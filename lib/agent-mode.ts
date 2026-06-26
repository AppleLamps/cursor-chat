import type { AgentMode } from "@/lib/defaults";
import { DEFAULT_AGENT_MODE } from "@/lib/defaults";

export function parseAgentMode(value: unknown): AgentMode {
  if (value === "qa" || value === "plan" || value === "implement") {
    return value;
  }

  return DEFAULT_AGENT_MODE;
}

export function isImplementMode(mode: AgentMode): boolean {
  return mode === "implement";
}

export function isPlanMode(mode: AgentMode): boolean {
  return mode === "plan";
}

export function isReadOnlyMode(mode: AgentMode): boolean {
  return mode === "qa" || mode === "plan";
}

export function sdkModeForAgentMode(mode: AgentMode): "agent" | "plan" {
  return isPlanMode(mode) ? "plan" : "agent";
}
