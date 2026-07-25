import { Agent, CursorSdkError } from "@cursor/sdk";
import { NextResponse } from "next/server";
import {
  authorizeArtifactRequest,
  MAX_ARTIFACT_COUNT,
  normalizeArtifactPath,
  type ArtifactRequest
} from "@/lib/artifact-api";
import { MAX_CHAT_BODY_BYTES } from "@/lib/chat-images";
import { readJsonBody } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const parsed = await readJsonBody<ArtifactRequest>(request, MAX_CHAT_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const authorized = authorizeArtifactRequest(parsed.body);
  if (!authorized.ok) return authorized.response;

  try {
    const agent = await Agent.resume(authorized.agentId, {
      apiKey: authorized.apiKey
    });
    try {
      const artifacts = await agent.listArtifacts();
      if (artifacts.length > MAX_ARTIFACT_COUNT) {
        return NextResponse.json(
          { error: "The agent returned too many artifacts." },
          { status: 413 }
        );
      }
      const safeArtifacts = artifacts.flatMap((artifact) => {
        const path = normalizeArtifactPath(artifact.path);
        return path &&
          Number.isSafeInteger(artifact.sizeBytes) &&
          artifact.sizeBytes >= 0
          ? [{ path, sizeBytes: artifact.sizeBytes, updatedAt: artifact.updatedAt }]
          : [];
      });
      return NextResponse.json(
        { artifacts: safeArtifacts },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    } finally {
      agent.close();
    }
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
