import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@cursor/sdk";
import { POST } from "@/app/api/agents/lifecycle/route";
import { createAgentSessionToken } from "@/lib/agent-session";

vi.mock("@cursor/sdk", () => ({
  Agent: {
    archive: vi.fn(),
    unarchive: vi.fn(),
    delete: vi.fn()
  },
  CursorSdkError: class CursorSdkError extends Error {}
}));

const scope = {
  apiKey: "key",
  agentId: "bc-agent",
  repoUrl: "https://github.com/acme/app",
  branch: "feature/lifecycle",
  agentMode: "implement" as const,
  modelId: "composer-2.5" as const
};

function request(body: Record<string, unknown>) {
  return new Request("https://example.test/api/agents/lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("cloud agent lifecycle route", () => {
  beforeEach(() => {
    vi.mocked(Agent.archive).mockReset().mockResolvedValue(undefined);
    vi.mocked(Agent.unarchive).mockReset().mockResolvedValue(undefined);
    vi.mocked(Agent.delete).mockReset().mockResolvedValue(undefined);
  });

  it.each(["archive", "unarchive", "delete"] as const)(
    "performs the authenticated %s operation",
    async (action) => {
      const agentSessionToken = createAgentSessionToken(scope);
      const response = await POST(request({ ...scope, action, agentSessionToken }));

      expect(response.status).toBe(200);
      expect(Agent[action]).toHaveBeenCalledWith("bc-agent", { apiKey: "key" });
      expect(await response.json()).toMatchObject({ action, agentId: "bc-agent" });
    }
  );

  it("rejects a lifecycle operation outside the signed full scope", async () => {
    const agentSessionToken = createAgentSessionToken({
      ...scope,
      branch: "feature/other"
    });
    const response = await POST(
      request({ ...scope, action: "delete", agentSessionToken })
    );

    expect(response.status).toBe(409);
    expect(Agent.delete).not.toHaveBeenCalled();
  });

  it("rejects unknown lifecycle actions", async () => {
    const response = await POST(request({ ...scope, action: "purge" }));

    expect(response.status).toBe(400);
    expect(Agent.archive).not.toHaveBeenCalled();
    expect(Agent.unarchive).not.toHaveBeenCalled();
    expect(Agent.delete).not.toHaveBeenCalled();
  });
});
