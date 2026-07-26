import { describe, expect, it } from "vitest";
import { createStreamBuffer, type StreamBufferSnapshot } from "@/lib/stream-buffer";

describe("createStreamBuffer", () => {
  it("keeps an ordered activity log without adjacent duplicates", () => {
    let snapshot: StreamBufferSnapshot | null = null;
    const buffer = createStreamBuffer(1000, (next) => {
      snapshot = next;
    });

    buffer.setActivity("Starting Cursor cloud agent...");
    buffer.setActivity("Searching the codebase...");
    buffer.setActivity("Searching the codebase...");
    buffer.setActivity("Finished searching");
    buffer.flushNow();

    const finalSnapshot = buffer.getSnapshot();
    expect(finalSnapshot.activity).toBe("Finished searching");
    expect(finalSnapshot.activityLog).toEqual([
      "Starting Cursor cloud agent...",
      "Searching the codebase...",
      "Finished searching"
    ]);
  });

  it("records reasoning between the tool calls it happened between", () => {
    const buffer = createStreamBuffer(1000, () => {});

    buffer.setActivity("Searching the codebase...");
    buffer.setThinking("The router");
    buffer.setThinking("The router owns the retry.");
    buffer.setActivity("Finished reading files");
    buffer.appendThinking(" Now I can answer.");
    buffer.flushNow();

    const { trace, thinking } = buffer.getSnapshot();
    expect(trace).toEqual([
      { type: "activity", label: "Searching the codebase..." },
      { type: "thinking", text: "The router owns the retry." },
      { type: "activity", label: "Finished reading files" },
      { type: "thinking", text: " Now I can answer." }
    ]);
    expect(thinking).toBe("The router owns the retry. Now I can answer.");
  });

  it("rebuilds the reasoning blocks when the agent replaces its thinking", () => {
    const buffer = createStreamBuffer(1000, () => {});

    buffer.setActivity("Searching the codebase...");
    buffer.setThinking("Draft reasoning");
    buffer.setActivity("Finished reading files");
    buffer.setThinking("A completely different summary.");
    buffer.flushNow();

    expect(buffer.getSnapshot().trace).toEqual([
      { type: "activity", label: "Searching the codebase..." },
      { type: "activity", label: "Finished reading files" },
      { type: "thinking", text: "A completely different summary." }
    ]);
  });
});
