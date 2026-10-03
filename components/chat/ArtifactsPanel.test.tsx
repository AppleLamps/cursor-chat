// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArtifactsPanel from "@/components/chat/ArtifactsPanel";

const scope = {
  apiKey: "test-key",
  agentId: "agent-1",
  agentSessionToken: "session-1",
  repoUrl: "https://github.com/acme/widgets",
  branch: "report/export",
  agentMode: "qa" as const,
  model: { id: "composer-2.5" }
};

function renderPanel() {
  return render(
    <>
      <button id="artifacts-trigger">Artifacts</button>
      <ArtifactsPanel id="artifacts-panel" labelledBy="artifacts-trigger" open scope={scope} />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ArtifactsPanel", () => {
  it("bounds large artifact lists without dropping download controls and refreshes their contents", async () => {
    const artifacts = Array.from({ length: 70 }, (_, index) => ({
      path: `reports/export-${index}.csv`, sizeBytes: 2048, updatedAt: "2026-10-03T00:00:00Z"
    }));
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ artifacts })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ artifacts: [] })));
    vi.stubGlobal("fetch", fetch);
    const view = renderPanel();
    await waitFor(() => expect(view.getAllByRole("button", { name: /^Download / })).toHaveLength(70));
    const list = view.getByRole("list", { name: "Generated artifacts" });
    expect(list.className).toContain("max-h-48");
    expect(list.className).toContain("overflow-y-auto");
    expect(list.tabIndex).toBe(0);
    expect(view.getByRole("button", { name: "Download reports/export-69.csv" }).className).toContain("min-h-11");
    fireEvent.click(view.getByRole("button", { name: "Refresh artifacts" }));
    await waitFor(() => expect(view.getByText("No artifacts are available.")).toBeTruthy());
    expect(view.queryByRole("list", { name: "Generated artifacts" })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(scope);
  });

  it.each([
    { agentId: "agent-2", repoUrl: "https://github.com/acme/another" },
    { agentSessionToken: "replacement-session" }
  ])("clears cached files immediately when the request scope changes: %j", async (changes) => {
    const artifact = { path: "old/private.csv", sizeBytes: 2048, updatedAt: "2026-10-03T00:00:00Z" };
    let resolveNewScope: (response: Response) => void = () => {};
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ artifacts: [artifact] })))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveNewScope = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const view = renderPanel();
    await view.findByRole("button", { name: "Download old/private.csv" });
    const changedScope = { ...scope, ...changes };
    view.rerender(
      <>
        <button id="artifacts-trigger">Artifacts</button>
        <ArtifactsPanel id="artifacts-panel" labelledBy="artifacts-trigger" open scope={changedScope} />
      </>
    );
    expect(view.queryByRole("button", { name: "Download old/private.csv" })).toBeNull();
    expect(view.getByRole("region", { name: "Artifacts" }).getAttribute("aria-busy")).toBe("true");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(changedScope);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    resolveNewScope(new Response(JSON.stringify({ artifacts: [] })));
    await waitFor(() => expect(view.getByText("No artifacts are available.")).toBeTruthy());
  });

  it("announces download errors, permits retry, and retains the scoped download request", async () => {
    const artifact = { path: "reports/output.csv", sizeBytes: 2048, updatedAt: "2026-10-03T00:00:00Z" };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ artifacts: [artifact] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Download is temporarily unavailable." }), { status: 503 }))
      .mockResolvedValueOnce(new Response("column\nvalue"));
    vi.stubGlobal("fetch", fetch);
    const createObjectURL = vi.fn().mockReturnValue("blob:artifact-download");
    const revokeObjectURL = vi.fn();
    class DownloadURL extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }
    vi.stubGlobal("URL", DownloadURL);
    let downloadedName: string | undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadedName = this.download;
    });
    const view = renderPanel();
    const download = await view.findByRole("button", { name: "Download reports/output.csv" });
    fireEvent.click(download);
    await waitFor(() => expect(view.getByRole("alert").textContent).toBe("Download is temporarily unavailable."));
    expect((download as HTMLButtonElement).disabled).toBe(false);
    expect(fetch.mock.calls[1][0]).toBe("/api/artifacts/download");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ ...scope, path: artifact.path });
    fireEvent.click(download);
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(view.queryByRole("alert")).toBeNull();
    expect(downloadedName).toBe("output.csv");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:artifact-download");
  });
});
