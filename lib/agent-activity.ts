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
