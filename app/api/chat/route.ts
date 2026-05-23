import { Agent, CursorAgentError } from "@cursor/sdk";
import type { Run, RunResult } from "@cursor/sdk";
import { NextResponse } from "next/server";
import { isImplementMode, parseAgentMode } from "@/lib/agent-mode";
import {
  buildFirstAgentMessage,
  buildUserPrompt,
  defaultImagePrompt
} from "@/lib/cursor-prompt";
import type { AgentMode } from "@/lib/defaults";
import { CURSOR_MODEL, DEFAULT_BRANCH } from "@/lib/defaults";
import {
  MAX_CHAT_BODY_BYTES,
  chatImagesToSdk,
  parseChatImages
} from "@/lib/chat-images";
import {
  bodyTooLargeResponse,
  checkRateLimit,
  rateLimitedResponse
} from "@/lib/rate-limit";
import { extractSourcePaths } from "@/lib/sources";
import { extractThinkingFromConversation } from "@/lib/thinking";
import { ChatStreamEventName, formatSseEvent } from "@/lib/sse";

type ChatRequest = {
  apiKey?: string;
  prompt?: string;
  repoUrl?: string;
  branch?: string;
  agentId?: string;
  agentMode?: AgentMode;
  images?: Array<{ url?: string; mimeType?: string }>;
};

const MAX_PROMPT_CHARS = 32_000;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive"
};

type StreamRunContext = {
  apiKey: string;
  repoUrl: string;
  branch: string;
  agentMode: AgentMode;
  promptText: string;
  sdkImages: ReturnType<typeof chatImagesToSdk>;
  agentId?: string;
  send: (event: ChatStreamEventName, data: Record<string, unknown>) => void;
};

type StreamCallbacks = {
  onTextDelta?: (delta: string) => void;
};

function createStreamCallbacks(
  send: StreamRunContext["send"],
  callbacks: StreamCallbacks
) {
  return {
    onDelta: ({ update }: { update: { type: string; text?: string } }) => {
      if (update.type === "text-delta" && update.text) {
        callbacks.onTextDelta?.(update.text);
        send("text", { delta: update.text });
        return;
      }

      if (update.type === "thinking-delta" && update.text) {
        send("thinking", { delta: update.text });
      }
    }
  };
}

async function streamRunEvents(
  run: Run,
  send: StreamRunContext["send"],
  options?: { streamThinking?: boolean }
) {
  const streamThinking = options?.streamThinking ?? false;

  for await (const event of run.stream()) {
    if (event.type === "tool_call") {
      send("tool", { name: event.name, status: event.status });

      if (event.status === "completed") {
        for (const path of extractSourcePaths(
          event.name,
          event.args,
          event.result
        )) {
          send("source", { path });
        }
      }

      continue;
    }

    if (event.type === "thinking" && event.text && streamThinking) {
      send("thinking", { delta: event.text });
      continue;
    }

    if (event.type === "status" && event.message) {
      send("status", { message: event.message });
    }
  }
}

function extractPrUrl(result: RunResult): string | undefined {
  return result.git?.branches?.find((branch) => branch.prUrl)?.prUrl;
}

async function createCloudAgent(
  apiKey: string,
  repoUrl: string,
  branch: string,
  agentMode: AgentMode
) {
  const cloudBase = {
    repos: [{ url: repoUrl, startingRef: branch }]
  };

  return Agent.create({
    apiKey,
    model: { id: CURSOR_MODEL },
    cloud: isImplementMode(agentMode)
      ? { ...cloudBase, autoCreatePR: true }
      : { ...cloudBase, skipReviewerRequest: true }
  });
}

async function startFirstRun({
  apiKey,
  repoUrl,
  branch,
  agentMode,
  promptText,
  sdkImages,
  send
}: Omit<StreamRunContext, "agentId">) {
  const agent = await createCloudAgent(apiKey, repoUrl, branch, agentMode);
  send("agent", { agentId: agent.agentId });

  let streamedTextLength = 0;
  const agentMessage = buildFirstAgentMessage(
    promptText,
    { repoUrl, branch, mode: agentMode },
    sdkImages.length > 0 ? sdkImages : undefined
  );

  const run = await agent.send(agentMessage, {
    ...createStreamCallbacks(send, {
      onTextDelta: (delta) => {
        streamedTextLength += delta.length;
      }
    })
  });

  return { agentId: agent.agentId, run, agent, streamedTextLength };
}

