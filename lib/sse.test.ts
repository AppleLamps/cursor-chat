import { describe, expect, it } from "vitest";
import { toolActivityLabel } from "@/lib/sse";

describe("toolActivityLabel", () => {
  it("turns internal command and edit tool names into readable progress", () => {
    expect(toolActivityLabel("run_terminal_cmd", "running")).toBe(
      "Running a command…"
    );
    expect(toolActivityLabel("apply_patch", "completed")).toBe(
      "Finished updating files"
    );
  });

  it("does not expose unknown internal tool names", () => {
    expect(toolActivityLabel("opaque_internal_operation", "running")).toBe(
      "Using a workspace tool…"
    );
    expect(toolActivityLabel("opaque_internal_operation", "error")).toBe(
      "Workspace operation failed"
    );
  });
});
