import { describe, expect, it } from "vitest";
import { createConversation } from "@/lib/chat-conversation";
import { conversationReducer, type ConversationState } from "@/lib/chat-reducer";
import type { Message } from "@/lib/chat-types";

const userMessage: Message = {
  id: "user",
  role: "user",
  content: "hello",
  createdAt: "2026-06-26T12:00:00.000Z"
};

const assistantMessage: Message = {
  id: "assistant",
  role: "assistant",
  content: "",
  createdAt: "2026-06-26T12:01:00.000Z",
  streaming: true
};

function state(): ConversationState {
  const conversation = {
    ...createConversation("https://github.com/acme/app", "main"),
    id: "chat"
  };
  return {
    conversations: [conversation],
    activeConversationId: conversation.id
  };
}

describe("conversationReducer", () => {
  it("creates, activates, renames, changes repo, and changes mode", () => {
    const next = {
      ...createConversation("https://github.com/acme/next", "dev", "implement"),
      id: "next",
      agentId: "agent",
      agentSessionToken: "token"
    };
    let current = conversationReducer(state(), { type: "create", conversation: next });

    expect(current.activeConversationId).toBe("next");

    current = conversationReducer(current, {
      type: "rename",
      id: "next",
      title: "Manual"
    });
    current = conversationReducer(current, {
      type: "change-repo",
      id: "next",
      repoUrl: "https://github.com/acme/renamed",
      branch: "release",
      modelId: "grok-4.5"
    });
    current = conversationReducer(current, {
      type: "change-mode",
      id: "next",
      mode: "plan"
    });

    const updated = current.conversations.find((item) => item.id === "next");
    expect(updated?.title).toBe("Manual");
    expect(updated?.manualTitle).toBe(true);
    expect(updated?.repoUrl).toBe("https://github.com/acme/renamed");
    expect(updated?.branch).toBe("release");
    expect(updated?.modelId).toBe("grok-4.5");
    expect(updated?.agentId).toBeUndefined();
    expect(updated?.agentSessionToken).toBeUndefined();
    expect(updated?.agentMode).toBe("plan");
  });

  it("clears agent session state when the model changes", () => {
    const current = conversationReducer(state(), {
      type: "replace-messages",
      conversationId: "chat",
      messages: [userMessage, assistantMessage],
      agentId: "agent",
      agentSessionToken: "token"
    });

    const next = conversationReducer(current, {
      type: "change-model",
      id: "chat",
      modelId: "grok-4.5"
    });

    expect(next.conversations[0].modelId).toBe("grok-4.5");
    expect(next.conversations[0].agentId).toBeUndefined();
    expect(next.conversations[0].agentSessionToken).toBeUndefined();
  });

  it("persists optimistic, streaming, completion, source, and error transitions", () => {
    let current = conversationReducer(state(), {
      type: "replace-messages",
      conversationId: "chat",
      messages: [userMessage, assistantMessage]
    });

    current = conversationReducer(current, {
      type: "patch-message",
      conversationId: "chat",
      messageId: "assistant",
      patch: {
        content: "partial",
        activity: "Searching the codebase...",
        activityLog: ["Starting Cursor cloud agent...", "Searching the codebase..."]
      }
    });
    current = conversationReducer(current, {
      type: "merge-source",
      conversationId: "chat",
      messageId: "assistant",
      source: "app/page.tsx"
    });
    current = conversationReducer(current, {
      type: "replace-messages",
      conversationId: "chat",
      messages: [
        userMessage,
        {
          ...assistantMessage,
          content: "done",
          streaming: false,
          activityLog: [
            "Starting Cursor cloud agent...",
            "Searching the codebase..."
          ],
          sources: ["app/page.tsx"]
        }
      ],
      agentId: "agent",
      agentSessionToken: "token"
    });

    const conversation = current.conversations[0];
    expect(conversation.messages[1].content).toBe("done");
    expect(conversation.messages[1].activityLog).toEqual([
      "Starting Cursor cloud agent...",
      "Searching the codebase..."
    ]);
    expect(conversation.messages[1].sources).toEqual(["app/page.tsx"]);
    expect(conversation.agentId).toBe("agent");
    expect(conversation.agentSessionToken).toBe("token");

    current = conversationReducer(current, {
      type: "replace-messages",
      conversationId: "chat",
      messages: [
        userMessage,
        {
          ...assistantMessage,
          content: "failed",
          error: true,
          streaming: false
        }
      ],
      agentId: null,
      agentSessionToken: null
    });

    expect(current.conversations[0].agentId).toBeUndefined();
    expect(current.conversations[0].messages[1].error).toBe(true);
  });

  it("deletes active conversations and falls back to the next conversation", () => {
    const second = { ...createConversation(), id: "second" };
    const current = conversationReducer(
      { conversations: [state().conversations[0], second], activeConversationId: "chat" },
      { type: "delete", id: "chat" }
    );

    expect(current.conversations.map((item) => item.id)).toEqual(["second"]);
    expect(current.activeConversationId).toBe("second");
  });
});
