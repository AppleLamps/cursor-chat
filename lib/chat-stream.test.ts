import { describe, expect, it } from "vitest";
import {
  ChatStreamError,
  consumeChatStream,
  isRecoverableStreamFailure,
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
  it("exposes early durable run identity before completion", async () => {
    let run:
      | { agentId: string; agentSessionToken?: string; runId: string }
      | undefined;

    await consumeChatStream(
      streamResponse([
        formatSseEvent("run", {
          agentId: "agent",
          agentSessionToken: "token",
          runId: "run"
        }),
        formatSseEvent("done", {
          agentId: "agent",
          runId: "run",
          status: "finished"
        })
      ]),
      {
        onRun: (payload) => {
          run = payload;
        }
      }
    );

    expect(run).toEqual({
      agentId: "agent",
      agentSessionToken: "token",
      runId: "run"
    });
  });

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

  it("renders safe task and tool diagnostics without exposing payloads", async () => {
    const activities: string[] = [];

    await consumeChatStream(
      streamResponse([
        formatSseEvent("task", {
          status: "running",
          text: "secret repository instructions"
        }),
        formatSseEvent("tool", {
          name: "grep",
          status: "error",
          argsTruncated: true,
          resultTruncated: true,
          args: { token: "secret" },
          result: "secret output"
        }),
        formatSseEvent("done", {
          agentId: "agent",
          runId: "run",
          status: "finished"
        })
      ]),
      {
        onActivity: (activity) => activities.push(activity)
      }
    );

    expect(activities).toEqual([
      "Working on a delegated task…",
      "Code search failed (details truncated)"
    ]);
    expect(activities.join(" ")).not.toContain("secret");
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

describe("stalled and dropped streams", () => {
  function openStream() {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        }
      }),
      { headers: { "Content-Type": "text/event-stream" } }
    );
    return { response, controller };
  }

  it("fails as retryable when no bytes (not even a heartbeat) arrive in time", async () => {
    const { response } = openStream();

    const failure = await consumeChatStream(response, {}, { idleTimeoutMs: 25 }).catch(
      (error) => error
    );

    expect(failure).toBeInstanceOf(ChatStreamError);
    expect(failure.code).toBe("stream_stalled");
    expect(failure.retryable).toBe(true);
    expect(isRecoverableStreamFailure(failure)).toBe(true);
  });

  it("treats heartbeat comments as activity so a quiet but healthy run is not cut off", async () => {
    const { response, controller } = openStream();
    const encoder = new TextEncoder();
    const heartbeats = setInterval(
      () => controller.enqueue(encoder.encode(": heartbeat\n\n")),
      10
    );
    const finishing = setTimeout(() => {
      controller.enqueue(
        encoder.encode(
          formatSseEvent("done", { agentId: "a", runId: "r", status: "finished" })
        )
      );
      controller.close();
    }, 120);

    let done: ChatStreamDone | undefined;
    await consumeChatStream(response, { onDone: (payload) => (done = payload) }, {
      idleTimeoutMs: 40
    });
    clearInterval(heartbeats);
    clearTimeout(finishing);

    expect(done?.runId).toBe("r");
  });

  it("reports an early close as a retryable connection error", async () => {
    const failure = await consumeChatStream(streamResponse([]), {}).catch((e) => e);

    expect(failure).toBeInstanceOf(ChatStreamError);
    expect(failure.code).toBe("connection_closed");
    expect(failure.message).toBe("The connection closed before the answer finished.");
    expect(isRecoverableStreamFailure(failure)).toBe(true);
  });

  it("only treats connection-level failures as recoverable", () => {
    expect(isRecoverableStreamFailure(new TypeError("network error"))).toBe(true);
    expect(
      isRecoverableStreamFailure(new ChatStreamError("timed out", { retryable: true }))
    ).toBe(true);
    expect(
      isRecoverableStreamFailure(new ChatStreamError("bad key", { retryable: false }))
    ).toBe(false);
    expect(isRecoverableStreamFailure(new ChatStreamError("run failed"))).toBe(false);
    expect(isRecoverableStreamFailure(new Error("HTTP 429"))).toBe(false);
    expect(isRecoverableStreamFailure(new DOMException("stopped", "AbortError"))).toBe(
      false
    );
  });
});
