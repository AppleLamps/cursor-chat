// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImplementationPanel from "@/components/chat/ImplementationPanel";
import type { Conversation } from "@/lib/chat-types";
import type { ImplementationOutcome } from "@/lib/implementation";
const outcome: ImplementationOutcome = { agentId: "agent", runId: "run", status: "finished", startingRef: "main",
  branches: [{ repoUrl: "https://github.com/acme/app", branch: "cursor/task", prUrl: "https://github.com/acme/app/pull/7" }] };
const conversation: Conversation = { id: "chat", title: "Task", createdAt: "now", updatedAt: "now", messages: [],
  agentId: "agent", agentSessionToken: "signed", repoUrl: "https://github.com/acme/app", branch: "main", agentMode: "implement" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("implementation status UI", () => {
  it("distinguishes Cursor's reported PR link from verified merged state and cumulative files", async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ outcome, pullRequests: [{ details: {
      url: "https://github.com/acme/app/pull/7", number: 7, state: "merged", head: "cursor/task", base: "main",
      files: [{ path: "src/app.ts", status: "modified", additions: 2, deletions: 1 }], filesTruncated: false
    } }] }));
    vi.stubGlobal("fetch", fetch);
    const view = render(<ImplementationPanel outcome={outcome} scope={{ apiKey: "synthetic", conversation }} />);
    await view.findByText("PR #7 · merged");
    fireEvent.click(view.getByText("PR changed files (1)"));
    expect(view.getByText(/src\/app.ts/)).toBeTruthy();
    expect(view.getByText(/Cumulative PR changes/)).toBeTruthy();
    expect(view.queryByText(/PR created/)).toBeNull();
  });
  it("ignores a late response after changing conversations", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetch);
    const view = render(<ImplementationPanel outcome={outcome} scope={{ apiKey: "synthetic", conversation }} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = fetch.mock.calls[0] as unknown as [string, RequestInit];
    view.rerender(<ImplementationPanel outcome={outcome} scope={{ apiKey: "synthetic", conversation: { ...conversation, id: "other", agentId: "other" } }} />);
    expect(signal[1].signal?.aborted).toBe(true);
    resolve(Response.json({ outcome, pullRequests: [{ details: { url: "https://github.com/acme/app/pull/7", number: 7, state: "merged" } }] }));
    await waitFor(() => expect(view.queryByText("PR #7 · merged")).toBeNull());
  });

  it("refreshes a detached running run once and does not refetch on transcript updates", async () => {
    const running = { ...outcome, status: "running" as const };
    const fetch = vi.fn().mockImplementation(async () => Response.json({ outcome, pullRequests: [] }));
    vi.stubGlobal("fetch", fetch);
    const view = render(<ImplementationPanel outcome={running} scope={{ apiKey: "synthetic", conversation }} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Refresh status" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await view.findByText("Cursor run: finished");
    view.rerender(<ImplementationPanel outcome={running} scope={{ apiKey: "synthetic", conversation: { ...conversation,
      messages: [{ id: "message", role: "assistant", content: "new text", createdAt: "now" }] } }} />);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
