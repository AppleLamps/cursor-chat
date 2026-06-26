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
});
