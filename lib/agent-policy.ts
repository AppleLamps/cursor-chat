import { isImplementMode } from "@/lib/agent-mode";
import type { AgentMode } from "@/lib/defaults";

type ImplementPolicyInput = {
  agentMode: AgentMode;
  repoUrl: string;
  branch: string;
  isFollowUp: boolean;
  implementConfirmed?: boolean;
};

type PolicyBlock = {
  allowed: false;
  status: number;
  error: string;
};

type PolicyAllow = {
  allowed: true;
};

const DEFAULT_PROTECTED_BRANCHES = [
  "main",
  "master",
  "prod",
  "production",
  "release",
  "release/*",
  "hotfix/*"
];

function parseList(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRepoUrl(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, "").toLowerCase();
  }
}

function repoSlug(value: string) {
  try {
    const url = new URL(value.trim());
    return url.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.git$/i, "")
      .toLowerCase();
  } catch {
    return value.trim().replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").toLowerCase();
  }
}

function wildcardMatch(pattern: string, value: string) {
  const escaped = pattern
    .trim()
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`, "i").test(value);
}

function matchesAny(patterns: string[], value: string) {
  return patterns.some((pattern) => wildcardMatch(pattern, value));
}

function isImplementModeEnabled() {
  return process.env.ASKCURSOR_ENABLE_IMPLEMENT_MODE !== "false";
}

function isRepoAllowed(repoUrl: string) {
  const allowedRepos = parseList(process.env.ASKCURSOR_IMPLEMENT_ALLOWED_REPOS);
  const allowedOwners = parseList(process.env.ASKCURSOR_IMPLEMENT_ALLOWED_OWNERS);

  if (allowedRepos.length === 0 && allowedOwners.length === 0) return true;

  const normalizedUrl = normalizeRepoUrl(repoUrl);
  const slug = repoSlug(repoUrl);
  const owner = slug.split("/")[0] || "";

  return (
    matchesAny(allowedRepos, normalizedUrl) ||
    matchesAny(allowedRepos, slug) ||
    matchesAny(allowedOwners, owner)
  );
}

function isBranchAllowed(branch: string) {
  const allowedBranches = parseList(process.env.ASKCURSOR_IMPLEMENT_ALLOWED_BRANCHES);

  return allowedBranches.length === 0 || matchesAny(allowedBranches, branch.trim());
}

function isProtectedBranch(branch: string) {
  if (process.env.ASKCURSOR_ALLOW_PROTECTED_IMPLEMENT_BRANCHES === "true") {
    return false;
  }

  const protectedBranches =
    parseList(process.env.ASKCURSOR_IMPLEMENT_PROTECTED_BRANCHES).length > 0
      ? parseList(process.env.ASKCURSOR_IMPLEMENT_PROTECTED_BRANCHES)
      : DEFAULT_PROTECTED_BRANCHES;

  return matchesAny(protectedBranches, branch.trim());
}

export function validateAgentPolicy({
  agentMode,
  repoUrl,
  branch,
  isFollowUp,
  implementConfirmed
}: ImplementPolicyInput): PolicyAllow | PolicyBlock {
  if (!isImplementMode(agentMode)) {
    return { allowed: true };
  }

  if (!isImplementModeEnabled()) {
    return {
      allowed: false,
      status: 403,
      error: "Implement mode is disabled for this deployment."
    };
  }

  if (!isRepoAllowed(repoUrl)) {
    return {
      allowed: false,
      status: 403,
      error: "Implement mode is not allowed for this repository."
    };
  }

  if (!isBranchAllowed(branch)) {
    return {
      allowed: false,
      status: 403,
      error: "Implement mode is not allowed for this branch."
    };
  }

  if (isProtectedBranch(branch)) {
    return {
      allowed: false,
      status: 403,
      error:
        "Implement mode is blocked on protected branches. Create a feature branch and try again."
    };
  }

  if (!isFollowUp && implementConfirmed !== true) {
    return {
      allowed: false,
      status: 428,
      error: "Confirm Implement mode before starting a write-capable agent run."
    };
  }

  return { allowed: true };
}
