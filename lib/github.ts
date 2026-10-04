import { validateRepoUrl } from "@/lib/validate";
import { canonicalRepoUrl, safePullRequestUrl, type PullRequestDetails } from "@/lib/implementation";

export type GitHubRepoRef = {
  owner: string;
  repo: string;
};

export function parseGitHubRepoUrl(repoUrl: string): GitHubRepoRef | null {
  const validation = validateRepoUrl(repoUrl);

  if (!validation.ok) {
    return null;
  }

  return {
    owner: validation.value.owner,
    repo: validation.value.repo
  };
}

/** Carries the HTTP status so routes can map it without parsing messages. */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

const GITHUB_API_ORIGIN = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BRANCHES = 300;
const MAX_BRANCH_PAGES = 5;

async function githubFetch(url: string, headers: Record<string, string>) {
  try {
    return await fetch(url, {
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw new GitHubApiError("GitHub did not respond in time. Try again.", 504);
  }
}

/** Read-only PR status and the PR's cumulative changed files (not this turn's edits). */
export async function getGitHubPullRequest(repoUrl: string, prUrl: string, token?: string): Promise<PullRequestDetails> {
  const url = safePullRequestUrl(prUrl, repoUrl);
  const ref = parseGitHubRepoUrl(repoUrl);
  if (!url || !ref) throw new GitHubApiError("The PR does not belong to this repository.", 400);
  const number = Number(url.split("/").at(-1));
  const prefix = `${GITHUB_API_ORIGIN}/repos/${ref.owner}/${ref.repo}/pulls/${number}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json", "User-Agent": "Codebase-Chat", "X-GitHub-Api-Version": "2022-11-28",
    ...(token?.trim() ? { Authorization: `Bearer ${token.trim()}` } : {})
  };
  const response = await githubFetch(prefix, headers);
  if (!response.ok) throw failureFor(response, "Could not verify the pull request with GitHub.", "PR not found or GitHub access is missing. Connect a GitHub token with read access to this repository, including SSO approval.");
  const pr = await response.json();
  if (safePullRequestUrl(pr.html_url, repoUrl) !== url ||
      canonicalRepoUrl(pr.base?.repo?.html_url ?? "") !== canonicalRepoUrl(repoUrl) ||
      typeof pr.head?.ref !== "string" || typeof pr.base?.ref !== "string" ||
      !["open", "closed"].includes(pr.state)) {
    throw new GitHubApiError("GitHub returned unexpected pull request metadata.", 502);
  }
  const files: PullRequestDetails["files"] = [];
  let filesTruncated = false;
  for (let page = 1; page <= 3; page++) {
    const fileResponse = await githubFetch(`${prefix}/files?per_page=100&page=${page}`, headers);
    if (!fileResponse.ok) throw failureFor(fileResponse, "Could not load changed files from GitHub.");
    const entries = await fileResponse.json();
    if (!Array.isArray(entries)) throw new GitHubApiError("GitHub returned unexpected changed files.", 502);
    for (const file of entries) {
      if (typeof file.filename === "string" && typeof file.status === "string" &&
          Number.isSafeInteger(file.additions) && Number.isSafeInteger(file.deletions)) {
        files.push({ path: file.filename, status: file.status, additions: file.additions, deletions: file.deletions });
      }
    }
    const hasNext = Boolean(parseGitHubNextLink(fileResponse.headers.get("link")));
    if (!hasNext) break;
    if (page === 3) filesTruncated = true;
  }
  filesTruncated ||= typeof pr.changed_files === "number" && pr.changed_files > files.length;
  return { url, number, state: pr.merged ? "merged" : pr.state === "closed" ? "closed" : pr.draft ? "draft" : "open",
    head: pr.head.ref, base: pr.base.ref, files, filesTruncated };
}

function failureFor(response: Response, fallback: string, notFound?: string) {
  if (response.status === 401) {
    return new GitHubApiError("GitHub token is invalid or expired.", 401);
  }
  if (
    response.status === 429 ||
    (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    return new GitHubApiError(
      "GitHub rate limit reached. Wait a few minutes and try again.",
      429
    );
  }
  if (response.status === 403) {
    return new GitHubApiError(
      "This GitHub token cannot access that repository. Check its permissions or SSO authorization.",
      403
    );
  }
  if (response.status === 404 && notFound) {
    return new GitHubApiError(notFound, 404);
  }
  return new GitHubApiError(fallback, 502);
}

type GitHubRepoResponse = {
  default_branch?: string;
};

type GitHubBranchResponse = {
  name: string;
};

export async function listGitHubBranches(
  repoUrl: string,
  githubToken: string
): Promise<{ branches: string[]; defaultBranch?: string }> {
  const ref = parseGitHubRepoUrl(repoUrl);

  if (!ref) {
    throw new Error("Only GitHub repository URLs are supported for branch listing.");
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${githubToken.trim()}`,
    "User-Agent": "Codebase-Chat",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  const repoPrefix = `${GITHUB_API_ORIGIN}/repos/${ref.owner}/${ref.repo}`;
  const repoResponse = await githubFetch(repoPrefix, headers);

  if (!repoResponse.ok) {
    throw failureFor(
      repoResponse,
      "Failed to load repository details from GitHub.",
      "Repository not found or token lacks access to this repo."
    );
  }

  const repoData = (await repoResponse.json()) as GitHubRepoResponse;
  const defaultBranch =
    typeof repoData.default_branch === "string"
      ? repoData.default_branch.trim()
      : undefined;
  const branches: string[] = [];
  let nextUrl: string | null = `${repoPrefix}/branches?per_page=100`;

  for (
    let pages = 0;
    nextUrl && pages < MAX_BRANCH_PAGES && branches.length < MAX_BRANCHES;
    pages += 1
  ) {
    const response: Response = await githubFetch(nextUrl, headers);

    if (!response.ok) {
      throw failureFor(response, "Failed to load branches from GitHub.");
    }

    const page: unknown = await response.json();
    if (!Array.isArray(page)) {
      throw new GitHubApiError("GitHub returned an unexpected response.", 502);
    }

    for (const branch of page as GitHubBranchResponse[]) {
      if (typeof branch?.name === "string" && branch.name.trim()) {
        branches.push(branch.name.trim());
      }
    }

    // The bearer token is only ever sent back to this repository's own API.
    const next = parseGitHubNextLink(response.headers.get("link"));
    nextUrl = next && next.startsWith(`${repoPrefix}/branches`) ? next : null;
  }

  const uniqueBranches = [...new Set(branches)].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  if (defaultBranch && uniqueBranches.includes(defaultBranch)) {
    uniqueBranches.sort((a, b) => {
      if (a === defaultBranch) return -1;
      if (b === defaultBranch) return 1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  }

  return {
    branches: uniqueBranches,
    defaultBranch: defaultBranch || undefined
  };
}

function parseGitHubNextLink(linkHeader: string | null) {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(",")) {
    const section = part.trim();

    if (section.includes('rel="next"')) {
      const match = section.match(/<([^>]+)>/);
      return match?.[1] ?? null;
    }
  }

  return null;
}
