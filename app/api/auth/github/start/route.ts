import { NextResponse } from "next/server";
import {
  GITHUB_OAUTH_CALLBACK_PATH,
  GITHUB_OAUTH_STATE_COOKIE,
  GITHUB_OAUTH_STATE_TTL_SECONDS,
  buildGitHubAuthorizeUrl,
  createOAuthState,
  getGitHubOAuthConfig
} from "@/lib/github-oauth";
import {
  checkRateLimit,
  limiterUnavailableResponse,
  rateLimitedResponse
} from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit("githubAuth", request);
  if (!rateLimit.allowed) {
    if (rateLimit.unavailable) return limiterUnavailableResponse();
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const config = getGitHubOAuthConfig();

  if (!config) {
    return NextResponse.json(
      { error: "GitHub sign-in is not configured on this deployment." },
      { status: 503 }
    );
  }

  const state = createOAuthState();
  const response = NextResponse.redirect(
    buildGitHubAuthorizeUrl(config.clientId, state)
  );

  response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: GITHUB_OAUTH_CALLBACK_PATH,
    maxAge: GITHUB_OAUTH_STATE_TTL_SECONDS
  });
  response.headers.set("Cache-Control", "no-store");

  return response;
}
