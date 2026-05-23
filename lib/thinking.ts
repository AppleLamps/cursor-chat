export function mergeThinkingText(
  current: string,
  payload: { delta?: string; text?: string }
) {
  if (payload.delta) {
    return current + payload.delta;
  }

  if (payload.text) {
    const next = payload.text;

    if (!current) {
      return next;
    }

    if (next.startsWith(current)) {
      return next;
    }

    if (current.startsWith(next)) {
      return current;
    }

    if (current.endsWith(next)) {
      return current;
    }

    return current + next;
  }

  return current;
}

export function extractThinkingFromConversation(turns: unknown) {
  if (!Array.isArray(turns)) {
    return undefined;
  }

  const parts: string[] = [];

  for (const turn of turns) {
    if (!turn || typeof turn !== "object") continue;

    const record = turn as {
      steps?: unknown[];
      turn?: { steps?: unknown[] };
    };
    const steps = record.turn?.steps ?? record.steps ?? [];

    for (const step of steps) {
      if (!step || typeof step !== "object") continue;

      const stepRecord = step as {
        type?: string;
        message?: { text?: string };
      };

      if (
        stepRecord.type === "thinkingMessage" &&
        stepRecord.message?.text?.trim()
      ) {
        parts.push(stepRecord.message.text.trim());
      }
    }
  }

  return parts.join("\n\n").trim() || undefined;
}
