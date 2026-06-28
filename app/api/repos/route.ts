import { Cursor, CursorAgentError } from "@cursor/sdk";
import { NextResponse } from "next/server";
import {
  bodyTooLargeResponse,
  checkRateLimit,
  limiterUnavailableResponse,
  readJsonBody,
  rateLimitedResponse
} from "@/lib/rate-limit";

type ReposRequest = {
  apiKey?: string;
};

export async function POST(request: Request) {
  const tooLarge = bodyTooLargeResponse(request);
  if (tooLarge) return tooLarge;

  const rateLimit = await checkRateLimit("repos", request);
  if (!rateLimit.allowed) {
    if (rateLimit.unavailable) {
      return limiterUnavailableResponse();
    }

    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const parsedBody = await readJsonBody<ReposRequest>(request);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;

  const apiKey = body.apiKey?.trim();

  if (!apiKey) {
    return NextResponse.json({ error: "API key is required." }, { status: 400 });
  }

  try {
    const repos = await Cursor.repositories.list({ apiKey });

    return NextResponse.json({
      repos: repos.map((repo) => ({ url: repo.url }))
    });
  } catch (error) {
    if (error instanceof CursorAgentError) {
      const status =
        error.message.toLowerCase().includes("auth") ||
        error.message.toLowerCase().includes("401")
          ? 401
          : 502;

      return NextResponse.json(
        {
          error: error.message,
          retryable: error.isRetryable
        },
        { status }
      );
    }

    return NextResponse.json(
      { error: "Failed to load repositories from Cursor." },
      { status: 502 }
    );
  }
}
