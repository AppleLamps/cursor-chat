// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BranchPicker from "@/components/BranchPicker";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockResolvedValue(
    Response.json({ branches: ["main", "develop", "feature/mobile"], defaultBranch: "main" })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function renderPicker(branch: string) {
  const onBranchChange = vi.fn();
  render(
    <BranchPicker
      repoUrl="https://github.com/acme/widgets"
      githubToken="gho_token"
      branch={branch}
      onBranchChange={onBranchChange}
    />
  );
  return onBranchChange;
}

describe("BranchPicker", () => {
  it("keeps a chat on its feature branch when the branch exists in the repo", async () => {
    const onBranchChange = renderPicker("feature/mobile");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(onBranchChange).not.toHaveBeenCalled();
  });

  it("falls back to the default branch when the current one does not exist", async () => {
    const onBranchChange = renderPicker("deleted-branch");

    await waitFor(() => expect(onBranchChange).toHaveBeenCalledWith("main"));
  });

  it("uses the default branch when none is chosen yet", async () => {
    const onBranchChange = renderPicker("");

    await waitFor(() => expect(onBranchChange).toHaveBeenCalledWith("main"));
  });
});
