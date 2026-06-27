"use client";

import { HammerIcon, ListChecksIcon, SearchIcon } from "lucide-react";
import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import type { AgentMode } from "@/lib/defaults";
import { cn } from "@/lib/utils";

export function agentModeLabel(mode: AgentMode) {
  if (isImplementMode(mode)) return "Implement";
  if (isPlanMode(mode)) return "Plan";
  return "Ask";
}

const modeOptions = [
  {
    mode: "qa",
    label: "Ask",
    Icon: SearchIcon
  },
  {
    mode: "plan",
    label: "Plan",
    Icon: ListChecksIcon
  },
  {
    mode: "implement",
    label: "Implement",
    Icon: HammerIcon
  }
] as const;

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
      className={cn(
        "inline-flex items-center rounded-[10px] border border-border/80 bg-muted/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        compact
          ? "gap-0.5 p-0.5"
          : "mx-auto w-full max-w-[22rem] gap-1 rounded-xl"
      )}
    >
      {modeOptions.map(({ mode, label, Icon }) => {
        const selected = agentMode === mode;

        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(mode)}
            className={cn(
              "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/45 active:translate-y-px",
              compact
                ? "h-7 min-w-16 px-2 text-xs"
                : "h-9 px-3 text-sm sm:px-4",
              selected
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
            )}
          >
            <Icon className={compact ? "size-3.5" : "size-4"} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
