"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import BranchPicker from "@/components/BranchPicker";
import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import { APP_NAME, DEFAULT_AGENT_MODE, DEFAULT_BRANCH, type AgentMode } from "@/lib/defaults";
import { RepoOption, filterRepos, repoLabel } from "@/lib/repo";

type RepoPickerProps = {
  repos: RepoOption[];
  loading: boolean;
  error: string | null;
  initialRepoUrl?: string | null;
  initialBranch?: string;
  initialAgentMode?: AgentMode;
  allowModeSelection?: boolean;
  githubToken?: string | null;
  title?: string;
  description?: string;
  submitLabel?: string;
  mode?: "page" | "modal";
  onRetry: () => void;
  onChangeCredentials?: () => void;
  onSelect: (
    repoUrl: string,
    branch: string,
    rememberAsDefault: boolean,
    agentMode: AgentMode
  ) => void;
  onCancel?: () => void;
};

export default function RepoPicker({
  repos,
  loading,
  error,
  initialRepoUrl,
  initialBranch = DEFAULT_BRANCH,
  initialAgentMode = DEFAULT_AGENT_MODE,
  allowModeSelection = true,
  githubToken,
  title = "Choose a repository",
  description,
  submitLabel = "Continue",
  mode = "page",
  onRetry,
  onChangeCredentials,
  onSelect,
  onCancel
}: RepoPickerProps) {
  const [selectedRepoUrl, setSelectedRepoUrl] = useState(initialRepoUrl ?? "");
  const [branch, setBranch] = useState(initialBranch);
  const [agentMode, setAgentMode] = useState<AgentMode>(initialAgentMode);
  const [rememberAsDefault, setRememberAsDefault] = useState(allowModeSelection);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const modeDescription =
    description ??
    (isImplementMode(agentMode)
      ? "Pick the codebase the agent should modify. It may commit changes and open a pull request."
      : isPlanMode(agentMode)
        ? "Pick the codebase the agent should inspect before producing a read-only implementation plan."
        : "Pick the codebase this conversation should answer questions about.");

  const filteredRepos = useMemo(
    () => filterRepos(repos, searchQuery),
    [repos, searchQuery]
  );

  useEffect(() => {
    if (initialRepoUrl) {
      setSelectedRepoUrl(initialRepoUrl);
      return;
    }

    if (repos.length === 1) {
      setSelectedRepoUrl(repos[0].url);
    }
  }, [initialRepoUrl, repos]);

  useEffect(() => {
    setRememberAsDefault(allowModeSelection);
  }, [allowModeSelection]);

  useEffect(() => {
    if (!loading && !error && repos.length > 0) {
      searchInputRef.current?.focus();
    }
  }, [loading, error, repos.length]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const repoUrl = selectedRepoUrl.trim();
    const branchName = branch.trim() || DEFAULT_BRANCH;

    if (!repoUrl) {
      setValidationError("Select a repository to continue.");
      return;
    }

    onSelect(repoUrl, branchName, rememberAsDefault, agentMode);
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
        <RepoPickerLoading />
      ) : error ? (
        <RepoPickerError
          message={error}
          onRetry={onRetry}
          onChangeCredentials={onChangeCredentials}
        />
      ) : repos.length === 0 ? (
        <RepoPickerEmpty
          onRetry={onRetry}
          onChangeCredentials={onChangeCredentials}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="repo-search" className="text-sm font-medium text-[#333]">
              Repository
            </label>
            <span className="text-xs text-[#8a8a8a]">
              {searchQuery.trim()
                ? `${filteredRepos.length} of ${repos.length}`
                : `${repos.length} connected`}
            </span>
          </div>

          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a]">
              <IconSearch />
            </span>
            <input
              ref={searchInputRef}
              id="repo-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search repositories…"
              className="w-full rounded-xl border border-[#d9d9d9] bg-[#fafafa] py-3 pl-10 pr-10 text-sm text-[#0d0d0d] outline-none transition focus:border-[#bdbdbd] focus:bg-white focus:ring-2 focus:ring-[#ececec]"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#777] transition hover:bg-[#ececec] hover:text-[#111]"
                aria-label="Clear search"
              >
                <IconClose className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div
            role="listbox"
            aria-label="Repositories"
            className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1"
          >
            {filteredRepos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d9d9d9] px-4 py-8 text-center">
                <p className="text-sm font-medium text-[#444]">No matches</p>
                <p className="mt-1 text-xs leading-5 text-[#8a8a8a]">
                  Try a different owner, repo name, or URL fragment.
                </p>
              </div>
            ) : (
              filteredRepos.map((repo) => {
                const selected = selectedRepoUrl === repo.url;
                const label = repoLabel(repo.url);

                return (
                  <button
                    key={repo.url}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => setSelectedRepoUrl(repo.url)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] ${
                      selected
                        ? "border-[#0d0d0d] bg-[#fafafa]"
                        : "border-[#ececec] hover:border-[#d9d9d9] hover:bg-[#fafafa]"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        selected ? "bg-[#0d0d0d] text-white" : "bg-[#f1f1f1] text-[#555]"
                      }`}
                    >
                      <IconFolder className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#202123]">
                        {label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#8a8a8a]">
                        {repo.url}
                      </span>
                    </span>
                    {selected ? (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0d0d0d] text-white">
                        <IconCheck className="h-3 w-3" />
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {allowModeSelection ? (
            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-[#333]">Chat mode</legend>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <ModeOption
                  selected={agentMode === "qa"}
                  title="Ask"
                  description="Read-only answers about the codebase"
                  onSelect={() => setAgentMode("qa")}
                />
                <ModeOption
                  selected={agentMode === "plan"}
                  title="Plan"
                  description="Read-only implementation plan"
                  onSelect={() => setAgentMode("plan")}
                />
                <ModeOption
                  selected={agentMode === "implement"}
                  title="Implement"
                  description="Make scoped changes; may open a pull request"
                  onSelect={() => setAgentMode("implement")}
                />
              </div>
              {isImplementMode(agentMode) ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                  The agent may modify this repository and open a PR when the task
                  requires code changes. Usage is billed to your Cursor account. The
                  repo must allow writes and must not use read-only Cursor hooks.
                </p>
              ) : null}
            </fieldset>
          ) : null}

          <BranchPicker
            repoUrl={selectedRepoUrl}
            githubToken={githubToken}
            branch={branch}
            onBranchChange={setBranch}
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
              disabled={!selectedRepoUrl}
              className="flex flex-1 items-center justify-center rounded-full bg-[#0d0d0d] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#303030] focus:outline-none focus:ring-4 focus:ring-black/10 disabled:cursor-not-allowed disabled:bg-[#bdbdbd]"
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
          className="w-full max-w-lg rounded-[1.75rem] border border-[#d9d9d9] bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
        >
          <h2 id="repo-picker-title" className="text-lg font-semibold text-[#202123]">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#5f6368]">{modeDescription}</p>
          <div className="mt-4">{form}</div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-[#0d0d0d]">
      <div className="w-full max-w-lg">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#8a8a8a]">
            {APP_NAME}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#202123] sm:text-[28px]">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#5f6368]">
            {modeDescription}
          </p>
        </div>
        {form}
      </div>
    </main>
  );
}

function ModeOption({
  selected,
  title,
  description,
  onSelect
}: {
  selected: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] ${
        selected
          ? "border-[#0d0d0d] bg-[#fafafa]"
          : "border-[#ececec] hover:border-[#d9d9d9] hover:bg-[#fafafa]"
      }`}
    >
      <span className="block text-sm font-medium text-[#202123]">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-[#8a8a8a]">{description}</span>
    </button>
  );
}

function RepoPickerLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-[#5f6368]">
        <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[#d9d9d9] border-t-[#444]" />
        Loading repositories from Cursor…
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-[68px] animate-pulse rounded-xl bg-[#f1f1f1]" />
        ))}
      </div>
    </div>
  );
}

