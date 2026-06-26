"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchRepositories, type RepoOption } from "@/lib/repo";

export function useRepoCatalog(apiKey: string | null, hasAuthHydrated: boolean) {
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);

  const loadRepositories = useCallback(async (key: string) => {
    setReposLoading(true);
    setReposError(null);

    try {
      setRepos(await fetchRepositories(key));
    } catch (caught) {
      setRepos([]);
      setReposError(
        caught instanceof Error ? caught.message : "Failed to load repositories."
      );
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!apiKey || !hasAuthHydrated) return;
    void loadRepositories(apiKey);
  }, [apiKey, hasAuthHydrated, loadRepositories]);

  function resetRepositories() {
    setRepos([]);
    setReposError(null);
  }

  return {
    repos,
    reposLoading,
    reposError,
    loadRepositories,
    resetRepositories
  };
}
