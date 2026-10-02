import { Agent, AgentNotFoundError, CursorSdkError } from "@cursor/sdk";
import type { ModelSelection, Run, RunResult } from "@cursor/sdk";
import { NextResponse } from "next/server";
import {
  isImplementMode,
  parseAgentMode,
  sdkModeForAgentMode
} from "@/lib/agent-mode";
import {
  buildFirstAgentMessage,
  buildUserPrompt,
  defaultImagePrompt
} from "@/lib/cursor-prompt";
import {
  DEFAULT_BRANCH,
  type AgentMode,
  type ModelId
} from "@/lib/defaults";
import {
  getFallbackModelCatalog,
  getModelCatalog,
  isAuthFailure,
  normalizeModelSelection,
  validateSelectionAgainstCatalog
} from "@/lib/model-catalog";
import {
  MAX_CHAT_BODY_BYTES,
  chatImagesToSdk,
  parseChatImages
} from "@/lib/chat-images";
import {
  checkRateLimit,
  claimChatConcurrencySlot,
  limiterUnavailableResponse,
  readJsonBody,
  rateLimitedResponse,
  type RateLimitResult
} from "@/lib/rate-limit";
import {
  createAgentSessionToken,
  verifyAgentSessionToken
} from "@/lib/agent-session";
import { validateAgentPolicy } from "@/lib/agent-policy";
import { extractSourcePaths } from "@/lib/sources";
import { extractThinkingFromConversation } from "@/lib/thinking";
import { ChatStreamEventName, formatSseEvent } from "@/lib/sse";
import { trimmedString, validateBranch, validateRepoUrl } from "@/lib/validate";
import { normalizeTokenUsage } from "@/lib/chat-telemetry";
import type { TerminationReason } from "@/lib/agent-run-termination";

// Opts the route into the longest duration available on Vercel Pro/Enterprise
// (Hobby is capped at 300s; lower this back to 300 if deploying on Hobby). The
// application timeout below fires first so clients receive a structured SSE
// error instead of an abrupt EOF.
export const maxDuration = 800;

type ChatRequest = {
  apiKey?: string;
  prompt?: string;
  repoUrl?: string;
  branch?: string;
  agentId?: string;
  agentSessionToken?: string;
  turnId?: string;
  recoverRunId?: string;
  agentMode?: AgentMode;
  modelId?: string;
  model?: ModelSelection;
  implementConfirmed?: boolean;
  images?: Array<{ url?: string; mimeType?: string }>;
};

const MAX_PROMPT_CHARS = 32_000;
const MAX_CHAT_RUN_TIMEOUT_MS = maxDuration * 1_000 - 15_000;
const DEFAULT_CHAT_RUN_TIMEOUT_MS = MAX_CHAT_RUN_TIMEOUT_MS;
const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
const RUN_STATUS_POLL_INTERVAL_MS = 2_000;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive"
};

type StreamRunContext = {
  apiKey: string;
  repoUrl: string;
  branch: string;
  agentMode: AgentMode;
  modelId: ModelId;
  modelSelection: ModelSelection;
  promptText: string;
  sdkImages: ReturnType<typeof chatImagesToSdk>;
  agentId?: string;
  agentSessionToken?: string;
  turnId: string;
  send: (event: ChatStreamEventName, data: Record<string, unknown>) => void;
};

type StreamCallbacks = {
  onTextDelta?: (delta: string) => void;
};

type RunTelemetry = {
  requestId?: string;
  usage?: ReturnType<typeof normalizeTokenUsage>;
};

function parseChatRunTimeoutMs() {
  const value = Number(process.env.ASKCURSOR_CHAT_RUN_TIMEOUT_MS);
  return Number.isInteger(value) && value > 0
    ? Math.min(value, MAX_CHAT_RUN_TIMEOUT_MS)
    : DEFAULT_CHAT_RUN_TIMEOUT_MS;
}

function formatTimeoutSeconds(timeoutMs: number) {
  return Math.max(1, Math.ceil(timeoutMs / 1000)).toLocaleString();
}

function createStreamCallbacks(
  send: StreamRunContext["send"],
  callbacks: StreamCallbacks
) {
  return {
    onDelta: ({ update }: { update: { type: string; text?: string } }) => {
      if (update.type === "text-delta" && update.text) {
        callbacks.onTextDelta?.(update.text);
        send("text", { delta: update.text });
        return;
      }

      if (update.type === "thinking-delta" && update.text) {
        send("thinking", { delta: update.text });
      }
    }
  };
}

