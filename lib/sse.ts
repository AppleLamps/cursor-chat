export type ChatStreamEventName =
  | "agent"
  | "text"
  | "tool"
  | "source"
  | "status"
  | "done"
  | "error";

export function formatSseEvent(
  event: ChatStreamEventName,
  data: Record<string, unknown>
) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export type ParsedSseEvent = {
  event: ChatStreamEventName;
  data: Record<string, unknown>;
};

export function parseSseBuffer(buffer: string) {
  const events: ParsedSseEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    if (!part.trim()) continue;

    let eventName = "message";
    let dataLine = "";

    for (const line of part.split("\n")) {
      if (line.startsWith("event: ")) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        dataLine = line.slice(6);
      }
    }

    if (!dataLine) continue;

    try {
      events.push({
        event: eventName as ChatStreamEventName,
        data: JSON.parse(dataLine) as Record<string, unknown>
      });
    } catch {
      // Ignore malformed SSE chunks.
    }
  }

  return { events, rest };
}

export function toolActivityLabel(name: string, status: string) {
  const normalized = name.toLowerCase();
  const prefix = status === "running" ? "Running" : "Finished";

  if (normalized.includes("read") || normalized === "read") {
    return status === "running" ? "Reading files…" : "Finished reading files";
  }

  if (normalized.includes("grep") || normalized.includes("search")) {
    return status === "running" ? "Searching the codebase…" : "Finished searching";
  }

  if (normalized.includes("glob") || normalized.includes("ls")) {
    return status === "running" ? "Scanning files…" : "Finished scanning files";
  }

  return `${prefix} ${name}…`;
}
