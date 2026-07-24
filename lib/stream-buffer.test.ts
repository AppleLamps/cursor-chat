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
});
