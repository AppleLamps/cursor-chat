// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HistorySettings from "@/components/chat/HistorySettings";

afterEach(cleanup);

function file() {
  return new File(["{}"], "chats.json", { type: "application/json" });
}

describe("HistorySettings", () => {
  it("exports on click", () => {
    const onExport = vi.fn();
    const view = render(<HistorySettings onExport={onExport} onImport={vi.fn()} />);

    fireEvent.click(view.getByRole("button", { name: "Export chats" }));

    expect(onExport).toHaveBeenCalledOnce();
  });

  it("reports what an import did", async () => {
    const onImport = vi.fn().mockResolvedValue({ ok: true, message: "Imported chats: 2 added." });
    const view = render(<HistorySettings onExport={vi.fn()} onImport={onImport} />);

    fireEvent.change(view.getByLabelText("Choose a chat export file"), {
      target: { files: [file()] }
    });

    await waitFor(() => expect(view.getByRole("status").textContent).toBe("Imported chats: 2 added."));
    expect(onImport).toHaveBeenCalledOnce();
    expect(view.getByRole("button", { name: "Import chats" })).toBeTruthy();
  });

  it("shows a rejected file as an error", async () => {
    const onImport = vi.fn().mockResolvedValue({ ok: false, message: "That file is not valid JSON." });
    const view = render(<HistorySettings onExport={vi.fn()} onImport={onImport} />);

    fireEvent.change(view.getByLabelText("Choose a chat export file"), {
      target: { files: [file()] }
    });

    const status = await view.findByText("That file is not valid JSON.");
    expect(status.className).toContain("text-red-700");
  });

  it("survives the importer throwing", async () => {
    const view = render(
      <HistorySettings onExport={vi.fn()} onImport={vi.fn().mockRejectedValue(new Error("boom"))} />
    );

    fireEvent.change(view.getByLabelText("Choose a chat export file"), {
      target: { files: [file()] }
    });

    expect(await view.findByText("That file could not be imported.")).toBeTruthy();
  });
});