async function streamRunEvents(
  run: Run,
  send: StreamRunContext["send"],
  options?: { streamThinking?: boolean }
): Promise<RunTelemetry> {
  const streamThinking = options?.streamThinking ?? false;
  const telemetry: RunTelemetry = {};

  for await (const event of run.stream()) {
    if (event.type === "request") {
      telemetry.requestId = event.request_id;
      continue;
    }

    if (event.type === "usage") {
      telemetry.usage = normalizeTokenUsage(event.usage) ?? telemetry.usage;
      continue;
    }

    if (event.type === "tool_call") {
      send("tool", {
        name: event.name,
        status: event.status,
        argsTruncated: event.truncated?.args === true,
        resultTruncated: event.truncated?.result === true
      });

      if (event.status === "completed") {
        for (const path of extractSourcePaths(
          event.name,
          event.args,
          event.result
        )) {
          send("source", { path });
        }
      }

      continue;
    }

    if (event.type === "task") {
      // Task text may contain user input, repository content, or tool arguments.
      // Only forward its lifecycle status; the client renders a fixed safe label.
      send("task", { status: event.status });
      continue;
    }

    if (event.type === "thinking" && event.text && streamThinking) {
      send("thinking", { delta: event.text });
      continue;
    }

    if (event.type === "status" && event.message) {
      send("status", { message: event.message });
    }
  }

  return telemetry;
}

function extractPrUrl(result: RunResult): string | undefined {
  return result.git?.branches?.find((branch) => branch.prUrl)?.prUrl;
}

function modelIdFromResult(result: RunResult, run: Run) {
  return result.model?.id ?? run.model?.id;
}

function requestIdFrom(error: CursorSdkError, run?: Run | null) {
  return error.requestId ?? run?.requestId;
}

function logCursorFailure({
  error,
  agentId,
  run,
  runId,
  requestId,
  agentMode,
  modelId,
  repoUrl,
  branch
}: {
  error: CursorSdkError | Error | string;
  agentId?: string;
  run?: Run | null;
  runId?: string;
  requestId?: string;
  agentMode: AgentMode;
  modelId: ModelId;
  repoUrl: string;
  branch: string;
}) {
  const sdkError = error instanceof CursorSdkError ? error : null;

  console.error("Cursor agent run failed", {
    agentId: agentId ?? run?.agentId,
    runId: runId ?? run?.id,
    requestId: requestId ?? (sdkError ? requestIdFrom(sdkError, run) : run?.requestId),
    agentMode,
    modelId,
    repoUrl,
    branch,
    message: typeof error === "string" ? error : error.message,
    code: sdkError?.code,
    status: sdkError?.status,
    retryable: sdkError?.isRetryable
  });
}

async function createCloudAgent(
  apiKey: string,
  repoUrl: string,
  branch: string,
  agentMode: AgentMode,
  modelSelection: ModelSelection,
  turnId: string
) {
  const cloudBase = {
    repos: [{ url: repoUrl, startingRef: branch }]
  };

  return Agent.create({
    apiKey,
    model: modelSelection,
    mode: sdkModeForAgentMode(agentMode),
    idempotencyKey: `${turnId}:agent`,
    cloud: isImplementMode(agentMode)
      ? { ...cloudBase, autoCreatePR: true }
      : { ...cloudBase, skipReviewerRequest: true }
  });
}

async function startFirstRun({
  apiKey,
  repoUrl,
  branch,
  agentMode,
  modelId,
  modelSelection,
  promptText,
  sdkImages,
  turnId,
  send
}: Omit<StreamRunContext, "agentId">) {
  const agent = await createCloudAgent(
    apiKey,
    repoUrl,
    branch,
    agentMode,
    modelSelection,
    turnId
  );
  const agentSessionToken = createAgentSessionToken({
    agentId: agent.agentId,
    apiKey,
    repoUrl,
    branch,
    agentMode,
    modelId,
    modelParams: modelSelection.params
  });
  send("agent", { agentId: agent.agentId, agentSessionToken });

  let streamedTextLength = 0;
  const agentMessage = buildFirstAgentMessage(
    promptText,
    { repoUrl, branch, mode: agentMode },
    sdkImages.length > 0 ? sdkImages : undefined
  );

  const run = await agent.send(agentMessage, {
    idempotencyKey: `${turnId}:send`,
    mode: sdkModeForAgentMode(agentMode),
    ...createStreamCallbacks(send, {
      onTextDelta: (delta) => {
        streamedTextLength += delta.length;
      }
    })
  });

  return {
    agentId: agent.agentId,
    agentSessionToken,
    run,
    agent,
    streamedTextLength
  };
}

