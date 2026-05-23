export type RepoOption = {
  url: string;
};

export function repoLabel(repoUrl: string) {
  try {
    const path = new URL(repoUrl).pathname.replace(/^\/+|\/+$/g, "");
    return path || repoUrl;
  } catch {
    return repoUrl;
  }
}

export function filterRepos(repos: RepoOption[], query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return repos;
  }

  return repos.filter((repo) => {
    const label = repoLabel(repo.url).toLowerCase();
    return (
      label.includes(normalized) || repo.url.toLowerCase().includes(normalized)
    );
  });
}

export async function fetchRepositories(apiKey: string) {
  const response = await fetch("/api/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey })
  });

  const data = (await response.json().catch(() => ({}))) as {
    repos?: RepoOption[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || "Failed to load repositories.");
  }

  return data.repos ?? [];
}

export type BranchListResult = {
  branches: string[];
  defaultBranch?: string;
};

export async function fetchBranches(repoUrl: string, githubToken: string) {
  const response = await fetch("/api/branches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl, githubToken })
  });

  const data = (await response.json().catch(() => ({}))) as BranchListResult & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || "Failed to load branches.");
  }

  return {
    branches: data.branches ?? [],
    defaultBranch: data.defaultBranch
  };
}
