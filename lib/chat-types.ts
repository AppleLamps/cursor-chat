import type { AgentTraceEntry } from "@/lib/agent-activity";
import type { AgentMode, ModelId } from "@/lib/defaults";
import type { ModelSelection } from "@/lib/model-client";

export type Role = "user" | "assistant";

export type ImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  storageKey?: string;
};

export type PdfAttachment = {
  id: string;
  name: string;
  url: string;
};

export type ChatTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  imageAttachments?: ImageAttachment[];
  pdfAttachments?: PdfAttachment[];
  annotations?: unknown[];
  error?: boolean;
  streaming?: boolean;
  activity?: string;
  activityLog?: string[];
  thinking?: string;
  /** Reasoning and tool updates in the order they streamed in. */
  trace?: AgentTraceEntry[];
  sources?: string[];
  prUrl?: string;
  runId?: string;
  requestId?: string;
  durationMs?: number;
  usage?: ChatTokenUsage;
  modelId?: string;
  /** Stable identity for one user turn and all retries of that turn. */
  turnId?: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  manualTitle?: boolean;
  repoUrl?: string;
  branch?: string;
  agentId?: string;
  agentSessionToken?: string;
  /** Last lifecycle state explicitly set through this app. */
  agentArchived?: boolean;
  agentMode?: AgentMode;
  modelId?: ModelId;
  /** Canonical SDK model selection. modelId remains for legacy storage. */
  model?: ModelSelection;
};

export type RepoPickerMode = "initial" | "new-chat" | "change";

export type ApiError = {
  error: string;
  status?: number;
};
