import type { Conversation, Message } from "@/lib/chat-types";
import { isConversation, normalizeConversation } from "@/lib/chat-conversation";

export const HISTORY_EXPORT_FORMAT = "askcursor-history";
export const HISTORY_EXPORT_VERSION = 1;
export const MAX_IMPORT_BYTES = 40 * 1024 * 1024;
export const MAX_IMPORT_CONVERSATIONS = 1_000;
const MAX_ID_LENGTH = 128;

export type HistoryExport = {
  format: typeof HISTORY_EXPORT_FORMAT;
  version: typeof HISTORY_EXPORT_VERSION;
  exportedAt: string;
  conversations: Conversation[];
};

/**
 * Removes what must not leave this browser or be trusted coming back in: the
 * cloud agent link and its signed token (bound to one API key), and live-run
 * state that means nothing elsewhere. Inline images stay when they are data
 * URLs; storage keys and blob URLs only make sense in the browser that made them.
 */
function sanitizeMessage(message: Message): Message {
  const {
    streaming: _streaming,
    recoverable: _recoverable,
    heartbeatAt: _heartbeatAt,
    activity: _activity,
    imageAttachments,
    pdfAttachments,
    ...rest
  } = message;

  const images = imageAttachments
    ?.filter((image) => typeof image?.url === "string" && image.url.startsWith("data:image/"))
    .map(({ storageKey: _storageKey, ...image }) => image);
  const pdfs = pdfAttachments?.filter(
    (pdf) => typeof pdf?.url === "string" && pdf.url.startsWith("data:")
  );

  return {
    ...rest,
    ...(images?.length ? { imageAttachments: images } : {}),
    ...(pdfs?.length ? { pdfAttachments: pdfs } : {})
  };
}

export function sanitizeConversationForTransfer(conversation: Conversation): Conversation {
  const {
    agentId: _agentId,
    agentSessionToken: _agentSessionToken,
    agentArchived: _agentArchived,
    ...rest
  } = conversation;

  return { ...rest, messages: conversation.messages.map(sanitizeMessage) };
}

export function buildHistoryExport(
  conversations: Conversation[],
  now = new Date()
): HistoryExport {
  return {
    format: HISTORY_EXPORT_FORMAT,
    version: HISTORY_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    conversations: conversations.map(sanitizeConversationForTransfer)
  };
}

export function historyExportFilename(now = new Date()) {
  return `askcursor-chats-${now.toISOString().slice(0, 10)}.json`;
}

export type ParsedHistoryImport =
  | { ok: true; conversations: Conversation[]; skipped: number }
  | { ok: false; error: string };

export function parseHistoryImport(
  text: string,
  now = Date.now()
): ParsedHistoryImport {
  if (text.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: "That file is too large to import." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (parsed as { conversations?: unknown }).conversations
      : undefined;

  if (!Array.isArray(list)) {
    return { ok: false, error: "That file does not look like an AskCursor chat export." };
  }

  if (
    !Array.isArray(parsed) &&
    (parsed as { format?: unknown }).format !== undefined &&
    (parsed as { format?: unknown }).format !== HISTORY_EXPORT_FORMAT
  ) {
    return { ok: false, error: "That file does not look like an AskCursor chat export." };
  }

  if (list.length > MAX_IMPORT_CONVERSATIONS) {
    return {
      ok: false,
      error: `That file has more than ${MAX_IMPORT_CONVERSATIONS.toLocaleString()} chats.`
    };
  }

  const conversations: Conversation[] = [];
  let skipped = 0;

  for (const candidate of list) {
    if (
      !isConversation(candidate) ||
      candidate.id.length > MAX_ID_LENGTH ||
      !Number.isFinite(Date.parse(candidate.updatedAt)) ||
      !Number.isFinite(Date.parse(candidate.createdAt))
    ) {
      skipped += 1;
      continue;
    }

    const conversation = normalizeConversation(
      sanitizeConversationForTransfer(candidate),
      now
    );
    conversations.push({
      ...conversation,
      repoUrl: typeof candidate.repoUrl === "string" ? candidate.repoUrl : undefined,
      branch: typeof candidate.branch === "string" ? candidate.branch : undefined
    });
  }

  if (conversations.length === 0) {
    return {
      ok: false,
      error: skipped > 0 ? "No valid chats were found in that file." : "That file has no chats."
    };
  }

  return { ok: true, conversations, skipped };
}

export type ImportPlan = {
  accepted: Conversation[];
  added: number;
  updated: number;
  /** Already present here with the same or a newer update. */
  unchanged: number;
};

/** Adds new chats and takes the imported copy only when it is newer. */
export function planHistoryImport(
  existing: Conversation[],
  incoming: Conversation[]
): ImportPlan {
  const byId = new Map(existing.map((conversation) => [conversation.id, conversation]));
  const accepted: Conversation[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const conversation of incoming) {
    const current = byId.get(conversation.id);

    if (!current) {
      accepted.push(conversation);
      added += 1;
    } else if (Date.parse(conversation.updatedAt) > Date.parse(current.updatedAt)) {
      // Keep this device's link to the cloud agent; the import never has one.
      accepted.push({
        ...conversation,
        agentId: current.agentId,
        agentSessionToken: current.agentSessionToken,
        agentArchived: current.agentArchived
      });
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  return { accepted, added, updated, unchanged };
}

export function describeImport(plan: ImportPlan, skipped: number) {
  const parts = [
    plan.added > 0 ? `${plan.added} added` : null,
    plan.updated > 0 ? `${plan.updated} updated` : null,
    plan.unchanged > 0 ? `${plan.unchanged} already up to date` : null,
    skipped > 0 ? `${skipped} skipped` : null
  ].filter(Boolean);

  return parts.length > 0 ? `Imported chats: ${parts.join(", ")}.` : "Nothing to import.";
}
