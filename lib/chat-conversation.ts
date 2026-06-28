import { isImplementMode, isPlanMode, parseAgentMode } from "@/lib/agent-mode";
import { DEFAULT_AGENT_MODE, DEFAULT_BRANCH, type AgentMode } from "@/lib/defaults";
import type { Conversation, Message, Role } from "@/lib/chat-types";

export function uid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function roleLabel(role: Role) {
  return role === "user" ? "You" : "Assistant";
}

export function titleFromMessages(messages: Message[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const text = firstUserMessage?.content.trim().replace(/\s+/g, " ") || "New chat";
  return text.length > 52 ? `${text.slice(0, 49)}...` : text;
}

export function agentModeLabel(mode: AgentMode) {
  if (isImplementMode(mode)) return "Implement";
  if (isPlanMode(mode)) return "Plan";
  return "Ask";
}

export function resolveConversationAgentMode(
  conversation?: Conversation | null
): AgentMode {
  return parseAgentMode(conversation?.agentMode);
}

export function createConversation(
  repoUrl?: string,
  branch?: string,
  agentMode: AgentMode = DEFAULT_AGENT_MODE
): Conversation {
  const now = new Date().toISOString();

  return {
    id: uid(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
    repoUrl,
    branch: branch || DEFAULT_BRANCH,
    agentMode
  };
}

export function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function latestUserMessage(messages: Message[]) {
  return (
    [...messages].reverse().find((message) => message.role === "user")?.content ||
    null
  );
}

export function latestPrUrl(messages: Message[]) {
  return [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.prUrl)?.prUrl;
}

export function conversationTranscript(
  conversationTitle: string,
  messages: Message[]
) {
  const transcript = messages
    .map((message) => {
      const label = roleLabel(message.role);
      const attachments = [
        ...(message.imageAttachments || []).map(
          (image) => `[Attached image: ${image.name}]`
        ),
        ...(message.pdfAttachments || []).map(
          (pdf) => `[Attached PDF: ${pdf.name}]`
        )
      ];
      const attachmentText = attachments.length
        ? `\n\n${attachments.join("\n")}`
        : "";

      return `${label} (${timeLabel(message.createdAt)}):\n${message.content}${attachmentText}`;
    })
    .join("\n\n---\n\n");

  return `# ${conversationTitle}\n\n${transcript}`;
}

export function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Conversation>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.messages)
  );
}

export function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...stripPrivateConversationFields(conversation),
    agentMode: parseAgentMode(conversation.agentMode)
  };
}

export function stripPrivateConversationFields(conversation: Conversation) {
  const {
    systemPrompt: _systemPrompt,
    ...publicConversation
  } = conversation as Conversation & { systemPrompt?: string };

  return publicConversation;
}

export function withPersistedMessages(
  conversation: Conversation,
  messages: Message[],
  now = new Date().toISOString(),
  nextAgentId?: string | null,
  nextAgentSessionToken?: string | null
): Conversation {
  const title =
    conversation.manualTitle && conversation.title
      ? conversation.title
      : titleFromMessages(messages);

  return {
    id: conversation.id,
    title,
    createdAt: conversation.createdAt,
    updatedAt: now,
    messages,
    manualTitle: conversation.manualTitle,
    repoUrl: conversation.repoUrl,
    branch: conversation.branch,
    agentId:
      nextAgentId === null ? undefined : nextAgentId ?? conversation.agentId,
    agentSessionToken:
      nextAgentId === null
        ? undefined
        : nextAgentSessionToken ?? conversation.agentSessionToken,
    agentMode: resolveConversationAgentMode(conversation)
  };
}
