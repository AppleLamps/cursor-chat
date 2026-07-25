// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RepoRunOptions from "@/components/RepoRunOptions";
import { FALLBACK_MODEL_CATALOG } from "@/lib/model-client";

afterEach(cleanup);

describe("RepoRunOptions", () => {
  it("reports mode and model changes through focused callbacks", () => {
    const onAgentModeChange = vi.fn();
    const onModelChange = vi.fn();
    const view = render(
      <RepoRunOptions
        allowModeSelection
        agentMode="qa"
        model={{ id: "composer-2.5" }}
        models={FALLBACK_MODEL_CATALOG}
        onAgentModeChange={onAgentModeChange}
        onModelChange={onModelChange}
      />
    );

    fireEvent.click(view.getByRole("button", { name: /Plan/ }));
    fireEvent.click(view.getByRole("button", { name: /Grok 4.5 High/ }));

    expect(onAgentModeChange).toHaveBeenCalledWith("plan");
    expect(onModelChange).toHaveBeenCalledWith({ id: "grok-4.5" });
  });

  it("hides write-mode selection when mode changes are locked", () => {
    const view = render(
      <RepoRunOptions
        allowModeSelection={false}
        agentMode="qa"
        model={{ id: "composer-2.5" }}
        models={FALLBACK_MODEL_CATALOG}
        onAgentModeChange={vi.fn()}
        onModelChange={vi.fn()}
      />
    );

    expect(view.queryByRole("button", { name: /Implement/ })).toBeNull();
    expect(view.getByRole("button", { name: /Composer 2.5/ })).toBeTruthy();
  });

  it("renders catalog parameters and returns the canonical SDK selection", () => {
    const onModelChange = vi.fn();
    const models = [{
      id: "cursor-router",
      displayName: "Cursor Router",
      aliases: ["auto"],
      parameters: [{
        id: "mode",
        displayName: "Optimization",
        values: [
          { value: "cost", displayName: "Cost" },
          { value: "intelligence", displayName: "Intelligence" }
        ]
      }],
      variants: [],
      model: { id: "cursor-router", params: [{ id: "mode", value: "cost" }] }
    }];
    const view = render(
      <RepoRunOptions
        allowModeSelection={false}
        agentMode="qa"
        model={models[0].model}
        models={models}
        onAgentModeChange={vi.fn()}
        onModelChange={onModelChange}
      />
    );

    fireEvent.change(view.getByLabelText("Optimization"), {
      target: { value: "intelligence" }
    });

    expect(onModelChange).toHaveBeenCalledWith({
      id: "cursor-router",
      params: [{ id: "mode", value: "intelligence" }]
    });
  });
});
