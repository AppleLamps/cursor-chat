import { describe, expect, it } from "vitest";
import { implementationOutcome, safePullRequestUrl, cursorFailureMessage } from "@/lib/implementation";
import { agentIdForTurn } from "@/lib/agent-session";
const repoUrl = "https://github.com/acme/app";
describe("Implement metadata", () => {
  it("keeps all same-repository branches, normalizes SDK URLs, and rejects unrelated PRs", () => {
    const outcome = implementationOutcome({ branches: [
      { repoUrl: "github.com/Acme/App", branch: "cursor/task", prUrl: `${repoUrl}/pull/1` },
      { repoUrl, branch: "cursor/task-2", prUrl: "https://github.com/other/app/pull/3" },
      { repoUrl: "https://github.com/other/app", prUrl: "https://github.com/other/app/pull/2" }
    ] }, { repoUrl, startingRef: "main", agentId: "agent", runId: "run", status: "error" });
    expect(outcome.branches).toHaveLength(2);
    expect(outcome.branches[0].prUrl).toBe(`${repoUrl}/pull/1`);
    expect(outcome.branches[1].prUrl).toBeUndefined();
    expect(outcome.status).toBe("error");
  });
  it.each(["javascript:alert(1)", "https://evil.test/acme/app/pull/1", "https://github.com:8443/acme/app/pull/1", `${repoUrl}/pull/1?token=secret`, "https://user:pass@github.com/acme/app/pull/1"])("rejects unsafe URL %s", (url) => {
    expect(safePullRequestUrl(url, repoUrl)).toBeUndefined();
  });
  it("keeps launch identity stable and separates accounts and turns", () => {
    expect(agentIdForTurn("key", "turn")).toBe(agentIdForTurn("key", "turn"));
    expect(agentIdForTurn("key", "turn")).not.toBe(agentIdForTurn("other", "turn"));
    expect(agentIdForTurn("key", "turn")).not.toBe(agentIdForTurn("key", "other"));
    expect(agentIdForTurn("key", "turn", "repo-a")).not.toBe(agentIdForTurn("key", "turn", "repo-b"));
    expect(agentIdForTurn("key", "turn")).toMatch(/^bc-[a-f0-9-]{36}$/);
  });
  it("separates Cursor integration permissions from metadata credentials", () => {
    expect(cursorFailureMessage({ message: "GitHub access denied" })).toContain("does not grant Cursor access");
  });
});
