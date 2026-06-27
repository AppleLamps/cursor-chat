"use client";

import { Button } from "@/components/ui/button";

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
    <div className="mx-auto mb-3 flex max-w-4xl flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      {canRetry ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onRetry}
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}
