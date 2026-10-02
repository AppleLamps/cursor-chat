import { randomBytes, timingSafeEqual } from "node:crypto";

export const GITHUB_OAUTH_STATE_COOKIE = "askcursor_gh_oauth_state";
export const GITHUB_OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const GITHUB_OAUTH_CALLBACK_PATH = "/api/auth/github/callback";

/** `repo` is the narrowest OAuth App scope that can read private repo branches. */
export const GITHUB_OAUTH_SCOPE = "repo";

export type GitHubOAuthConfig = {
  clientId: string;
  clientSecret: string;
};

export function getGitHubOAuthConfig(): GitHubOAuthConfig | null {
  const clientId = process.env.ASKCURSOR_GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.ASKCURSOR_GITHUB_CLIENT_SECRET?.trim();

  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function createOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function statesMatch(expected: string | undefined, actual: string | null) {
  if (!expected || !actual) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(actual);

  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildGitHubAuthorizeUrl(clientId: string, state: string) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", GITHUB_OAUTH_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export class GitHubOAuthError extends Error {}

export async function exchangeGitHubCode(
  config: GitHubOAuthConfig,
  code: string
): Promise<string> {
  let response: Response;

  try {
    response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Codebase-Chat"
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code
      }),
      cache: "no-store"
    });
  } catch {
    throw new GitHubOAuthError("Could not reach GitHub. Try connecting again.");
  }

  if (!response.ok) {
    throw new GitHubOAuthError("GitHub rejected the sign-in. Try connecting again.");
  }

  const data = (await response.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
  } | null;

  if (!data?.access_token) {
    throw new GitHubOAuthError(
      data?.error === "bad_verification_code"
        ? "The GitHub sign-in expired. Try connecting again."
        : "GitHub did not return an access token. Try connecting again."
    );
  }

  return data.access_token;
}
