"use client";

import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import {
  SUGGESTED_IMPLEMENT_PROMPTS,
  SUGGESTED_PLAN_PROMPTS,
  SUGGESTED_PROMPTS,
  type AgentMode
} from "@/lib/defaults";
import ModeToggle from "@/components/chat/ModeToggle";

export default function EmptyState({
  agentMode,
  onAgentModeChange,
  onPick
}: {
  agentMode: AgentMode;
  onAgentModeChange: (mode: AgentMode) => void;
  onPick: (prompt: string) => void;
}) {
  const prompts = isImplementMode(agentMode)
    ? SUGGESTED_IMPLEMENT_PROMPTS
    : isPlanMode(agentMode)
      ? SUGGESTED_PLAN_PROMPTS
      : SUGGESTED_PROMPTS;

  return (
    <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
      <div className="w-full py-10 text-center sm:py-16">
        <ModeToggle agentMode={agentMode} onChange={onAgentModeChange} />
        <h2 className="mt-6 text-2xl font-medium tracking-tight text-[#202123] sm:text-[28px]">
          {isImplementMode(agentMode)
            ? "Describe a change for Cursor to implement"
            : isPlanMode(agentMode)
              ? "Plan a change before implementation"
              : "Ask Cursor anything about your repo"}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#5f6368]">
          {isImplementMode(agentMode)
            ? "Tasks run against the repository selected in the header. The agent can edit code and may open a pull request."
            : isPlanMode(agentMode)
              ? "Plans are based on repository inspection and stay read-only: no edits, commits, or pull requests."
              : "Questions are answered from the repository selected in the header, with sources you can verify."}
        </p>
        {isImplementMode(agentMode) ? (
          <p className="mx-auto mt-3 max-w-xl text-xs leading-5 text-amber-900/80">
            Implement mode can modify the repo. Switch to Ask above for read-only Q&A.
          </p>
        ) : null}
        <div className="mx-auto mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2 sm:items-start">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPick(prompt)}
              className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-left text-sm leading-6 text-[#5f6368] transition hover:bg-[#f7f7f8] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
