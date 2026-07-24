import { describe, expect, it } from "vitest";
import {
  decodeConversationStorage,
  encodeConversationStorage,
  mergeConversationSnapshots
} from "@/lib/conversation-sync";
import type { Conversation } from "@/lib/chat-types";

function conversation(id: string, updatedAt: string, title = id): Conversation {
  return {
    id,
    title,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    messages: []
  };
}

function recentIso(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe("conversation storage synchronization", () => {
  it("reads legacy array storage", () => {
    const decoded = decodeConversationStorage(
      JSON.stringify([conversation("legacy", "2026-01-01T00:00:00.000Z")])
    );

    expect(decoded.conversations).toHaveLength(1);
    expect(decoded.tombstones).toEqual({});
  });

  it("keeps the newest version of each conversation", () => {
    const result = mergeConversationSnapshots(
      [conversation("chat", "2026-01-01T00:00:01.000Z", "local")],
      [
        conversation("chat", "2026-01-01T00:00:02.000Z", "external"),
        conversation("other", "2026-01-01T00:00:03.000Z")
      ],
      {},
      {}
    );

    expect(result.conversations.map(({ id }) => id)).toEqual(["other", "chat"]);
    expect(result.conversations.find(({ id }) => id === "chat")?.title).toBe(
      "external"
    );
  });

  it("preserves deletions across tabs without deleting a newer recreation", () => {
    const deleted = mergeConversationSnapshots(
      [conversation("chat", recentIso(-2_000))],
      [],
      {},
      { chat: recentIso(-1_000) }
    );
    expect(deleted.conversations).toEqual([]);

    const recreated = mergeConversationSnapshots(
      [conversation("chat", recentIso(1_000))],
      [],
      {},
      { chat: recentIso(-1_000) }
    );
    expect(recreated.conversations).toHaveLength(1);
  });

  it("writes a versioned payload", () => {
    expect(encodeConversationStorage([], {})).toEqual({
      version: 2,
      conversations: [],
      tombstones: {}
    });
  });
});
