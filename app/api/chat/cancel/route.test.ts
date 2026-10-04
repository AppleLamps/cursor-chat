import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent, CursorSdkError } from "@cursor/sdk";
import { POST } from "@/app/api/chat/cancel/route";
import { createAgentSessionToken } from "@/lib/agent-session";

vi.mock("@cursor/sdk", () => ({
  Agent: { cancelRun: vi.fn(), getRun: vi.fn() },
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
    vi.mocked(Agent.getRun).mockReset().mockResolvedValue({ agentId: "agent", status: "running" } as Awaited<ReturnType<typeof Agent.getRun>>);
    cancelRun.mockImplementation(async () => {
      vi.mocked(Agent.getRun).mockResolvedValue({ agentId: "agent", status: "cancelled" } as Awaited<ReturnType<typeof Agent.getRun>>);
    });
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

  it("does not claim an already finished run was cancelled", async () => {
    vi.mocked(Agent.getRun).mockResolvedValue({ agentId: "agent", status: "finished" } as Awaited<ReturnType<typeof Agent.getRun>>);
    const response = await POST(request({ ...requestBody, agentSessionToken: createAgentSessionToken(requestBody) }));
    expect(await response.json()).toMatchObject({ cancelled: false, status: "finished" });
    expect(cancelRun).not.toHaveBeenCalled();
  });

  it("does not confirm cancellation until Cursor reports it", async () => {
    cancelRun.mockResolvedValue(undefined);
    const response = await POST(request({ ...requestBody, agentSessionToken: createAgentSessionToken(requestBody) }));
    expect(await response.json()).toMatchObject({ cancelled: false, status: "running" });
  });

  it("reconciles a finish racing with the cancellation request", async () => {
    cancelRun.mockImplementation(async () => {
      vi.mocked(Agent.getRun).mockResolvedValue({ agentId: "agent", status: "finished" } as Awaited<ReturnType<typeof Agent.getRun>>);
      throw Object.assign(new CursorSdkError("Run already ended"), { code: "run_not_cancellable", status: 409 });
    });
    const response = await POST(request({ ...requestBody, agentSessionToken: createAgentSessionToken(requestBody) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ cancelled: false, status: "finished" });
  });

  it("still stops a run on a branch that Implement policy would now refuse", async () => {
    const scope = { ...requestBody, branch: "main" };
    const agentSessionToken = createAgentSessionToken(scope);
    const response = await POST(request({ ...scope, agentSessionToken }));

    expect(response.status).toBe(200);
    expect(cancelRun).toHaveBeenCalledOnce();
  });

  it("answers 400 rather than throwing on non-string fields", async () => {
    const response = await POST(request({ ...requestBody, apiKey: 7, runId: {} }));

    expect(response.status).toBe(400);
    expect(cancelRun).not.toHaveBeenCalled();
  });

  it("rejects oversized control bodies", async () => {
    const response = await POST(
      request({ ...requestBody, padding: "x".repeat(17_000) })
    );

    expect(response.status).toBe(413);
  });
});
