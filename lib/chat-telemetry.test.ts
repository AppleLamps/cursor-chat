import { describe, expect, it } from "vitest";
import {
  formatTokenUsage,
  normalizeTokenUsage,
  telemetryTitle
} from "@/lib/chat-telemetry";

describe("chat telemetry", () => {
  it("normalizes complete SDK usage payloads", () => {
    expect(
      normalizeTokenUsage({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 150,
        reasoningTokens: 25
      })
    ).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 150,
      reasoningTokens: 25
    });
  });

  it("rejects incomplete or malformed usage payloads", () => {
    expect(normalizeTokenUsage(undefined)).toBeUndefined();
    expect(normalizeTokenUsage({ totalTokens: 10 })).toBeUndefined();
    expect(
      normalizeTokenUsage({
        inputTokens: 1,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: "3"
      })
    ).toBeUndefined();
  });

  it("formats compact token counts", () => {
    expect(
      formatTokenUsage({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 150
      })
    ).toBe("150 tokens");

    expect(
      formatTokenUsage({
        inputTokens: 1000,
        outputTokens: 250,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 1250
      })
    ).toBe("1.3k tokens");
  });

  it("builds a tooltip with request and run identifiers", () => {
    expect(
      telemetryTitle({
        requestId: "req",
        runId: "run",
        modelId: "composer-2.5",
        durationMs: 123
      })
    ).toContain("Request: req");
  });
});
