import {
  MAX_IMPORT_BYTES,
  historyExportFilename,
  parseHistoryImport,
  type HistoryExport,
  type ParsedHistoryImport
} from "@/lib/history-transfer";

/** Saves the export through a temporary link; nothing is uploaded anywhere. */
export function downloadHistoryFile(data: HistoryExport) {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = historyExportFilename();
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function readHistoryFile(file: File): Promise<ParsedHistoryImport> {
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, error: "That file is too large to import." };
  }

  try {
    return parseHistoryImport(await file.text());
  } catch {
    return { ok: false, error: "That file could not be read." };
  }
}
