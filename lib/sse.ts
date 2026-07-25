export type ChatStreamEventName =
  | "agent"
  | "run"
  | "text"
  | "thinking"
  | "tool"
  | "task"
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
  const malformedEvents: string[] = [];
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
      malformedEvents.push(eventName);
    }
  }

  return { events, malformedEvents, rest };
}

export function toolActivityLabel(
  name: string,
  status: string,
  options: { argsTruncated?: boolean; resultTruncated?: boolean } = {}
) {
  const normalized = name.toLowerCase();
  const suffix =
    options.argsTruncated || options.resultTruncated ? " (details truncated)" : "";

  if (status === "error") {
    return `Tool ${name} failed${suffix}`;
  }

  const prefix = status === "running" ? "Running" : "Finished";

  if (normalized.includes("read") || normalized === "read") {
    return `${status === "running" ? "Reading files…" : "Finished reading files"}${suffix}`;
  }

  if (normalized.includes("grep") || normalized.includes("search")) {
    return `${status === "running" ? "Searching the codebase…" : "Finished searching"}${suffix}`;
  }

  if (normalized.includes("glob") || normalized.includes("ls")) {
    return `${status === "running" ? "Scanning files…" : "Finished scanning files"}${suffix}`;
  }

  return `${prefix} ${name}…${suffix}`;
}

export function taskActivityLabel(status?: string) {
  const normalized = status?.trim().toLowerCase();

  if (normalized === "completed" || normalized === "finished") {
    return "Finished delegated task";
  }

  if (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "cancelled"
  ) {
    return "Delegated task failed";
  }

  return "Working on a delegated task…";
}
