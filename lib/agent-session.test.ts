import { describe, expect, it } from "vitest";
import {
  createAgentSessionToken,
  verifyAgentSessionToken
} from "@/lib/agent-session";

const context = {
  agentId: "agent",
  repoUrl: "https://github.com/acme/app",
  branch: "main",
  agentMode: "plan" as const,
  apiKey: "cursor-key"
};

describe("agent session tokens", () => {
  it("preserves plan mode in session validation", () => {
    const token = createAgentSessionToken(context);

    expect(verifyAgentSessionToken(token, context)).toEqual({ valid: true });
    expect(
      verifyAgentSessionToken(token, { ...context, agentMode: "qa" })
    ).toMatchObject({ valid: false });
  });
});
