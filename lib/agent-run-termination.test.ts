import { describe, expect, it, vi } from "vitest";
import { terminateAgentRun } from "@/lib/agent-run-termination";

describe("terminateAgentRun", () => {
  it("closes, cancels, disposes, and releases in order", async () => {
    const calls: string[] = [];

    await terminateAgentRun({
      reason: "abort",
      run: {
        supports: () => true,
        cancel: async () => {
          calls.push("cancel");
        }
      },
      closeStream: () => calls.push("close"),
      disposeAgent: async () => {
        calls.push("dispose");
      },
      releaseSlot: async () => {
        calls.push("release");
      },
      onError: vi.fn()
    });

    expect(calls).toEqual(["close", "cancel", "dispose", "release"]);
  });

  it("still releases resources when cancellation and disposal fail", async () => {
    const releaseSlot = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    await terminateAgentRun({
      reason: "timeout",
      run: {
        supports: () => true,
        cancel: async () => {
          throw new Error("cancel failed");
        }
      },
      closeStream: vi.fn(),
      disposeAgent: async () => {
        throw new Error("dispose failed");
      },
      releaseSlot,
      onError
    });

    expect(onError).toHaveBeenCalledTimes(2);
    expect(releaseSlot).toHaveBeenCalledOnce();
  });
});
