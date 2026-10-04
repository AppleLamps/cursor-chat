import { afterEach, describe, expect, it } from "vitest";
import { validateAgentPolicy } from "@/lib/agent-policy";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("validateAgentPolicy", () => {
  it("allows plan mode without implement confirmation or protected branch checks", () => {
    delete process.env.ASKCURSOR_ALLOW_PROTECTED_IMPLEMENT_BRANCHES;

    expect(
      validateAgentPolicy({
        agentMode: "plan",
        repoUrl: "https://github.com/acme/app",
        branch: "main",
        isFollowUp: false,
        implementConfirmed: false
      })
    ).toEqual({ allowed: true });
  });

  it("still blocks unconfirmed implement mode", () => {
    expect(
      validateAgentPolicy({
        agentMode: "implement",
        repoUrl: "https://github.com/acme/app",
        branch: "feature/test",
        isFollowUp: false,
        implementConfirmed: false
      })
    ).toMatchObject({
      allowed: false,
      status: 428
    });
  });

  const implement = (branch: string) =>
    validateAgentPolicy({
      agentMode: "implement",
      repoUrl: "https://github.com/acme/app",
      branch,
      isFollowUp: true
    });

  it.each(["main", "MAIN", "refs/heads/main", "heads/main", "refs/heads/release/1.2"])(
    "allows protected starting ref %s because writes use a separate branch",
    (branch) => {
      expect(implement(branch)).toEqual({ allowed: true });
    }
  );

  it("allows ordinary feature branches", () => {
    expect(implement("feature/x")).toEqual({ allowed: true });
    expect(implement("refs/heads/feature/x")).toEqual({ allowed: true });
  });

  it("does not confuse legacy protected write target settings with starting refs", () => {
    process.env.ASKCURSOR_IMPLEMENT_PROTECTED_BRANCHES = "staging";

    expect(implement("staging")).toEqual({ allowed: true });
    expect(implement("main")).toEqual({ allowed: true });
    expect(implement("feature/x")).toEqual({ allowed: true });
  });

  it("applies the branch allowlist to the short name", () => {
    process.env.ASKCURSOR_IMPLEMENT_ALLOWED_BRANCHES = "feature/*";

    expect(implement("refs/heads/feature/x")).toEqual({ allowed: true });
    expect(implement("bugfix/x")).toMatchObject({ allowed: false });
  });
});
