import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@cursor/sdk";
import { POST } from "@/app/api/artifacts/route";
import { createAgentSessionToken } from "@/lib/agent-session";

vi.mock("@cursor/sdk", () => ({
  Agent: { resume: vi.fn() },
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

function request(value: Record<string, unknown>) {
  return new Request("https://example.test/api/artifacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value)
  });
}

describe("artifact listing route", () => {
  const resume = vi.mocked(Agent.resume);
  const listArtifacts = vi.fn();
  const close = vi.fn();

  beforeEach(() => {
    resume.mockReset();
    listArtifacts.mockReset();
    close.mockReset();
    resume.mockResolvedValue({ listArtifacts, close } as never);
  });

  it("lists safe artifacts within a signed agent scope", async () => {
    listArtifacts.mockResolvedValue([
      { path: "reports/result.json", sizeBytes: 12, updatedAt: "2026-07-24T00:00:00Z" },
      { path: "../secret", sizeBytes: 4, updatedAt: "2026-07-24T00:00:00Z" }
    ]);
    const agentSessionToken = createAgentSessionToken(body);
    const response = await POST(request({ ...body, agentSessionToken }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      artifacts: [
        { path: "reports/result.json", sizeBytes: 12, updatedAt: "2026-07-24T00:00:00Z" }
      ]
    });
    expect(resume).toHaveBeenCalledWith("agent", { apiKey: "key" });
    expect(close).toHaveBeenCalled();
  });

  it("rejects a mismatched signed scope before resuming", async () => {
    const agentSessionToken = createAgentSessionToken({ ...body, branch: "other" });
    const response = await POST(request({ ...body, agentSessionToken }));
    expect(response.status).toBe(409);
    expect(resume).not.toHaveBeenCalled();
  });
});
