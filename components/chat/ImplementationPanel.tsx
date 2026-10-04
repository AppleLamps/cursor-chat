"use client";

import { useEffect, useState } from "react";
import type { Conversation } from "@/lib/chat-types";
import type { ImplementationOutcome, PullRequestDetails } from "@/lib/implementation";
import { safePullRequestUrl } from "@/lib/implementation";
import { resolveConversationModel } from "@/lib/chat-conversation";
import { Button } from "@/components/ui/button";

type Snapshot = { outcome: ImplementationOutcome; pullRequests: Array<{ details?: PullRequestDetails; url?: string; error?: string }> };

export default function ImplementationPanel({ outcome, scope }: {
  outcome: ImplementationOutcome;
  scope?: { apiKey: string; githubToken?: string | null; conversation: Conversation };
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const conversation = scope?.conversation;
  const apiKey = scope?.apiKey;
  const githubToken = scope?.githubToken;
  const conversationId = conversation?.id;
  const agentSessionToken = conversation?.agentSessionToken;
  const repoUrl = conversation?.repoUrl;
  const branch = conversation?.branch;
  const agentMode = conversation?.agentMode;
  const modelJson = conversation ? JSON.stringify(resolveConversationModel(conversation)) : undefined;
  const canRefresh = conversation?.agentId === outcome.agentId && Boolean(conversation?.agentSessionToken);
  // Abort old requests on run, repository, conversation, or credential change.
  useEffect(() => {
    setSnapshot(undefined);
    setError(undefined);
    setBusy(false);
  }, [outcome, scope?.apiKey, scope?.githubToken, conversation?.id, conversation?.repoUrl]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  useEffect(() => {
    if (!apiKey || !canRefresh || (outcome.status === "running" && refreshVersion === 0)) return;
    const controller = new AbortController();
    setBusy(true);
    setError(undefined);
    void fetch("/api/implementation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ apiKey, githubToken,
        agentId: outcome.agentId, runId: outcome.runId, agentSessionToken,
        repoUrl, branch, agentMode, model: modelJson ? JSON.parse(modelJson) : undefined })
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not refresh implementation status.");
      if (!controller.signal.aborted) setSnapshot(data);
    }).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Refresh failed.");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [apiKey, githubToken, conversationId, agentSessionToken, repoUrl, branch, agentMode, modelJson, canRefresh, outcome, refreshVersion]);
  const current = snapshot?.outcome ?? outcome;
  return (
    <section aria-label="Implementation status" className="mt-3 min-w-0 rounded-lg border border-border p-3 text-xs leading-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Cursor run: {current.status}</p>
        {canRefresh ? <Button type="button" variant="ghost" size="xs" disabled={busy}
          onClick={() => setRefreshVersion((value) => value + 1)}>{busy ? "Checking…" : "Refresh status"}</Button> : null}
      </div>
      <p className="break-all text-muted-foreground">Starting ref: {current.startingRef}</p>
      <p className="text-muted-foreground">Current agent branches and PRs</p>
      {current.branches.map((entry, index) => {
        const prUrl = safePullRequestUrl(entry.prUrl, entry.repoUrl);
        const pr = snapshot?.pullRequests.find((item) => (item.details?.url ?? item.url) === prUrl);
        return <div key={`${entry.branch}-${index}`} className="mt-2 min-w-0">
          {entry.branch ? <p className="break-all font-mono">{entry.branch}</p> : null}
          {prUrl ? <a href={prUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {pr?.details ? `PR #${pr.details.number} · ${pr.details.state}` : "View pull request · status unverified"}
          </a> : <p>No pull request reported for this branch.</p>}
          {pr?.error ? <p className="mt-1 text-destructive">{pr.error}</p> : null}
          {pr?.details ? <>
            <p className="break-all text-muted-foreground">{pr.details.head} → {pr.details.base}</p>
            <details className="mt-1">
              <summary className="cursor-pointer">PR changed files ({pr.details.files.length}{pr.details.filesTruncated ? "+" : ""})</summary>
              <ul className="mt-1 space-y-1">{pr.details.files.map((file) => <li key={file.path} className="break-all font-mono">
                {file.path} · {file.status} · +{file.additions} −{file.deletions}
              </li>)}</ul>
              <p className="text-muted-foreground">Cumulative PR changes{pr.details.filesTruncated ? "; list truncated to 300 files" : ""}.</p>
            </details>
          </> : null}
        </div>;
      })}
      {!current.branches.length ? <p>No branch or pull request reported by Cursor yet.</p> : null}
      {error ? <p role="alert" className="mt-2 text-destructive">{error}</p> : null}
    </section>
  );
}
