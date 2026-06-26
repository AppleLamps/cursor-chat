export type RepoUrlValidation =
  | { ok: true; value: { url: string; owner: string; repo: string } }
  | { ok: false; error: string };

export type BranchValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

const MAX_REPO_URL_LENGTH = 2048;
const MAX_BRANCH_LENGTH = 255;
const GITHUB_OWNER_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const GITHUB_REPO_PATTERN = /^[a-z\d._-]+$/i;
const CONTROL_OR_WHITESPACE_PATTERN = /[\x00-\x20\x7f]/;
const GIT_REF_METACHARS_PATTERN = /[~^:?*[\]]/;
const SHELL_METACHARS_PATTERN = /[;&|`$!<>(){}]/;

export function validateRepoUrl(value: string | undefined): RepoUrlValidation {
  const raw = value?.trim() || "";

  if (!raw) {
    return { ok: false, error: "Repository URL is required." };
  }

  if (raw.length > MAX_REPO_URL_LENGTH) {
    return { ok: false, error: "Repository URL is too long." };
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Repository URL must be a valid URL." };
  }

  const host = url.hostname.toLowerCase();

  if (url.protocol !== "https:") {
    return { ok: false, error: "Repository URL must use https." };
  }

  if (host !== "github.com" && host !== "www.github.com") {
    return { ok: false, error: "Only GitHub repository URLs are supported." };
  }

  if (url.username || url.password || url.search || url.hash) {
    return {
      ok: false,
      error:
        "Repository URL must not include credentials, query strings, or fragments."
    };
  }

  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");

  if (parts.length !== 2) {
    return {
      ok: false,
      error: "Repository URL must point to a GitHub owner and repository."
    };
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");

  if (!GITHUB_OWNER_PATTERN.test(owner) || !GITHUB_REPO_PATTERN.test(repo)) {
    return { ok: false, error: "Repository URL contains an invalid owner or repo." };
  }

  return {
    ok: true,
    value: {
      url: `https://github.com/${owner}/${repo}`,
      owner,
      repo
    }
  };
}

export function validateBranch(value: string | undefined): BranchValidation {
  const branch = value?.trim() || "";

  if (!branch) {
    return { ok: false, error: "Branch is required." };
  }

  if (branch.length > MAX_BRANCH_LENGTH) {
    return { ok: false, error: "Branch name is too long." };
  }

  if (
    branch.startsWith("-") ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.endsWith(".lock")
  ) {
    return { ok: false, error: "Branch name is not a valid Git ref." };
  }

  if (
    branch === "@" ||
    branch.includes("..") ||
    branch.includes("@{") ||
    branch.includes("\\") ||
    branch.includes("//") ||
    CONTROL_OR_WHITESPACE_PATTERN.test(branch) ||
    GIT_REF_METACHARS_PATTERN.test(branch) ||
    SHELL_METACHARS_PATTERN.test(branch)
  ) {
    return { ok: false, error: "Branch name is not a valid Git ref." };
  }

  const parts = branch.split("/");

  if (
    parts.some(
      (part) => !part || part.startsWith(".") || part.toLowerCase().endsWith(".lock")
    )
  ) {
    return { ok: false, error: "Branch name is not a valid Git ref." };
  }

  return { ok: true, value: branch };
}
