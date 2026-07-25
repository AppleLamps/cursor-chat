import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@cursor/sdk";
import { POST } from "@/app/api/artifacts/download/route";
import { createAgentSessionToken } from "@/lib/agent-session";
import { MAX_ARTIFACT_BYTES } from "@/lib/artifact-api";

vi.mock("@cursor/sdk", () => ({
  Agent: { resume: vi.fn() },
  CursorSdkError: class CursorSdkError extends Error {},
  CursorAgentError: class CursorAgentError extends Error {}
}));

const body = {
  apiKey: "key",
  agentId: "agent",
  repoUrl: "https://github.com/acme/app",
  branch: "main",
  agentMode: "qa" as const,
  modelId: "composer-2.5",
  model: { id: "composer-2.5" }
};

function request(value: Record<string, unknown>) {
  return new Request("https://example.test/api/artifacts/download", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value)
  });
}

describe("artifact download route", () => {
  const resume = vi.mocked(Agent.resume);
  const listArtifacts = vi.fn();
  const downloadArtifact = vi.fn();
  const close = vi.fn();

  beforeEach(() => {
    resume.mockReset();
    listArtifacts.mockReset();
    downloadArtifact.mockReset();
    close.mockReset();
    resume.mockResolvedValue({ listArtifacts, downloadArtifact, close } as never);
  });

  it("returns a listed artifact as a forced binary attachment", async () => {
    const content = Buffer.from("hello");
    listArtifacts.mockResolvedValue([
      { path: "output/report.txt", sizeBytes: content.byteLength, updatedAt: "now" }
    ]);
    downloadArtifact.mockResolvedValue(content);
    const token = createAgentSessionToken(body);
    const response = await POST(
      request({ ...body, agentSessionToken: token, path: "output/report.txt" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toContain('filename="report.txt"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("hello");
  });

  it("rejects traversal before contacting Cursor", async () => {
    const token = createAgentSessionToken(body);
    const response = await POST(
      request({ ...body, agentSessionToken: token, path: "../secret" })
    );
    expect(response.status).toBe(400);
    expect(resume).not.toHaveBeenCalled();
  });

  it("rejects oversized artifacts before downloading them", async () => {
    listArtifacts.mockResolvedValue([
      { path: "huge.bin", sizeBytes: MAX_ARTIFACT_BYTES + 1, updatedAt: "now" }
    ]);
    const token = createAgentSessionToken(body);
    const response = await POST(
      request({ ...body, agentSessionToken: token, path: "huge.bin" })
    );
    expect(response.status).toBe(413);
    expect(downloadArtifact).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
