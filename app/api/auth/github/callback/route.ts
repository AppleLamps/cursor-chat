import { NextResponse } from "next/server";
import {
  GITHUB_OAUTH_CALLBACK_PATH,
  GITHUB_OAUTH_STATE_COOKIE,
  GitHubOAuthError,
  exchangeGitHubCode,
  getGitHubOAuthConfig,
  statesMatch
} from "@/lib/github-oauth";
import {
  checkRateLimit,
  limiterUnavailableResponse,
  rateLimitedResponse
} from "@/lib/rate-limit";

function appRedirect(request: Request, params: Record<string, string>) {
  const target = new URL("/", request.url);
  target.hash = new URLSearchParams(params).toString();

  const response = NextResponse.redirect(target);
  response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, "", {
    path: GITHUB_OAUTH_CALLBACK_PATH,
    maxAge: 0
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");

  return response;
}

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit("githubAuth", request);
  if (!rateLimit.allowed) {
    if (rateLimit.unavailable) return limiterUnavailableResponse();
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const config = getGitHubOAuthConfig();

  if (!config) {
    return appRedirect(request, {
      github_error: "GitHub sign-in is not configured on this deployment."
    });
  }

  const url = new URL(request.url);

  if (url.searchParams.get("error")) {
    return appRedirect(request, {
      github_error: "GitHub sign-in was cancelled."
    });
  }

  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GITHUB_OAUTH_STATE_COOKIE}=`))
    ?.slice(GITHUB_OAUTH_STATE_COOKIE.length + 1);
  const code = url.searchParams.get("code")?.trim();

  if (!code || !statesMatch(cookieState, url.searchParams.get("state"))) {
    return appRedirect(request, {
      github_error: "GitHub sign-in could not be verified. Try connecting again."
    });
  }

  try {
    const token = await exchangeGitHubCode(config, code);
    return appRedirect(request, { github_token: token });
  } catch (error) {
    return appRedirect(request, {
      github_error:
        error instanceof GitHubOAuthError
          ? error.message
          : "GitHub sign-in failed. Try connecting again."
    });
  }
}
