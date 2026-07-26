import { describe, expect, it } from "vitest";
import {
  activityExplanation,
  activityKind,
  activityState,
  buildActivitySteps,
  formatElapsedTime
} from "@/lib/agent-activity";

describe("activityKind", () => {
  it("maps stream labels to timeline categories", () => {
    expect(activityKind("Starting Cursor cloud agent...")).toBe("start");
    expect(activityKind("Searching the codebase…")).toBe("search");
    expect(activityKind("Finished reading files")).toBe("read");
    expect(activityKind("Finished updating files")).toBe("edit");
    expect(activityKind("Running a command…")).toBe("command");
    expect(activityKind("Finished repository check")).toBe("git");
    expect(activityKind("Working on a delegated task…")).toBe("task");
    expect(activityKind("Writing the response…")).toBe("writing");
    expect(
      activityKind("Live updates ended; waiting for the final run result...")
    ).toBe("waiting");
    expect(activityKind("Using a workspace tool…")).toBe("generic");
  });
});

describe("activityState", () => {
  it("derives running, done, and failed states from the label", () => {
    expect(activityState("Reading files…")).toBe("running");
    expect(activityState("Starting Cursor cloud agent...")).toBe("running");
    expect(activityState("Finished reading files")).toBe("done");
    expect(activityState("Command failed")).toBe("failed");
  });
});

describe("buildActivitySteps", () => {
  it("replaces a running step with its own completion", () => {
    const steps = buildActivitySteps([
      "Reading files…",
      "Finished reading files"
    ]);

    expect(steps).toHaveLength(1);
    expect(steps[0].label).toBe("Finished reading files");
    expect(steps[0].state).toBe("done");
  });

  it("collapses consecutive duplicates into a repeat count", () => {
    const steps = buildActivitySteps([
      "Searching the codebase…",
      "Searching the codebase…",
      "Searching the codebase…"
    ]);

    expect(steps).toHaveLength(1);
    expect(steps[0].repeatCount).toBe(3);
  });

  it("keeps distinct phases in order and drops blank entries", () => {
    const steps = buildActivitySteps([
      "Starting Cursor cloud agent...",
      "   ",
      "Searching the codebase…",
      "Finished searching",
      "Writing the response…"
    ]);

    expect(steps.map((step) => step.label)).toEqual([
      "Starting Cursor cloud agent...",
      "Finished searching",
      "Writing the response…"
    ]);
  });

  it("starts a new step when the same tool runs again after finishing", () => {
    const steps = buildActivitySteps([
      "Reading files…",
      "Finished reading files",
      "Reading files…"
    ]);

    expect(steps).toHaveLength(2);
    expect(steps[1].state).toBe("running");
  });
});

describe("activityExplanation", () => {
  it("explains the active phase in plain language", () => {
    expect(activityExplanation("Writing the response…")).toContain("answer");
    expect(activityExplanation("Searching the codebase…")).toContain("repository");
  });
});

describe("formatElapsedTime", () => {
  it("formats seconds and minutes", () => {
    expect(formatElapsedTime(0)).toBe("0s");
    expect(formatElapsedTime(45)).toBe("45s");
    expect(formatElapsedTime(60)).toBe("1m");
    expect(formatElapsedTime(95)).toBe("1m 35s");
  });
});