function RepoPickerError({
  message,
  onRetry,
  onChangeCredentials
}: {
  message: string;
  onRetry: () => void;
  onChangeCredentials?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm font-medium text-red-950">Could not load repositories</p>
        <p className="mt-1 text-sm leading-6 text-red-900/80">{message}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-[#d9d9d9] px-4 py-2 text-sm font-medium text-[#333] transition hover:bg-[#f7f7f8]"
        >
          <IconRefresh className="h-4 w-4" />
          Retry
        </button>
        {onChangeCredentials ? (
          <button
            type="button"
            onClick={onChangeCredentials}
            className="inline-flex items-center gap-2 rounded-full border border-[#d9d9d9] px-4 py-2 text-sm font-medium text-[#333] transition hover:bg-[#f7f7f8]"
          >
            <IconKey className="h-4 w-4" />
            Change tokens
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RepoPickerEmpty({
  onRetry,
  onChangeCredentials
}: {
  onRetry: () => void;
  onChangeCredentials?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-[#d9d9d9] px-4 py-6 text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f1f1] text-[#666]">
          <IconFolder className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-medium text-[#444]">No repositories found</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#5f6368]">
          Connect a GitHub repository in Cursor, then reload the list here.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-[#d9d9d9] px-4 py-2 text-sm font-medium text-[#333] transition hover:bg-[#f7f7f8]"
        >
          <IconRefresh className="h-4 w-4" />
          Retry
        </button>
        {onChangeCredentials ? (
          <button
            type="button"
            onClick={onChangeCredentials}
            className="inline-flex items-center gap-2 rounded-full border border-[#d9d9d9] px-4 py-2 text-sm font-medium text-[#333] transition hover:bg-[#f7f7f8]"
          >
            <IconKey className="h-4 w-4" />
            Change tokens
          </button>
        ) : null}
      </div>
    </div>
  );
}

function IconSearch({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconClose({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function IconFolder({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function IconCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconRefresh({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  );
}

function IconKey({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="m10.5 12.5 7-7" />
      <path d="m18 5 1 1" />
      <path d="m15 8 1 1" />
    </svg>
  );
}
