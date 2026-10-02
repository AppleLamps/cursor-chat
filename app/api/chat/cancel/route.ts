import { Agent, CursorSdkError, type ModelSelection } from "@cursor/sdk";
import { NextResponse } from "next/server";
import { parseAgentMode } from "@/lib/agent-mode";
import { verifyAgentSessionToken } from "@/lib/agent-session";
import { readControlBody } from "@/lib/rate-limit";
import { DEFAULT_BRANCH } from "@/lib/defaults";
import { normalizeModelSelection } from "@/lib/model-catalog";
import { trimmedString, validateBranch, validateRepoUrl } from "@/lib/validate";

type CancelRequest = {
  apiKey?: string;
  agentId?: string;
  agentSessionToken?: string;
  runId?: string;
  repoUrl?: string;
  branch?: string;
  agentMode?: string;
  modelId?: string;
  model?: ModelSelection;
};

export async function POST(request: Request) {
  const parsedBody = await readControlBody<CancelRequest>(request);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;
  const apiKey = trimmedString(body.apiKey);
  const agentId = trimmedString(body.agentId);
  const agentSessionToken = trimmedString(body.agentSessionToken);
  const runId = trimmedString(body.runId);
  const agentMode = parseAgentMode(body.agentMode);
  const repoValidation = validateRepoUrl(body.repoUrl);
  const branchValidation = validateBranch(trimmedString(body.branch) || DEFAULT_BRANCH);
  const model = normalizeModelSelection(body.model, body.modelId);

  if (!apiKey || !agentId || !runId) {
    return NextResponse.json(
      { error: "API key, agent ID, and run ID are required." },
      { status: 400 }
    );
  }
  if (!repoValidation.ok) {
    return NextResponse.json({ error: repoValidation.error }, { status: 400 });
  }
  if (!branchValidation.ok) {
    return NextResponse.json({ error: branchValidation.error }, { status: 400 });
  }
  if (!model) {
    return NextResponse.json({ error: "A valid model is required." }, { status: 400 });
  }

  const repoUrl = repoValidation.value.url;
  const branch = branchValidation.value;
  const modelId = model.id;
  // No Implement-mode policy re-check here: the signed session token already
  // binds this agent to its repo, branch, mode, and model, and stopping a run
  // must keep working even if policy changes mid-run.
  const session = verifyAgentSessionToken(agentSessionToken, {
    agentId,
    apiKey,
    repoUrl,
    branch,
    agentMode,
    modelId,
    modelParams: model.params
  });
  if (!session.valid) {
    return NextResponse.json(
      { error: "This agent session is not authorized to cancel the run." },
      { status: 409 }
    );
  }

  try {
    await Agent.cancelRun(runId, {
      runtime: "cloud",
      agentId,
      apiKey
    });
    return NextResponse.json({ cancelled: true, runId });
  } catch (error) {
    if (error instanceof CursorSdkError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          retryable: error.isRetryable,
          requestId: error.requestId
        },
        { status: error.status && error.status >= 400 ? error.status : 502 }
      );
    }
    throw error;
  }
}
