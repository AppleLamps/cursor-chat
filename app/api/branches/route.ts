import { NextResponse } from "next/server";
import { GitHubApiError, listGitHubBranches } from "@/lib/github";
import {
  bodyTooLargeResponse,
  checkRateLimit,
  limiterUnavailableResponse,
  readJsonBody,
  rateLimitedResponse
} from "@/lib/rate-limit";
import { trimmedString, validateRepoUrl } from "@/lib/validate";

type BranchesRequest = {
  repoUrl?: string;
  githubToken?: string;
};

export async function POST(request: Request) {
  const tooLarge = bodyTooLargeResponse(request);
  if (tooLarge) return tooLarge;

  const rateLimit = await checkRateLimit("branches", request);
  if (!rateLimit.allowed) {
    if (rateLimit.unavailable) {
      return limiterUnavailableResponse();
    }

    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const parsedBody = await readJsonBody<BranchesRequest>(request);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;

  const repoUrl = trimmedString(body.repoUrl);
  const githubToken = trimmedString(body.githubToken);

  const repoValidation = validateRepoUrl(repoUrl);
  if (!repoValidation.ok) {
    return NextResponse.json({ error: repoValidation.error }, { status: 400 });
  }

  if (!githubToken) {
    return NextResponse.json({ error: "GitHub token is required." }, { status: 400 });
  }

  try {
    const result = await listGitHubBranches(repoValidation.value.url, githubToken);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Failed to load branches from GitHub." },
      { status: 502 }
    );
  }
}
