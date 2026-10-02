"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("AskCursor crashed.", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6 text-[#0d0d0d]">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202123]">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#5f6368]">
          The app hit an unexpected error. Your chats are saved in this browser
          and are not affected. Try again, or reload the page if it keeps
          happening.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-[#0d0d0d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#303030] focus:outline-none focus-visible:ring-4 focus-visible:ring-black/20"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-[#d9d9d9] px-5 py-3 text-sm font-medium text-[#444] transition hover:bg-[#f7f7f8] focus:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
          >
            Reload
          </button>
        </div>
      </div>
    </main>
  );
}
