"use client";

import { isImplementMode } from "@/lib/agent-mode";
import {
  AVAILABLE_MODELS,
  type AgentMode,
  type ModelId
} from "@/lib/defaults";

export default function RepoRunOptions({
  allowModeSelection,
  agentMode,
  modelId,
  onAgentModeChange,
  onModelChange
}: {
  allowModeSelection: boolean;
  agentMode: AgentMode;
  modelId: ModelId;
  onAgentModeChange: (mode: AgentMode) => void;
  onModelChange: (modelId: ModelId) => void;
}) {
  return (
    <>
      {allowModeSelection ? (
        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-[#333]">Chat mode</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Option
              selected={agentMode === "qa"}
              title="Ask"
              description="Read-only answers about the codebase"
              onSelect={() => onAgentModeChange("qa")}
            />
            <Option
              selected={agentMode === "plan"}
              title="Plan"
              description="Read-only implementation plan"
              onSelect={() => onAgentModeChange("plan")}
            />
            <Option
              selected={agentMode === "implement"}
              title="Implement"
              description="Make scoped changes; may open a pull request"
              onSelect={() => onAgentModeChange("implement")}
            />
          </div>
          {isImplementMode(agentMode) ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
              The agent may modify this repository and open a PR when the task
              requires code changes. Usage is billed to your Cursor account. The
              repo must allow writes and must not use read-only Cursor hooks.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-[#333]">Model</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {AVAILABLE_MODELS.map((model) => (
            <Option
              key={model.id}
              selected={modelId === model.id}
              title={model.label}
              description={model.description}
              onSelect={() => onModelChange(model.id)}
            />
          ))}
        </div>
      </fieldset>
    </>
  );
}

function Option({
  selected,
  title,
  description,
  onSelect
}: {
  selected: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`rounded-xl border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] ${
        selected
          ? "border-[#0d0d0d] bg-[#fafafa]"
          : "border-[#ececec] hover:border-[#d9d9d9] hover:bg-[#fafafa]"
      }`}
    >
      <span className="block text-sm font-medium text-[#202123]">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-[#8a8a8a]">
        {description}
      </span>
    </button>
  );
}
