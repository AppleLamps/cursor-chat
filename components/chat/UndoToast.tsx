"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** How long a deleted chat can be restored. */
export const UNDO_DELETE_MS = 8_000;

export default function UndoToast({
  message,
  onUndo,
  onExpire
}: {
  message: string;
  onUndo: () => void;
  onExpire: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onExpire, UNDO_DELETE_MS);
    return () => window.clearTimeout(timer);
  }, [onExpire]);

  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--composer-h,6rem)+0.75rem)] z-20 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-foreground py-1.5 pl-4 pr-1.5 text-sm text-background shadow-lg">
        <span className="min-w-0 truncate">{message}</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onUndo}
          className="shrink-0 rounded-full"
        >
          Undo
        </Button>
      </div>
    </div>
  );
}
