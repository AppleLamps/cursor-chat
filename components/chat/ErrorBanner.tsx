"use client";

export default function ErrorBanner({
  message,
  canRetry,
  onRetry
}: {
  message: string;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto mb-3 flex max-w-4xl flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      {canRetry ? (
        <button
          onClick={onRetry}
          className="rounded-full bg-red-950 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-300"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
