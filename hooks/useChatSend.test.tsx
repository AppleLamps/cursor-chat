// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatSend } from "@/hooks/useChatSend";
import { formatSseEvent } from "@/lib/sse";
import type { Conversation, Message } from "@/lib/chat-types";

type Options = Parameters<typeof useChatSend>[0];

const fetchMock = vi.fn();

type Stream = {
  push: (event: Parameters<typeof formatSseEvent>[0], data: Record<string, unknown>) => void;
  close: () => void;
  signal: AbortSignal | undefined;
  body: Record<string, unknown>;
};

const streams: Stream[] = [];
const cancelBodies: Record<string, unknown>[] = [];
let cancelResponses: number[] = [];

function installFetch() {
  streams.length = 0;
  cancelBodies.length = 0;
  cancelResponses = [200];

  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/chat/cancel") {
      cancelBodies.push(JSON.parse(String(init?.body)));
      const status = cancelResponses.length > 1 ? cancelResponses.shift()! : cancelResponses[0];
      return new Response("{}", { status });
    }

    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      }
    });
    // A real fetch errors the body when its signal aborts; mirror that.
    init?.signal?.addEventListener("abort", () => {
      try {
        controller.error(new DOMException("Aborted", "AbortError"));
      } catch {
        // already closed
      }
    });

    streams.push({
      push: (event, data) => controller.enqueue(encoder.encode(formatSseEvent(event, data))),
      close: () => controller.close(),
      signal: init?.signal ?? undefined,
      body: JSON.parse(String(init?.body))
    });

    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  });
}

const conversation: Conversation = {
  id: "chat-1",
  title: "Chat",
  createdAt: "2026-06-26T12:00:00.000Z",
  updatedAt: "2026-06-26T12:00:00.000Z",
  messages: [],
  repoUrl: "https://github.com/acme/widgets",
  branch: "main",
  agentMode: "qa"
};

function message(overrides: Partial<Message> & Pick<Message, "id" | "role">): Message {
  return { content: "text", createdAt: "2026-06-26T12:00:00.000Z", ...overrides };
}

function setup(messages: Message[] = []) {
  const replace = vi.fn();
  const options: Options = {
    apiKey: "key",
    activeConversation: { ...conversation, messages },
    activeAgentMode: "qa",
    messages,
    pendingImages: [],
    pendingPdfs: [],
    inputRef: { current: null },
    clearDraft: vi.fn(),
    openRepoPicker: vi.fn(),
    activeConversationIdRef: { current: "chat-1" },
    replaceMessagesForConversation: replace,
    patchMessageForConversation: vi.fn(),
    patchAgentSessionForConversation: vi.fn(),
    mergeSourceForConversation: vi.fn(),
    setExternalSyncPaused: vi.fn()
  };
  const hook = renderHook(() => useChatSend(options));
  return { ...hook, replace };
}

function lastSavedMessages(replace: ReturnType<typeof vi.fn>): Message[] {
  return replace.mock.calls[replace.mock.calls.length - 1][1] as Message[];
}

beforeEach(() => {
  installFetch();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("Stop", () => {
  it("waits for the run id and cancels then, when pressed before the agent starts", async () => {
    const { result } = setup();

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("hello");
    });
    await waitFor(() => expect(streams).toHaveLength(1));

    act(() => result.current.stopGenerating());

    // Aborting now would orphan a run nobody could cancel, so nothing happens yet.
    expect(cancelBodies).toHaveLength(0);
    expect(streams[0].signal?.aborted).toBe(false);
    expect(result.current.composerNote).toMatch(/Stopping/);

    streams[0].push("run", { agentId: "agent-1", runId: "run-1", agentSessionToken: "tok" });

    await waitFor(() => expect(cancelBodies).toHaveLength(1));
    expect(cancelBodies[0]).toMatchObject({ apiKey: "key", agentId: "agent-1", runId: "run-1" });
    expect(streams[0].signal?.aborted).toBe(true);

    await act(async () => {
      await sending;
    });
    expect(result.current.isSending).toBe(false);
  });

  it("cancels immediately when the run id is already known", async () => {
    const { result } = setup();

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("hello");
    });
    await waitFor(() => expect(streams).toHaveLength(1));
    streams[0].push("run", { agentId: "agent-1", runId: "run-9" });
    // Let the client process the run event.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    act(() => result.current.stopGenerating());

    await waitFor(() => expect(cancelBodies).toHaveLength(1));
    expect(cancelBodies[0].runId).toBe("run-9");
    await act(async () => {
      await sending;
    });
  });

  it("says so when the cancel could not be confirmed instead of claiming it stopped", async () => {
    cancelResponses = [403];
    const { result } = setup();

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("hello");
    });
    await waitFor(() => expect(streams).toHaveLength(1));
    streams[0].push("run", { agentId: "agent-1", runId: "run-1" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    act(() => result.current.stopGenerating());

    await waitFor(() =>
      expect(result.current.composerNote).toMatch(/Could not confirm the run was cancelled/)
    );
    // A 403 will not improve on retry.
    expect(cancelBodies).toHaveLength(1);
    await act(async () => {
      await sending;
    });
  });

  it("retries a transient cancel failure once before giving up", async () => {
    cancelResponses = [503, 200];
    const { result } = setup();

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("hello");
    });
    await waitFor(() => expect(streams).toHaveLength(1));
    streams[0].push("run", { agentId: "agent-1", runId: "run-1" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    act(() => result.current.stopGenerating());

    await waitFor(() => expect(cancelBodies).toHaveLength(2), { timeout: 3000 });
    expect(result.current.composerNote).not.toMatch(/Could not confirm/);
    await act(async () => {
      await sending;
    });
  });

  it("keeps what had streamed and does not offer to re-attach after a deliberate stop", async () => {
    const { result, replace } = setup();

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("hello");
    });
    await waitFor(() => expect(streams).toHaveLength(1));
    streams[0].push("run", { agentId: "agent-1", runId: "run-1" });
    streams[0].push("text", { delta: "Half an answer" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    act(() => result.current.stopGenerating());
    await act(async () => {
      await sending;
    });

    const saved = lastSavedMessages(replace).at(-1)!;
    expect(saved.error).toBe(true);
    expect(saved.content).toContain("Half an answer");
    expect(saved.content).toContain("Agent run stopped.");
    expect(saved.recoverable).toBe(false);
  });
});

