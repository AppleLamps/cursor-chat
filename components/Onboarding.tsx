"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { APP_NAME } from "@/lib/defaults";
import { isPlausibleApiKey, isPlausibleGitHubToken } from "@/lib/storage";

export type CursorLoginHandlers = {
  onUrl: (url: string) => void;
  signal: AbortSignal;
};

type CursorConnection =
  | { phase: "idle" }
  | { phase: "waiting"; url?: string }
  | { phase: "connected"; email?: string }
  | { phase: "error"; message: string };

type OnboardingProps = {
  onComplete: (payload: {
    apiKey: string;
    githubToken?: string;
    remember: boolean;
  }) => void;
  /** Token already obtained through the GitHub connect flow. */
  githubToken?: string | null;
  githubError?: string | null;
  /** When provided, a "Connect Cursor" button offers browser sign-in instead of pasting a key. */
  onConnectCursor?: (
    handlers: CursorLoginHandlers
  ) => Promise<{ apiKey: string; email?: string }>;
  /** When provided, a "Connect GitHub" button replaces pasting a token. */
  onConnectGitHub?: (pending: { apiKey?: string; remember: boolean }) => void;
};

export default function Onboarding({
  onComplete,
  githubToken: connectedGitHubToken,
  githubError,
  onConnectCursor,
  onConnectGitHub
}: OnboardingProps) {
  const [apiKey, setApiKey] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<CursorConnection>({ phase: "idle" });
  const loginAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => loginAbortRef.current?.abort(), []);

  async function connectCursor() {
    if (!onConnectCursor) return;

    loginAbortRef.current?.abort();
    const abort = new AbortController();
    loginAbortRef.current = abort;
    setError(null);
    setCursor({ phase: "waiting" });

    // Opened inside the click so mobile browsers allow it; pointed at the
    // sign-in page once the server has the URL. The visible link below is the
    // fallback when a popup blocker wins.
    let popup: Window | null = null;
    try {
      popup = window.open("", "_blank");
      if (popup) popup.opener = null;
    } catch {
      popup = null;
    }

    try {
      const result = await onConnectCursor({
        signal: abort.signal,
        onUrl: (url) => {
          setCursor({ phase: "waiting", url });
          try {
            if (popup && !popup.closed) popup.location.href = url;
          } catch {
            // Fall back to the visible link.
          }
        }
      });

      if (abort.signal.aborted) return;
      setApiKey(result.apiKey);
      setCursor({ phase: "connected", email: result.email });
    } catch (caught) {
      if (abort.signal.aborted) return;
      setCursor({
        phase: "error",
        message:
          caught instanceof Error && caught.message
            ? caught.message
            : "Cursor sign-in failed."
      });
    } finally {
      try {
        popup?.close();
      } catch {
        // Nothing to clean up.
      }
    }
  }

  function cancelCursor() {
    loginAbortRef.current?.abort();
    setCursor({ phase: "idle" });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedKey = apiKey.trim();
    const trimmedGitHub = githubToken.trim();

    if (!isPlausibleApiKey(trimmedKey)) {
      setError("Enter a valid Cursor API key (at least 12 characters).");
      return;
    }

    if (trimmedGitHub && !isPlausibleGitHubToken(trimmedGitHub)) {
      setError("Enter a valid GitHub token or leave the GitHub field blank.");
      return;
    }

    onComplete({
      apiKey: trimmedKey,
      githubToken: trimmedGitHub || connectedGitHubToken || undefined,
      remember
    });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-[max(1rem,env(safe-area-inset-left))] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-[#0d0d0d]">
      <div className="w-full max-w-md">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#8a8a8a]">
            {APP_NAME}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#202123] sm:text-[28px]">
            Connect your Cursor account
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#5f6368]">
            {onConnectCursor
              ? "Sign in with Cursor, or paste an API key, to ask questions about your repositories. "
              : "Paste a Cursor API key to ask questions about your repositories. "}
            Your keys stay in this browser session unless you choose to remember
            them.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 rounded-[1.75rem] border border-[#d9d9d9] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
        >
          {onConnectCursor ? (
            <div className="mb-5">
              {cursor.phase === "connected" ? (
                <p className="rounded-xl border border-[#cfe8d6] bg-[#f3faf5] px-4 py-3 text-sm font-medium text-[#1a7f37]">
                  ✓ Cursor connected{cursor.email ? ` as ${cursor.email}` : ""}
                </p>
              ) : cursor.phase === "waiting" ? (
                <div
                  role="status"
                  className="rounded-xl border border-[#d9d9d9] bg-[#fafafa] px-4 py-3 text-sm text-[#444]"
                >
                  <p className="font-medium">Waiting for you to approve in Cursor…</p>
                  {cursor.url ? (
                    <p className="mt-1 text-xs leading-5 text-[#5f6368]">
                      Nothing opened?{" "}
                      <a
                        href={cursor.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[#202123] underline underline-offset-2"
                      >
                        Open the Cursor sign-in page
                      </a>
                      .
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={cancelCursor}
                    className="mt-2 text-xs font-medium text-[#5f6368] underline underline-offset-2 hover:text-[#111]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void connectCursor()}
                  className="flex w-full items-center justify-center rounded-full bg-[#0d0d0d] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#303030] focus:outline-none focus:ring-4 focus:ring-black/10"
                >
                  Connect Cursor
                </button>
              )}
              {cursor.phase === "error" ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950"
                >
                  {cursor.message}
                </p>
              ) : null}
              {cursor.phase !== "connected" ? (
                <p className="mt-4 text-center text-xs text-[#8a8a8a]">
                  or paste an API key
                </p>
              ) : null}
            </div>
          ) : null}

          <label htmlFor="cursor-api-key" className="block text-sm font-medium text-[#333]">
            Cursor API key
          </label>
          <input
            id="cursor-api-key"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="cursor_…"
            className="mt-2 w-full rounded-xl border border-[#d9d9d9] bg-[#fafafa] px-4 py-3 text-sm text-[#0d0d0d] outline-none transition focus:border-[#bdbdbd] focus:bg-white focus:ring-2 focus:ring-[#ececec]"
          />

          <div className="mt-5 rounded-xl border border-[#ececec] bg-[#fafafa] p-4">
            <p className="text-sm font-medium text-[#333]">
              GitHub <span className="font-normal text-[#8a8a8a]">(optional)</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-[#5f6368]">
              Adds a real branch picker when you choose a repository. Without it,
              you can still type common branch names manually.
            </p>

            {githubError ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-950">
                {githubError}
              </p>
            ) : null}

            {connectedGitHubToken ? (
              <p className="mt-3 text-sm font-medium text-[#1a7f37]">
                ✓ GitHub connected
              </p>
            ) : onConnectGitHub ? (
              <button
                type="button"
                onClick={() =>
                  onConnectGitHub({
                    apiKey: apiKey.trim() || undefined,
                    remember
                  })
                }
                className="mt-3 flex w-full items-center justify-center rounded-full border border-[#d9d9d9] bg-white px-4 py-2.5 text-sm font-semibold text-[#202123] transition hover:bg-[#f7f7f8] focus:outline-none focus:ring-4 focus:ring-black/10"
              >
                Connect GitHub
              </button>
            ) : null}

            {!connectedGitHubToken && onConnectGitHub ? (
              <p className="mt-2 text-xs leading-5 text-[#8a8a8a]">
                Only used to list branches. GitHub&apos;s OAuth sign-in has no
                read-only option for private repositories, so it asks for the{" "}
                <strong>repo</strong> scope. To limit access, paste a
                fine-grained token with read-only Contents access instead.
              </p>
            ) : null}

            {connectedGitHubToken ? null : onConnectGitHub ? (
              <details className="mt-3 text-xs leading-5 text-[#5f6368]">
                <summary className="cursor-pointer font-medium text-[#444]">
                  Paste a token instead
                </summary>
                <GitHubTokenField value={githubToken} onChange={setGithubToken} />
              </details>
            ) : (
              <GitHubTokenField value={githubToken} onChange={setGithubToken} />
            )}
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-[#444]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#c7c7c7]"
            />
            <span>
              Remember on this device
              <span className="mt-1 block text-xs leading-5 text-[#8a8a8a]">
                Persisted in browser local storage on this computer.
              </span>
            </span>
          </label>

          {error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-5 flex w-full items-center justify-center rounded-full bg-[#0d0d0d] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#303030] focus:outline-none focus:ring-4 focus:ring-black/10"
          >
            Continue
          </button>
        </form>

        <p className="mt-5 text-center text-xs leading-5 text-[#8a8a8a]">
          Create a Cursor key in the{" "}
          <a
            href="https://cursor.com/dashboard/integrations"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#444] underline underline-offset-2 hover:text-[#111]"
          >
            Cursor integrations dashboard
          </a>
          .
        </p>
      </div>
    </main>
  );
}

function GitHubTokenField({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-3">
      <label htmlFor="github-token" className="block text-sm font-medium text-[#333]">
        GitHub token
      </label>
      <input
        id="github-token"
        type="password"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="ghp_… or github_pat_…"
        className="mt-2 w-full rounded-xl border border-[#d9d9d9] bg-white px-4 py-3 text-sm text-[#0d0d0d] outline-none transition focus:border-[#bdbdbd] focus:ring-2 focus:ring-[#ececec]"
      />
      <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs leading-5 text-[#5f6368]">
        <li>
          Open{" "}
          <a
            href="https://github.com/settings/tokens/new?scopes=repo&description=AskCursor"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#444] underline underline-offset-2 hover:text-[#111]"
          >
            GitHub token settings
          </a>
        </li>
        <li>
          Create a classic token with the <strong>repo</strong> scope, or a
          fine-grained token with read-only Contents access
        </li>
        <li>Paste the token here and continue</li>
      </ol>
      <p className="mt-3 text-xs leading-5 text-[#8a8a8a]">
        Used only to list branches. Sent to this app&apos;s server, then to
        GitHub. Never stored on the server.
      </p>
    </div>
  );
}
