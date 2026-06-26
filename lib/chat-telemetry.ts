import type { ChatTokenUsage } from "@/lib/chat-types";

const USAGE_FIELDS = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "totalTokens"
] as const;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeTokenUsage(value: unknown): ChatTokenUsage | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Partial<Record<keyof ChatTokenUsage, unknown>>;
  const usage = Object.fromEntries(
    USAGE_FIELDS.map((field) => [field, finiteNumber(candidate[field])])
  ) as Record<(typeof USAGE_FIELDS)[number], number | undefined>;

  if (USAGE_FIELDS.some((field) => usage[field] === undefined)) {
    return undefined;
  }

  const reasoningTokens = finiteNumber(candidate.reasoningTokens);

  return {
    inputTokens: usage.inputTokens!,
    outputTokens: usage.outputTokens!,
    cacheReadTokens: usage.cacheReadTokens!,
    cacheWriteTokens: usage.cacheWriteTokens!,
    totalTokens: usage.totalTokens!,
    ...(reasoningTokens === undefined ? {} : { reasoningTokens })
  };
}

function compactNumber(value: number) {
  if (value < 1000) return `${value}`;
  if (value < 1_000_000) {
    return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  }
  return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}m`;
}

export function formatTokenUsage(usage: ChatTokenUsage | undefined) {
  if (!usage) return null;
  return `${compactNumber(usage.totalTokens)} tokens`;
}

export function telemetryTitle({
  usage,
  requestId,
  runId,
  modelId,
  durationMs
}: {
  usage?: ChatTokenUsage;
  requestId?: string;
  runId?: string;
  modelId?: string;
  durationMs?: number;
}) {
  const parts = [
    usage ? `Input: ${usage.inputTokens}` : null,
    usage ? `Output: ${usage.outputTokens}` : null,
    usage?.reasoningTokens !== undefined
      ? `Reasoning: ${usage.reasoningTokens}`
      : null,
    modelId ? `Model: ${modelId}` : null,
    durationMs !== undefined ? `Duration: ${durationMs}ms` : null,
    requestId ? `Request: ${requestId}` : null,
    runId ? `Run: ${runId}` : null
  ].filter(Boolean);

  return parts.join(" | ");
}
