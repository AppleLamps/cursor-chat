// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RepoRunOptions from "@/components/RepoRunOptions";

afterEach(cleanup);

describe("RepoRunOptions", () => {
  it("reports mode and model changes through focused callbacks", () => {
    const onAgentModeChange = vi.fn();
    const onModelChange = vi.fn();
    const view = render(
      <RepoRunOptions
        allowModeSelection
        agentMode="qa"
        modelId="composer-2.5"
        onAgentModeChange={onAgentModeChange}
        onModelChange={onModelChange}
      />
    );

    fireEvent.click(view.getByRole("button", { name: /Plan/ }));
    fireEvent.click(view.getByRole("button", { name: /Grok 4.5 High/ }));

    expect(onAgentModeChange).toHaveBeenCalledWith("plan");
    expect(onModelChange).toHaveBeenCalledWith("grok-4.5");
  });

  it("hides write-mode selection when mode changes are locked", () => {
    const view = render(
      <RepoRunOptions
        allowModeSelection={false}
        agentMode="qa"
        modelId="composer-2.5"
        onAgentModeChange={vi.fn()}
        onModelChange={vi.fn()}
      />
    );

    expect(view.queryByRole("button", { name: /Implement/ })).toBeNull();
    expect(view.getByRole("button", { name: /Composer 2.5/ })).toBeTruthy();
  });
});
