import type { AgentTraceEntry } from "@/lib/agent-activity";

export type StreamBufferSnapshot = {
  content: string;
  thinking: string;
  activity: string;
  activityLog: string[];
  /** Reasoning and tool updates in the order they arrived. */
  trace: AgentTraceEntry[];
};

const MAX_ACTIVITY_LOG_ITEMS = 20;
const MAX_TRACE_ACTIVITY_ENTRIES = 400;

export function createStreamBuffer(
  flushMs: number,
  onFlush: (snapshot: StreamBufferSnapshot) => void
) {
  let content = "";
  let thinking = "";
  let activity = "";
  let activityLog: string[] = [];
  let trace: AgentTraceEntry[] = [];
  // Reasoning already closed off by a later activity entry. New thinking text
  // extends the open block, so anything past this prefix belongs to it.
  let committedThinking = "";
  let openThinkingIndex: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function snapshot(): StreamBufferSnapshot {
    return {
      content,
      thinking,
      activity,
      activityLog: [...activityLog],
      trace: trace.map((entry) => ({ ...entry }))
    };
  }

  function trimTrace() {
    let activityEntries = 0;
    for (const entry of trace) {
      if (entry.type === "activity") activityEntries += 1;
    }
    if (activityEntries <= MAX_TRACE_ACTIVITY_ENTRIES) return;

    // Only activity entries are dropped: removing reasoning would invalidate
    // the committed-prefix accounting above.
    let toDrop = activityEntries - MAX_TRACE_ACTIVITY_ENTRIES;
    const next: AgentTraceEntry[] = [];
    for (const entry of trace) {
      if (toDrop > 0 && entry.type === "activity") {
        toDrop -= 1;
        continue;
      }
      next.push(entry);
    }
    trace = next;
    openThinkingIndex =
      openThinkingIndex === null ? null : trace.length - 1;
  }

  function appendActivity(next: string) {
    const trimmed = next.trim();
    if (!trimmed) return;

    if (openThinkingIndex !== null) {
      committedThinking = thinking;
      openThinkingIndex = null;
    }

    const previous = [...trace]
      .reverse()
      .find((entry) => entry.type === "activity");
    if (previous?.type === "activity" && previous.label === trimmed) return;

    trace.push({ type: "activity", label: trimmed });
    trimTrace();

    if (activityLog[activityLog.length - 1] === trimmed) return;
    activityLog = [...activityLog, trimmed].slice(-MAX_ACTIVITY_LOG_ITEMS);
  }

  function recordThinking(text: string) {
    thinking = text;

    if (!text.startsWith(committedThinking)) {
      // The agent replaced its reasoning wholesale; rebuild it as one block.
      trace = trace.filter((entry) => entry.type !== "thinking");
      committedThinking = "";
      trace.push({ type: "thinking", text });
      openThinkingIndex = trace.length - 1;
      return;
    }

    const pending = text.slice(committedThinking.length);
    if (!pending) return;

    if (openThinkingIndex === null) {
      trace.push({ type: "thinking", text: pending });
      openThinkingIndex = trace.length - 1;
      return;
    }

    trace[openThinkingIndex] = { type: "thinking", text: pending };
  }

  function flushNow() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    onFlush(snapshot());
  }

  function scheduleFlush() {
    if (timer !== null) return;

    timer = setTimeout(() => {
      timer = null;
      onFlush(snapshot());
    }, flushMs);
  }

  return {
    appendText(delta: string) {
      content += delta;
      scheduleFlush();
    },
    setContent(text: string) {
      content = text;
      scheduleFlush();
    },
    appendThinking(delta: string) {
      recordThinking(thinking + delta);
      scheduleFlush();
    },
    setThinking(text: string) {
      recordThinking(text);
      scheduleFlush();
    },
    setActivity(next: string) {
      activity = next;
      appendActivity(next);
      scheduleFlush();
    },
    flushNow,
    getSnapshot: snapshot
  };
}
