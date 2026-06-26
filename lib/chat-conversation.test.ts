import { describe, expect, it } from "vitest";
import {
  conversationTranscript,
  createConversation,
  normalizeConversation,
  sortConversations,
  titleFromMessages,
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
      "plan"
    );

    expect(conversation.repoUrl).toBe("https://github.com/acme/app");
    expect(conversation.branch).toBe("main");
    expect(conversation.agentMode).toBe("qa");
    expect(conversation.messages).toEqual([]);
    expect(planConversation.agentMode).toBe("plan");
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
    const conversation = {
      ...createConversation(),
      agentMode: "bad-mode",
      systemPrompt: "secret"
    } as unknown as Conversation & { systemPrompt: string };

    const normalized = normalizeConversation(conversation);

    expect(normalized.agentMode).toBe("qa");
    expect("systemPrompt" in normalized).toBe(false);
  });

  it("preserves plan mode during normalization and persistence", () => {
    const conversation = {
      ...createConversation(),
      agentMode: "plan"
    };
    const messages = [userMessage("Plan this")];

    expect(normalizeConversation(conversation).agentMode).toBe("plan");
    expect(withPersistedMessages(conversation, messages).agentMode).toBe("plan");
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
