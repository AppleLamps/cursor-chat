import type { AgentMode } from "@/lib/defaults";

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
  thinking?: string;
  sources?: string[];
  prUrl?: string;
  runId?: string;
  requestId?: string;
  durationMs?: number;
  usage?: ChatTokenUsage;
  modelId?: string;
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
  agentMode?: AgentMode;
};

export type RepoPickerMode = "initial" | "new-chat" | "change";

export type ApiError = {
  error: string;
  status?: number;
};
