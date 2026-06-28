import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/chat/route";
import { checkRateLimit } from "@/lib/rate-limit";

vi.mock("@cursor/sdk", () => {
  class CursorAgentError extends Error {
    isRetryable = false;
  }

  return {
    Agent: {
      create: vi.fn(),
      resume: vi.fn()
    },
    AgentNotFoundError: class AgentNotFoundError extends Error {},
    CursorAgentError
  };
});

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();

  return {
    ...actual,
    checkRateLimit: vi.fn()
  };
});

function chatRequest(body: unknown) {
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("chat route validation and rate limiting", () => {
  const mockedCheckRateLimit = vi.mocked(checkRateLimit);

  beforeEach(() => {
    mockedCheckRateLimit.mockReset();
    mockedCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it("does not charge chat rate limits for invalid repositories", async () => {
    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "not a repository url",
        branch: "main"
      })
    );

    expect(response.status).toBe(400);
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
  });

  it("does not charge chat rate limits for prompts rejected before agent work", async () => {
    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "x".repeat(32_001),
        repoUrl: "https://github.com/acme/app",
        branch: "main"
      })
    );

    expect(response.status).toBe(413);
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
  });
});
