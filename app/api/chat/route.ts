import { Agent, CursorAgentError } from "@cursor/sdk";
import { NextResponse } from "next/server";
import { wrapUserPrompt } from "@/lib/cursor-prompt";
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

  const wrappedPrompt = wrapUserPrompt(prompt || "What's in this image?", {
    repoUrl,
    branch
  });
  const agentMessage =
    sdkImages.length > 0
      ? { text: wrappedPrompt, images: sdkImages }
      : wrappedPrompt;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ChatStreamEventName, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(formatSseEvent(event, data)));
      };

      let agent: Awaited<ReturnType<typeof Agent.create>> | null = null;

      try {
        if (agentId) {
          try {
            agent = await Agent.resume(agentId, {
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

            agent = await Agent.create({
              apiKey,
              model: { id: CURSOR_MODEL },
              cloud: {
                repos: [{ url: repoUrl, startingRef: branch }],
                skipReviewerRequest: true
              }
            });
          }
        } else {
          agent = await Agent.create({
            apiKey,
            model: { id: CURSOR_MODEL },
            cloud: {
              repos: [{ url: repoUrl, startingRef: branch }],
              skipReviewerRequest: true
            }
          });
        }

        send("agent", { agentId: agent.agentId });
        send("status", { message: "Starting Cursor cloud agent…" });

        const run = await agent.send(agentMessage, {
          onDelta: ({ update }) => {
            if (update.type === "text-delta" && update.text) {
              send("text", { delta: update.text });
              return;
            }

            if (update.type === "thinking-delta" && update.text) {
              send("status", { message: "Thinking…" });
            }
          }
        });

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

          if (event.type === "thinking" && event.text) {
            send("status", { message: "Thinking…" });
            continue;
          }

          if (event.type === "status" && event.message) {
            send("status", { message: event.message });
          }
        }

        const result = await run.wait();

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

        send("done", {
          agentId: agent.agentId,
          runId: result.id,
          status: result.status,
          result: result.result
        });
      } catch (error) {
        if (error instanceof CursorAgentError) {
          send("error", {
            message: error.message,
            retryable: error.isRetryable
          });
          return;
        }

        send("error", { message: "Failed to run the Cursor agent." });
      } finally {
        if (agent) {
          await agent[Symbol.asyncDispose]();
        }
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
