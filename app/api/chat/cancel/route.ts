import { Agent, CursorSdkError, type ModelSelection } from "@cursor/sdk";
import { NextResponse } from "next/server";
import { parseAgentMode } from "@/lib/agent-mode";
import { validateAgentPolicy } from "@/lib/agent-policy";
import { verifyAgentSessionToken } from "@/lib/agent-session";
import { MAX_CHAT_BODY_BYTES } from "@/lib/chat-images";
import { readJsonBody } from "@/lib/rate-limit";
import { DEFAULT_BRANCH } from "@/lib/defaults";
import { normalizeModelSelection } from "@/lib/model-catalog";
import { validateBranch, validateRepoUrl } from "@/lib/validate";

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
  const parsedBody = await readJsonBody<CancelRequest>(
    request,
    MAX_CHAT_BODY_BYTES
  );
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;
  const apiKey = body.apiKey?.trim();
  const agentId = body.agentId?.trim();
  const agentSessionToken = body.agentSessionToken?.trim();
  const runId = body.runId?.trim();
  const agentMode = parseAgentMode(body.agentMode);
  const repoValidation = validateRepoUrl(body.repoUrl);
  const branchValidation = validateBranch(body.branch?.trim() || DEFAULT_BRANCH);
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
  const policy = validateAgentPolicy({
    agentMode,
    repoUrl,
    branch,
    isFollowUp: true
  });
  if (!policy.allowed) {
    return NextResponse.json({ error: policy.error }, { status: policy.status });
  }

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
