import { validateRepoUrl } from "@/lib/validate";

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
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw new GitHubApiError("GitHub did not respond in time. Try again.", 504);
  }
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
