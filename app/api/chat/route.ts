import { Agent, CursorAgentError } from "@cursor/sdk";
import type { Run, SDKMessage } from "@cursor/sdk";
import { NextResponse } from "next/server";
import { createCloudAgentRun } from "@/lib/cursor-cloud-api";
import {
  buildAgentInstructions,
  buildUserPrompt,
  defaultImagePrompt
} from "@/lib/cursor-prompt";
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
  promptText: string;
  sdkImages: ReturnType<typeof chatImagesToSdk>;
  agentId?: string;
  send: (event: ChatStreamEventName, data: Record<string, unknown>) => void;
};

function extractAssistantText(event: SDKMessage) {
  if (event.type !== "assistant") return "";

  return event.message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

async function streamRun(
  run: Run,
  send: StreamRunContext["send"],
  options?: { streamAssistantText?: boolean; streamThinking?: boolean }
) {
  const streamAssistantText = options?.streamAssistantText ?? true;
  const streamThinking = options?.streamThinking ?? true;

  for await (const event of run.stream()) {
    if (event.type === "assistant") {
      if (streamAssistantText) {
        const text = extractAssistantText(event);
        if (text) {
          send("text", { delta: text });
        }
      }
      continue;
    }

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

async function startFirstRun({
  apiKey,
  repoUrl,
  branch,
  promptText,
  sdkImages,
  send
}: Omit<StreamRunContext, "agentId">) {
  const { agentId, runId } = await createCloudAgentRun({
    apiKey,
    promptText,
    images: sdkImages.length > 0 ? sdkImages : undefined,
    instructions: buildAgentInstructions({ repoUrl, branch }),
    mode: "plan",
    modelId: CURSOR_MODEL,
    repoUrl,
    branch
  });

  send("agent", { agentId });

  const run = await Agent.getRun(runId, {
    runtime: "cloud",
    agentId,
    apiKey
  });

  return { agentId, run, streamAssistantText: true as const, streamThinking: true as const };
}

async function startFollowUpRun({
  apiKey,
  repoUrl,
  branch,
  promptText,
  sdkImages,
  agentId,
  send
}: StreamRunContext): Promise<
  | {
      agentId: string;
      run: Run;
      agent: null;
      streamAssistantText: true;
      streamThinking: true;
    }
  | {
      agentId: string;
      run: Run;
      agent: Awaited<ReturnType<typeof Agent.create>>;
      streamAssistantText: false;
      streamThinking: false;
    }
> {
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

    return {
      ...(await startFirstRun({
        apiKey,
        repoUrl,
        branch,
        promptText,
        sdkImages,
        send
      })),
      agent: null,
      streamAssistantText: true as const,
      streamThinking: true as const
    };
  }

  send("agent", { agentId: agent.agentId });

  const agentMessage =
    sdkImages.length > 0
      ? { text: promptText, images: sdkImages }
      : promptText;

  const run = await agent.send(agentMessage, {
    onDelta: ({ update }) => {
      if (update.type === "text-delta" && update.text) {
        send("text", { delta: update.text });
        return;
      }

      if (update.type === "thinking-delta" && update.text) {
        send("thinking", { delta: update.text });
      }
    }
  });

  return {
    agentId: agent.agentId,
    run,
    agent,
    streamAssistantText: false as const,
    streamThinking: false as const
  };
}

export async function POST(request: Request) {
  const tooLarge = bodyTooLargeResponse(request, MAX_CHAT_BODY_BYTES);
  if (tooLarge) return tooLarge;

  const rateLimit = checkRateLimit("chat", request);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let body: ChatRequest;

  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
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
          promptText,
          sdkImages,
          agentId,
          send
        };

        const started = agentId
          ? await startFollowUpRun(runContext)
          : await startFirstRun(runContext);

        disposableAgent = "agent" in started ? started.agent : null;
        const resolvedAgentId = started.agentId;

        await streamRun(started.run, send, {
          streamAssistantText: started.streamAssistantText,
          streamThinking: started.streamThinking
        });

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
          result: result.result,
          thinking
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
