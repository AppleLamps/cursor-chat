import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/proxy";

describe("buildContentSecurityPolicy", () => {
  const directives = (policy: string) =>
    Object.fromEntries(
      policy.split("; ").map((part) => {
        const [name, ...values] = part.split(" ");
        return [name, values.join(" ")];
      })
    );

  it("allows scripts only by nonce, with no inline or eval escape hatch", () => {
    const csp = directives(buildContentSecurityPolicy("abc123", false));

    expect(csp["script-src"]).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp["script-src"]).not.toContain("unsafe-inline");
    expect(csp["script-src"]).not.toContain("unsafe-eval");
  });

  it("never loads remote images and locks down embedding", () => {
    const csp = directives(buildContentSecurityPolicy("n", false));

    expect(csp["img-src"]).toBe("'self' data: blob:");
    expect(csp["connect-src"]).toBe("'self'");
    expect(csp["frame-ancestors"]).toBe("'none'");
    expect(csp["object-src"]).toBe("'none'");
  });

  it("adds eval for the dev server only", () => {
    expect(buildContentSecurityPolicy("n", true)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy("n", false)).not.toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy("n", false)).toContain("upgrade-insecure-requests");
  });
});
