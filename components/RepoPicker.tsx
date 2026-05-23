"use client";

import { FormEvent, useEffect, useState } from "react";
import { APP_NAME, DEFAULT_BRANCH } from "@/lib/defaults";
import { RepoOption, repoLabel } from "@/lib/repo";

type RepoPickerProps = {
  repos: RepoOption[];
  loading: boolean;
  error: string | null;
  initialRepoUrl?: string | null;
  initialBranch?: string;
  title?: string;
  description?: string;
  submitLabel?: string;
  mode?: "page" | "modal";
  onRetry: () => void;
  onSelect: (repoUrl: string, branch: string, rememberAsDefault: boolean) => void;
  onCancel?: () => void;
};

export default function RepoPicker({
  repos,
  loading,
  error,
  initialRepoUrl,
  initialBranch = DEFAULT_BRANCH,
  title = "Choose a repository",
  description = "Pick the codebase this conversation should answer questions about.",
  submitLabel = "Continue",
  mode = "page",
  onRetry,
  onSelect,
  onCancel
}: RepoPickerProps) {
  const [selectedRepoUrl, setSelectedRepoUrl] = useState(initialRepoUrl ?? "");
  const [branch, setBranch] = useState(initialBranch);
  const [rememberAsDefault, setRememberAsDefault] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRepoUrl) {
      setSelectedRepoUrl(initialRepoUrl);
      return;
    }

    if (repos.length === 1) {
      setSelectedRepoUrl(repos[0].url);
    }
  }, [initialRepoUrl, repos]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const repoUrl = selectedRepoUrl.trim();
    const branchName = branch.trim() || DEFAULT_BRANCH;

    if (!repoUrl) {
      setValidationError("Select a repository to continue.");
      return;
    }

    onSelect(repoUrl, branchName, rememberAsDefault);
  }

  const form = (
    <form
      onSubmit={handleSubmit}
      className={
        mode === "page"
          ? "mt-8 rounded-[1.75rem] border border-[#d9d9d9] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
          : "rounded-2xl bg-white"
      }
    >
      {loading ? (
        <p className="text-sm text-[#5f6368]">Loading repositories from Cursor…</p>
      ) : error ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950">
            {error}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-[#d9d9d9] px-4 py-2 text-sm font-medium text-[#333] transition hover:bg-[#f7f7f8]"
          >
            Retry
          </button>
        </div>
      ) : repos.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-[#5f6368]">
            No GitHub repositories are connected to your Cursor account yet.
            Connect a repo in Cursor, then retry.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-[#d9d9d9] px-4 py-2 text-sm font-medium text-[#333] transition hover:bg-[#f7f7f8]"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="repo-select" className="block text-sm font-medium text-[#333]">
            Repository
          </label>
          <select
            id="repo-select"
            value={selectedRepoUrl}
            onChange={(event) => setSelectedRepoUrl(event.target.value)}
            className="mt-2 w-full rounded-xl border border-[#d9d9d9] bg-[#fafafa] px-4 py-3 text-sm text-[#0d0d0d] outline-none transition focus:border-[#bdbdbd] focus:bg-white focus:ring-2 focus:ring-[#ececec]"
          >
            <option value="">Select a repository…</option>
            {repos.map((repo) => (
              <option key={repo.url} value={repo.url}>
                {repoLabel(repo.url)}
              </option>
            ))}
          </select>

          <label htmlFor="repo-branch" className="mt-4 block text-sm font-medium text-[#333]">
            Branch
          </label>
          <input
            id="repo-branch"
            type="text"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            placeholder={DEFAULT_BRANCH}
            className="mt-2 w-full rounded-xl border border-[#d9d9d9] bg-[#fafafa] px-4 py-3 text-sm text-[#0d0d0d] outline-none transition focus:border-[#bdbdbd] focus:bg-white focus:ring-2 focus:ring-[#ececec]"
          />

          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-[#444]">
            <input
              type="checkbox"
              checked={rememberAsDefault}
              onChange={(event) => setRememberAsDefault(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#c7c7c7]"
            />
            <span>
              Use as default for new chats
              <span className="mt-1 block text-xs leading-5 text-[#8a8a8a]">
                Saved locally on this device.
              </span>
            </span>
          </label>

          {validationError ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950">
              {validationError}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-[#d9d9d9] px-4 py-3 text-sm font-medium text-[#444] transition hover:bg-[#f7f7f8]"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              className="flex flex-1 items-center justify-center rounded-full bg-[#0d0d0d] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#303030] focus:outline-none focus:ring-4 focus:ring-black/10"
            >
              {submitLabel}
            </button>
          </div>
        </>
      )}
    </form>
  );

  if (mode === "modal") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 py-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="repo-picker-title"
          className="w-full max-w-md rounded-[1.75rem] border border-[#d9d9d9] bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
        >
          <h2 id="repo-picker-title" className="text-lg font-semibold text-[#202123]">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#5f6368]">{description}</p>
          <div className="mt-4">{form}</div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-[#0d0d0d]">
      <div className="w-full max-w-md">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#8a8a8a]">
            {APP_NAME}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#202123] sm:text-[28px]">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#5f6368]">
            {description}
          </p>
        </div>
        {form}
      </div>
    </main>
  );
}
