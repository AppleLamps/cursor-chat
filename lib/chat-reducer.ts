import { DEFAULT_BRANCH, type AgentMode } from "@/lib/defaults";
import type { Conversation, Message } from "@/lib/chat-types";
import {
  latestUserMessage,
  resolveConversationAgentMode,
  sortConversations,
  withPersistedMessages
} from "@/lib/chat-conversation";
import { uniqueSortedSources } from "@/lib/sources";

export type ConversationState = {
  conversations: Conversation[];
  activeConversationId: string;
};

export type ConversationAction =
  | {
      type: "hydrate";
      conversations: Conversation[];
      activeConversationId?: string;
    }
  | { type: "activate"; conversation: Conversation }
  | { type: "create"; conversation: Conversation }
  | { type: "delete"; id: string }
  | { type: "rename"; id: string; title: string }
  | { type: "change-repo"; id: string; repoUrl: string; branch: string }
  | { type: "change-mode"; id: string; mode: AgentMode }
  | {
      type: "replace-messages";
      conversationId: string;
      messages: Message[];
      agentId?: string | null;
      agentSessionToken?: string | null;
    }
  | {
      type: "patch-message";
      conversationId: string;
      messageId: string;
      patch: Partial<Message>;
    }
  | {
      type: "merge-source";
      conversationId: string;
      messageId: string;
      source: string;
    };

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction
): ConversationState {
  switch (action.type) {
    case "hydrate": {
      const conversations = sortConversations(action.conversations);
      const requested = action.activeConversationId;
      const activeConversationId =
        requested && conversations.some((conversation) => conversation.id === requested)
          ? requested
          : conversations[0]?.id ?? state.activeConversationId;

      return { conversations, activeConversationId };
    }

    case "activate":
    case "create":
      return {
        conversations: sortConversations([
          action.conversation,
          ...state.conversations.filter(
            (conversation) => conversation.id !== action.conversation.id
          )
        ]),
        activeConversationId: action.conversation.id
      };

    case "delete": {
      const conversations = sortConversations(
        state.conversations.filter((conversation) => conversation.id !== action.id)
      );

      return {
        conversations,
        activeConversationId:
          action.id === state.activeConversationId
            ? conversations[0]?.id ?? state.activeConversationId
            : state.activeConversationId
      };
    }

    case "rename":
      return {
        ...state,
        conversations: sortConversations(
          state.conversations.map((conversation) =>
            conversation.id === action.id
              ? {
                  ...conversation,
                  title: action.title,
                  manualTitle: true,
                  updatedAt: new Date().toISOString()
                }
              : conversation
          )
        )
      };

    case "change-repo":
      return {
        ...state,
        conversations: sortConversations(
          state.conversations.map((conversation) =>
            conversation.id === action.id
              ? {
                  ...conversation,
                  repoUrl: action.repoUrl,
                  branch: action.branch,
                  agentId: undefined,
                  agentSessionToken: undefined,
                  updatedAt: new Date().toISOString()
                }
              : conversation
          )
        )
      };

    case "change-mode":
      return {
        ...state,
        conversations: sortConversations(
          state.conversations.map((conversation) =>
            conversation.id === action.id
              ? {
                  ...conversation,
                  agentMode: action.mode,
                  agentId: undefined,
                  agentSessionToken: undefined,
                  updatedAt: new Date().toISOString()
                }
              : conversation
          )
        )
      };

    case "replace-messages":
      if (action.messages.length === 0) return state;

      return {
        ...state,
        conversations: sortConversations(
          state.conversations.map((conversation) =>
            conversation.id === action.conversationId
              ? withPersistedMessages(
                  conversation,
                  action.messages,
                  new Date().toISOString(),
                  action.agentId,
                  action.agentSessionToken
                )
              : conversation
          )
        )
      };

    case "patch-message":
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.conversationId
            ? {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === action.messageId
                    ? { ...message, ...action.patch }
                    : message
                )
              }
            : conversation
        )
      };

    case "merge-source":
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.conversationId
            ? {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === action.messageId
                    ? {
                        ...message,
                        sources: uniqueSortedSources([
                          ...(message.sources || []),
                          action.source
                        ])
                      }
                    : message
                )
              }
            : conversation
        )
      };

    default:
      return state;
  }
}

export function activeConversation(state: ConversationState) {
  return (
    state.conversations.find(
      (conversation) => conversation.id === state.activeConversationId
    ) || null
  );
}

export function activeMessages(state: ConversationState) {
  return activeConversation(state)?.messages ?? [];
}

export function lastUserMessage(state: ConversationState) {
  return latestUserMessage(activeMessages(state));
}

export function defaultBranchForConversation(conversation?: Conversation | null) {
  return conversation?.branch || DEFAULT_BRANCH;
}

export function agentModeForConversation(conversation?: Conversation | null) {
  return resolveConversationAgentMode(conversation);
}
