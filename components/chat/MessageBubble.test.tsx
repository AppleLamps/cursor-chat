// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MessageBubble from "@/components/chat/MessageBubble";

afterEach(cleanup);

describe("MessageBubble agent progress", () => {
  it("prioritizes the current phase and reassures during longer runs", async () => {
    const view = render(
      <MessageBubble
        message={{
          id: "assistant",
          role: "assistant",
          content: "",
          createdAt: new Date(Date.now() - 25_000).toISOString(),
          streaming: true,
          activity: "Writing the response…",
          activityLog: [
            "Starting Cursor cloud agent…",
            "Finished reading files",
            "Writing the response…"
          ]
        }}
        copied={false}
        onCopy={() => {}}
        onRetry={() => {}}
      />
    );

    expect(view.getByText("Working · 3 steps")).toBeTruthy();
    expect(view.getAllByText("Writing the response…").length).toBeGreaterThan(0);
    expect(view.queryByText("Generating response...")).toBeNull();
    await waitFor(() => {
      expect(
        view.getByText(/Still working normally/)
      ).toBeTruthy();
    });
  });

  it("states the live phase once while the timeline is expanded", () => {
    const view = render(
      <MessageBubble
        message={{
          id: "assistant",
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          streaming: true,
          activity: "Searching the codebase…",
          activityLog: ["Starting Cursor cloud agent…", "Searching the codebase…"]
        }}
        copied={false}
        onCopy={() => {}}
        onRetry={() => {}}
      />
    );

    expect(view.getAllByText("Searching the codebase…")).toHaveLength(1);
    expect(view.getByText("Working · 2 steps")).toBeTruthy();
  });

  it("renders reasoning inline where it happened, without its own scrollbox", () => {
    const view = render(
      <MessageBubble
        message={{
          id: "assistant",
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          streaming: true,
          trace: [
            { type: "activity", label: "Searching the codebase…" },
            { type: "thinking", text: "The router owns the retry." },
            { type: "activity", label: "Finished reading files" },
            { type: "thinking", text: "Now I can answer." }
          ]
        }}
        copied={false}
        onCopy={() => {}}
        onRetry={() => {}}
      />
    );

    const trace = Array.from(view.container.querySelectorAll("li")).map(
      (item) => item.textContent?.trim()
    );
    expect(trace[0]).toContain("Searching the codebase…");
    expect(trace[1]).toBe("The router owns the retry.");
    expect(trace[2]).toContain("Finished reading files");
    expect(trace[3]).toBe("Now I can answer.");
    expect(view.container.querySelector(".overflow-y-auto")).toBeNull();
  });

  it("renders streamed reasoning as rich text instead of raw markdown", () => {
    const view = render(
      <MessageBubble
        message={{
          id: "assistant",
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          streaming: true,
          thinking: "## Plan\n\n- Check `MessageBubble`\n- **Fix** the trace",
          activityLog: ["Starting Cursor cloud agent…"]
        }}
        copied={false}
        onCopy={() => {}}
        onRetry={() => {}}
      />
    );

    expect(view.getByRole("heading", { name: "Plan" })).toBeTruthy();
    expect(view.container.querySelector("li code")?.textContent).toBe(
      "MessageBubble"
    );
    expect(view.getByText("Fix").tagName).toBe("STRONG");
    expect(view.queryByText(/## Plan/)).toBeNull();
  });
});

describe("MessageBubble actions", () => {
  const answer = {
    id: "a1",
    role: "assistant" as const,
    content: "Here is the answer.",
    createdAt: "2026-06-26T12:00:00.000Z"
  };

  it("offers Retry only when the answer can be regenerated", () => {
    const hidden = render(
      <MessageBubble message={answer} copied={false} onCopy={() => {}} onRetry={() => {}} />
    );
    expect(hidden.queryByRole("button", { name: /Retry/ })).toBeNull();
    hidden.unmount();

    const shown = render(
      <MessageBubble
        message={answer}
        copied={false}
        canRegenerate
        onCopy={() => {}}
        onRetry={() => {}}
      />
    );
    expect(shown.getByRole("button", { name: /Retry/ })).toBeTruthy();
  });

  it("passes the message and its id to the shared handlers", () => {
    const onCopy = vi.fn();
    const onRetry = vi.fn();
    const view = render(
      <MessageBubble
        message={answer}
        copied={false}
        canRegenerate
        onCopy={onCopy}
        onRetry={onRetry}
      />
    );

    fireEvent.click(view.getByRole("button", { name: /Copy/ }));
    fireEvent.click(view.getByRole("button", { name: /Retry/ }));

    expect(onCopy).toHaveBeenCalledWith(answer);
    expect(onRetry).toHaveBeenCalledWith("a1");
  });
});

describe("MessageBubble compact sources", () => {
  it("keeps a long source list collapsed and exposes every link when expanded", () => {
    const sources = Array.from({ length: 153 }, (_, index) => `src/file-${index}.ts`);
    const view = render(
      <MessageBubble
        message={{ id: "sources", role: "assistant", content: "Answer", createdAt: "2026-10-03T00:00:00Z", sources }}
        repoUrl="https://github.com/acme/widgets"
        branch="main"
        copied={false}
        onCopy={() => {}}
        onRetry={() => {}}
      />
    );
    const toggle = view.getByRole("button", { name: "Sources (153)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(view.queryByRole("list", { name: "Source files" })).toBeNull();
    fireEvent.click(toggle);
    const list = view.getByRole("list", { name: "Source files" });
    expect(toggle.getAttribute("aria-controls")).toBe(list.id);
    expect(list.tabIndex).toBe(0);
    expect(list.className).toContain("max-h-40");
    expect(list.className).toContain("overflow-y-auto");
    expect(view.getAllByRole("link")).toHaveLength(153);
    expect(view.getByRole("link", { name: "src/file-152.ts" }).getAttribute("href")).toBe("https://github.com/acme/widgets/blob/main/src/file-152.ts");
    fireEvent.click(toggle);
    expect(view.queryByRole("list", { name: "Source files" })).toBeNull();
    fireEvent.click(toggle);
    expect(view.getAllByRole("link")).toHaveLength(153);
  });
});

describe("MessageBubble unified answer footer", () => {
  const answer = {
    id: "answer-with-artifacts",
    role: "assistant" as const,
    content: "The exported report is ready.",
    createdAt: "2026-10-03T00:00:00.000Z",
    sources: ["src/report.ts"]
  };
  const artifactScope = {
    apiKey: "test-key",
    conversation: {
      id: "conversation",
      title: "Report",
      createdAt: answer.createdAt,
      updatedAt: answer.createdAt,
      messages: [],
      agentId: "agent-1",
      agentSessionToken: "session-1",
      repoUrl: "https://github.com/acme/widgets"
    }
  };

  afterEach(() => vi.unstubAllGlobals());

  it("keeps controls in one wrapping row and expands panels after the footer, outside the bubble", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      artifacts: [{ path: "reports/result.csv", sizeBytes: 2048, updatedAt: answer.createdAt }]
    })));
    vi.stubGlobal("fetch", fetch);
    const view = render(
      <MessageBubble
        message={answer}
        repoUrl={artifactScope.conversation.repoUrl}
        copied={false}
        canRegenerate
        onCopy={() => {}}
        onRetry={() => {}}
        artifactScope={artifactScope}
      />
    );
    const sources = view.getByRole("button", { name: "Sources (1)" });
    const artifacts = view.getByRole("button", { name: "Artifacts" });
    const copy = view.getByRole("button", { name: "Copy answer" });
    const retry = view.getByRole("button", { name: "Retry answer" });
    const footer = sources.closest('[data-slot="message-footer"]');
    expect(footer?.className).toContain("flex-wrap");
    for (const control of [sources, artifacts, copy, retry]) {
      expect(control.closest('[data-slot="message-footer"]')).toBe(footer);
      expect(control.className).toContain("min-h-11");
    }
    expect(view.queryByText("Assistant")).toBeNull();
    expect(footer?.querySelector("time")?.getAttribute("datetime")).toBe(answer.createdAt);
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(sources);
    fireEvent.click(artifacts);
    const sourceList = view.getByRole("list", { name: "Source files" });
    const artifactPanel = view.getByRole("region", { name: "Artifacts" });
    expect(sourceList.parentElement).toBe(footer?.parentElement);
    expect(artifactPanel.parentElement).toBe(footer?.parentElement);
    expect(sourceList.closest('[data-slot="bubble-content"]')).toBeNull();
    expect((footer?.compareDocumentPosition(sourceList) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(artifacts.getAttribute("aria-controls")).toBe(artifactPanel.id);
    expect(artifacts.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(view.getByRole("button", { name: "Download reports/result.csv" })).toBeTruthy());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/artifacts");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      apiKey: "test-key", agentId: "agent-1", agentSessionToken: "session-1",
      repoUrl: "https://github.com/acme/widgets", branch: "main", agentMode: "qa",
      model: { id: "composer-2.5" }
    });

    artifacts.focus();
    fireEvent.click(artifacts);
    expect(artifacts.getAttribute("aria-expanded")).toBe("false");
    expect(view.queryByRole("region", { name: "Artifacts" })).toBeNull();
    expect(view.queryByRole("button", { name: "Download reports/result.csv" })).toBeNull();
    expect(document.activeElement).toBe(artifacts);
    fireEvent.click(artifacts);
    expect(view.getByRole("button", { name: "Download reports/result.csv" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("announces artifact failures and lets the reader retry without losing the disclosure", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "The agent is unavailable." }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ artifacts: [] })));
    vi.stubGlobal("fetch", fetch);
    const view = render(
      <MessageBubble message={answer} copied={false} onCopy={() => {}} onRetry={() => {}} artifactScope={artifactScope} />
    );
    const toggle = view.getByRole("button", { name: "Artifacts" });
    fireEvent.click(toggle);
    expect(view.getByRole("status").textContent).toBe("Loading artifacts…");
    await waitFor(() => expect(view.getByRole("alert").textContent).toBe("The agent is unavailable."));
    fireEvent.click(view.getByRole("button", { name: "Retry loading artifacts" }));
    await waitFor(() => expect(view.getByText("No artifacts are available.")).toBeTruthy());
    expect(view.queryByRole("alert")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(view.getByRole("region", { name: "Artifacts" }).getAttribute("aria-busy")).toBe("false");
  });

  it("can collapse artifacts while loading and reopens with the completed results", async () => {
    let resolveResponse: (response: Response) => void = () => {};
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const view = render(
      <MessageBubble message={answer} copied={false} onCopy={() => {}} onRetry={() => {}} artifactScope={artifactScope} />
    );
    const toggle = view.getByRole("button", { name: "Artifacts" });
    fireEvent.click(toggle);
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(toggle);
    resolveResponse(new Response(JSON.stringify({ artifacts: [] })));
    await waitFor(() => expect(view.container.querySelector('[role="region"]')?.getAttribute("aria-busy")).toBe("false"));
    expect(view.queryByRole("region", { name: "Artifacts" })).toBeNull();
    fireEvent.click(toggle);
    expect(view.getByText("No artifacts are available.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps artifact and answer actions unavailable while streaming or on errors", () => {
    const view = render(
      <MessageBubble message={{ ...answer, streaming: true }} copied={false} canRegenerate onCopy={() => {}} onRetry={() => {}} artifactScope={artifactScope} />
    );
    expect(view.queryByRole("button", { name: "Artifacts" })).toBeNull();
    expect(view.queryByRole("button", { name: "Copy answer" })).toBeNull();
    expect(view.queryByRole("button", { name: "Retry answer" })).toBeNull();
    view.rerender(
      <MessageBubble message={{ ...answer, error: true }} copied={false} canRegenerate onCopy={() => {}} onRetry={() => {}} artifactScope={artifactScope} />
    );
    expect(view.queryByRole("button", { name: /Sources|Artifacts|Copy answer|Retry answer/ })).toBeNull();
  });
});
