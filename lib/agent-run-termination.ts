export type TerminationReason = "abort" | "timeout";

type CancelableRun = {
  supports(capability: "cancel"): boolean;
  cancel(): Promise<unknown>;
};

type AgentRunTerminationOptions = {
  reason: TerminationReason;
  run: CancelableRun | null;
  closeStream: () => void;
  disposeAgent: () => Promise<void>;
  releaseSlot: () => Promise<void>;
  onError: (operation: "cancel" | "dispose", error: unknown) => void;
};

export async function terminateAgentRun({
  reason,
  run,
  closeStream,
  disposeAgent,
  releaseSlot,
  onError
}: AgentRunTerminationOptions) {
  closeStream();

  try {
    if (run?.supports("cancel")) {
      await run.cancel();
    }
  } catch (error) {
    onError("cancel", error);
  }

  try {
    await disposeAgent();
  } catch (error) {
    onError("dispose", error);
  }

  await releaseSlot();
  return reason;
}
