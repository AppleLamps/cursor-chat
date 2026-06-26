"use client";

import { useEffect, useState } from "react";
import {
  clearStoredApiKey,
  clearStoredGitHubToken,
  getRememberKey,
  getStoredApiKey,
  getStoredGitHubToken,
  isPlausibleGitHubToken,
  persistApiKey,
  persistGitHubToken
} from "@/lib/storage";

export function useAuthSettings() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [hasAuthHydrated, setHasAuthHydrated] = useState(false);

  useEffect(() => {
    setApiKey(getStoredApiKey());
    setGithubToken(getStoredGitHubToken());
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
    return true;
  }

  return {
    apiKey,
    githubToken,
    hasAuthHydrated,
    completeOnboarding,
    signOut,
    clearGitHubToken,
    saveGitHubToken
  };
}
