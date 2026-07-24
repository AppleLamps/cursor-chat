"use client";

import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import {
  SUGGESTED_IMPLEMENT_PROMPTS,
  SUGGESTED_PLAN_PROMPTS,
  SUGGESTED_PROMPTS,
  type AgentMode
} from "@/lib/defaults";
import { Button } from "@/components/ui/button";

export default function EmptyState({
  agentMode,
  onPick
}: {
  agentMode: AgentMode;
  onPick: (prompt: string) => void;
}) {
  const prompts = isImplementMode(agentMode)
    ? SUGGESTED_IMPLEMENT_PROMPTS
    : isPlanMode(agentMode)
      ? SUGGESTED_PLAN_PROMPTS
      : SUGGESTED_PROMPTS;

  return (
    <div className="mx-auto w-full max-w-3xl text-center">
      <h2 className="text-2xl font-medium tracking-tight text-foreground sm:text-[28px]">
        {isImplementMode(agentMode)
          ? "Describe a change for Cursor to implement"
          : isPlanMode(agentMode)
            ? "Plan a change before implementation"
            : "Ask Cursor anything about your repo"}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        {isImplementMode(agentMode)
          ? "Tasks run against the repository selected in the header. The agent can edit code and may open a pull request."
          : isPlanMode(agentMode)
            ? "Plans are based on repository inspection and stay read-only: no edits, commits, or pull requests."
            : "Questions are answered from the repository selected in the header, with sources you can verify."}
      </p>
      {isImplementMode(agentMode) ? (
        <p className="mx-auto mt-3 max-w-xl text-xs leading-5 text-amber-900/80">
          Implement mode can modify the repo. Switch to Ask in the header for
          read-only Q&amp;A.
        </p>
      ) : null}
      <div className="mx-auto mt-7 grid w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:items-start">
        {prompts.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="outline"
            onClick={() => onPick(prompt)}
            className="h-auto justify-start whitespace-normal rounded-xl px-4 py-3 text-left text-sm leading-6 text-muted-foreground"
          >
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  );
}
