import { describe, expect, it } from "vitest";
import {
  backupCorruptHistory,
  isQuotaError,
  persistHistory,
  trimConversationsForQuota
} from "@/lib/history-storage";
import { createConversation } from "@/lib/chat-conversation";
import type { Conversation, Message } from "@/lib/chat-types";

function heavyMessage(id: string): Message {
  return {
    id,
    role: "assistant",
    content: "answer",
    createdAt: "2026-06-26T12:00:00.000Z",
    thinking: "long reasoning",
    activityLog: ["a", "b"],
    trace: [{ kind: "step" }] as unknown as Message["trace"]
  };
}

function conversations(count: number): Conversation[] {
  return Array.from({ length: count }, (_, index) => ({
    ...createConversation("https://github.com/acme/app"),
    id: `c${index}`,
    messages: [heavyMessage(`m${index}`)]
  }));
}

class QuotaError extends Error {
  constructor() {
    super("full");
    this.name = "QuotaExceededError";
  }
}

describe("isQuotaError", () => {
  it("recognises the browser variants", () => {
    expect(isQuotaError(new QuotaError())).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error("nope"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe("trimConversationsForQuota", () => {
  it("drops reasoning and trace from older chats but keeps the answers", () => {
    const trimmed = trimConversationsForQuota(conversations(4), 2);

    expect(trimmed[0].messages[0].trace).toBeDefined();
    expect(trimmed[1].messages[0].thinking).toBeDefined();
    for (const conversation of trimmed.slice(2)) {
      const [message] = conversation.messages;
      expect(message.content).toBe("answer");
      expect(message.trace).toBeUndefined();
      expect(message.thinking).toBeUndefined();
      expect(message.activityLog).toBeUndefined();
    }
  });

  it("does not mutate its input", () => {
    const input = conversations(3);
    trimConversationsForQuota(input, 0);

    expect(input[2].messages[0].trace).toBeDefined();
  });
});

describe("persistHistory", () => {
  it("writes once when there is room", () => {
    const writes: string[] = [];
    const outcome = persistHistory(
      { setItem: (_key, value) => void writes.push(value) },
      "k",
      conversations(2),
      {}
    );

    expect(outcome).toEqual({ ok: true, trimmed: false });
    expect(writes).toHaveLength(1);
  });

  it("retries without the trace when storage is full and reports that it trimmed", () => {
    const sizes: number[] = [];
    const storage = {
      setItem: (_key: string, value: string) => {
        sizes.push(value.length);
        // Room for the two newest chats' reasoning, not for all four.
        if ((value.match(/long reasoning/g) ?? []).length > 2) throw new QuotaError();
      }
    };

    const outcome = persistHistory(storage, "k", conversations(4), {});

    expect(outcome).toEqual({ ok: true, trimmed: true });
    expect(sizes).toHaveLength(2);
    expect(sizes[1]).toBeLessThan(sizes[0]);
  });

  it("reports quota when even the trimmed history does not fit", () => {
    const outcome = persistHistory(
      {
        setItem: () => {
          throw new QuotaError();
        }
      },
      "k",
      conversations(2),
      {}
    );

    expect(outcome).toEqual({ ok: false, reason: "quota" });
  });

  it("reports blocked storage without retrying", () => {
    let attempts = 0;
    const outcome = persistHistory(
      {
        setItem: () => {
          attempts += 1;
          throw new DOMException("denied", "SecurityError");
        }
      },
      "k",
      conversations(1),
      {}
    );

    expect(outcome).toEqual({ ok: false, reason: "unavailable" });
    expect(attempts).toBe(1);
  });
});

describe("backupCorruptHistory", () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
      data,
      get length() {
        return data.size;
      },
      key: (index: number) => [...data.keys()][index] ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key)
    };
  }

  it("keeps the unreadable text under a backup key", () => {
    const storage = fakeStorage();

    expect(backupCorruptHistory(storage, "history", "{broken")).toBe(true);

    const [name] = [...storage.data.keys()];
    expect(name.startsWith("history-corrupt-")).toBe(true);
    expect(storage.data.get(name)).toBe("{broken");
  });

  it("keeps only the newest backup", () => {
    const storage = fakeStorage({ "history-corrupt-1": "old", other: "keep" });

    backupCorruptHistory(storage, "history", "new");

    expect(storage.data.has("history-corrupt-1")).toBe(false);
    expect(storage.data.get("other")).toBe("keep");
    expect([...storage.data.keys()].filter((k) => k.includes("corrupt"))).toHaveLength(1);
  });

  it("does nothing for an empty value", () => {
    const storage = fakeStorage();

    expect(backupCorruptHistory(storage, "history", null)).toBe(false);
    expect(storage.data.size).toBe(0);
  });
});