describe("failed streams", () => {
  it("keeps the partial answer and marks a dropped connection recoverable", async () => {
    const { result, replace } = setup();

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("hello");
    });
    await waitFor(() => expect(streams).toHaveLength(1));
    streams[0].push("run", { agentId: "agent-1", runId: "run-1" });
    streams[0].push("text", { delta: "Here is what I found so far" });
    streams[0].close(); // ends without a "done" event

    await act(async () => {
      await sending;
    });

    const saved = lastSavedMessages(replace).at(-1)!;
    expect(saved.error).toBe(true);
    expect(saved.content).toContain("Here is what I found so far");
    expect(saved.runId).toBe("run-1");
    expect(saved.recoverable).toBe(true);
  });

  it("does not mark a failed run recoverable, since re-attaching would replay the failure", async () => {
    const { result, replace } = setup();

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("hello");
    });
    await waitFor(() => expect(streams).toHaveLength(1));
    streams[0].push("run", { agentId: "agent-1", runId: "run-1" });
    streams[0].push("error", { message: "The run failed.", runId: "run-1" });

    await act(async () => {
      await sending;
    });

    const saved = lastSavedMessages(replace).at(-1)!;
    expect(saved.error).toBe(true);
    expect(saved.recoverable).toBe(false);
  });
});

describe("Retry", () => {
  const userTurn = message({ id: "u1", role: "user", content: "What is this?", turnId: "turn-1" });

  async function retry(run: (hook: ReturnType<typeof setup>["result"]) => void, messages: Message[]) {
    const { result } = setup(messages);
    act(() => run(result));
    await waitFor(() => expect(streams.length).toBeGreaterThan(0));
    streams[0].push("done", { agentId: "agent-1", runId: "run-new", status: "finished", result: "ok" });
    streams[0].close();
    await waitFor(() => expect(result.current.isSending).toBe(false));
    return streams[0].body;
  }

  it("re-attaches to the same run, with the same turn, after a lost connection", async () => {
    const body = await retry(
      (hook) => hook.current.retryLast(),
      [
        userTurn,
        message({ id: "a1", role: "assistant", error: true, recoverable: true, runId: "run-1" })
      ]
    );

    expect(body.recoverRunId).toBe("run-1");
    expect(body.turnId).toBe("turn-1");
  });

  it("sends the prompt again under a new turn after a failed run", async () => {
    const body = await retry(
      (hook) => hook.current.retryLast(),
      [
        userTurn,
        message({ id: "a1", role: "assistant", error: true, recoverable: false, runId: "run-1" })
      ]
    );

    expect(body.recoverRunId).toBeUndefined();
    expect(body.prompt).toBe("What is this?");
    expect(body.turnId).toBeTruthy();
    expect(body.turnId).not.toBe("turn-1");
  });

  it("regenerates the latest answer as a new run instead of replaying the old one", async () => {
    const body = await retry(
      (hook) => hook.current.retryAssistantMessage("a1"),
      [userTurn, message({ id: "a1", role: "assistant", runId: "run-1", turnId: "turn-1" })]
    );

    expect(body.recoverRunId).toBeUndefined();
    expect(body.turnId).not.toBe("turn-1");
  });

  it("refuses to rewind an older answer, which the cloud agent still remembers", async () => {
    const { result } = setup([
      userTurn,
      message({ id: "a1", role: "assistant", runId: "run-1" }),
      message({ id: "u2", role: "user", content: "And then?", turnId: "turn-2" }),
      message({ id: "a2", role: "assistant", runId: "run-2" })
    ]);

    act(() => result.current.retryAssistantMessage("a1"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(streams).toHaveLength(0);
  });
});

describe("sending", () => {
  it("ignores a second send while one is starting, even in the same tick", async () => {
    const { result } = setup();

    act(() => {
      void result.current.sendMessage("first");
      void result.current.sendMessage("second");
    });
    await waitFor(() => expect(streams).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(streams).toHaveLength(1);
    expect(streams[0].body.prompt).toBe("first");

    streams[0].push("done", { agentId: "a", runId: "r", status: "finished", result: "ok" });
    streams[0].close();
    await waitFor(() => expect(result.current.isSending).toBe(false));
  });
});
