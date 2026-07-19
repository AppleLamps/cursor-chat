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
  modelId: "composer-2.5" as const,
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

  it("binds validation to the selected model", () => {
    const token = createAgentSessionToken(context);

    expect(
      verifyAgentSessionToken(token, {
        ...context,
        modelId: "cursor-grok-4.5-high"
      })
    ).toMatchObject({ valid: false });
  });

  it("accepts legacy tokens without a model only for the default model", () => {
    const token = createAgentSessionToken({
      ...context,
      modelId: undefined
    } as unknown as typeof context);

    expect(verifyAgentSessionToken(token, context)).toEqual({ valid: true });
    expect(
      verifyAgentSessionToken(token, {
        ...context,
        modelId: "cursor-grok-4.5-high"
      })
    ).toMatchObject({ valid: false });
  });
});
