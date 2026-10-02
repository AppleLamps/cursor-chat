import { describe, expect, it } from "vitest";
import { trimmedString } from "@/lib/validate";

describe("trimmedString", () => {
  it("trims text and treats everything else as absent", () => {
    expect(trimmedString("  hi  ")).toBe("hi");
    expect(trimmedString("")).toBe("");
    expect(trimmedString(undefined)).toBeUndefined();
    expect(trimmedString(null)).toBeUndefined();
    expect(trimmedString(12)).toBeUndefined();
    expect(trimmedString({ trim: () => "x" })).toBeUndefined();
    expect(trimmedString(["a"])).toBeUndefined();
  });
});
