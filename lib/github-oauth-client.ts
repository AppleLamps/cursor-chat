const GITHUB_OAUTH_START_PATH = "/api/auth/github/start";

export type GitHubOAuthHashResult = {
  token: string | null;
  error: string | null;
};

/**
 * The OAuth callback returns the result in the URL fragment so the token never
 * reaches server logs. Returns null when the hash carries no OAuth result.
 */
export function parseGitHubOAuthHash(hash: string): GitHubOAuthHashResult | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("github_token")?.trim() || null;
  const error = params.get("github_error")?.trim() || null;

  if (!token && !error) return null;

  return { token, error };
}

export function startGitHubOAuth() {
  // A server route (it redirects to GitHub), not a Next.js page.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(GITHUB_OAUTH_START_PATH);
}
