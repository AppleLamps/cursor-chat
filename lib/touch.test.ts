import { describe, expect, it } from "vitest";
import { shouldSendOnEnter } from "@/lib/touch";

const enter = { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false };

describe("shouldSendOnEnter", () => {
  it("sends on a bare Enter with a mouse and keyboard", () => {
    expect(shouldSendOnEnter(enter, false)).toBe(true);
  });

  it("keeps Shift+Enter as a line break", () => {
    expect(shouldSendOnEnter({ ...enter, shiftKey: true }, false)).toBe(false);
  });

  it("treats Enter as a line break on touch devices", () => {
    expect(shouldSendOnEnter(enter, true)).toBe(false);
  });

  it("always sends on Cmd/Ctrl+Enter, even on touch devices", () => {
    expect(shouldSendOnEnter({ ...enter, metaKey: true }, true)).toBe(true);
    expect(shouldSendOnEnter({ ...enter, ctrlKey: true }, false)).toBe(true);
  });

  it("ignores other keys", () => {
    expect(shouldSendOnEnter({ ...enter, key: "a" }, false)).toBe(false);
  });
});
