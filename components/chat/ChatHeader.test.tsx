// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatHeader from "@/components/chat/ChatHeader";

afterEach(cleanup);

function renderHeader(overrides: Partial<Parameters<typeof ChatHeader>[0]> = {}) {
  return render(
    <ChatHeader
      onReset={vi.fn()}
      onShare={vi.fn()}
      canShare
      shareStatus={null}
      sidebarOpen={false}
      repoLabel="acme/widgets · main · Composer 2.5"
      agentMode="qa"
      canChangeAgentMode
      onAgentModeChange={vi.fn()}
      onChangeRepo={vi.fn()}
      onToggleSidebar={vi.fn()}
      onOpenMobileSidebar={vi.fn()}
      canManageCloudAgent={false}
      cloudAgentArchived={false}
      lifecycleBusy={false}
      onToggleCloudArchive={vi.fn()}
      onDeleteCloudAgent={vi.fn()}
      {...overrides}
    />
  );
}

describe("ChatHeader on phones", () => {
  it("shows the repository and splits branch/model onto a second line", () => {
    const view = renderHeader();

    expect(view.getAllByText("acme/widgets").length).toBeGreaterThan(0);
    expect(view.getByText("main · Composer 2.5")).toBeTruthy();
  });

  it("lets the user change the repository from the phone header", () => {
    const onChangeRepo = vi.fn();
    const view = renderHeader({ onChangeRepo });

    view
      .getAllByLabelText(/Change repository/)[0]
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onChangeRepo).toHaveBeenCalled();
  });

  it("keeps destructive cloud-agent actions out of the always-visible header", () => {
    const view = renderHeader({ canManageCloudAgent: true });

    // They live in the overflow menu (closed by default), not inline on phones.
    expect(view.queryAllByText("Delete cloud agent").length).toBe(
      // the desktop-only inline button (hidden below lg via CSS) is the only one in the DOM
      1
    );
    expect(view.getAllByLabelText("More actions").length).toBeGreaterThan(0);
  });
});
