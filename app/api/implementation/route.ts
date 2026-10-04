import { Agent, CursorSdkError } from "@cursor/sdk";
import { NextResponse } from "next/server";
import { authorizeArtifactRequest, type ArtifactRequest } from "@/lib/artifact-api";
import { readControlBody } from "@/lib/rate-limit";
import { getGitHubPullRequest } from "@/lib/github";
import { cursorFailureMessage, implementationOutcome } from "@/lib/implementation";
import { trimmedString } from "@/lib/validate";

export async function POST(request: Request) {
  const parsed = await readControlBody<ArtifactRequest & { runId?: string; githubToken?: string }>(request);
  if (!parsed.ok) return parsed.response;
  // Observing an existing run remains allowed when deployment write policy changes.
  const authorized = authorizeArtifactRequest(parsed.body, { observationOnly: true });
  if (!authorized.ok) return authorized.response;
  const runId = trimmedString(parsed.body.runId);
  if (!runId || parsed.body.agentMode !== "implement") return NextResponse.json({ error: "An Implement run ID is required." }, { status: 400 });
  try {
    const run = await Agent.getRun(runId, { runtime: "cloud", agentId: authorized.agentId, apiKey: authorized.apiKey });
    if (run.agentId !== authorized.agentId) return NextResponse.json({ error: "Run does not belong to this agent." }, { status: 409 });
    const outcome = implementationOutcome(run.git, { agentId: authorized.agentId, runId, status: run.status,
      startingRef: parsed.body.branch!, repoUrl: parsed.body.repoUrl! });
    const pullRequests = await Promise.all(outcome.branches.filter((entry) => entry.prUrl).map(async (entry) => {
      try { return { details: await getGitHubPullRequest(entry.repoUrl, entry.prUrl!, trimmedString(parsed.body.githubToken)) }; }
      catch (error) { return { url: entry.prUrl, error: error instanceof Error ? error.message : "GitHub status could not be verified." }; }
    }));
    return NextResponse.json({ outcome, pullRequests }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CursorSdkError ? cursorFailureMessage(error) : "Could not refresh the Cursor run. Try again." },
      { status: error instanceof CursorSdkError && error.status && error.status >= 400 ? error.status : 502 });
  }
}
