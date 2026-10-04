import type { RunResult } from "@cursor/sdk";
import { validateRepoUrl } from "@/lib/validate";

export type ImplementationBranch = { repoUrl: string; branch?: string; prUrl?: string };
export type ImplementationOutcome = {
  agentId: string;
  runId: string;
  status: "running" | "finished" | "error" | "cancelled";
  startingRef: string;
  /** Cursor's current per-agent Git state, including for historical runs. */
  branches: ImplementationBranch[];
};
export type PullRequestDetails = {
  url: string;
  number: number;
  state: "open" | "draft" | "closed" | "merged";
  head: string;
  base: string;
  files: Array<{ path: string; status: string; additions: number; deletions: number }>;
  filesTruncated: boolean;
};

export function canonicalRepoUrl(value: string) {
  const parsed = validateRepoUrl(value.startsWith("github.com/") ? `https://${value}` : value);
  return parsed.ok ? parsed.value.url.toLowerCase() : undefined;
}

export function safePullRequestUrl(value: unknown, repoUrl?: string) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port ||
        url.username || url.password || url.search || url.hash) return undefined;
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/([1-9]\d*)\/?$/);
    if (!match || !canonicalRepoUrl(`https://github.com/${match[1]}/${match[2]}`)) return undefined;
    if (repoUrl && canonicalRepoUrl(`https://github.com/${match[1]}/${match[2]}`) !== canonicalRepoUrl(repoUrl)) return undefined;
    return `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`;
  } catch { return undefined; }
}

export function implementationOutcome(
  git: RunResult["git"],
  context: Omit<ImplementationOutcome, "branches"> & { repoUrl: string }
): ImplementationOutcome {
  const repoUrl = canonicalRepoUrl(context.repoUrl)!;
  const branches = (git?.branches ?? []).flatMap((entry) => {
    if (canonicalRepoUrl(entry.repoUrl) !== repoUrl) return [];
    return [{ repoUrl, branch: entry.branch, prUrl: safePullRequestUrl(entry.prUrl, repoUrl) }];
  });
  return { agentId: context.agentId, runId: context.runId, status: context.status, startingRef: context.startingRef, branches };
}

export function cursorFailureMessage(error: { message: string; code?: string; status?: number }) {
  if (error.code === "integration_not_connected" || /github|repository|permission|integration|SSO/i.test(error.message)) {
    return `${error.message} Check this repository's access in Cursor Settings → Integrations, including organization approval/SSO and write permissions. The app's GitHub token is only used for GitHub metadata; it does not grant Cursor access.`;
  }
  if (error.status === 401) return "Cursor rejected the API key. Reconnect Cursor or check the key, then try again.";
  if (error.code === "agent_busy") return "This Cursor agent already has a run in progress. Reconnect to the existing run or wait for it to finish before sending a follow-up.";
  if (error.status === 404 || error.code === "not_found") return `${error.message} The agent or repository is unavailable. Check Cursor access; start a new chat explicitly if this agent was deleted.`;
  return error.message;
}
