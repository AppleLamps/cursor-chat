import { parseSseBuffer, toolActivityLabel } from "@/lib/sse";

export type ChatStreamDone = {
  agentId: string;
  runId: string;
  status: string;
  result?: string;
};

export type ChatStreamHandlers = {
  onAgent?: (agentId: string) => void;
  onText?: (delta: string) => void;
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
            handlers.onAgent?.(agentId);
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
              result: typeof data.result === "string" ? data.result : undefined
            });
          }
          break;
        }
        case "error": {
          const message = data.message;
          throw new Error(
            typeof message === "string" ? message : "The chat stream failed."
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
