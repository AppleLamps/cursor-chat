import { describe, expect, it } from "vitest";
import {
  INTERRUPTED_NOTE,
  conversationTranscript,
  createConversation,
  normalizeConversation,
  sortConversations,
  titleFromMessages,
  uid,
  withPersistedMessages
} from "@/lib/chat-conversation";
import type { Conversation, Message } from "@/lib/chat-types";

function userMessage(content: string): Message {
  return {
    id: `user-${content}`,
    role: "user",
    content,
    createdAt: "2026-06-26T12:00:00.000Z"
  };
}

describe("chat conversation helpers", () => {
  it("creates conversations with repo, branch, and agent mode defaults", () => {
    const conversation = createConversation("https://github.com/acme/app");
    const planConversation = createConversation(
      "https://github.com/acme/app",
      "main",
      "plan",
      "grok-4.5"
    );

    expect(conversation.repoUrl).toBe("https://github.com/acme/app");
    expect(conversation.branch).toBe("main");
    expect(conversation.agentMode).toBe("qa");
    expect(conversation.modelId).toBe("composer-2.5");
    expect(conversation.messages).toEqual([]);
    expect(planConversation.agentMode).toBe("plan");
    expect(planConversation.modelId).toBe("grok-4.5");
  });

  it("generates collision-resistant UUID-style ids when available", () => {
    expect(uid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("sorts conversations newest first", () => {
    const older = {
      ...createConversation(),
      id: "older",
      updatedAt: "2026-06-25T12:00:00.000Z"
    };
    const newer = {
      ...createConversation(),
      id: "newer",
      updatedAt: "2026-06-26T12:00:00.000Z"
    };

    expect(sortConversations([older, newer]).map((item) => item.id)).toEqual([
      "newer",
      "older"
    ]);
  });

  it("derives titles from first user message and preserves manual titles", () => {
    const messages = [userMessage("Please explain this repository in detail")];
    const conversation: Conversation = {
      ...createConversation(),
      id: "manual",
      title: "Pinned title",
      manualTitle: true
    };

    expect(titleFromMessages(messages)).toBe("Please explain this repository in detail");
    expect(withPersistedMessages(conversation, messages).title).toBe("Pinned title");
  });

  it("normalizes invalid agent mode and strips private fields", () => {
    const conversation: Conversation = {
      ...createConversation(),
      agentMode: "bad-mode",
      modelId: "bad-model",
      systemPrompt: "secret"
    } as unknown as Conversation & { systemPrompt: string };

    const normalized = normalizeConversation(conversation);

    expect(normalized.agentMode).toBe("qa");
    expect(normalized.modelId).toBe("bad-model");
    expect("systemPrompt" in normalized).toBe(false);
  });

  it("hydrates stored conversations without model IDs to the default model", () => {
    const { modelId: _modelId, ...storedConversation } = createConversation();

    expect(normalizeConversation(storedConversation).modelId).toBe("composer-2.5");
  });

  it("preserves plan mode and model during normalization and persistence", () => {
    const conversation: Conversation = {
      ...createConversation(),
      agentMode: "plan",
      modelId: "grok-4.5"
    };
    const messages = [userMessage("Plan this")];

    expect(normalizeConversation(conversation).agentMode).toBe("plan");
    expect(normalizeConversation(conversation).modelId).toBe(
      "grok-4.5"
    );
    expect(withPersistedMessages(conversation, messages).agentMode).toBe("plan");
    expect(withPersistedMessages(conversation, messages).modelId).toBe(
      "grok-4.5"
    );
  });

  it("formats a share transcript with attachment labels", () => {
    const transcript = conversationTranscript("Demo", [
      {
        ...userMessage("Analyze this"),
        imageAttachments: [
          {
            id: "image",
            name: "screen.png",
            mimeType: "image/png",
            url: "https://example.com/screen.png"
          }
        ]
      }
    ]);

    expect(transcript).toContain("# Demo");
    expect(transcript).toContain("You (");
    expect(transcript).toContain("[Attached image: screen.png]");
  });
});

describe("interrupted replies and malformed history", () => {
  const NOW = Date.parse("2026-06-26T12:10:00.000Z");

  function streaming(overrides: Partial<Message> = {}): Message {
    return {
      id: "reply",
      role: "assistant",
      content: "Partial answer",
      createdAt: "2026-06-26T12:00:00.000Z",
      streaming: true,
      runId: "run-1",
      ...overrides
    };
  }

  function conversationWith(messages: Message[]): Conversation {
    return { ...createConversation("https://github.com/acme/app"), messages };
  }

  it("turns an abandoned streaming reply into a recoverable error that keeps the partial text", () => {
    const [message] = normalizeConversation(
      conversationWith([streaming({ heartbeatAt: NOW - 120_000 })]),
      NOW
    ).messages;

    expect(message.streaming).toBe(false);
    expect(message.error).toBe(true);
    expect(message.recoverable).toBe(true);
    expect(message.runId).toBe("run-1");
    expect(message.content).toContain("Partial answer");
    expect(message.content).toContain(INTERRUPTED_NOTE);
  });

  it("treats a streaming reply with no heartbeat (older saves) as abandoned", () => {
    const [message] = normalizeConversation(conversationWith([streaming()]), NOW)
      .messages;

    expect(message.streaming).toBe(false);
    expect(message.error).toBe(true);
  });

  it("leaves a reply with a fresh heartbeat alone, since another tab is still running it", () => {
    const [message] = normalizeConversation(
      conversationWith([streaming({ heartbeatAt: NOW - 5_000 })]),
      NOW
    ).messages;

    expect(message.streaming).toBe(true);
    expect(message.error).toBeUndefined();
  });

  it("is not recoverable without a run id, and has a useful message with no partial text", () => {
    const [message] = normalizeConversation(
      conversationWith([streaming({ content: "", runId: undefined, heartbeatAt: 1 })]),
      NOW
    ).messages;

    expect(message.recoverable).toBe(false);
    expect(message.content).toBe(INTERRUPTED_NOTE);
  });

  it("drops one malformed message instead of failing the whole history", () => {
    const good = userMessage("hello");
    const messages = [
      good,
      null,
      { id: 5, role: "user", content: "bad id" },
      { id: "x", role: "system", content: "bad role" }
    ] as unknown as Message[];

    expect(normalizeConversation(conversationWith(messages), NOW).messages).toEqual([
      good
    ]);
  });

  it("settles messages when mapped over an array (the index must not be read as the clock)", () => {
    const conversations = [
      conversationWith([streaming({ heartbeatAt: Date.now() - 600_000 })])
    ];

    // This is how the store calls it; a bare .map(normalizeConversation) would
    // pass the index (0) as `now` and leave the stale reply spinning.
    const [conversation] = conversations.map((item) => normalizeConversation(item));

    expect(conversation.messages[0].streaming).toBe(false);
  });

  it("keeps the archived flag when messages are replaced", () => {
    const archived = { ...createConversation("https://github.com/acme/app"), agentArchived: true };

    expect(
      withPersistedMessages(archived, [userMessage("hi")]).agentArchived
    ).toBe(true);
  });
});