async function startFollowUpRun({
  apiKey,
  repoUrl,
  branch,
  agentMode,
  promptText,
  sdkImages,
  agentId,
  send
}: StreamRunContext) {
  let agent: Awaited<ReturnType<typeof Agent.create>> | null = null;

  try {
    agent = await Agent.resume(agentId!, {
      apiKey,
      model: { id: CURSOR_MODEL }
    });
  } catch (resumeError) {
    if (!(resumeError instanceof CursorAgentError)) {
      throw resumeError;
    }

    send("status", {
      message: "Previous agent unavailable. Starting a new cloud agent…"
    });

    return startFirstRun({
      apiKey,
      repoUrl,
      branch,
      agentMode,
      promptText,
      sdkImages,
      send
    });
  }

  send("agent", { agentId: agent.agentId });

  let streamedTextLength = 0;
  const agentMessage =
    sdkImages.length > 0
      ? { text: promptText, images: sdkImages }
      : promptText;

  const run = await agent.send(agentMessage, {
    ...createStreamCallbacks(send, {
      onTextDelta: (delta) => {
        streamedTextLength += delta.length;
      }
    })
  });

  return { agentId: agent.agentId, run, agent, streamedTextLength };
}

export async function POST(request: Request) {
  const tooLarge = bodyTooLargeResponse(request, MAX_CHAT_BODY_BYTES);
  if (tooLarge) return tooLarge;

  let body: ChatRequest;

  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const agentMode = parseAgentMode(body.agentMode);
  const rateLimit = checkRateLimit(
    isImplementMode(agentMode) ? "chatImplement" : "chat",
    request
  );
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const apiKey = body.apiKey?.trim();
  const prompt = body.prompt?.trim();
  const repoUrl = body.repoUrl?.trim();
  const branch = body.branch?.trim() || DEFAULT_BRANCH;
  const agentId = body.agentId?.trim();

  if (!apiKey) {
    return NextResponse.json({ error: "API key is required." }, { status: 400 });
  }

  if (!repoUrl) {
    return NextResponse.json({ error: "Repository URL is required." }, { status: 400 });
  }

  const sdkImages = chatImagesToSdk(parseChatImages(body.images));

  if (!prompt && sdkImages.length === 0) {
    return NextResponse.json({ error: "A prompt or image is required." }, { status: 400 });
  }

  if (prompt && prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      {
        error: `Prompt is too long. Keep it under ${MAX_PROMPT_CHARS.toLocaleString()} characters.`
      },
      { status: 413 }
    );
  }

  const promptText = buildUserPrompt(prompt || defaultImagePrompt());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ChatStreamEventName, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(formatSseEvent(event, data)));
      };

      let disposableAgent: Awaited<ReturnType<typeof Agent.create>> | null = null;

      try {
        send("status", { message: "Starting Cursor cloud agent…" });

        const runContext: StreamRunContext = {
          apiKey,
          repoUrl,
          branch,
          agentMode,
          promptText,
          sdkImages,
          agentId,
          send
        };

        const started = agentId
          ? await startFollowUpRun(runContext)
          : await startFirstRun(runContext);

        disposableAgent = started.agent;
        const resolvedAgentId = started.agentId;

        await streamRunEvents(started.run, send);

        const result = await started.run.wait();

        if (result.status === "error") {
          send("error", {
            message: "The Cursor agent run failed before finishing.",
            runId: result.id
          });
          return;
        }

        if (result.status === "cancelled") {
          send("error", {
            message: "The Cursor agent run was cancelled.",
            runId: result.id
          });
          return;
        }

        const finalResult = result.result?.trim();
        if (finalResult && started.streamedTextLength === 0) {
          send("text", { delta: finalResult });
        }

        let thinking: string | undefined;

        if (started.run.supports("conversation")) {
          try {
            const turns = await started.run.conversation();
            thinking = extractThinkingFromConversation(turns);
          } catch {
            // Fall back to whatever thinking streamed during the run.
          }
        }

        send("done", {
          agentId: resolvedAgentId,
          runId: result.id,
          status: result.status,
          result: finalResult,
          thinking,
          prUrl: extractPrUrl(result)
        });
      } catch (error) {
        if (error instanceof CursorAgentError) {
          send("error", {
            message: error.message,
            retryable: error.isRetryable
          });
          return;
        }

        send("error", {
          message:
            error instanceof Error
              ? error.message
              : "Failed to run the Cursor agent."
        });
      } finally {
        if (disposableAgent) {
          await disposableAgent[Symbol.asyncDispose]();
        }
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
