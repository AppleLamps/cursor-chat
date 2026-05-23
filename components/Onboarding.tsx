"use client";

import { FormEvent, useState } from "react";
import { APP_NAME } from "@/lib/defaults";
import { isPlausibleApiKey } from "@/lib/storage";

type OnboardingProps = {
  onComplete: (apiKey: string, remember: boolean) => void;
};

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = apiKey.trim();

    if (!isPlausibleApiKey(trimmed)) {
      setError("Enter a valid Cursor API key (at least 12 characters).");
      return;
    }

    onComplete(trimmed, remember);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-[#0d0d0d]">
      <div className="w-full max-w-md">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#8a8a8a]">
            {APP_NAME}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#202123] sm:text-[28px]">
            Connect your Cursor account
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#5f6368]">
            Paste a Cursor API key to ask questions about your repositories. Your
            key stays on this device unless you choose to remember it.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 rounded-[1.75rem] border border-[#d9d9d9] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
        >
          <label htmlFor="cursor-api-key" className="block text-sm font-medium text-[#333]">
            Cursor API key
          </label>
          <input
            id="cursor-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="cursor_…"
            className="mt-2 w-full rounded-xl border border-[#d9d9d9] bg-[#fafafa] px-4 py-3 text-sm text-[#0d0d0d] outline-none transition focus:border-[#bdbdbd] focus:bg-white focus:ring-2 focus:ring-[#ececec]"
          />

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
                Stored in browser local storage on this computer only.
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
          Create a key in the{" "}
          <a
            href="https://cursor.com/dashboard/integrations"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#444] underline underline-offset-2 hover:text-[#111]"
          >
            Cursor integrations dashboard
          </a>
          . The key is sent to this app&apos;s server when loading repositories
          and when sending messages. It is never stored on the server.
        </p>
      </div>
    </main>
  );
}
