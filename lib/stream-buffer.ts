export type StreamBufferSnapshot = {
  content: string;
  thinking: string;
  activity: string;
};

export function createStreamBuffer(
  flushMs: number,
  onFlush: (snapshot: StreamBufferSnapshot) => void
) {
  let content = "";
  let thinking = "";
  let activity = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  function snapshot(): StreamBufferSnapshot {
    return { content, thinking, activity };
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
      scheduleFlush();
    },
    flushNow,
    getSnapshot: snapshot
  };
}
