"use client";

import { isImplementMode } from "@/lib/agent-mode";
import { type AgentMode } from "@/lib/defaults";
import {
  modelSelectionsEqual,
  type ModelCatalogEntry,
  type ModelSelection
} from "@/lib/model-client";

export default function RepoRunOptions({
  allowModeSelection,
  agentMode,
  model,
  models,
  modelsLoading,
  usingFallback,
  onAgentModeChange,
  onModelChange
}: {
  allowModeSelection: boolean;
  agentMode: AgentMode;
  model: ModelSelection;
  models: ModelCatalogEntry[];
  modelsLoading?: boolean;
  usingFallback?: boolean;
  onAgentModeChange: (mode: AgentMode) => void;
  onModelChange: (model: ModelSelection) => void;
}) {
  const selectedCatalogModel = models.find((entry) => entry.id === model.id);

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
        <legend className="text-sm font-medium text-[#333]">
          Model {modelsLoading ? <span className="font-normal text-[#8a8a8a]">· loading…</span> : null}
        </legend>
        {usingFallback ? (
          <p className="mt-1 text-xs text-[#8a8a8a]">
            Showing fallback models while the Cursor catalog is unavailable.
          </p>
        ) : null}
        <div className="mt-2">
          <label className="sr-only" htmlFor="model-selection">
            Model
          </label>
          <select
            id="model-selection"
            value={selectedCatalogModel ? model.id : ""}
            onChange={(event) => {
              const selected = models.find(
                (entry) => entry.id === event.target.value
              );
              if (selected) onModelChange(selected.model);
            }}
            className="w-full rounded-xl border border-[#d9d9d9] bg-white px-3 py-2.5 text-sm text-[#202123] outline-none transition focus:border-[#a8a8a8] focus:ring-2 focus:ring-[#d9d9d9]"
          >
            {!selectedCatalogModel ? (
              <option value="" disabled>
                Select a model
              </option>
            ) : null}
            {models.map((catalogModel) => (
              <option key={catalogModel.id} value={catalogModel.id}>
                {catalogModel.displayName}
              </option>
            ))}
          </select>
          {selectedCatalogModel?.description ? (
            <p className="mt-1.5 text-xs leading-5 text-[#8a8a8a]">
              {selectedCatalogModel.description}
            </p>
          ) : null}
        </div>
        {!selectedCatalogModel ? (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Previously selected model “{model.id}” is unavailable. Choose another
            model before continuing.
          </p>
        ) : null}
        {selectedCatalogModel?.variants?.length ? (
          <div className="mt-3">
            <label className="text-xs font-medium text-[#555]" htmlFor="model-variant">
              Variant
            </label>
            <select
              id="model-variant"
              value={String(
                selectedCatalogModel.variants.findIndex((variant) =>
                  modelSelectionsEqual({ id: model.id, params: variant.params }, model)
                )
              )}
              onChange={(event) => {
                const selected =
                  selectedCatalogModel.variants[Number(event.target.value)];
                if (selected) onModelChange({ id: model.id, params: selected.params });
              }}
              className="mt-1 w-full rounded-xl border border-[#d9d9d9] bg-white px-3 py-2 text-sm"
            >
              <option value="-1" disabled>Select a variant</option>
              {selectedCatalogModel.variants.map((variant, index) => (
                <option key={`${variant.displayName}-${index}`} value={index}>{variant.displayName}</option>
              ))}
            </select>
          </div>
        ) : (
          selectedCatalogModel?.parameters?.map((parameter) => (
            <div key={parameter.id} className="mt-3">
              <label className="text-xs font-medium text-[#555]" htmlFor={`model-param-${parameter.id}`}>
                {parameter.displayName ?? parameter.id}
              </label>
              <select
                id={`model-param-${parameter.id}`}
                value={
                  model.params?.find((entry) => entry.id === parameter.id)?.value ??
                  ""
                }
                onChange={(event) => {
                  if (!event.target.value) {
                    const remaining = (model.params ?? []).filter(
                      (entry) => entry.id !== parameter.id
                    );
                    onModelChange({
                      id: model.id,
                      ...(remaining.length ? { params: remaining } : {})
                    });
                    return;
                  }
                  const option = parameter.values.find(
                    (candidate) => candidate.value === event.target.value
                  );
                  if (!option) return;
                  onModelChange({
                    id: model.id,
                    params: [
                      ...(model.params ?? []).filter((entry) => entry.id !== parameter.id),
                      { id: parameter.id, value: option.value }
                    ]
                  });
                }}
                className="mt-1 w-full rounded-xl border border-[#d9d9d9] bg-white px-3 py-2 text-sm"
              >
                <option value="">Use Cursor default</option>
                {parameter.values.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.displayName ?? option.value}
                  </option>
                ))}
              </select>
            </div>
          ))
        )}
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
  description?: string;
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
      {description ? (
        <span className="mt-1 block text-xs leading-5 text-[#8a8a8a]">
          {description}
        </span>
      ) : null}
    </button>
  );
}
