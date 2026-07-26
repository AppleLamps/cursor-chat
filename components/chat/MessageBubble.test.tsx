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
});
