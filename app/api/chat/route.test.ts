import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@cursor/sdk";
import { POST } from "@/app/api/chat/route";
import { createAgentSessionToken } from "@/lib/agent-session";
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
  const mockedAgentCreate = vi.mocked(Agent.create);
  const mockedAgentResume = vi.mocked(Agent.resume);

  function mockAgent(modelId: string) {
    const run = {
      id: "run",
      agentId: "agent",
      model: { id: modelId },
      requestId: "request",
      durationMs: 1,
      stream: async function* () {},
      wait: vi.fn().mockResolvedValue({
        id: "run",
        status: "completed",
        result: "done",
        model: { id: modelId },
        requestId: "request",
        durationMs: 1
      }),
      supports: vi.fn().mockReturnValue(false)
    };

    return {
      agentId: "agent",
      send: vi.fn().mockResolvedValue(run),
      [Symbol.asyncDispose]: vi.fn()
    };
  }

  beforeEach(() => {
    mockedCheckRateLimit.mockReset();
    mockedCheckRateLimit.mockResolvedValue({ allowed: true });
    mockedAgentCreate.mockReset();
    mockedAgentResume.mockReset();
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

  it("does not charge chat rate limits for invalid models", async () => {
    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "https://github.com/acme/app",
        branch: "main",
        modelId: "not-a-model"
      })
    );

    expect(response.status).toBe(400);
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
  });

  it("uses the selected model for first runs", async () => {
    const agent = mockAgent("grok-4.5-high");
    mockedAgentCreate.mockResolvedValue(agent);

    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "https://github.com/acme/app",
        branch: "main",
        modelId: "grok-4.5-high"
      })
    );

    await response.text();

    expect(mockedAgentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { id: "grok-4.5-high" }
      })
    );
  });

  it("uses the selected model for follow-up runs", async () => {
    const agent = mockAgent("grok-4.5-high");
    mockedAgentResume.mockResolvedValue(agent);
    const agentSessionToken = createAgentSessionToken({
      agentId: "agent",
      apiKey: "key",
      repoUrl: "https://github.com/acme/app",
      branch: "main",
      agentMode: "qa",
      modelId: "grok-4.5-high"
    });

    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "https://github.com/acme/app",
        branch: "main",
        agentId: "agent",
        agentSessionToken,
        modelId: "grok-4.5-high"
      })
    );

    await response.text();

    expect(mockedAgentResume).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        model: { id: "grok-4.5-high" }
      })
    );
  });
});
