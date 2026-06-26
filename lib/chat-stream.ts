import { parseSseBuffer, toolActivityLabel } from "@/lib/sse";
import { normalizeTokenUsage } from "@/lib/chat-telemetry";
import type { ChatTokenUsage } from "@/lib/chat-types";

export type ChatStreamDone = {
  agentId: string;
  agentSessionToken?: string;
  runId: string;
  status: string;
  result?: string;
  thinking?: string;
  prUrl?: string;
  requestId?: string;
  usage?: ChatTokenUsage;
  durationMs?: number;
  modelId?: string;
};

export class ChatStreamError extends Error {
  readonly runId?: string;
  readonly requestId?: string;
  readonly code?: string;
  readonly status?: number;
  readonly retryable?: boolean;

  constructor(
    message: string,
    metadata: {
      runId?: string;
      requestId?: string;
      code?: string;
      status?: number;
      retryable?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "ChatStreamError";
    this.runId = metadata.runId;
    this.requestId = metadata.requestId;
    this.code = metadata.code;
    this.status = metadata.status;
    this.retryable = metadata.retryable;
  }
}

export type ChatStreamHandlers = {
  onAgent?: (agentId: string, agentSessionToken?: string) => void;
  onText?: (delta: string) => void;
  onThinking?: (payload: { delta?: string; text?: string }) => void;
  onActivity?: (activity: string) => void;
  onSource?: (path: string) => void;
  onDone?: (payload: ChatStreamDone) => void;
};

export async function consumeChatStream(
  response: Response,
  handlers: ChatStreamHandlers
) {
  if (!response.body) {
    throw new Error("The server returned an empty streaming response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;

    for (const { event, data } of parsed.events) {
      switch (event) {
        case "agent": {
          const agentId = data.agentId;
          if (typeof agentId === "string") {
            handlers.onAgent?.(
              agentId,
              typeof data.agentSessionToken === "string"
                ? data.agentSessionToken
                : undefined
            );
          }
          break;
        }
        case "text": {
          const delta = data.delta;
          if (typeof delta === "string" && delta.length > 0) {
            handlers.onText?.(delta);
          }
          break;
        }
        case "thinking": {
          const delta = data.delta;
          const text = data.text;

          if (typeof delta === "string" && delta.length > 0) {
            handlers.onThinking?.({ delta });
            break;
          }

          if (typeof text === "string" && text.length > 0) {
            handlers.onThinking?.({ text });
          }
          break;
        }
        case "tool": {
          const name = data.name;
          const status = data.status;
          if (typeof name === "string" && typeof status === "string") {
            handlers.onActivity?.(toolActivityLabel(name, status));
          }
          break;
        }
        case "source": {
          const path = data.path;
          if (typeof path === "string" && path.trim()) {
            handlers.onSource?.(path.trim());
          }
          break;
        }
        case "status": {
          const message = data.message;
          if (typeof message === "string" && message.trim()) {
            handlers.onActivity?.(message.trim());
          }
          break;
        }
        case "done": {
          const agentId = data.agentId;
          const runId = data.runId;
          const status = data.status;
          if (
            typeof agentId === "string" &&
            typeof runId === "string" &&
            typeof status === "string"
          ) {
            finished = true;
            handlers.onDone?.({
              agentId,
              runId,
              status,
              agentSessionToken:
                typeof data.agentSessionToken === "string"
                  ? data.agentSessionToken
                  : undefined,
              result: typeof data.result === "string" ? data.result : undefined,
              thinking: typeof data.thinking === "string" ? data.thinking : undefined,
              prUrl: typeof data.prUrl === "string" ? data.prUrl : undefined,
              requestId:
                typeof data.requestId === "string" ? data.requestId : undefined,
              usage: normalizeTokenUsage(data.usage),
              durationMs:
                typeof data.durationMs === "number" ? data.durationMs : undefined,
              modelId: typeof data.model === "string" ? data.model : undefined
            });
          }
          break;
        }
        case "error": {
          const message = data.message;
          throw new ChatStreamError(
            typeof message === "string" ? message : "The chat stream failed.",
            {
              runId: typeof data.runId === "string" ? data.runId : undefined,
              requestId:
                typeof data.requestId === "string" ? data.requestId : undefined,
              code: typeof data.code === "string" ? data.code : undefined,
              status: typeof data.status === "number" ? data.status : undefined,
              retryable:
                typeof data.retryable === "boolean" ? data.retryable : undefined
            }
          );
        }
        default:
          break;
      }
    }
  }

  if (!finished) {
    throw new Error("The connection closed before the answer finished.");
  }
}
