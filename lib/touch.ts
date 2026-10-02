/** True on phones/tablets where the primary input is a finger, not a mouse. */
export function isCoarsePointer() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

type EnterKeyEvent = {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
};

/**
 * Cmd/Ctrl+Enter always sends. A bare Enter sends only with a mouse and
 * keyboard; on touch devices it inserts a line break and the send button sends.
 */
export function shouldSendOnEnter(event: EnterKeyEvent, coarsePointer: boolean) {
  if (event.key !== "Enter") return false;
  if (event.metaKey || event.ctrlKey) return true;
  return !event.shiftKey && !coarsePointer;
}
