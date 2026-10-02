"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Storage problems get their own banner: unlike a failed request there is
 * nothing to retry, and a Retry button here could re-run an agent.
 */
export default function StorageWarning({
  message,
  onDismiss
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="mx-auto mb-3 flex max-w-4xl items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        aria-label="Dismiss storage warning"
        className="shrink-0 text-amber-900 hover:bg-amber-100"
      >
        <XIcon />
      </Button>
    </div>
  );
}
