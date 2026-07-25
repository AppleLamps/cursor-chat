"use client";

import { useState } from "react";
import { DownloadIcon, PackageIcon, RefreshCwIcon } from "lucide-react";
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

export default function ArtifactsPanel({ scope }: { scope: ArtifactScope }) {
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const requestBody = {
    apiKey: scope.apiKey,
    agentId: scope.agentId,
    agentSessionToken: scope.agentSessionToken,
    repoUrl: scope.repoUrl,
    branch: scope.branch,
    agentMode: scope.agentMode,
    model: scope.model
  };

  async function loadArtifacts() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as { artifacts?: Artifact[] };
      setArtifacts(Array.isArray(payload.artifacts) ? payload.artifacts : []);
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
        body: JSON.stringify({ ...requestBody, path: artifact.path })
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

  if (artifacts === null) {
    return (
      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadArtifacts()}
          disabled={loading}
        >
          {loading ? <RefreshCwIcon className="animate-spin" /> : <PackageIcon />}
          {loading ? "Loading artifacts" : "View artifacts"}
        </Button>
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Artifacts ({artifacts.length})</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => void loadArtifacts()}
          disabled={loading}
        >
          <RefreshCwIcon className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>
      {artifacts.length ? (
        <ul className="mt-2 divide-y divide-border">
          {artifacts.map((artifact) => (
            <li key={artifact.path} className="flex items-center justify-between gap-3 py-2">
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
                aria-label={`Download ${artifact.path}`}
                onClick={() => void downloadArtifact(artifact)}
                disabled={downloading === artifact.path}
              >
                <DownloadIcon />
                {downloading === artifact.path ? "Downloading" : "Download"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No artifacts are available.</p>
      )}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
