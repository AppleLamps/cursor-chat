import { describe, expect, it } from "vitest";
import {
  describeCost,
  formatCostCents,
  MAX_USAGE_RUN_COUNT,
  normalizeAgentUsage,
  normalizeUsageCost
} from "@/lib/usage-api";

const tokenUsage = {
  inputTokens: 10,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 30
};

describe("usage cost normalization", () => {
  it("accepts a well-formed cost", () => {
    expect(normalizeUsageCost({ rawCostCents: 12.5, chargedCents: 9 })).toEqual({
      rawCostCents: 12.5,
      chargedCents: 9
    });
  });

  it.each([
    undefined,
    null,
    "free",
    {},
    { rawCostCents: 1 },
    { chargedCents: 1 },
    { rawCostCents: -1, chargedCents: 1 },
    { rawCostCents: Number.NaN, chargedCents: 1 },
    { rawCostCents: Number.POSITIVE_INFINITY, chargedCents: 1 }
  ])("rejects malformed cost %s", (value) => {
    expect(normalizeUsageCost(value)).toBeUndefined();
  });
});

describe("agent usage normalization", () => {
  it("keeps only runs carrying a usable run id", () => {
    const payload = normalizeAgentUsage({
      usage: tokenUsage,
      cost: { rawCostCents: 20, chargedCents: 15 },
      runs: [
        { runId: "run-1", usage: tokenUsage, cost: { rawCostCents: 8, chargedCents: 6 } },
        { runId: "  ", usage: tokenUsage },
        { usage: tokenUsage },
        "nope",
        { runId: "run-2" }
      ]
    });

    expect(payload.usage).toEqual(tokenUsage);
    expect(payload.cost).toEqual({ rawCostCents: 20, chargedCents: 15 });
    expect(payload.runs).toEqual([
      { runId: "run-1", usage: tokenUsage, cost: { rawCostCents: 8, chargedCents: 6 } },
      { runId: "run-2" }
    ]);
  });

  it("treats a run without cost as pending rather than free", () => {
    const payload = normalizeAgentUsage({ runs: [{ runId: "run-1", usage: tokenUsage }] });
    expect(payload.runs[0].cost).toBeUndefined();
  });

  it("caps the number of runs handed back", () => {
    const runs = Array.from({ length: MAX_USAGE_RUN_COUNT + 25 }, (_, index) => ({
      runId: `run-${index}`
    }));
    expect(normalizeAgentUsage({ runs }).runs).toHaveLength(MAX_USAGE_RUN_COUNT);
  });

  it.each([undefined, null, "usage", 7])("survives a junk payload %s", (value) => {
    expect(normalizeAgentUsage(value)).toEqual({ runs: [] });
  });
});

describe("cost formatting", () => {
  it("scales precision to the amount", () => {
    expect(formatCostCents(0)).toBe("$0.00");
    expect(formatCostCents(0.4)).toBe("<$0.01");
    expect(formatCostCents(4.2)).toBe("$0.042");
    expect(formatCostCents(50)).toBe("$0.50");
    expect(formatCostCents(123)).toBe("$1.23");
    expect(formatCostCents(12345)).toBe("$123.45");
  });

  it("rejects impossible amounts", () => {
    expect(formatCostCents(-1)).toBeNull();
    expect(formatCostCents(Number.NaN)).toBeNull();
  });
});

describe("cost description", () => {
  it("returns nothing while cost is still pending", () => {
    expect(describeCost(undefined)).toBeNull();
  });

  it("labels uncharged usage as included and keeps the list price", () => {
    const display = describeCost({ rawCostCents: 40, chargedCents: 0 });
    expect(display?.included).toBe(true);
    expect(display?.label).toBe("included");
    expect(display?.detail).toContain("$0.40");
  });

  it("labels uncharged usage without inventing a list price", () => {
    const display = describeCost({ rawCostCents: 0, chargedCents: 0 });
    expect(display?.included).toBe(true);
    expect(display?.detail).not.toContain("List price");
  });

  it("reports the charged amount and the discount when there is one", () => {
    const display = describeCost({ rawCostCents: 200, chargedCents: 150 });
    expect(display?.included).toBe(false);
    expect(display?.label).toBe("$1.50");
    expect(display?.detail).toBe("Charged $1.50 of $2.00 list price.");
  });

  it("omits the discount line when nothing was discounted", () => {
    expect(describeCost({ rawCostCents: 150, chargedCents: 150 })?.detail).toBe(
      "Charged $1.50."
    );
  });
});
