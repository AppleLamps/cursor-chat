export type AgentActivityKind =
  | "start"
  | "search"
  | "read"
  | "edit"
  | "command"
  | "git"
  | "task"
  | "reasoning"
  | "writing"
  | "waiting"
  | "generic";

export type AgentActivityState = "running" | "done" | "failed";

export type AgentActivityStep = {
  id: string;
  label: string;
  kind: AgentActivityKind;
  state: AgentActivityState;
  repeatCount: number;
};

export function activityKind(label: string): AgentActivityKind {
  const normalized = label.toLowerCase();

  if (normalized.includes("starting") && normalized.includes("agent")) {
    return "start";
  }
  if (normalized.includes("waiting for the final run result")) return "waiting";
  if (normalized.includes("writing") || normalized.includes("response")) {
    return "writing";
  }
  if (normalized.includes("reasoning") || normalized.includes("thinking")) {
    return "reasoning";
  }
  if (normalized.includes("delegated task")) return "task";
  if (
    normalized.includes("searching") ||
    normalized.includes("search") ||
    normalized.includes("scanning") ||
    normalized.includes("scan")
  ) {
    return "search";
  }
  if (normalized.includes("read")) return "read";
  if (
    normalized.includes("updating files") ||
    normalized.includes("file update") ||
    normalized.includes("editing") ||
    normalized.includes("writing files")
  ) {
    return "edit";
  }
  if (normalized.includes("command")) return "command";
  if (normalized.includes("repository check") || normalized.includes("repository state")) {
    return "git";
  }
  if (normalized.includes("agent")) return "start";

  return "generic";
}

export function activityState(label: string): AgentActivityState {
  const normalized = label.toLowerCase();

  if (normalized.includes("failed") || normalized.includes("unavailable")) {
    return "failed";
  }
  if (normalized.startsWith("finished")) return "done";
  if (/[…]|\.\.\.$/.test(label.trim())) return "running";

  return "done";
}

/**
 * Turns the raw activity log into a readable timeline: consecutive duplicates
 * collapse into a repeat count, and a "running" step is replaced in place by
 * its own completion instead of showing both halves of the same step.
 */
export function buildActivitySteps(activityLog: string[] = []): AgentActivityStep[] {
  const steps: AgentActivityStep[] = [];

  for (const entry of activityLog) {
    const label = entry?.trim();
    if (!label) continue;

    const kind = activityKind(label);
    const state = activityState(label);
    const previous = steps[steps.length - 1];

    if (previous && previous.kind === kind) {
      if (previous.label === label) {
        previous.repeatCount += 1;
        continue;
      }

      if (previous.state === "running" && state !== "running") {
        previous.label = label;
        previous.state = state;
        continue;
      }
    }

    steps.push({
      id: `${steps.length}-${label}`,
      label,
      kind,
      state,
      repeatCount: 1
    });
  }

  return steps;
}

/**
 * One ordered slice of the run as it happened: either a tool/status update or
 * a block of reasoning that streamed between two of them.
 */
export type AgentTraceEntry =
  | { type: "activity"; label: string }
  | { type: "thinking"; text: string };

export type AgentTraceItem =
  | { type: "step"; id: string; step: AgentActivityStep }
  | { type: "reasoning"; id: string; text: string };

/**
 * Flattens the recorded timeline into render-ready items so reasoning appears
 * where it actually happened instead of being appended after every tool call.
 * Older messages predate the timeline and fall back to steps-then-reasoning.
 */
export function buildTraceItems(
  entries: AgentTraceEntry[] | undefined,
  fallback: { activityLog?: string[]; thinking?: string } = {}
): AgentTraceItem[] {
  if (!entries?.length) {
    const items: AgentTraceItem[] = buildActivitySteps(
      fallback.activityLog
    ).map((step) => ({ type: "step", id: step.id, step }));
    const thinking = fallback.thinking?.trim();

    if (thinking) {
      items.push({ type: "reasoning", id: "reasoning-legacy", text: thinking });
    }

    return items;
  }

  const items: AgentTraceItem[] = [];

  for (const entry of entries) {
    if (entry.type === "thinking") {
      const text = entry.text.trim();
      if (!text) continue;
      items.push({ type: "reasoning", id: `reasoning-${items.length}`, text });
      continue;
    }

    const label = entry.label.trim();
    if (!label) continue;

    const kind = activityKind(label);
    const state = activityState(label);
    const previous = items[items.length - 1];

    // Reasoning breaks a run of steps, so only merge with an adjacent step.
    if (previous?.type === "step" && previous.step.kind === kind) {
      if (previous.step.label === label) {
        previous.step.repeatCount += 1;
        continue;
      }

      if (previous.step.state === "running" && state !== "running") {
        previous.step.label = label;
        previous.step.state = state;
        continue;
      }
    }

    const id = `${items.length}-${label}`;
    items.push({
      type: "step",
      id,
      step: { id, label, kind, state, repeatCount: 1 }
    });
  }

  return items;
}

export function countTraceSteps(items: AgentTraceItem[]) {
  return items.reduce((total, item) => (item.type === "step" ? total + 1 : total), 0);
}

export function activityExplanation(label: string) {
  switch (activityKind(label)) {
    case "writing":
      return "The repository work is done and the answer is being composed.";
    case "reasoning":
      return "Reviewing the gathered evidence and deciding what matters.";
    case "waiting":
      return "Live updates ended, but the durable Cursor run is still being checked.";
    case "read":
    case "search":
      return "Inspecting the repository before producing an answer.";
    case "edit":
      return "Applying changes to the repository and checking the outcome.";
    case "command":
      return "Running a command in the workspace and reading the output.";
    case "git":
      return "Checking branch and diff state in the repository.";
    case "task":
      return "A sub-task is running and its result will feed back into the answer.";
    case "start":
      return "Connecting to the Cursor cloud agent and preparing the workspace.";
    default:
      return "Working in the repository; progress updates as steps complete.";
  }
}

export function formatElapsedTime(seconds: number) {
  if (seconds < 1) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
