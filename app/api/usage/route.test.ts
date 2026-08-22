import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@cursor/sdk";
import { POST } from "@/app/api/usage/route";
import { createAgentSessionToken } from "@/lib/agent-session";

vi.mock("@cursor/sdk", () => ({
  Agent: { getUsage: vi.fn() },
  CursorSdkError: class CursorSdkError extends Error {},
  CursorAgentError: class CursorAgentError extends Error {}
}));

const body = {
  apiKey: "key",
  agentId: "agent",
  repoUrl: "https://github.com/acme/app",
  branch: "main",
  agentMode: "qa" as const,
  modelId: "composer-2.5",
  model: { id: "composer-2.5" }
};

const tokenUsage = {
  inputTokens: 10,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 30
};

function request(value: Record<string, unknown>) {
  return new Request("https://example.test/api/usage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value)
  });
}

describe("agent usage route", () => {
  const getUsage = vi.mocked(Agent.getUsage);

  beforeEach(() => {
    getUsage.mockReset();
  });

  it("returns normalized usage within a signed agent scope", async () => {
    getUsage.mockResolvedValue({
      usage: tokenUsage,
      cost: { rawCostCents: 20, chargedCents: 15 },
      runs: [
        { runId: "run-1", usage: tokenUsage, cost: { rawCostCents: 8, chargedCents: 6 } }
      ]
    } as never);
    const agentSessionToken = createAgentSessionToken(body);
    const response = await POST(request({ ...body, agentSessionToken }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      usage: tokenUsage,
      cost: { rawCostCents: 20, chargedCents: 15 },
      runs: [
        { runId: "run-1", usage: tokenUsage, cost: { rawCostCents: 8, chargedCents: 6 } }
      ]
    });
    expect(getUsage).toHaveBeenCalledWith("agent", { apiKey: "key" });
  });

  it("omits cost that the billing backend has not reported yet", async () => {
    getUsage.mockResolvedValue({
      usage: tokenUsage,
      runs: [{ runId: "run-1", usage: tokenUsage }]
    } as never);
    const agentSessionToken = createAgentSessionToken(body);
    const response = await POST(request({ ...body, agentSessionToken }));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      cost?: unknown;
      runs: Array<{ cost?: unknown }>;
    };
    expect(payload.cost).toBeUndefined();
    expect(payload.runs[0].cost).toBeUndefined();
  });

  it("rejects a mismatched signed scope before calling the SDK", async () => {
    const agentSessionToken = createAgentSessionToken({
      ...body,
      branch: "other-branch"
    });
    const response = await POST(request({ ...body, agentSessionToken }));

    expect(response.status).toBe(409);
    expect(getUsage).not.toHaveBeenCalled();
  });

  it("rejects a request with no session token", async () => {
    const response = await POST(request(body));

    expect(response.status).toBe(409);
    expect(getUsage).not.toHaveBeenCalled();
  });

  it("never leaks usage for an agent signed with a different API key", async () => {
    const agentSessionToken = createAgentSessionToken({ ...body, apiKey: "other-key" });
    const response = await POST(request({ ...body, agentSessionToken }));

    expect(response.status).toBe(409);
    expect(getUsage).not.toHaveBeenCalled();
  });
});
