/**
 * Shared by the usage route and the chat UI, so this module must stay free of
 * server-only imports — anything reaching `@cursor/sdk` breaks the client
 * bundle. Request authorization lives in the route.
 */
import { normalizeTokenUsage } from "@/lib/chat-telemetry";
import type { ChatTokenUsage, ChatUsageCost } from "@/lib/chat-types";

/**
 * Cloud agents report one entry per run. A conversation is one agent, so this
 * caps how many runs we will hand back to the browser for a single chat.
 */
export const MAX_USAGE_RUN_COUNT = 500;

export type RunCostEntry = {
  runId: string;
  usage?: ChatTokenUsage;
  cost?: ChatUsageCost;
};

export type AgentUsagePayload = {
  usage?: ChatTokenUsage;
  cost?: ChatUsageCost;
  runs: RunCostEntry[];
};

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Cost is server-derived and eventually consistent — the SDK omits it entirely
 * until billing events land, so an absent cost is normal, not an error.
 */
export function normalizeUsageCost(value: unknown): ChatUsageCost | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Partial<Record<keyof ChatUsageCost, unknown>>;
  const rawCostCents = finiteNonNegative(candidate.rawCostCents);
  const chargedCents = finiteNonNegative(candidate.chargedCents);

  if (rawCostCents === undefined || chargedCents === undefined) return undefined;

  return { rawCostCents, chargedCents };
}

export function normalizeAgentUsage(value: unknown): AgentUsagePayload {
  if (!value || typeof value !== "object") return { runs: [] };

  const candidate = value as { usage?: unknown; cost?: unknown; runs?: unknown };
  const runs = Array.isArray(candidate.runs) ? candidate.runs : [];

  return {
    usage: normalizeTokenUsage(candidate.usage),
    cost: normalizeUsageCost(candidate.cost),
    runs: runs.slice(0, MAX_USAGE_RUN_COUNT).flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const run = entry as { runId?: unknown; usage?: unknown; cost?: unknown };
      const runId = typeof run.runId === "string" ? run.runId.trim() : "";
      if (!runId) return [];
      const usage = normalizeTokenUsage(run.usage);
      const cost = normalizeUsageCost(run.cost);
      return [{ runId, ...(usage ? { usage } : {}), ...(cost ? { cost } : {}) }];
    })
  };
}

/**
 * Cents arrive as floats and a single Ask run can land well under a cent, so
 * the precision follows the magnitude instead of always showing two decimals.
 */
export function formatCostCents(cents: number) {
  if (!Number.isFinite(cents) || cents < 0) return null;
  if (cents === 0) return "$0.00";

  const dollars = cents / 100;
  if (dollars < 0.01) return `<$0.01`;
  if (dollars < 1) return `$${dollars.toFixed(3).replace(/0$/, "")}`;
  return `$${dollars.toFixed(2)}`;
}

export type CostDisplay = {
  label: string;
  /** True when Cursor charged nothing — plan-included, BYOK, or credit grant. */
  included: boolean;
  detail: string;
};

/**
 * `chargedCents` is what actually hit the account and is 0 for plan-included,
 * BYOK, and credit-grant usage. Reporting that as "$0.00" reads like a bug, so
 * those runs are labelled "included" with the undiscounted list price kept in
 * the detail line.
 */
export function describeCost(cost: ChatUsageCost | undefined): CostDisplay | null {
  if (!cost) return null;

  const charged = formatCostCents(cost.chargedCents);
  const raw = formatCostCents(cost.rawCostCents);
  if (!charged || !raw) return null;

  if (cost.chargedCents === 0) {
    return {
      label: "included",
      included: true,
      detail:
        cost.rawCostCents > 0
          ? `Not charged (plan-included, BYOK, or credits). List price ${raw}.`
          : "Not charged (plan-included, BYOK, or credits)."
    };
  }

  return {
    label: charged,
    included: false,
    detail:
      cost.rawCostCents > cost.chargedCents
        ? `Charged ${charged} of ${raw} list price.`
        : `Charged ${charged}.`
  };
}