async function startFollowUpRun({
  apiKey,
  repoUrl,
  branch,
  agentMode,
  modelId,
  modelSelection,
  promptText,
  sdkImages,
  agentId,
  turnId,
  send
}: StreamRunContext) {
  let agent: Awaited<ReturnType<typeof Agent.create>> | null = null;

  try {
    agent = await Agent.resume(agentId!, {
      apiKey,
      model: modelSelection,
      mode: sdkModeForAgentMode(agentMode)
    });
  } catch (resumeError) {
    if (resumeError instanceof AgentNotFoundError) {
      send("status", {
        message: "Previous agent unavailable. Starting a new cloud agent..."
      });

      return startFirstRun({
        apiKey,
        repoUrl,
        branch,
        agentMode,
        modelId,
        modelSelection,
        promptText,
        sdkImages,
        turnId,
        send
      });
    }

    if (!(resumeError instanceof CursorSdkError)) {
      throw resumeError;
    }

    throw resumeError;
  }

  const agentSessionToken = createAgentSessionToken({
    agentId: agent.agentId,
    apiKey,
    repoUrl,
    branch,
    agentMode,
    modelId,
    modelParams: modelSelection.params
  });
  send("agent", { agentId: agent.agentId, agentSessionToken });

  let streamedTextLength = 0;
  const agentMessage =
    sdkImages.length > 0
      ? { text: promptText, images: sdkImages }
      : promptText;

  const run = await agent.send(agentMessage, {
    idempotencyKey: `${turnId}:send`,
    mode: sdkModeForAgentMode(agentMode),
    ...createStreamCallbacks(send, {
      onTextDelta: (delta) => {
        streamedTextLength += delta.length;
      }
    })
  });

  return {
    agentId: agent.agentId,
    agentSessionToken,
    run,
    agent,
    streamedTextLength
  };
}

async function recoverRun({
  apiKey,
  repoUrl,
  branch,
  agentMode,
  modelId,
  modelSelection,
  agentId,
  recoverRunId
}: Pick<
  StreamRunContext,
  | "apiKey"
  | "repoUrl"
  | "branch"
  | "agentMode"
  | "modelId"
  | "modelSelection"
  | "agentId"
> & { recoverRunId: string }) {
  const run = await Agent.getRun(recoverRunId, {
    runtime: "cloud",
    agentId: agentId!,
    apiKey
  });

  if (run.agentId !== agentId) {
    throw new Error("The recovered run does not belong to this agent session.");
  }

  const agentSessionToken = createAgentSessionToken({
    agentId: agentId!,
    apiKey,
    repoUrl,
    branch,
    agentMode,
    modelId,
    modelParams: modelSelection.params
  });

  return {
    agentId: agentId!,
    agentSessionToken,
    run,
    agent: null,
    streamedTextLength: 0
  };
}

// Losing the live event stream says nothing about the durable run: the cloud
// agent keeps working and its result stays fetchable. Cold agents are the
// common case — the first run of a freshly created agent regularly drops its
// SSE attachment while the repository is still being provisioned.
function isUnavailableRunStreamMessage(message: string | undefined) {
  return typeof message === "string" && /stream is no longer available/i.test(message);
}

function isUnavailableRunStreamError(error: unknown) {
  return error instanceof Error && isUnavailableRunStreamMessage(error.message);
}

// The SDK reports a dropped stream through `Run.wait()` rather than through
// `Run.stream()`: the background stream loop closes the event buffer in a
// `finally`, so iteration ends cleanly, and the rejection only resurfaces when
// `wait()` awaits the same promise and marks the run as errored. Both shapes
// have to be treated as a transport failure, not as a failed run.
function isUnavailableRunStreamResult(result: RunResult) {
  return (
    result.status === "error" &&
    isUnavailableRunStreamMessage(result.error?.message)
  );
}

async function pollRunUntilTerminal({
  apiKey,
  agentId,
  runId,
  shouldStop
}: {
  apiKey: string;
  agentId: string;
  runId: string;
  shouldStop: () => boolean;
}): Promise<Run | null> {
  while (!shouldStop()) {
    const run = await Agent.getRun(runId, {
      runtime: "cloud",
      agentId,
      apiKey
    });
    if (run.agentId !== agentId) {
      throw new Error("The recovered run does not belong to this agent session.");
    }
    if (run.status !== "running") return run;

    await new Promise((resolve) =>
      setTimeout(resolve, RUN_STATUS_POLL_INTERVAL_MS)
    );
  }

  return null;
}

