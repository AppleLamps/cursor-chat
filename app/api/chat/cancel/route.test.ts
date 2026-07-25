import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@cursor/sdk";
import { POST } from "@/app/api/chat/cancel/route";
import { createAgentSessionToken } from "@/lib/agent-session";

vi.mock("@cursor/sdk", () => ({
  Agent: { cancelRun: vi.fn() },
  CursorSdkError: class CursorSdkError extends Error {},
  CursorAgentError: class CursorAgentError extends Error {}
}));

const requestBody = {
  apiKey: "key",
  agentId: "agent",
  runId: "run",
  repoUrl: "https://github.com/acme/app",
  branch: "feature/recovery",
  agentMode: "implement" as const,
  modelId: "composer-2.5" as const
};

function request(body: Record<string, unknown>) {
  return new Request("https://example.test/api/chat/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("chat cancellation route", () => {
  const cancelRun = vi.mocked(Agent.cancelRun);

  beforeEach(() => {
    cancelRun.mockReset();
    cancelRun.mockResolvedValue(undefined);
  });

  it("cancels only the run bound to a valid agent session", async () => {
    const agentSessionToken = createAgentSessionToken(requestBody);
    const response = await POST(
      request({ ...requestBody, agentSessionToken })
    );

    expect(response.status).toBe(200);
    expect(cancelRun).toHaveBeenCalledWith("run", {
      runtime: "cloud",
      agentId: "agent",
      apiKey: "key"
    });
  });

  it("rejects a run cancellation with a mismatched session scope", async () => {
    const agentSessionToken = createAgentSessionToken({
      ...requestBody,
      branch: "feature/other"
    });
    const response = await POST(
      request({ ...requestBody, agentSessionToken })
    );

    expect(response.status).toBe(409);
    expect(cancelRun).not.toHaveBeenCalled();
  });
});
