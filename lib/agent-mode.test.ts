import { describe, expect, it } from "vitest";
import {
  isImplementMode,
  isPlanMode,
  isReadOnlyMode,
  parseAgentMode,
  sdkModeForAgentMode
} from "@/lib/agent-mode";

describe("agent mode helpers", () => {
  it("parses plan mode and defaults invalid values to ask", () => {
    expect(parseAgentMode("qa")).toBe("qa");
    expect(parseAgentMode("plan")).toBe("plan");
    expect(parseAgentMode("implement")).toBe("implement");
    expect(parseAgentMode("bad")).toBe("qa");
  });

  it("maps product modes to Cursor SDK modes", () => {
    expect(sdkModeForAgentMode("qa")).toBe("agent");
    expect(sdkModeForAgentMode("plan")).toBe("plan");
    expect(sdkModeForAgentMode("implement")).toBe("agent");
  });

  it("classifies read-only and write-capable modes", () => {
    expect(isPlanMode("plan")).toBe(true);
    expect(isImplementMode("implement")).toBe(true);
    expect(isReadOnlyMode("qa")).toBe(true);
    expect(isReadOnlyMode("plan")).toBe(true);
    expect(isReadOnlyMode("implement")).toBe(false);
  });
});
