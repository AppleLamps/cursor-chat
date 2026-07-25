import type { ModelSelection } from "@cursor/sdk";
import { NextResponse } from "next/server";
import { parseAgentMode } from "@/lib/agent-mode";
import { validateAgentPolicy } from "@/lib/agent-policy";
import { verifyAgentSessionToken } from "@/lib/agent-session";
import { DEFAULT_BRANCH } from "@/lib/defaults";
import { normalizeModelSelection } from "@/lib/model-catalog";
import { validateBranch, validateRepoUrl } from "@/lib/validate";

export const MAX_ARTIFACT_COUNT = 200;
export const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

export type ArtifactRequest = {
  apiKey?: string;
  agentId?: string;
  agentSessionToken?: string;
  repoUrl?: string;
  branch?: string;
  agentMode?: string;
  modelId?: string;
  model?: ModelSelection;
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
  const apiKey = body.apiKey?.trim();
  const agentId = body.agentId?.trim();
  const agentSessionToken = body.agentSessionToken?.trim();
  const agentMode = parseAgentMode(body.agentMode);
  const repoValidation = validateRepoUrl(body.repoUrl);
  const branchValidation = validateBranch(body.branch?.trim() || DEFAULT_BRANCH);
  const model = normalizeModelSelection(body.model, body.modelId);

  if (!apiKey || !agentId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "API key and agent ID are required." },
        { status: 400 }
      )
    };
  }
  if (!repoValidation.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: repoValidation.error }, { status: 400 })
    };
  }
  if (!branchValidation.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: branchValidation.error }, { status: 400 })
    };
  }
  if (!model) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "A valid model is required." },
        { status: 400 }
      )
    };
  }

  const policy = validateAgentPolicy({
    agentMode,
    repoUrl: repoValidation.value.url,
    branch: branchValidation.value,
    isFollowUp: true
  });
  if (!policy.allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: policy.error }, { status: policy.status })
    };
  }

  const session = verifyAgentSessionToken(agentSessionToken, {
    agentId,
    apiKey,
    repoUrl: repoValidation.value.url,
    branch: branchValidation.value,
    agentMode,
    modelId: model.id,
    modelParams: model.params
  });
  if (!session.valid) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This agent session is not authorized to access artifacts." },
        { status: 409 }
      )
    };
  }

  return { ok: true, apiKey, agentId, path: body.path };
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