function limitedResponse(result: Exclude<RateLimitResult, { allowed: true }>) {
  return result.unavailable
    ? limiterUnavailableResponse()
    : rateLimitedResponse(result.retryAfterSeconds);
}

export async function POST(request: Request) {
  // A cheap per-IP guard before the body is read, so oversized or junk
  // requests cannot be used to burn CPU while the precise limits wait on the
  // validated API key.
  const preflight = await checkRateLimit("chatPreflight", request);
  if (!preflight.allowed) return limitedResponse(preflight);

  const parsedBody = await readJsonBody<ChatRequest>(request, MAX_CHAT_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;

  const body = parsedBody.body;

  const apiKey = trimmedString(body.apiKey);
  const agentMode = parseAgentMode(body.agentMode);
  const prompt = trimmedString(body.prompt);
  const repoValidation = validateRepoUrl(body.repoUrl);
  if (!repoValidation.ok) {
    return NextResponse.json({ error: repoValidation.error }, { status: 400 });
  }

  const branchValidation = validateBranch(
    trimmedString(body.branch) || DEFAULT_BRANCH
  );
  if (!branchValidation.ok) {
    return NextResponse.json({ error: branchValidation.error }, { status: 400 });
  }

  const repoUrl = repoValidation.value.url;
  const branch = branchValidation.value;
  const agentId = trimmedString(body.agentId);
  const agentSessionToken = trimmedString(body.agentSessionToken);
  const turnId = trimmedString(body.turnId);
  const recoverRunId = trimmedString(body.recoverRunId);

  if (!apiKey) {
    return NextResponse.json({ error: "API key is required." }, { status: 400 });
  }

  const requestedModel = normalizeModelSelection(body.model, body.modelId);
  if (!requestedModel) {
    return NextResponse.json(
      { error: "A valid Cursor model selection is required." },
      { status: 400 }
    );
  }

  if (
    !turnId ||
    turnId.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(turnId)
  ) {
    return NextResponse.json(
      { error: "A valid client turn ID is required." },
      { status: 400 }
    );
  }

  if (recoverRunId && !agentId) {
    return NextResponse.json(
      { error: "An agent session is required to recover a run." },
      { status: 400 }
    );
  }

  const policy = validateAgentPolicy({
    agentMode,
    repoUrl,
    branch,
    isFollowUp: Boolean(agentId),
    implementConfirmed: body.implementConfirmed === true
  });

  if (!policy.allowed) {
    return NextResponse.json({ error: policy.error }, { status: policy.status });
  }

  const sdkImages = chatImagesToSdk(parseChatImages(body.images));

  if (!recoverRunId && !prompt && sdkImages.length === 0) {
    return NextResponse.json({ error: "A prompt or image is required." }, { status: 400 });
  }

  if (prompt && prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      {
        error: `Prompt is too long. Keep it under ${MAX_PROMPT_CHARS.toLocaleString()} characters.`
      },
      { status: 413 }
    );
  }

  let modelSelection = requestedModel;
  if (!recoverRunId) {
    let catalog;
    try {
      catalog = await getModelCatalog(apiKey);
    } catch (error) {
      if (isAuthFailure(error)) {
        return NextResponse.json(
          { error: "The Cursor API key was rejected. Check the key and try again." },
          { status: 401 }
        );
      }
      catalog = getFallbackModelCatalog();
    }
    const validation = validateSelectionAgainstCatalog(requestedModel, catalog);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    modelSelection = validation.value;
  }
  const modelId = modelSelection.id;

  if (agentId) {
    const session = verifyAgentSessionToken(agentSessionToken, {
      agentId,
      apiKey,
      repoUrl,
      branch,
      agentMode,
      modelId,
      modelParams: modelSelection.params
    });

    if (!session.valid) {
      return NextResponse.json(
        {
          error:
            "This agent session is no longer valid for the selected repository, branch, mode, and model. Start a new chat to continue."
        },
        { status: 409 }
      );
    }
  }

  // Requests rejected above never spend quota. The catalog lookup is bounded
  // by the preflight limit and the per-key (and failure) cache.
  // The precise per-IP and per-key limits come before the catalog lookup, which
  // makes an upstream call on every cache miss.
  const rateLimit = await checkRateLimit(
    isImplementMode(agentMode) ? "chatImplement" : "chat",
    request,
    { apiKey }
  );
  if (!rateLimit.allowed) return limitedResponse(rateLimit);

  const promptText = buildUserPrompt(prompt || defaultImagePrompt());
  const concurrencySlot = await claimChatConcurrencySlot(apiKey);
  if (!concurrencySlot.allowed) {
    if (concurrencySlot.unavailable) return limiterUnavailableResponse();

    if (concurrencySlot.reason === "per-user") {
      return NextResponse.json(
        {
          error:
            "You already have several runs in progress. Wait for one to finish, or stop one, then try again."
        },
        {
          status: 429,
          headers: { "Retry-After": String(concurrencySlot.retryAfterSeconds) }
        }
      );
    }

    return rateLimitedResponse(concurrencySlot.retryAfterSeconds);
  }

  // Set once the stream starts; lets the consumer's cancel() take the same
  // detach path as a request abort.
  let detachOnCancel: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      detachOnCancel?.();
    },
    async start(controller) {
      const encoder = new TextEncoder();
      const runTimeoutMs = parseChatRunTimeoutMs();
      let streamClosed = false;
      let slotReleased = false;
      let disposableAgent: Awaited<ReturnType<typeof Agent.create>> | null = null;
      let currentRun: Run | null = null;
      let resolvedAgentIdForLog = agentId;
      let terminationPromise: Promise<void> | null = null;

      // enqueue/close throw once the consumer has cancelled the stream, which
      // must never escape into the run loop.
      const enqueue = (chunk: string) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          streamClosed = true;
        }
      };

      const send = (event: ChatStreamEventName, data: Record<string, unknown>) => {
        enqueue(formatSseEvent(event, data));
      };

      const closeStream = () => {
        if (streamClosed) return;
        streamClosed = true;
        try {
          controller.close();
        } catch {
          // Already cancelled by the consumer.
        }
      };

      // SSE comments are ignored by the client parser but keep the HTTP
      // response active while the agent is busy without emitting SDK events.
      const sendHeartbeat = () => enqueue(": heartbeat\n\n");

      const releaseSlot = async () => {
        if (slotReleased) return;
        slotReleased = true;
        await concurrencySlot.release();
      };

      const disposeAgent = async () => {
        if (!disposableAgent) return;
        const agent = disposableAgent;
        disposableAgent = null;
        await agent[Symbol.asyncDispose]();
      };

      const terminateRun = (reason: TerminationReason) => {
        if (terminationPromise) return terminationPromise;

        if (reason === "abort" || reason === "timeout") {
          // Transport loss and route deadlines detach from durable cloud work.
          // Explicit user cancellation is handled separately; cancelling here
          // would make the emitted run identity impossible to recover.
          if (reason === "timeout") {
            send("error", {
              message: `The connection to the Cursor run timed out after ${formatTimeoutSeconds(runTimeoutMs)} seconds. Reconnect to continue receiving this run.`,
              runId: currentRun?.id,
              retryable: true
            });
          }
          closeStream();
          terminationPromise = (async () => {
            try {
              await disposeAgent();
            } catch (error) {
              console.error("Failed to dispose detached Cursor agent.", error);
            }
            await releaseSlot();
          })();
          return terminationPromise;
        }

        return terminationPromise;
      };

      const handleRequestAbort = () => {
        void terminateRun("abort");
      };
      request.signal.addEventListener("abort", handleRequestAbort, { once: true });
      detachOnCancel = handleRequestAbort;

      const timeout = setTimeout(() => {
        void terminateRun("timeout");
      }, runTimeoutMs);
      const heartbeat = setInterval(sendHeartbeat, SSE_HEARTBEAT_INTERVAL_MS);

      try {
        send("status", { message: "Starting Cursor cloud agent..." });

        const runContext: StreamRunContext = {
          apiKey,
          repoUrl,
          branch,
          agentMode,
          modelId,
          modelSelection,
          promptText,
          sdkImages,
          agentId,
          agentSessionToken,
          turnId,
          send
        };

        const started = recoverRunId
          ? await recoverRun({ ...runContext, recoverRunId })
          : agentId
            ? await startFollowUpRun(runContext)
            : await startFirstRun(runContext);

        disposableAgent = started.agent;
        const resolvedAgentId = started.agentId;
        const resolvedAgentSessionToken = started.agentSessionToken;
        resolvedAgentIdForLog = resolvedAgentId;
        currentRun = started.run;
        send("run", {
          agentId: resolvedAgentId,
          agentSessionToken: resolvedAgentSessionToken,
          runId: started.run.id
        });

        if (request.signal.aborted || streamClosed) {
          // The request may have been aborted (or the client cancelled the
          // stream, or the deadline passed) while Agent.create/resume was still
          // pending, before there was an agent to dispose of.
          terminationPromise = null;
          await terminateRun("abort");
          return;
        }

        let completedRun = started.run;
        let streamTelemetry: RunTelemetry = {};

        const recoverFromLostStream = async () => {
          send("status", {
            message: "Live updates ended; waiting for the final run result..."
          });
          const recoveredRun = await pollRunUntilTerminal({
            apiKey,
            agentId: resolvedAgentId,
            runId: completedRun.id,
            shouldStop: () => streamClosed
          });
          if (!recoveredRun) return null;
          completedRun = recoveredRun;
          currentRun = recoveredRun;
          return recoveredRun.wait();
        };

        try {
          streamTelemetry = await streamRunEvents(started.run, send);
        } catch (error) {
          if (!isUnavailableRunStreamError(error)) throw error;

          const recoveredResult = await recoverFromLostStream();
          if (!recoveredResult) return;
        }

        let result = await completedRun.wait();

        if (isUnavailableRunStreamResult(result)) {
          const recoveredResult = await recoverFromLostStream();
          if (!recoveredResult) return;
          result = recoveredResult;
        }

        const requestId =
          result.requestId ?? streamTelemetry.requestId ?? completedRun.requestId;
        const usage =
          normalizeTokenUsage(result.usage) ?? streamTelemetry.usage;

        if (result.status === "error") {
          const runError =
            result.error?.message || "The Cursor agent run failed before finishing.";
          logCursorFailure({
            error: runError,
            agentId: resolvedAgentId,
            run: completedRun,
            runId: result.id,
            requestId,
            agentMode,
            modelId,
            repoUrl,
            branch
          });
          send("error", {
            message: runError,
            code: result.error?.code,
            runId: result.id,
            requestId
          });
          return;
        }

        if (result.status === "cancelled") {
          logCursorFailure({
            error: "The Cursor agent run was cancelled.",
            agentId: resolvedAgentId,
            run: completedRun,
            runId: result.id,
            requestId,
            agentMode,
            modelId,
            repoUrl,
            branch
          });
          send("error", {
            message: "The Cursor agent run was cancelled.",
            runId: result.id,
            requestId
          });
          return;
        }

        const finalResult = result.result?.trim();
        if (finalResult && started.streamedTextLength === 0) {
          send("text", { delta: finalResult });
        }

        let thinking: string | undefined;

        if (completedRun.supports("conversation")) {
          try {
            const turns = await completedRun.conversation();
            thinking = extractThinkingFromConversation(turns);
          } catch {
            // Fall back to whatever thinking streamed during the run.
          }
        }

        send("done", {
          agentId: resolvedAgentId,
          agentSessionToken: resolvedAgentSessionToken,
          runId: result.id,
          status: result.status,
          result: finalResult,
          thinking,
          prUrl: extractPrUrl(result),
          requestId,
          usage,
          durationMs: result.durationMs ?? completedRun.durationMs,
          model: modelIdFromResult(result, completedRun)
        });
      } catch (error) {
        if (error instanceof CursorSdkError) {
          const requestId = requestIdFrom(error, currentRun);
          logCursorFailure({
            error,
            agentId: resolvedAgentIdForLog,
            run: currentRun,
            requestId,
            agentMode,
            modelId,
            repoUrl,
            branch
          });
          send("error", {
            message: error.message,
            retryable: error.isRetryable,
            code: error.code,
            status: error.status,
            requestId,
            runId: currentRun?.id
          });
          return;
        }

        logCursorFailure({
          error:
            error instanceof Error
              ? error
              : "Failed to run the Cursor agent.",
          agentId: resolvedAgentIdForLog,
          run: currentRun,
          agentMode,
          modelId,
          repoUrl,
          branch
        });
        send("error", {
          message:
            error instanceof Error
              ? error.message
              : "Failed to run the Cursor agent."
        });
      } finally {
        request.signal.removeEventListener("abort", handleRequestAbort);
        clearTimeout(timeout);
        clearInterval(heartbeat);
        await terminationPromise;
        await disposeAgent();
        await releaseSlot();
        closeStream();
      }
    }
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
