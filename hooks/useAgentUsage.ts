"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BRANCH } from "@/lib/defaults";
import type { Conversation, ChatUsageCost } from "@/lib/chat-types";
import { DEFAULT_MODEL_SELECTION } from "@/lib/model-client";
import { normalizeAgentUsage, type AgentUsagePayload } from "@/lib/usage-api";

/**
 * Billing events land shortly after a run ends, so the first read can come back
 * with usage but no cost. Retry a few times before giving up rather than
 * leaving the run permanently blank.
 */
const COST_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000];

export type AgentUsageState = {
  costByRunId: Map<string, ChatUsageCost>;
  total: AgentUsagePayload["cost"];
  loading: boolean;
};

function completedRunIds(conversation: Conversation | null | undefined) {
  if (!conversation) return [] as string[];
  return conversation.messages.flatMap((message) =>
    message.role === "assistant" && !message.streaming && !message.error && message.runId
      ? [message.runId]
      : []
  );
}

/**
 * Loads billed cost for the active conversation's cloud agent. One request
 * covers every run in the chat, so cost is fetched per conversation rather than
 * per message.
 */
export function useAgentUsage(
  apiKey: string | null,
  conversation: Conversation | null | undefined
): AgentUsageState {
  const [usage, setUsage] = useState<AgentUsagePayload>({ runs: [] });
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agentId = conversation?.agentId;
  const agentSessionToken = conversation?.agentSessionToken;
  const repoUrl = conversation?.repoUrl;
  const branch = conversation?.branch || DEFAULT_BRANCH;
  const agentMode = conversation?.agentMode || "qa";
  const model = conversation?.model || {
    id: conversation?.modelId || DEFAULT_MODEL_SELECTION.id
  };
  // Refetch whenever a new run completes, not on every message mutation.
  const runIdKey = completedRunIds(conversation).join(",");
  // Serialized so the effect compares model by value, not by object identity.
  const modelKey = JSON.stringify(model);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const request = ++requestRef.current;
    clearRetry();

    if (!apiKey || !agentId || !agentSessionToken || !repoUrl || !runIdKey) {
      setUsage({ runs: [] });
      setLoading(false);
      return;
    }

    const expectedRunIds = runIdKey.split(",");
    let cancelled = false;
    const controller = new AbortController();

    async function load(attempt: number) {
      if (cancelled || request !== requestRef.current) return;
      setLoading(true);
      try {
        const response = await fetch("/api/usage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            agentId,
            agentSessionToken,
            repoUrl,
            branch,
            agentMode,
            model: JSON.parse(modelKey)
          }),
          signal: controller.signal
        });
        if (cancelled || request !== requestRef.current) return;
        if (!response.ok) return;

        const payload = normalizeAgentUsage(await response.json());
        if (cancelled || request !== requestRef.current) return;
        setUsage(payload);

        // Retry only while a completed run is still missing its cost.
        const priced = new Set(
          payload.runs.flatMap((run) => (run.cost ? [run.runId] : []))
        );
        const pending = expectedRunIds.some((runId) => !priced.has(runId));
        if (pending && attempt < COST_RETRY_DELAYS_MS.length) {
          retryTimerRef.current = setTimeout(
            () => void load(attempt + 1),
            COST_RETRY_DELAYS_MS[attempt]
          );
        }
      } catch {
        // Cost is supplementary; a failed read just leaves the label hidden.
      } finally {
        if (!cancelled && request === requestRef.current) setLoading(false);
      }
    }

    void load(0);

    return () => {
      cancelled = true;
      controller.abort();
      clearRetry();
    };
  }, [
    apiKey,
    agentId,
    agentSessionToken,
    repoUrl,
    branch,
    agentMode,
    modelKey,
    runIdKey,
    clearRetry
  ]);

  // Rebuilt on every streamed chunk otherwise, and handed to every bubble.
  const costByRunId = useMemo(() => {
    const map = new Map<string, ChatUsageCost>();
    for (const run of usage.runs) {
      if (run.cost) map.set(run.runId, run.cost);
    }
    return map;
  }, [usage.runs]);

  return { costByRunId, total: usage.cost, loading };
}
