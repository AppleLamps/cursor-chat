"use client";

import { useEffect, useState } from "react";
import { parseGitHubOAuthHash, startGitHubOAuth } from "@/lib/github-oauth-client";
import {
  clearStoredApiKey,
  clearStoredGitHubToken,
  getRememberKey,
  getStoredApiKey,
  getStoredGitHubToken,
  isPlausibleApiKey,
  isPlausibleGitHubToken,
  persistApiKey,
  persistGitHubToken,
  setRememberKey
} from "@/lib/storage";

export function useAuthSettings() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [githubConnectError, setGithubConnectError] = useState<string | null>(null);
  const [hasAuthHydrated, setHasAuthHydrated] = useState(false);

  useEffect(() => {
    setApiKey(getStoredApiKey());
    let token = getStoredGitHubToken();

    // The GitHub OAuth callback returns its result in the URL fragment.
    const oauthResult = parseGitHubOAuthHash(window.location.hash);

    if (oauthResult) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );

      if (oauthResult.token && isPlausibleGitHubToken(oauthResult.token)) {
        persistGitHubToken(oauthResult.token, getRememberKey());
        token = oauthResult.token;
      } else {
        setGithubConnectError(
          oauthResult.error ?? "GitHub returned an unexpected token. Try again."
        );
      }
    }

    setGithubToken(token);
    setHasAuthHydrated(true);
  }, []);

  function completeOnboarding({
    apiKey: key,
    githubToken: token,
    remember
  }: {
    apiKey: string;
    githubToken?: string;
    remember: boolean;
  }) {
    persistApiKey(key, remember);
    persistGitHubToken(token ?? null, remember);
    setApiKey(key);
    setGithubToken(token ?? null);
  }

  function signOut() {
    clearStoredApiKey();
    setApiKey(null);
    setGithubToken(null);
  }

  function clearGitHubToken() {
    clearStoredGitHubToken();
    setGithubToken(null);
  }

  function saveGitHubToken(token: string) {
    const trimmed = token.trim();

    if (!isPlausibleGitHubToken(trimmed)) {
      return false;
    }

    persistGitHubToken(trimmed, getRememberKey());
    setGithubToken(trimmed);
    setGithubConnectError(null);
    return true;
  }

  /**
   * Leaves the page for GitHub. Anything typed so far is persisted first so it
   * survives the round trip: the Cursor key (if valid) and the remember choice.
   */
  function connectGitHub(pending?: { apiKey?: string; remember?: boolean }) {
    const remember = pending?.remember ?? getRememberKey();
    const pendingKey = pending?.apiKey?.trim();

    if (pendingKey && isPlausibleApiKey(pendingKey)) {
      persistApiKey(pendingKey, remember);
    } else {
      setRememberKey(remember);
    }

    startGitHubOAuth();
  }

  return {
    apiKey,
    githubToken,
    githubConnectError,
    hasAuthHydrated,
    completeOnboarding,
    signOut,
    clearGitHubToken,
    saveGitHubToken,
    connectGitHub,
    dismissGitHubConnectError: () => setGithubConnectError(null)
  };
}
