export type StreamBufferSnapshot = {
  content: string;
  thinking: string;
  activity: string;
  activityLog: string[];
};

const MAX_ACTIVITY_LOG_ITEMS = 20;

export function createStreamBuffer(
  flushMs: number,
  onFlush: (snapshot: StreamBufferSnapshot) => void
) {
  let content = "";
  let thinking = "";
  let activity = "";
  let activityLog: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function snapshot(): StreamBufferSnapshot {
    return { content, thinking, activity, activityLog: [...activityLog] };
  }

  function appendActivity(next: string) {
    const trimmed = next.trim();
    if (!trimmed || activityLog[activityLog.length - 1] === trimmed) return;
    activityLog = [...activityLog, trimmed].slice(-MAX_ACTIVITY_LOG_ITEMS);
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
      thinking += delta;
      scheduleFlush();
    },
    setThinking(text: string) {
      thinking = text;
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
