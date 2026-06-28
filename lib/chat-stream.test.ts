import { describe, expect, it } from "vitest";
import {
  ChatStreamError,
  consumeChatStream,
  type ChatStreamDone
} from "@/lib/chat-stream";
import { formatSseEvent } from "@/lib/sse";

function streamResponse(chunks: string[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      }
    }),
    {
      headers: { "Content-Type": "text/event-stream" }
    }
  );
}

describe("consumeChatStream", () => {
  it("parses done telemetry fields", async () => {
    let donePayload: ChatStreamDone | undefined;

    await consumeChatStream(
      streamResponse([
        formatSseEvent("done", {
          agentId: "agent",
          agentSessionToken: "token",
          runId: "run",
          requestId: "request",
          status: "finished",
          result: "done",
          durationMs: 1000,
          model: "composer-2.5",
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 1,
            cacheWriteTokens: 0,
            totalTokens: 15
          }
        })
      ]),
      {
        onDone: (payload) => {
          donePayload = payload;
        }
      }
    );

    expect(donePayload?.requestId).toBe("request");
    expect(donePayload?.usage?.totalTokens).toBe(15);
    expect(donePayload?.durationMs).toBe(1000);
    expect(donePayload?.modelId).toBe("composer-2.5");
  });

  it("throws structured stream errors", async () => {
    await expect(
      consumeChatStream(
        streamResponse([
          formatSseEvent("error", {
            message: "failed",
            runId: "run",
            requestId: "request",
            code: "agent_not_found",
            status: 404,
            retryable: false
          })
        ]),
        {}
      )
    ).rejects.toMatchObject({
      name: "ChatStreamError",
      message: "failed",
      runId: "run",
      requestId: "request",
      code: "agent_not_found",
      status: 404,
      retryable: false
    } satisfies Partial<ChatStreamError>);
  });

  it("throws when an SSE event contains malformed JSON", async () => {
    await expect(
      consumeChatStream(
        streamResponse([
          "event: text\ndata: {not-json}\n\n",
          formatSseEvent("done", {
            agentId: "agent",
            runId: "run",
            status: "finished"
          })
        ]),
        {}
      )
    ).rejects.toMatchObject({
      name: "ChatStreamError",
      message: "Received malformed chat stream data."
    } satisfies Partial<ChatStreamError>);
  });
});
