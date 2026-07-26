import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "@cursor/sdk";
import { maxDuration, POST } from "@/app/api/chat/route";
import { createAgentSessionToken } from "@/lib/agent-session";
import { checkRateLimit } from "@/lib/rate-limit";

vi.mock("@cursor/sdk", () => {
  class CursorSdkError extends Error {
    isRetryable = false;
  }
  class CursorAgentError extends CursorSdkError {}

  return {
    Agent: {
      create: vi.fn(),
      resume: vi.fn(),
      getRun: vi.fn()
    },
    AgentNotFoundError: class AgentNotFoundError extends Error {},
    CursorSdkError,
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

function chatRequest(body: unknown, signal?: AbortSignal) {
  const requestBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? { turnId: "test-turn", ...body }
      : body;
  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
    signal
  });
}

describe("chat route validation and rate limiting", () => {
  const mockedCheckRateLimit = vi.mocked(checkRateLimit);
  const mockedAgentCreate = vi.mocked(Agent.create);
  const mockedAgentResume = vi.mocked(Agent.resume);
  const mockedAgentGetRun = vi.mocked(Agent.getRun);

  function mockAgent(
    modelId: string,
    resultOverrides: Record<string, unknown> = {}
  ): Awaited<ReturnType<typeof Agent.create>> {
    const run = {
      id: "run",
      agentId: "agent",
      model: { id: modelId },
      requestId: "request",
      durationMs: 1,
      stream: async function* () {},
      wait: vi.fn().mockResolvedValue({
        id: "run",
        status: "finished",
        result: "done",
        model: { id: modelId },
        requestId: "request",
        durationMs: 1,
        ...resultOverrides
      }),
      supports: vi.fn().mockReturnValue(false)
    };

    return {
      agentId: "agent",
      send: vi.fn().mockResolvedValue(run),
      [Symbol.asyncDispose]: vi.fn()
    } as unknown as Awaited<ReturnType<typeof Agent.create>>;
  }

  beforeEach(() => {
    mockedCheckRateLimit.mockReset();
    mockedCheckRateLimit.mockResolvedValue({ allowed: true });
    mockedAgentCreate.mockReset();
    mockedAgentResume.mockReset();
    mockedAgentGetRun.mockReset();
  });

  it("declares a platform duration long enough for cloud agent runs", () => {
    expect(maxDuration).toBe(300);
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
    const agent = mockAgent("grok-4.5");
    mockedAgentCreate.mockResolvedValue(agent);

    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "https://github.com/acme/app",
        branch: "main",
        modelId: "grok-4.5"
      })
    );

    await response.text();

    expect(mockedAgentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { id: "grok-4.5" }
      })
    );
  });

  it("uses the selected model for follow-up runs", async () => {
    const agent = mockAgent("grok-4.5");
    mockedAgentResume.mockResolvedValue(agent);
    const agentSessionToken = createAgentSessionToken({
      agentId: "agent",
      apiKey: "key",
      repoUrl: "https://github.com/acme/app",
      branch: "main",
      agentMode: "qa",
      modelId: "grok-4.5"
    });

    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "https://github.com/acme/app",
        branch: "main",
        agentId: "agent",
        agentSessionToken,
        modelId: "grok-4.5"
      })
    );

    await response.text();

    expect(mockedAgentResume).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({
        model: { id: "grok-4.5" }
      })
    );
  });

  it("detaches without cancelling durable cloud work when the request is aborted", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const dispose = vi.fn().mockResolvedValue(undefined);
    const run = {
      id: "run",
      agentId: "agent",
      model: { id: "composer-2.5" },
      stream: async function* () {
        await new Promise<void>(() => undefined);
      },
      wait: vi.fn(),
      supports: vi.fn((capability: string) => capability === "cancel"),
      cancel
    };
    const agent = {
      agentId: "agent",
      send: vi.fn().mockResolvedValue(run),
      [Symbol.asyncDispose]: dispose
    } as unknown as Awaited<ReturnType<typeof Agent.create>>;
    mockedAgentCreate.mockResolvedValue(agent);
    const controller = new AbortController();

    const response = await POST(
      chatRequest(
        {
          apiKey: "key",
          prompt: "hello",
          repoUrl: "https://github.com/acme/app",
          branch: "main"
        },
        controller.signal
      )
    );
    controller.abort();
    await response.text();

    await vi.waitFor(() => {
      expect(cancel).not.toHaveBeenCalled();
      expect(dispose).toHaveBeenCalledOnce();
    });
  });

  it("uses separate stable idempotency keys and emits run identity early", async () => {
    const agent = mockAgent("composer-2.5");
    mockedAgentCreate.mockResolvedValue(agent);

    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "https://github.com/acme/app",
        branch: "main",
        turnId: "client-turn"
      })
    );
    const body = await response.text();

    expect(mockedAgentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "client-turn:agent" })
    );
    expect(agent.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "client-turn:send" })
    );
    expect(body).toContain("event: run");
    expect(body.indexOf("event: run")).toBeLessThan(body.indexOf("event: done"));
  });

  it("streams the SDK terminal error message and code", async () => {
    const agent = mockAgent("composer-2.5", {
      status: "error",
      result: undefined,
      error: {
        message: "Repository checkout failed.",
        code: "checkout_failed"
      }
    });
    mockedAgentCreate.mockResolvedValue(agent);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "https://github.com/acme/app",
        branch: "main"
      })
    );
    const body = await response.text();

    expect(body).toContain("event: error");
    expect(body).toContain('"message":"Repository checkout failed."');
    expect(body).toContain('"code":"checkout_failed"');
    expect(body).not.toContain("failed before finishing");
    consoleError.mockRestore();
  });

  it("streams safe task and tool diagnostics without raw payloads", async () => {
    const run = {
      id: "run",
      agentId: "agent",
      model: { id: "composer-2.5" },
      stream: async function* () {
        yield {
          type: "task",
          agent_id: "agent",
          run_id: "run",
          status: "running",
          text: "private task text"
        };
        yield {
          type: "tool_call",
          agent_id: "agent",
          run_id: "run",
          call_id: "call",
          name: "grep",
          status: "error",
          args: { apiKey: "private argument" },
          result: "private result",
          truncated: { args: true, result: true }
        };
      },
      wait: vi.fn().mockResolvedValue({
        id: "run",
        status: "finished",
        result: "done",
        model: { id: "composer-2.5" }
      }),
      supports: vi.fn().mockReturnValue(false)
    };
    const agent = {
      agentId: "agent",
      send: vi.fn().mockResolvedValue(run),
      [Symbol.asyncDispose]: vi.fn()
    } as unknown as Awaited<ReturnType<typeof Agent.create>>;
    mockedAgentCreate.mockResolvedValue(agent);

    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "https://github.com/acme/app",
        branch: "main"
      })
    );
    const body = await response.text();

    expect(body).toContain("event: task");
    expect(body).toContain('"status":"running"');
    expect(body).toContain("event: tool");
    expect(body).toContain('"status":"error"');
    expect(body).toContain('"argsTruncated":true');
    expect(body).toContain('"resultTruncated":true');
    expect(body).not.toContain("private task text");
    expect(body).not.toContain("private argument");
    expect(body).not.toContain("private result");
  });

  it("recovers the same run without creating or sending another run", async () => {
    const run = {
      id: "run-to-recover",
      agentId: "agent",
      model: { id: "grok-4.5" },
      requestId: "request",
      durationMs: 2,
      stream: async function* () {},
      wait: vi.fn().mockResolvedValue({
        id: "run-to-recover",
        status: "finished",
        result: "recovered",
        model: { id: "grok-4.5" }
      }),
      supports: vi.fn().mockReturnValue(false)
    } as unknown as Awaited<ReturnType<typeof Agent.getRun>>;
    mockedAgentGetRun.mockResolvedValue(run);
    const agentSessionToken = createAgentSessionToken({
      agentId: "agent",
      apiKey: "key",
      repoUrl: "https://github.com/acme/app",
      branch: "main",
      agentMode: "qa",
      modelId: "grok-4.5"
    });

    const response = await POST(
      chatRequest({
        apiKey: "key",
        repoUrl: "https://github.com/acme/app",
        branch: "main",
        modelId: "grok-4.5",
        agentId: "agent",
        agentSessionToken,
        turnId: "client-turn",
        recoverRunId: "run-to-recover"
      })
    );
    const body = await response.text();

    expect(mockedAgentGetRun).toHaveBeenCalledWith("run-to-recover", {
      runtime: "cloud",
      agentId: "agent",
      apiKey: "key"
    });
    expect(mockedAgentCreate).not.toHaveBeenCalled();
    expect(mockedAgentResume).not.toHaveBeenCalled();
    expect(body).toContain("recovered");
    expect(body).toContain("event: done");
  });

  it("polls the durable run when its live stream is no longer available", async () => {
    const unavailableRun = {
      id: "run",
      agentId: "agent",
      model: { id: "composer-2.5" },
      requestId: "request",
      status: "running",
      stream: async function* () {
        throw new Error("Run stream is no longer available");
      },
      wait: vi.fn(),
      supports: vi.fn().mockReturnValue(false)
    };
    const agent = {
      agentId: "agent",
      send: vi.fn().mockResolvedValue(unavailableRun),
      [Symbol.asyncDispose]: vi.fn()
    } as unknown as Awaited<ReturnType<typeof Agent.create>>;
    const recoveredRun = {
      id: "run",
      agentId: "agent",
      model: { id: "composer-2.5" },
      requestId: "request",
      durationMs: 2,
      status: "finished",
      wait: vi.fn().mockResolvedValue({
        id: "run",
        status: "finished",
        result: "recovered without the live stream",
        model: { id: "composer-2.5" }
      }),
      supports: vi.fn().mockReturnValue(false)
    } as unknown as Awaited<ReturnType<typeof Agent.getRun>>;
    mockedAgentCreate.mockResolvedValue(agent);
    mockedAgentGetRun.mockResolvedValue(recoveredRun);

    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "https://github.com/acme/app",
        branch: "main"
      })
    );
    const body = await response.text();

    expect(mockedAgentGetRun).toHaveBeenCalledWith("run", {
      runtime: "cloud",
      agentId: "agent",
      apiKey: "key"
    });
    expect(agent.send).toHaveBeenCalledTimes(1);
    expect(unavailableRun.wait).not.toHaveBeenCalled();
    expect(body).toContain("recovered without the live stream");
    expect(body).toContain("event: done");
    expect(body).not.toContain("event: error");
  });

  it("rejects a recovered run that is not owned by the verified agent", async () => {
    const run = {
      id: "run-to-recover",
      agentId: "different-agent",
      stream: async function* () {},
      wait: vi.fn(),
      supports: vi.fn().mockReturnValue(false)
    } as unknown as Awaited<ReturnType<typeof Agent.getRun>>;
    mockedAgentGetRun.mockResolvedValue(run);
    const agentSessionToken = createAgentSessionToken({
      agentId: "agent",
      apiKey: "key",
      repoUrl: "https://github.com/acme/app",
      branch: "main",
      agentMode: "qa",
      modelId: "composer-2.5"
    });

    const response = await POST(
      chatRequest({
        apiKey: "key",
        repoUrl: "https://github.com/acme/app",
        branch: "main",
        agentId: "agent",
        agentSessionToken,
        recoverRunId: "run-to-recover"
      })
    );
    const body = await response.text();

    expect(body).toContain("does not belong to this agent session");
    expect(run.wait).not.toHaveBeenCalled();
  });
});
