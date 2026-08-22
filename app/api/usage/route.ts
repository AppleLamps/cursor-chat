import { Agent, CursorSdkError } from "@cursor/sdk";
import { NextResponse } from "next/server";
import {
  bodyTooLargeResponse,
  checkRateLimit,
  limiterUnavailableResponse,
  rateLimitedResponse,
  readJsonBody
} from "@/lib/rate-limit";
import {
  authorizeAgentSessionRequest,
  type AgentSessionRequest
} from "@/lib/agent-request-auth";
import { normalizeAgentUsage } from "@/lib/usage-api";

export async function POST(request: Request) {
  const tooLarge = bodyTooLargeResponse(request);
  if (tooLarge) return tooLarge;

  const rateLimit = await checkRateLimit("usage", request);
  if (!rateLimit.allowed) {
    if (rateLimit.unavailable) return limiterUnavailableResponse();
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const parsed = await readJsonBody<AgentSessionRequest>(request);
  if (!parsed.ok) return parsed.response;

  const authorized = authorizeAgentSessionRequest(
    parsed.body,
    "This agent session is not authorized to read usage."
  );
  if (!authorized.ok) return authorized.response;

  try {
    const usage = await Agent.getUsage(authorized.agentId, {
      apiKey: authorized.apiKey
    });

    return NextResponse.json(normalizeAgentUsage(usage), {
      headers: { "Cache-Control": "private, no-store" }
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
