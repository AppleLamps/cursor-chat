import { describe, expect, it } from "vitest";
import { isSafeLoginUrl } from "@/lib/cursor-login";

describe("isSafeLoginUrl", () => {
  it("accepts https and rejects everything else in production", () => {
    expect(isSafeLoginUrl("https://cursor.com/loginDeepControl?x=1", true)).toBe(true);
    expect(isSafeLoginUrl("http://cursor.com/login", true)).toBe(false);
    expect(isSafeLoginUrl("javascript:alert(1)", true)).toBe(false);
    expect(isSafeLoginUrl("data:text/html,hi", false)).toBe(false);
    expect(isSafeLoginUrl("https://user:pw@cursor.com/", true)).toBe(false);
    expect(isSafeLoginUrl("not a url", true)).toBe(false);
    expect(isSafeLoginUrl(undefined, true)).toBe(false);
  });

  it("allows plain http only outside production", () => {
    expect(isSafeLoginUrl("http://localhost:3000/login", false)).toBe(true);
  });
});
