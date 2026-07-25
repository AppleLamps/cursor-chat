import { Agent, CursorSdkError } from "@cursor/sdk";
import { NextResponse } from "next/server";
import {
  artifactFilename,
  authorizeArtifactRequest,
  MAX_ARTIFACT_COUNT,
  MAX_ARTIFACT_BYTES,
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
  const path = normalizeArtifactPath(authorized.path);
  if (!path) {
    return NextResponse.json({ error: "A valid artifact path is required." }, { status: 400 });
  }

  try {
    const agent = await Agent.resume(authorized.agentId, {
      apiKey: authorized.apiKey
    });
    try {
      const listed = await agent.listArtifacts();
      if (listed.length > MAX_ARTIFACT_COUNT) {
        return NextResponse.json(
          { error: "The agent returned too many artifacts." },
          { status: 413 }
        );
      }
      const artifact = listed.find(
        (candidate) => normalizeArtifactPath(candidate.path) === path
      );
      if (!artifact) {
        return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
      }
      if (
        !Number.isSafeInteger(artifact.sizeBytes) ||
        artifact.sizeBytes < 0 ||
        artifact.sizeBytes > MAX_ARTIFACT_BYTES
      ) {
        return NextResponse.json(
          { error: "Artifact is too large to download safely." },
          { status: 413 }
        );
      }
      const content = await agent.downloadArtifact(path);
      if (content.byteLength > MAX_ARTIFACT_BYTES || content.byteLength !== artifact.sizeBytes) {
        return NextResponse.json(
          { error: "Artifact size did not match its metadata." },
          { status: 502 }
        );
      }
      return new NextResponse(new Uint8Array(content), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": artifactFilename(path),
          "Content-Length": String(content.byteLength),
          "Content-Type": "application/octet-stream",
          "X-Content-Type-Options": "nosniff"
        }
      });
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
