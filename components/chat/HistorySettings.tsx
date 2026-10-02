"use client";

import { useRef, useState } from "react";

type ImportResult = { ok: boolean; message: string };

export default function HistorySettings({
  onExport,
  onImport
}: {
  onExport: () => void;
  onImport: (file: File) => Promise<ImportResult>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    setBusy(true);
    setResult(null);
    try {
      setResult(await onImport(file));
    } catch {
      setResult({ ok: false, message: "That file could not be imported." });
    } finally {
      setBusy(false);
      // Lets the same file be chosen again.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="py-4">
      <p className="text-xs text-[#8a8a8a]">Chat history</p>
      <p className="mt-0.5 text-sm leading-5 text-[#303030]">
        Chats live only in this browser. Export a copy to back them up or move
        them to another device.
      </p>
      <p className="mt-1 text-xs leading-5 text-[#8a8a8a]">
        Exports include your questions, answers and attached images, but not
        your keys or links to cloud agents.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onExport}
          className="min-h-11 rounded-full border border-[#d9d9d9] px-4 py-2 text-sm font-medium text-[#444] transition hover:bg-[#f1f1f1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bdbdbd] md:min-h-0 md:px-3 md:py-1.5 md:text-xs"
        >
          Export chats
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="min-h-11 rounded-full border border-[#d9d9d9] px-4 py-2 text-sm font-medium text-[#444] transition hover:bg-[#f1f1f1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bdbdbd] disabled:opacity-50 md:min-h-0 md:px-3 md:py-1.5 md:text-xs"
        >
          {busy ? "Importing…" : "Import chats"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          aria-label="Choose a chat export file"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>

      <p
        role="status"
        className={`mt-2 text-xs leading-5 ${
          result && !result.ok ? "text-red-700" : "text-[#1a7f37]"
        }`}
      >
        {result?.message}
      </p>
    </div>
  );
}
