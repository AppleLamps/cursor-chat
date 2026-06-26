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

  const repoResponse = await fetch(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}`,
    { headers, cache: "no-store" }
  );

  if (!repoResponse.ok) {
    if (repoResponse.status === 401) {
      throw new Error("GitHub token is invalid or expired.");
    }

    if (repoResponse.status === 404) {
      throw new Error("Repository not found or token lacks access to this repo.");
    }

    throw new Error("Failed to load repository details from GitHub.");
  }

  const repoData = (await repoResponse.json()) as GitHubRepoResponse;
  const defaultBranch = repoData.default_branch?.trim();
  const branches: string[] = [];
  let nextUrl: string | null =
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/branches?per_page=100`;

  while (nextUrl && branches.length < 300) {
    const response = await fetch(nextUrl, { headers, cache: "no-store" });

    if (!response.ok) {
      throw new Error("Failed to load branches from GitHub.");
    }

    const page = (await response.json()) as GitHubBranchResponse[];

    for (const branch of page) {
      if (branch.name?.trim()) {
        branches.push(branch.name.trim());
      }
    }

    const link = response.headers.get("link");
    nextUrl = parseGitHubNextLink(link);
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
