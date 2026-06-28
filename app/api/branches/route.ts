import { NextResponse } from "next/server";
import { listGitHubBranches } from "@/lib/github";
import {
  bodyTooLargeResponse,
  checkRateLimit,
  limiterUnavailableResponse,
  readJsonBody,
  rateLimitedResponse
} from "@/lib/rate-limit";
import { validateRepoUrl } from "@/lib/validate";

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

  const repoUrl = body.repoUrl?.trim();
  const githubToken = body.githubToken?.trim();

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
    const message =
      error instanceof Error ? error.message : "Failed to load branches from GitHub.";

    const status = message.toLowerCase().includes("invalid") ? 401 : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
