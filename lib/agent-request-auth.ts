import type { ModelSelection } from "@cursor/sdk";
import { NextResponse } from "next/server";
import { parseAgentMode } from "@/lib/agent-mode";
import { validateAgentPolicy } from "@/lib/agent-policy";
import { verifyAgentSessionToken } from "@/lib/agent-session";
import { DEFAULT_BRANCH } from "@/lib/defaults";
import { normalizeModelSelection } from "@/lib/model-catalog";
import { validateBranch, validateRepoUrl } from "@/lib/validate";

/**
 * Body fields every agent-scoped endpoint needs to prove the caller owns the
 * cloud agent it is asking about.
 */
export type AgentSessionRequest = {
  apiKey?: string;
  agentId?: string;
  agentSessionToken?: string;
  repoUrl?: string;
  branch?: string;
  agentMode?: string;
  modelId?: string;
  model?: ModelSelection;
};

export type AuthorizedAgentSession =
  | { ok: true; apiKey: string; agentId: string }
  | { ok: false; response: NextResponse };

/**
 * Validates the repo/branch/model envelope and verifies the signed agent
 * session token binds this API key to this agent. Shared by every read-only
 * endpoint that acts on an existing cloud agent.
 */
export function authorizeAgentSessionRequest(
  body: AgentSessionRequest,
  unauthorizedMessage: string
): AuthorizedAgentSession {
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
      response: NextResponse.json({ error: unauthorizedMessage }, { status: 409 })
    };
  }

  return { ok: true, apiKey, agentId };
}
