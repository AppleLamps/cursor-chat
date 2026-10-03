"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import type { AgentMode } from "@/lib/defaults";
import type { ModelSelection } from "@/lib/model-client";
import { Button } from "@/components/ui/button";

type Artifact = {
  path: string;
  sizeBytes: number;
  updatedAt: string;
};

type ArtifactScope = {
  apiKey: string;
  agentId: string;
  agentSessionToken: string;
  repoUrl: string;
  branch: string;
  agentMode: AgentMode;
  model: ModelSelection;
};

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof payload?.error === "string" ? payload.error : "Artifact request failed.";
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function requestArtifacts(body: string, signal?: AbortSignal) {
  const response = await fetch("/api/artifacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json() as { artifacts?: Artifact[] };
  return Array.isArray(payload.artifacts) ? payload.artifacts : [];
}

type ArtifactsPanelProps = {
  scope: ArtifactScope;
  id: string;
  labelledBy: string;
  open: boolean;
};

export default function ArtifactsPanel(props: ArtifactsPanelProps) {
  const requestScope = JSON.stringify(props.scope);
  const [identity, setIdentity] = useState({ requestScope, revision: 0 });

  // Reset the entire cache synchronously when its scope changes. A numeric key
  // keeps credentials out of React keys and prevents old downloads or requests
  // from carrying over into a different agent, repository, or credential scope.
  if (identity.requestScope !== requestScope) {
    setIdentity({ requestScope, revision: identity.revision + 1 });
  }

  return <ArtifactsPanelContents key={identity.revision} {...props} />;
}

function ArtifactsPanelContents({
  scope,
  id,
  labelledBy,
  open
}: ArtifactsPanelProps) {
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const requestBody = JSON.stringify({
    apiKey: scope.apiKey,
    agentId: scope.agentId,
    agentSessionToken: scope.agentSessionToken,
    repoUrl: scope.repoUrl,
    branch: scope.branch,
    agentMode: scope.agentMode,
    model: scope.model
  });

  // The parent mounts this panel on its first opening and keeps it mounted
  // while collapsed, so toggling the disclosure does not refetch its contents.
  useEffect(() => {
    const controller = new AbortController();
    requestArtifacts(requestBody, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setArtifacts(items);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Could not load artifacts.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [requestBody]);

  async function loadArtifacts() {
    setLoading(true);
    setError(null);
    try {
      setArtifacts(await requestArtifacts(requestBody));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load artifacts.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadArtifact(artifact: Artifact) {
    setDownloading(artifact.path);
    setError(null);
    try {
      const response = await fetch("/api/artifacts/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scope, path: artifact.path })
      });
      if (!response.ok) throw new Error(await readError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.path.split("/").at(-1) || "artifact";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not download artifact.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      aria-busy={loading}
      hidden={!open}
      className="w-full max-w-3xl rounded-lg border border-border bg-muted/20 px-3 py-2"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">
          Artifacts{artifacts ? ` (${artifacts.length})` : ""}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="min-h-11 md:min-h-7"
          aria-label={error && artifacts === null ? "Retry loading artifacts" : "Refresh artifacts"}
          onClick={() => void loadArtifacts()}
          disabled={loading}
        >
          <RefreshCwIcon aria-hidden="true" className={loading ? "animate-spin" : undefined} />
          {error && artifacts === null ? "Retry" : "Refresh"}
        </Button>
      </div>
      {loading ? <p role="status" className="py-2 text-xs text-muted-foreground">Loading artifacts…</p> : null}
      {artifacts?.length ? (
        <ul
          aria-label="Generated artifacts"
          tabIndex={0}
          className="mt-1 max-h-48 divide-y divide-border overflow-y-auto overscroll-contain rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {artifacts.map((artifact) => (
            <li key={artifact.path} className="flex min-w-0 items-center justify-between gap-3 py-1">
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs" title={artifact.path}>
                  {artifact.path}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(artifact.sizeBytes)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="min-h-11 md:min-h-7"
                aria-label={`Download ${artifact.path}`}
                onClick={() => void downloadArtifact(artifact)}
                disabled={downloading === artifact.path}
              >
                <DownloadIcon aria-hidden="true" />
                {downloading === artifact.path ? "Downloading" : "Download"}
              </Button>
            </li>
          ))}
        </ul>
      ) : artifacts && !loading ? (
        <p className="py-2 text-xs text-muted-foreground">No artifacts are available.</p>
      ) : null}
      {error ? <p role="alert" className="py-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
