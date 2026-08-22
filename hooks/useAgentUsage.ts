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
  /** True when the total omits runs from an agent that was replaced. */
  partial: boolean;
  loading: boolean;
};

/**
 * Every run that has stopped, including failed and cancelled ones — a run that
 * errored partway can still have consumed billable tokens, so leaving it out
 * would let the chat total silently undercount.
 */
function settledRunIds(conversation: Conversation | null | undefined) {
  if (!conversation) return [] as string[];
  return conversation.messages.flatMap((message) =>
    message.role === "assistant" && !message.streaming && message.runId
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
  const [{ usage, settled }, setState] = useState<{
    usage: AgentUsagePayload;
    settled: boolean;
  }>({ usage: { runs: [] }, settled: false });
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
  const runIdKey = settledRunIds(conversation).join(",");
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
      setState({ usage: { runs: [] }, settled: false });
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

        // A run this agent has no record of never arrives — it belongs to an
        // agent that was replaced. Only the newest run is plausibly still
        // landing, so only it justifies waiting.
        const reported = new Map(payload.runs.map((run) => [run.runId, run]));
        const newestRunId = expectedRunIds.at(-1);
        const pending =
          expectedRunIds.some((runId) => {
            const run = reported.get(runId);
            return Boolean(run) && !run?.cost;
          }) ||
          (newestRunId !== undefined && !reported.has(newestRunId));
        const willRetry = pending && attempt < COST_RETRY_DELAYS_MS.length;

        setState({ usage: payload, settled: !willRetry });

        if (willRetry) {
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

  /**
   * Runs the current agent never reported. Recovering from a lost cloud agent
   * replaces `conversation.agentId` while keeping the transcript, so earlier
   * runs belong to an agent this total does not cover. Flag the shortfall
   * instead of presenting an undercount as the whole bill.
   */
  const partial = useMemo(() => {
    if (!settled) return false;
    const reported = new Set(usage.runs.map((run) => run.runId));
    return runIdKey
      .split(",")
      .some((runId) => Boolean(runId) && !reported.has(runId));
  }, [settled, usage.runs, runIdKey]);

  return { costByRunId, total: usage.cost, partial, loading };
}
