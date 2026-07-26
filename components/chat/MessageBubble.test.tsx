// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

    expect(view.getByText("Agent is working")).toBeTruthy();
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
    expect(view.getByText("2 steps")).toBeTruthy();
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
