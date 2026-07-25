import { Agent, CursorSdkError, type ModelSelection } from "@cursor/sdk";
import { NextResponse } from "next/server";
import { parseAgentMode } from "@/lib/agent-mode";
import { verifyAgentSessionToken } from "@/lib/agent-session";
import { MAX_CHAT_BODY_BYTES } from "@/lib/chat-images";
import { DEFAULT_BRANCH } from "@/lib/defaults";
import { normalizeModelSelection } from "@/lib/model-catalog";
import { readJsonBody } from "@/lib/rate-limit";
import { validateBranch, validateRepoUrl } from "@/lib/validate";

type LifecycleAction = "archive" | "unarchive" | "delete";

type LifecycleRequest = {
  action?: LifecycleAction;
  apiKey?: string;
  agentId?: string;
  agentSessionToken?: string;
  repoUrl?: string;
  branch?: string;
  agentMode?: string;
  modelId?: string;
  model?: ModelSelection;
};

export async function POST(request: Request) {
  const parsedBody = await readJsonBody<LifecycleRequest>(
    request,
    MAX_CHAT_BODY_BYTES
  );
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;
  const action = body.action;
  const apiKey = body.apiKey?.trim();
  const agentId = body.agentId?.trim();
  const agentSessionToken = body.agentSessionToken?.trim();
  const repoValidation = validateRepoUrl(body.repoUrl);
  const branchValidation = validateBranch(body.branch?.trim() || DEFAULT_BRANCH);
  const agentMode = parseAgentMode(body.agentMode);
  const model = normalizeModelSelection(body.model, body.modelId);

  if (!action || !["archive", "unarchive", "delete"].includes(action)) {
    return NextResponse.json(
      { error: "A valid lifecycle action is required." },
      { status: 400 }
    );
  }
  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: "API key and agent ID are required." },
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
    return NextResponse.json(
      { error: "This agent session is not authorized to manage the cloud agent." },
      { status: 409 }
    );
  }

  try {
    await Agent[action](agentId, { apiKey });
    return NextResponse.json({
      action,
      agentId,
      archived: action === "archive" ? true : action === "unarchive" ? false : undefined,
      deleted: action === "delete"
    });
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
