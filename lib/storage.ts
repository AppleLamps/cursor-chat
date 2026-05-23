export const STORAGE_KEYS = {
  API_KEY: "codebase-chat-api-key-v1",
  GITHUB_TOKEN: "codebase-chat-github-token-v1",
  REMEMBER_KEY: "codebase-chat-remember-key-v1",
  DEFAULT_REPO: "codebase-chat-default-repo-v1",
  DEFAULT_BRANCH: "codebase-chat-default-branch-v1",
  CONVERSATIONS: "codebase-chat-conversations-v1",
  SIDEBAR: "codebase-chat-sidebar-v1"
} as const;

function isBrowser() {
  return typeof window !== "undefined";
}

export function getRememberKey(): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(STORAGE_KEYS.REMEMBER_KEY) === "true";
}

export function setRememberKey(remember: boolean) {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    STORAGE_KEYS.REMEMBER_KEY,
    remember ? "true" : "false"
  );
}

export function getStoredApiKey(): string | null {
  if (!isBrowser() || !getRememberKey()) return null;

  const key = window.localStorage.getItem(STORAGE_KEYS.API_KEY)?.trim();
  return key || null;
}

export function persistApiKey(key: string, remember: boolean) {
  if (!isBrowser()) return;

  setRememberKey(remember);

  if (remember) {
    window.localStorage.setItem(STORAGE_KEYS.API_KEY, key.trim());
    return;
  }

  window.localStorage.removeItem(STORAGE_KEYS.API_KEY);
  window.localStorage.removeItem(STORAGE_KEYS.GITHUB_TOKEN);
}

export function clearStoredApiKey() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEYS.API_KEY);
  window.localStorage.removeItem(STORAGE_KEYS.GITHUB_TOKEN);
  window.localStorage.removeItem(STORAGE_KEYS.REMEMBER_KEY);
  clearDefaultRepoSettings();
}

export function getStoredGitHubToken(): string | null {
  if (!isBrowser() || !getRememberKey()) return null;

  const token = window.localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN)?.trim();
  return token || null;
}

export function persistGitHubToken(token: string | null, remember: boolean) {
  if (!isBrowser()) return;

  if (!remember || !token?.trim()) {
    window.localStorage.removeItem(STORAGE_KEYS.GITHUB_TOKEN);
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.GITHUB_TOKEN, token.trim());
}

export function clearStoredGitHubToken() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEYS.GITHUB_TOKEN);
}

export function getDefaultRepo(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(STORAGE_KEYS.DEFAULT_REPO)?.trim() || null;
}

export function setDefaultRepo(repoUrl: string) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEYS.DEFAULT_REPO, repoUrl.trim());
}

export function getDefaultBranch(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(STORAGE_KEYS.DEFAULT_BRANCH)?.trim() || null;
}

export function setDefaultBranch(branch: string) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEYS.DEFAULT_BRANCH, branch.trim());
}

export function clearDefaultRepoSettings() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEYS.DEFAULT_REPO);
  window.localStorage.removeItem(STORAGE_KEYS.DEFAULT_BRANCH);
}

export function maskApiKey(key: string) {
  if (key.length <= 12) return "••••••••";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

export function isPlausibleApiKey(key: string) {
  const trimmed = key.trim();
  return trimmed.length >= 12;
}

export function isPlausibleGitHubToken(token: string) {
  const trimmed = token.trim();

  if (trimmed.length < 20) {
    return false;
  }

  return /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/.test(trimmed);
}
