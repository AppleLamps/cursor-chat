// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationStore } from "@/hooks/useConversationStore";
import { createConversation, INTERRUPTED_NOTE } from "@/lib/chat-conversation";
import { STORAGE_KEYS } from "@/lib/storage";
import * as attachmentStorage from "@/lib/chat-attachment-storage";
import type { Conversation, Message } from "@/lib/chat-types";

const KEY = STORAGE_KEYS.CONVERSATIONS;

function seed(conversations: Conversation[]) {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ version: 2, conversations, tombstones: {} })
  );
}

function chat(id: string, messages: Message[] = []): Conversation {
  return {
    ...createConversation("https://github.com/acme/widgets"),
    id,
    title: id,
    messages
  };
}

function reply(overrides: Partial<Message> = {}): Message {
  return {
    id: "reply",
    role: "assistant",
    content: "partial",
    createdAt: "2026-06-26T12:00:00.000Z",
    ...overrides
  };
}

async function hydrated() {
  const hook = renderHook(() => useConversationStore({ apiKey: "key" }));
  await waitFor(() => expect(hook.result.current.hasHydrated).toBe(true));
  return hook;
}

function historyWrites(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([key]) => key === KEY);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("saving history", () => {
  it("batches a burst of changes into one write instead of one per change", async () => {
    seed([chat("a", [reply({ id: "m1", content: "" })])]);
    const { result } = await hydrated();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    // A reply streaming in: dozens of patches in a few hundred milliseconds.
    for (let index = 0; index < 30; index += 1) {
      act(() => {
        result.current.patchMessageForConversation("a", "m1", {
          content: "token ".repeat(index + 1)
        });
      });
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(historyWrites(setItem)).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(historyWrites(setItem)).toHaveLength(1);
    const saved = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(saved.conversations[0].messages[0].content).toContain("token token");
  });

  it("writes immediately when the page is hidden so a pending change is not lost", async () => {
    seed([chat("a", [reply({ id: "m1" })])]);
    const { result } = await hydrated();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    act(() => {
      result.current.patchMessageForConversation("a", "m1", { content: "latest words" });
    });
    // The debounce has not fired yet.
    expect(window.localStorage.getItem(KEY)).not.toContain("latest words");

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(window.localStorage.getItem(KEY)).toContain("latest words");
  });

  it("warns, without a retry path, when browser storage is full", async () => {
    seed([chat("a", [reply({ id: "m1" })])]);
    const { result } = await hydrated();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string) => {
      if (key === KEY) throw new DOMException("full", "QuotaExceededError");
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    act(() => {
      result.current.patchMessageForConversation("a", "m1", { content: "more" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(result.current.storageWarning).toMatch(/storage is full/i);
    act(() => result.current.dismissStorageWarning());
    expect(result.current.storageWarning).toBeNull();
  });
});

describe("loading history", () => {
  it("shows a reply that was streaming when the tab closed as an interrupted, retryable error", async () => {
    seed([
      chat("a", [
        { id: "u", role: "user", content: "question", createdAt: "2026-06-26T12:00:00.000Z" },
        reply({ streaming: true, runId: "run-1", content: "Half of it" })
      ])
    ]);

    const { result } = await hydrated();
    const last = result.current.messages.at(-1)!;

    expect(last.streaming).toBe(false);
    expect(last.error).toBe(true);
    expect(last.recoverable).toBe(true);
    expect(last.content).toContain("Half of it");
    expect(last.content).toContain(INTERRUPTED_NOTE);
    expect(result.current.lastAssistantErrored).toBe(true);
  });

  it("leaves a reply with a fresh heartbeat alone, since another tab is running it", async () => {
    seed([chat("a", [reply({ streaming: true, heartbeatAt: Date.now() - 2_000 })])]);

    const { result } = await hydrated();

    expect(result.current.messages[0].streaming).toBe(true);
  });

  it("keeps an unreadable history as a backup instead of wiping it, and says so", async () => {
    window.localStorage.setItem(KEY, "{this is not json");

    const { result } = await hydrated();

    expect(result.current.storageWarning).toMatch(/backup/i);
    const backupKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith(`${KEY}-corrupt-`)
    );
    expect(backupKey).toBeDefined();
    expect(window.localStorage.getItem(backupKey!)).toBe("{this is not json");
  });

  it("allows new history to be saved after the unreadable original is safely backed up", async () => {
    const original = "{this is not json";
    window.localStorage.setItem(KEY, original);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result } = renderHook(() => useConversationStore({ apiKey: "key" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const backupKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith(`${KEY}-corrupt-`)
    );
    expect(backupKey).toBeDefined();
    expect(window.localStorage.getItem(KEY)).toBe(original);
    act(() => result.current.createAndActivateConversation(chat("new-chat")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(JSON.parse(window.localStorage.getItem(KEY)!).conversations[0].id).toBe("new-chat");
    expect(window.localStorage.getItem(backupKey!)).toBe(original);
  });

  it("does not overwrite unread history when the initial storage read fails", async () => {
    seed([chat("original")]);
    const original = window.localStorage.getItem(KEY);
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const pruneImages = vi.spyOn(attachmentStorage, "pruneStoredImages");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result, unmount } = renderHook(() => useConversationStore({ apiKey: "key" }));

    expect(result.current.hasHydrated).toBe(true);
    expect(result.current.storageWarning).toMatch(/blocking site storage/i);
    getItem.mockRestore();
    act(() => result.current.createAndActivateConversation(chat("new-chat")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    act(() => window.dispatchEvent(new Event("pagehide")));
    unmount();

    expect(window.localStorage.getItem(KEY)).toBe(original);
    expect(historyWrites(setItem)).toHaveLength(0);
    expect(pruneImages).not.toHaveBeenCalled();
  });

  it.each(["debounce", "pagehide", "visibilitychange", "unmount"] as const)(
    "preserves unreadable history and its previous backup when backup fails, including %s saves",
    async (saveTrigger) => {
      const original = "{this is not json";
      const previousBackupKey = `${KEY}-corrupt-1`;
      window.localStorage.setItem(KEY, original);
      window.localStorage.setItem(previousBackupKey, "previous unreadable history");
      const originalSetItem = Storage.prototype.setItem;
      const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key: string,
        value: string
      ) {
        // Replacing the original would fit, but creating a backup does not.
        if (key.startsWith(`${KEY}-corrupt-`)) {
          throw new DOMException("full", "QuotaExceededError");
        }
        originalSetItem.call(this, key, value);
      });
      const removeItem = vi.spyOn(Storage.prototype, "removeItem");
      const serialize = vi.spyOn(attachmentStorage, "serializeConversationsForStorage");
      const serializeSync = vi.spyOn(attachmentStorage, "serializeConversationsSync");
      const writeImages = vi.spyOn(attachmentStorage, "writePendingImages");
      const pruneImages = vi.spyOn(attachmentStorage, "pruneStoredImages");
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      const { result, unmount } = renderHook(() => useConversationStore({ apiKey: "key" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.hasHydrated).toBe(true);
      expect(result.current.storageWarning).toMatch(/original history.*untouched/i);
      expect(result.current.storageWarning).toMatch(/new chats will not be saved/i);
      expect(window.localStorage.getItem(KEY)).toBe(original);
      expect(window.localStorage.getItem(previousBackupKey)).toBe("previous unreadable history");

      act(() => {
        result.current.dismissStorageWarning();
        result.current.createAndActivateConversation(chat("new-chat"));
      });
      expect(result.current.conversations).toHaveLength(1);

      if (saveTrigger === "debounce") {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(700);
        });
      } else if (saveTrigger === "unmount") {
        unmount();
      } else if (saveTrigger === "visibilitychange") {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        act(() => document.dispatchEvent(new Event("visibilitychange")));
      } else {
        act(() => window.dispatchEvent(new Event("pagehide")));
      }

      expect(window.localStorage.getItem(KEY)).toBe(original);
      expect(window.localStorage.getItem(previousBackupKey)).toBe("previous unreadable history");
      expect(historyWrites(setItem)).toHaveLength(0);
      expect(removeItem).not.toHaveBeenCalled();
      expect(serialize).not.toHaveBeenCalled();
      expect(serializeSync).not.toHaveBeenCalled();
      expect(writeImages).not.toHaveBeenCalled();
      expect(pruneImages).not.toHaveBeenCalled();
    }
  );

  it("also disables persistence when valid history cannot be hydrated or backed up", async () => {
    seed([chat("original")]);
    const original = window.localStorage.getItem(KEY);
    vi.spyOn(attachmentStorage, "hydrateConversationsFromStorage").mockRejectedValueOnce(
      new Error("Could not hydrate saved attachments")
    );
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key.startsWith(`${KEY}-corrupt-`)) {
        throw new DOMException("denied", "SecurityError");
      }
      originalSetItem.call(this, key, value);
    });
    const pruneImages = vi.spyOn(attachmentStorage, "pruneStoredImages");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result, unmount } = renderHook(() => useConversationStore({ apiKey: "key" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.hasHydrated).toBe(true);
    act(() => result.current.createAndActivateConversation(chat("new-chat")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    act(() => window.dispatchEvent(new Event("pagehide")));
    unmount();

    expect(window.localStorage.getItem(KEY)).toBe(original);
    expect(historyWrites(setItem)).toHaveLength(0);
    expect(pruneImages).not.toHaveBeenCalled();
  });

  it("survives one malformed message without losing the rest of the conversation", async () => {
    const good = { id: "u", role: "user", content: "hello", createdAt: "2026-06-26T12:00:00.000Z" };
    seed([chat("a", [good as Message, null as unknown as Message])]);

    const { result } = await hydrated();

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.storageWarning).toBeNull();
  });
});

describe("deleting and restoring", () => {
  it("brings a deleted conversation back, and clears its deletion marker so other tabs follow", async () => {
    const original = chat("a", [reply({ id: "m1", content: "keep me" })]);
    seed([original, chat("b")]);
    const { result } = await hydrated();

    act(() => result.current.deleteConversation("a"));
    expect(result.current.conversations.some((c) => c.id === "a")).toBe(false);

    act(() => result.current.createAndActivateConversation(original));

    expect(result.current.conversations.some((c) => c.id === "a")).toBe(true);
    expect(result.current.activeConversationId).toBe("a");
  });

  describe("export and import", () => {
    it("exports without agent links and imports back, reviving a chat deleted here", async () => {
      seed([
        {
          ...chat("keep", [reply({ id: "m1", role: "user", content: "hi" })]),
          agentId: "agent-1",
          agentSessionToken: "tok"
        }
      ]);
      const { result } = await hydrated();

      const exported = result.current.exportHistory();
      expect(JSON.stringify(exported)).not.toContain("agent-1");
      expect(exported.conversations).toHaveLength(1);

      act(() => result.current.deleteConversation("keep"));
      expect(result.current.conversations).toHaveLength(0);

      let plan: ReturnType<typeof result.current.importHistory> | undefined;
      act(() => {
        plan = result.current.importHistory(exported.conversations);
      });

      expect(plan).toMatchObject({ added: 1, updated: 0, unchanged: 0 });
      expect(result.current.conversations.map((c) => c.id)).toEqual(["keep"]);

      // The revived chat must survive the next save and cross-tab merge.
      await waitFor(() => {
        const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
        expect(saved.tombstones).not.toHaveProperty("keep");
        expect(saved.conversations).toHaveLength(1);
      });
    });

    it("leaves chats alone when the import is not newer", async () => {
      seed([chat("same")]);
      const { result } = await hydrated();

      let plan: ReturnType<typeof result.current.importHistory> | undefined;
      act(() => {
        plan = result.current.importHistory(result.current.exportHistory().conversations);
      });

      expect(plan).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
    });
  });
});
