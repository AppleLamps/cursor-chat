import { NextResponse } from "next/server";
import {
  getFallbackModelCatalog,
  getModelCatalog,
  isAuthFailure
} from "@/lib/model-catalog";
import {
  bodyTooLargeResponse,
  checkRateLimit,
  limiterUnavailableResponse,
  readJsonBody,
  rateLimitedResponse
} from "@/lib/rate-limit";
import { trimmedString } from "@/lib/validate";

type ModelsRequest = { apiKey?: string };

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store"
};

export async function POST(request: Request) {
  const tooLarge = bodyTooLargeResponse(request);
  if (tooLarge) return tooLarge;

  const rateLimit = await checkRateLimit("models", request);
  if (!rateLimit.allowed) {
    return rateLimit.unavailable
      ? limiterUnavailableResponse()
      : rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const parsed = await readJsonBody<ModelsRequest>(request);
  if (!parsed.ok) return parsed.response;
  const apiKey = trimmedString(parsed.body.apiKey);
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key is required." },
      { status: 400, headers: PRIVATE_RESPONSE_HEADERS }
    );
  }

  try {
    return NextResponse.json(await getModelCatalog(apiKey), {
      headers: PRIVATE_RESPONSE_HEADERS
    });
  } catch (error) {
    if (isAuthFailure(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Cursor rejected the API key." },
        {
          status: (error as { status: number }).status,
          headers: PRIVATE_RESPONSE_HEADERS
        }
      );
    }

    console.error("Failed to load Cursor model catalog", {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      {
        ...getFallbackModelCatalog(),
        warning: "Live Cursor models are temporarily unavailable."
      },
      { headers: PRIVATE_RESPONSE_HEADERS }
    );
  }
}
