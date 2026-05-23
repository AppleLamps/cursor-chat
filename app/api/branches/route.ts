import { NextResponse } from "next/server";
import { listGitHubBranches } from "@/lib/github";
import {
  bodyTooLargeResponse,
  checkRateLimit,
  rateLimitedResponse
} from "@/lib/rate-limit";

type BranchesRequest = {
  repoUrl?: string;
  githubToken?: string;
};

export async function POST(request: Request) {
  const tooLarge = bodyTooLargeResponse(request);
  if (tooLarge) return tooLarge;

  const rateLimit = checkRateLimit("branches", request);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let body: BranchesRequest;

  try {
    body = (await request.json()) as BranchesRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const repoUrl = body.repoUrl?.trim();
  const githubToken = body.githubToken?.trim();

  if (!repoUrl) {
    return NextResponse.json({ error: "Repository URL is required." }, { status: 400 });
  }

  if (!githubToken) {
    return NextResponse.json({ error: "GitHub token is required." }, { status: 400 });
  }

  try {
    const result = await listGitHubBranches(repoUrl, githubToken);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load branches from GitHub.";

    const status = message.toLowerCase().includes("invalid") ? 401 : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
