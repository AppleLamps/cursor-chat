import type { Conversation } from "@/lib/chat-types";
import {
  encodeConversationStorage,
  type ConversationTombstones
} from "@/lib/conversation-sync";

export type PersistOutcome =
  | { ok: true; trimmed: boolean }
  | { ok: false; reason: "quota" | "unavailable" };

/** How many of the most recent conversations keep their agent trace on a trim. */
export const KEEP_TRACE_FOR_CONVERSATIONS = 2;

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, code } = error as { name?: string; code?: number };
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

/**
 * Reasoning text and the step-by-step trace are by far the largest part of a
 * saved chat and the least valuable once the answer exists. When storage is
 * full, drop them from everything except the most recent conversations.
 * Conversations are expected newest first.
 */
export function trimConversationsForQuota(
  conversations: Conversation[],
  keepTraceFor = KEEP_TRACE_FOR_CONVERSATIONS
): Conversation[] {
  return conversations.map((conversation, index) => {
    if (index < keepTraceFor) return conversation;

    return {
      ...conversation,
      messages: conversation.messages.map((message) => {
        if (!message.trace && !message.thinking && !message.activityLog) {
          return message;
        }

        const { trace: _trace, thinking: _thinking, activityLog: _log, ...rest } =
          message;
        return rest;
      })
    };
  });
}

function tryWrite(
  storage: Pick<Storage, "setItem">,
  key: string,
  conversations: Conversation[],
  tombstones: ConversationTombstones
) {
  storage.setItem(
    key,
    JSON.stringify(encodeConversationStorage(conversations, tombstones))
  );
}

/**
 * Writes the conversation list, and if the browser says storage is full,
 * retries once without the bulky trace data before giving up. Never throws.
 */
export function persistHistory(
  storage: Pick<Storage, "setItem">,
  key: string,
  conversations: Conversation[],
  tombstones: ConversationTombstones
): PersistOutcome {
  try {
    tryWrite(storage, key, conversations, tombstones);
    return { ok: true, trimmed: false };
  } catch (error) {
    if (!isQuotaError(error)) return { ok: false, reason: "unavailable" };
  }

  try {
    tryWrite(storage, key, trimConversationsForQuota(conversations), tombstones);
    return { ok: true, trimmed: true };
  } catch (error) {
    return { ok: false, reason: isQuotaError(error) ? "quota" : "unavailable" };
  }
}

const CORRUPT_BACKUP_SUFFIX = "-corrupt";

/**
 * Keep an unreadable history instead of deleting it, so a bad record or a
 * version mismatch cannot silently wipe someone's chats. Older backups are
 * removed only after the new copy has been stored successfully.
 */
export function backupCorruptHistory(
  storage: Pick<Storage, "setItem" | "removeItem" | "length" | "key">,
  key: string,
  raw: string | null
) {
  if (!raw) return false;

  const stale: string[] = [];
  try {
    const prefix = `${key}${CORRUPT_BACKUP_SUFFIX}-`;
    for (let index = 0; index < storage.length; index += 1) {
      const name = storage.key(index);
      if (name?.startsWith(prefix)) stale.push(name);
    }

    // Multiple failures can occur in one millisecond. Never overwrite an
    // existing backup before the new copy has been saved.
    const base = `${prefix}${Date.now()}`;
    const existing = new Set(stale);
    let backupKey = base;
    let suffix = 1;
    while (existing.has(backupKey)) backupKey = `${base}-${suffix++}`;

    storage.setItem(backupKey, raw);
  } catch {
    return false;
  }

  // Cleanup is best effort: its failure does not undo a successful backup.
  for (const name of stale) {
    try {
      storage.removeItem(name);
    } catch {
      // Retaining an extra recovery copy is safer than discarding the new one.
    }
  }
  return true;
}
