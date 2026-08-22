// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentUsage } from "@/hooks/useAgentUsage";
import type { Conversation, Message } from "@/lib/chat-types";

afterEach(cleanup);

const tokenUsage = {
  inputTokens: 10,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 30
};

function assistant(runId: string, overrides: Partial<Message> = {}): Message {
  return {
    id: runId,
    role: "assistant",
    content: "Done.",
    createdAt: "2026-08-22T00:00:00Z",
    runId,
    ...overrides
  };
}

function conversation(messages: Message[]): Conversation {
  return {
    id: "conversation",
    title: "Chat",
    createdAt: "2026-08-22T00:00:00Z",
    updatedAt: "2026-08-22T00:00:00Z",
    messages,
    repoUrl: "https://github.com/acme/app",
    branch: "main",
    agentId: "agent",
    agentSessionToken: "token",
    agentMode: "qa",
    model: { id: "composer-2.5" }
  };
}

function mockUsageResponse(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useAgentUsage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests usage for a run that failed, since it can still be billed", async () => {
    const fetchMock = mockUsageResponse({
      cost: { rawCostCents: 90, chargedCents: 90 },
      runs: [
        { runId: "run-1", usage: tokenUsage, cost: { rawCostCents: 90, chargedCents: 90 } }
      ]
    });

    const { result } = renderHook(() =>
      useAgentUsage(
        "key",
        conversation([assistant("run-1", { error: true, content: "Run failed." })])
      )
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.costByRunId.get("run-1")).toEqual({
        rawCostCents: 90,
        chargedCents: 90
      })
    );
    expect(result.current.partial).toBe(false);
  });

  it("flags the total as partial when a run predates an agent replacement", async () => {
    mockUsageResponse({
      cost: { rawCostCents: 50, chargedCents: 50 },
      runs: [
        { runId: "run-2", usage: tokenUsage, cost: { rawCostCents: 50, chargedCents: 50 } }
      ]
    });

    const { result } = renderHook(() =>
      useAgentUsage("key", conversation([assistant("run-1"), assistant("run-2")]))
    );

    await waitFor(() => expect(result.current.partial).toBe(true));
    // The surviving run still prices normally; only the total is incomplete.
    expect(result.current.costByRunId.get("run-2")).toBeTruthy();
    expect(result.current.costByRunId.has("run-1")).toBe(false);
  });

  it("does not flag a complete total as partial", async () => {
    mockUsageResponse({
      cost: { rawCostCents: 50, chargedCents: 50 },
      runs: [
        { runId: "run-1", usage: tokenUsage, cost: { rawCostCents: 20, chargedCents: 20 } },
        { runId: "run-2", usage: tokenUsage, cost: { rawCostCents: 30, chargedCents: 30 } }
      ]
    });

    const { result } = renderHook(() =>
      useAgentUsage("key", conversation([assistant("run-1"), assistant("run-2")]))
    );

    await waitFor(() => expect(result.current.total).toBeTruthy());
    expect(result.current.partial).toBe(false);
  });

  it("skips the request entirely when no run has settled", async () => {
    const fetchMock = mockUsageResponse({ runs: [] });

    renderHook(() =>
      useAgentUsage("key", conversation([assistant("run-1", { streaming: true })]))
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the request without an API key", async () => {
    const fetchMock = mockUsageResponse({ runs: [] });

    renderHook(() => useAgentUsage(null, conversation([assistant("run-1")])));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
