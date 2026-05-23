"use client";

import { useEffect, useMemo, useState } from "react";
import { BRANCH_PRESETS, DEFAULT_BRANCH } from "@/lib/defaults";
import { fetchBranches } from "@/lib/repo";

type BranchPickerProps = {
  repoUrl: string;
  githubToken?: string | null;
  branch: string;
  onBranchChange: (branch: string) => void;
};

export default function BranchPicker({
  repoUrl,
  githubToken,
  branch,
  onBranchChange
}: BranchPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enhancedMode = Boolean(githubToken?.trim());

  useEffect(() => {
    if (!enhancedMode || !repoUrl.trim()) {
      setBranches([]);
      setDefaultBranch(undefined);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadBranches() {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchBranches(repoUrl, githubToken!.trim());

        if (cancelled) return;

        setBranches(result.branches);
        setDefaultBranch(result.defaultBranch);

        if (result.defaultBranch) {
          onBranchChange(result.defaultBranch);
        } else if (result.branches.length > 0) {
          onBranchChange(result.branches[0]);
        }
      } catch (caught) {
        if (cancelled) return;

        setBranches([]);
        setDefaultBranch(undefined);
        setError(
          caught instanceof Error ? caught.message : "Failed to load branches."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadBranches();

    return () => {
      cancelled = true;
    };
  }, [repoUrl, githubToken, enhancedMode]);

  const filteredBranches = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();

    if (!normalized) {
      return branches;
    }

    return branches.filter((name) => name.toLowerCase().includes(normalized));
  }, [branches, searchQuery]);

  if (!repoUrl.trim()) {
    return (
      <div className="mt-4 rounded-xl border border-[#ececec] bg-[#fafafa] p-4">
        <p className="text-sm font-medium text-[#333]">Branch</p>
        <p className="mt-2 text-xs leading-5 text-[#8a8a8a]">
          Select a repository first to choose a branch.
        </p>
      </div>
    );
  }

  if (enhancedMode) {
    return (
      <div className="mt-4 rounded-xl border border-[#ececec] bg-[#fafafa] p-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="branch-search" className="text-sm font-medium text-[#333]">
            Branch
          </label>
          <span className="text-xs text-[#8a8a8a]">
            {loading
              ? "Loading…"
              : branches.length
                ? `${filteredBranches.length} from GitHub`
                : "GitHub"}
          </span>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {error}
          </div>
        ) : null}

        {!loading && error ? (
          <BasicBranchInput branch={branch} onBranchChange={onBranchChange} />
        ) : null}

        {!error ? (
          <>
            <input
              id="branch-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search branches…"
              disabled={loading || branches.length === 0}
              className="mt-2 w-full rounded-xl border border-[#d9d9d9] bg-white px-4 py-3 text-sm text-[#0d0d0d] outline-none transition focus:border-[#bdbdbd] focus:ring-2 focus:ring-[#ececec] disabled:bg-[#f5f5f5] disabled:text-[#999]"
            />

            <div
              role="listbox"
              aria-label="Branches"
              className="mt-3 max-h-40 space-y-1 overflow-y-auto pr-1"
            >
              {loading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="h-10 animate-pulse rounded-lg bg-[#ececec]" />
                  ))}
                </div>
              ) : filteredBranches.length === 0 ? (
                <p className="px-1 py-2 text-xs leading-5 text-[#8a8a8a]">
                  No branches match your search.
                </p>
              ) : (
                filteredBranches.map((name) => {
                  const selected = branch === name;
                  const isDefault = name === defaultBranch;

                  return (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onBranchChange(name)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] ${
                        selected
                          ? "border-[#0d0d0d] bg-white text-[#111]"
                          : "border-transparent bg-transparent text-[#444] hover:bg-white"
                      }`}
                    >
                      <span className="truncate font-medium">{name}</span>
                      {isDefault ? (
                        <span className="ml-2 shrink-0 text-xs text-[#8a8a8a]">default</span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : null}

        <p className="mt-3 text-xs leading-5 text-[#8a8a8a]">
          The agent reads code from this branch. Source links in answers use it too.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-[#ececec] bg-[#fafafa] p-4">
      <label htmlFor="repo-branch" className="block text-sm font-medium text-[#333]">
        Branch
      </label>
      <BasicBranchInput branch={branch} onBranchChange={onBranchChange} />
      <p className="mt-2 text-xs leading-5 text-[#8a8a8a]">
        Pick a common branch or type a custom ref. Add a GitHub token in onboarding
        to load real branches automatically.
      </p>
    </div>
  );
}

function BasicBranchInput({
  branch,
  onBranchChange
}: {
  branch: string;
  onBranchChange: (branch: string) => void;
}) {
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {BRANCH_PRESETS.map((preset) => {
          const selected = branch === preset;

          return (
            <button
              key={preset}
              type="button"
              onClick={() => onBranchChange(preset)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] ${
                selected
                  ? "border-[#0d0d0d] bg-[#0d0d0d] text-white"
                  : "border-[#d9d9d9] bg-white text-[#444] hover:bg-[#f7f7f8]"
              }`}
            >
              {preset}
            </button>
          );
        })}
      </div>

      <input
        id="repo-branch"
        type="text"
        value={branch}
        onChange={(event) => onBranchChange(event.target.value)}
        placeholder={DEFAULT_BRANCH}
        className="mt-3 w-full rounded-xl border border-[#d9d9d9] bg-white px-4 py-3 text-sm text-[#0d0d0d] outline-none transition focus:border-[#bdbdbd] focus:ring-2 focus:ring-[#ececec]"
      />
    </>
  );
}
