import { beforeEach, describe, expect, it, vi } from "vitest";
import { Agent, Cursor } from "@cursor/sdk";
import { maxDuration, POST } from "@/app/api/chat/route";
import { createAgentSessionToken } from "@/lib/agent-session";
import { clearModelCatalogCacheForTests } from "@/lib/model-catalog";
import { checkRateLimit, claimChatConcurrencySlot } from "@/lib/rate-limit";

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
    Cursor: { models: { list: vi.fn() } },
    AgentNotFoundError: class AgentNotFoundError extends Error {},
    CursorSdkError,
    CursorAgentError
  };
});

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();

  return {
    ...actual,
    checkRateLimit: vi.fn(),
    claimChatConcurrencySlot: vi.fn(actual.claimChatConcurrencySlot)
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
  const mockedListModels = vi.mocked(Cursor.models.list);
  const mockedClaimSlot = vi.mocked(claimChatConcurrencySlot);

  /** The cheap preflight guard always runs; only the real chat limits count as quota. */
  function expectNoQuotaCharged() {
    const routes = mockedCheckRateLimit.mock.calls.map(([route]) => route);
    expect(routes.filter((route) => route !== "chatPreflight")).toEqual([]);
  }

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
    clearModelCatalogCacheForTests();
    // Without a reachable catalog the route falls back to the built-in models.
    mockedListModels.mockReset().mockRejectedValue(new Error("catalog down"));
  });

  it("declares a platform duration long enough for cloud agent runs", () => {
    expect(maxDuration).toBe(800);
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
    expectNoQuotaCharged();
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
    expectNoQuotaCharged();
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
    expectNoQuotaCharged();
  });

  it.each(["main", "feature/custom-base"])("launches Implement from %s on a separate branch", async (branch) => {
    mockedAgentCreate.mockResolvedValue(mockAgent("composer-2.5"));
    await (await POST(chatRequest({ apiKey: "key", prompt: "fix it", repoUrl: "https://github.com/acme/app",
      branch, agentMode: "implement", implementConfirmed: true }))).text();
    expect(mockedAgentCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: "agent", agentId: expect.stringMatching(/^bc-/),
      cloud: { repos: [{ url: "https://github.com/acme/app", startingRef: branch }],
        autoCreatePR: true, workOnCurrentBranch: false, skipReviewerRequest: true }
    }));
  });

  it("uses stable creation identity and send key when the launch response is lost", async () => {
    const agent = mockAgent("composer-2.5");
    mockedAgentCreate.mockResolvedValue(agent);
    const body = { apiKey: "key", prompt: "fix it", repoUrl: "https://github.com/acme/app", branch: "main",
      agentMode: "implement", implementConfirmed: true, turnId: "same-turn" };
    await (await POST(chatRequest(body))).text();
    await (await POST(chatRequest(body))).text();
    expect(mockedAgentCreate.mock.calls[0][0].agentId).toBe(mockedAgentCreate.mock.calls[1][0].agentId);
    expect(vi.mocked(agent.send).mock.calls.map((call) => call[1]?.idempotencyKey)).toEqual(["agent:same-turn:send", "agent:same-turn:send"]);
  });

  it("retains scoped PR metadata even for a failed Implement run", async () => {
    mockedAgentCreate.mockResolvedValue(mockAgent("composer-2.5", { status: "error", error: { message: "test failed" },
      git: { branches: [{ repoUrl: "github.com/acme/app", branch: "cursor/change", prUrl: "https://github.com/acme/app/pull/7" }] } }));
    const body = await (await POST(chatRequest({ apiKey: "key", prompt: "fix it", repoUrl: "https://github.com/acme/app", branch: "main",
      agentMode: "implement", implementConfirmed: true }))).text();
    expect(body).toContain('"prUrl":"https://github.com/acme/app/pull/7"');
    expect(body).toContain('"status":"error"');
    expect(body).not.toContain("event: done");
  });

  it("never silently replaces an unavailable Implement follow-up", async () => {
    const { AgentNotFoundError } = await import("@cursor/sdk");
    mockedAgentResume.mockRejectedValue(new AgentNotFoundError("missing"));
    const scope = { apiKey: "key", agentId: "agent", repoUrl: "https://github.com/acme/app", branch: "main",
      agentMode: "implement" as const, modelId: "composer-2.5" };
    const body = await (await POST(chatRequest({ ...scope, prompt: "fix the test", agentSessionToken: createAgentSessionToken(scope) }))).text();
    expect(body).toContain("no replacement agent was started");
    expect(mockedAgentCreate).not.toHaveBeenCalled();
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

  const validBody = {
    apiKey: "key",
    prompt: "hello",
    repoUrl: "https://github.com/acme/app",
    branch: "main"
  };

  it("runs the preflight guard before reading the body", async () => {
    mockedCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 5
    });

    const response = await POST(chatRequest(validBody));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(mockedCheckRateLimit.mock.calls[0][0]).toBe("chatPreflight");
    expect(mockedAgentCreate).not.toHaveBeenCalled();
  });

  it("answers 400, not 500, when fields are not strings", async () => {
    const response = await POST(
      chatRequest({ ...validBody, apiKey: 123, prompt: { text: "hi" } })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "API key is required."
    });

    const nullBody = await POST(chatRequest(null));
    expect(nullBody.status).toBe(400);
  });

  it("rejects an API key Cursor refuses instead of starting a run", async () => {
    mockedListModels.mockRejectedValue(
      Object.assign(new Error("bad key"), { status: 401 })
    );

    const response = await POST(chatRequest(validBody));

    expect(response.status).toBe(401);
    expect(mockedAgentCreate).not.toHaveBeenCalled();
    expect(mockedCheckRateLimit.mock.calls.map(([route]) => route)).toEqual([
      "chatPreflight"
    ]);
  });

  it("explains when one user already holds their share of streams", async () => {
    mockedClaimSlot.mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 10,
      reason: "per-user"
    });

    const response = await POST(chatRequest(validBody));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
    const { error } = await response.json();
    expect(error).toMatch(/several runs in progress/);
    expect(mockedClaimSlot).toHaveBeenCalledWith("key");
  });

  it("detaches and frees the slot when the client cancels the stream", async () => {
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
    mockedAgentCreate.mockResolvedValue({
      agentId: "agent",
      send: vi.fn().mockResolvedValue(run),
      [Symbol.asyncDispose]: dispose
    } as unknown as Awaited<ReturnType<typeof Agent.create>>);

    const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
      "@/lib/rate-limit"
    );
    const release = vi.fn();
    mockedClaimSlot.mockImplementationOnce(async (identity) => {
      const slot = await actual.claimChatConcurrencySlot(identity);
      if (!slot.allowed) return slot;
      return {
        allowed: true,
        release: async () => {
          release();
          await slot.release();
        }
      };
    });

    const response = await POST(chatRequest(validBody));
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();

    await vi.waitFor(() => {
      expect(release).toHaveBeenCalledOnce();
      expect(dispose).toHaveBeenCalledOnce();
    });
    expect(cancel).not.toHaveBeenCalled();
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
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^bc-.*:agent$/) })
    );
    expect(agent.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: "agent:client-turn:send" })
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
    expect(body).toContain('"message":"Repository checkout failed.');
    expect(body).toContain("Cursor Settings");
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

  it("polls the durable run when a lost stream is only reported by wait()", async () => {
    // The SDK closes the run event buffer in a `finally`, so a dropped SSE
    // attachment ends `stream()` cleanly and only resurfaces as an errored
    // `wait()` result. This is what a cold agent's very first run hits.
    const lostStreamRun = {
      id: "run",
      agentId: "agent",
      model: { id: "composer-2.5" },
      requestId: "request",
      status: "running",
      stream: async function* () {},
      wait: vi.fn().mockResolvedValue({
        id: "run",
        status: "error",
        error: { message: "Run stream is no longer available" },
        model: { id: "composer-2.5" }
      }),
      supports: vi.fn().mockReturnValue(false)
    };
    const agent = {
      agentId: "agent",
      send: vi.fn().mockResolvedValue(lostStreamRun),
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
        result: "recovered after the stream dropped",
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
    expect(body).toContain("recovered after the stream dropped");
    expect(body).toContain("event: done");
    expect(body).not.toContain("event: error");
    expect(body).not.toContain("no longer available");
  });

  it("still reports a genuine run failure", async () => {
    const failedRun = {
      id: "run",
      agentId: "agent",
      model: { id: "composer-2.5" },
      requestId: "request",
      status: "running",
      stream: async function* () {},
      wait: vi.fn().mockResolvedValue({
        id: "run",
        status: "error",
        error: { message: "The sandbox ran out of disk space" },
        model: { id: "composer-2.5" }
      }),
      supports: vi.fn().mockReturnValue(false)
    };
    mockedAgentCreate.mockResolvedValue({
      agentId: "agent",
      send: vi.fn().mockResolvedValue(failedRun),
      [Symbol.asyncDispose]: vi.fn()
    } as unknown as Awaited<ReturnType<typeof Agent.create>>);

    const response = await POST(
      chatRequest({
        apiKey: "key",
        prompt: "hello",
        repoUrl: "https://github.com/acme/app",
        branch: "main"
      })
    );
    const body = await response.text();

    expect(mockedAgentGetRun).not.toHaveBeenCalled();
    expect(body).toContain("event: error");
    expect(body).toContain("The sandbox ran out of disk space");
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
