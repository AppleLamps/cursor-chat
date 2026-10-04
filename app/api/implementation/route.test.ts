import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@cursor/sdk";
import { POST } from "@/app/api/implementation/route";
import { createAgentSessionToken } from "@/lib/agent-session";
import { getGitHubPullRequest } from "@/lib/github";
vi.mock("@cursor/sdk", () => ({ Agent: { getRun: vi.fn() }, CursorSdkError: class extends Error {} }));
vi.mock("@/lib/github", () => ({ getGitHubPullRequest: vi.fn() }));
const scope = { agentId: "agent", apiKey: "synthetic", repoUrl: "https://github.com/acme/app", branch: "main",
  agentMode: "implement" as const, modelId: "composer-2.5" };
function request(extra = {}) { return new Request("https://test/api/implementation", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...scope, runId: "run", agentSessionToken: createAgentSessionToken(scope), ...extra }) }); }
beforeEach(() => {
  vi.mocked(Agent.getRun).mockReset().mockResolvedValue({ agentId: "agent", status: "finished", git: { branches: [
    { repoUrl: "github.com/acme/app", branch: "cursor/task", prUrl: "https://github.com/acme/app/pull/7" }
  ] } } as Awaited<ReturnType<typeof Agent.getRun>>);
  vi.mocked(getGitHubPullRequest).mockReset().mockRejectedValue(new Error("Connect GitHub with read access"));
});
afterEach(() => vi.unstubAllEnvs());
describe("implementation status authorization", () => {
  it("observes existing runs when new writes are disabled and retains metadata on GitHub failure", async () => {
    vi.stubEnv("ASKCURSOR_ENABLE_IMPLEMENT_MODE", "false");
    const response = await POST(request());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ outcome: { status: "finished", branches: [{ branch: "cursor/task" }] },
      pullRequests: [{ error: "Connect GitHub with read access" }] });
  });
  it("rejects cross-repository session reuse before provider calls", async () => {
    expect((await POST(request({ repoUrl: "https://github.com/other/app" }))).status).toBe(409);
    expect(Agent.getRun).not.toHaveBeenCalled();
    expect(getGitHubPullRequest).not.toHaveBeenCalled();
  });
  it("rejects a mismatched run owner", async () => {
    vi.mocked(Agent.getRun).mockResolvedValue({ agentId: "other", status: "finished" } as Awaited<ReturnType<typeof Agent.getRun>>);
    expect((await POST(request())).status).toBe(409);
    expect(getGitHubPullRequest).not.toHaveBeenCalled();
  });
});
