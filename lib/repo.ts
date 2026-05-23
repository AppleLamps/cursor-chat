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
