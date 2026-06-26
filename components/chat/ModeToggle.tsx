"use client";

import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import type { AgentMode } from "@/lib/defaults";

export function agentModeLabel(mode: AgentMode) {
  if (isImplementMode(mode)) return "Implement";
  if (isPlanMode(mode)) return "Plan";
  return "Ask";
}

export default function ModeToggle({
  agentMode,
  onChange,
  size = "default"
}: {
  agentMode: AgentMode;
  onChange: (mode: AgentMode) => void;
  size?: "default" | "compact";
}) {
  const compact = size === "compact";

  return (
    <div
      role="group"
      aria-label="Chat mode"
      className={`inline-flex rounded-full border border-[#d9d9d9] bg-[#f7f7f8] p-0.5 ${
        compact ? "" : "mx-auto"
      }`}
    >
      {(["qa", "plan", "implement"] as const).map((mode) => {
        const selected = agentMode === mode;
        const label = agentModeLabel(mode);

        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(mode)}
            className={`rounded-full px-3 font-medium transition focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] ${
              compact ? "py-1 text-[10px] uppercase tracking-[0.08em]" : "py-2 text-sm"
            } ${
              selected
                ? "bg-white text-[#202123] shadow-sm"
                : "text-[#666] hover:text-[#333]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
