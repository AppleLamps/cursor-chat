import type { AgentMode } from "@/lib/defaults";
import { DEFAULT_AGENT_MODE } from "@/lib/defaults";

export function parseAgentMode(value: unknown): AgentMode {
  if (value === "qa" || value === "implement") {
    return value;
  }

  return DEFAULT_AGENT_MODE;
}

export function isImplementMode(mode: AgentMode): boolean {
  return mode === "implement";
}
