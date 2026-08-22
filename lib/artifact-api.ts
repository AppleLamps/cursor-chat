import { NextResponse } from "next/server";
import {
  authorizeAgentSessionRequest,
  type AgentSessionRequest
} from "@/lib/agent-request-auth";

export const MAX_ARTIFACT_COUNT = 200;
export const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

export type ArtifactRequest = AgentSessionRequest & {
  path?: string;
};

export function authorizeArtifactRequest(body: ArtifactRequest):
  | {
      ok: true;
      apiKey: string;
      agentId: string;
      path?: string;
    }
  | { ok: false; response: NextResponse } {
  const authorized = authorizeAgentSessionRequest(
    body,
    "This agent session is not authorized to access artifacts."
  );
  if (!authorized.ok) return authorized;

  return { ...authorized, path: body.path };
}

export function normalizeArtifactPath(value: unknown) {
  if (typeof value !== "string") return null;
  const path = value.trim().replaceAll("\\", "/");
  if (
    !path ||
    path.length > 1024 ||
    path.startsWith("/") ||
    /^[a-zA-Z]:/.test(path) ||
    path.includes("\0")
  ) {
    return null;
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

export function artifactFilename(path: string) {
  const basename = path.split("/").at(-1) || "artifact";
  const ascii = basename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\;\r\n]/g, "_")
    .slice(0, 180) || "artifact";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(
    basename.slice(0, 180)
  )}`;
}
