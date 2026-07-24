import type { Conversation } from "@/lib/chat-types";
import { sortConversations } from "@/lib/chat-conversation";

export const CONVERSATION_STORAGE_VERSION = 2;
const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type ConversationTombstones = Record<string, string>;

export type ConversationStoragePayload = {
  version: typeof CONVERSATION_STORAGE_VERSION;
  conversations: unknown[];
  tombstones: ConversationTombstones;
};

export function decodeConversationStorage(raw: string | null): {
  conversations: unknown[];
  tombstones: ConversationTombstones;
} {
  const parsed = raw ? (JSON.parse(raw) as unknown) : [];

  if (Array.isArray(parsed)) {
    return { conversations: parsed, tombstones: {} };
  }

  if (!parsed || typeof parsed !== "object") {
    return { conversations: [], tombstones: {} };
  }

  const candidate = parsed as Partial<ConversationStoragePayload>;
  return {
    conversations: Array.isArray(candidate.conversations)
      ? candidate.conversations
      : [],
    tombstones:
      candidate.tombstones &&
      typeof candidate.tombstones === "object" &&
      !Array.isArray(candidate.tombstones)
        ? Object.fromEntries(
            Object.entries(candidate.tombstones).filter(
              ([id, deletedAt]) =>
                Boolean(id) &&
                typeof deletedAt === "string" &&
                Number.isFinite(Date.parse(deletedAt))
            )
          )
        : {}
  };
}

export function encodeConversationStorage(
  conversations: unknown[],
  tombstones: ConversationTombstones
): ConversationStoragePayload {
  return {
    version: CONVERSATION_STORAGE_VERSION,
    conversations,
    tombstones: pruneConversationTombstones(tombstones)
  };
}

export function mergeConversationSnapshots(
  local: Conversation[],
  external: Conversation[],
  localTombstones: ConversationTombstones,
  externalTombstones: ConversationTombstones
) {
  const tombstones = pruneConversationTombstones(
    [...Object.entries(localTombstones), ...Object.entries(externalTombstones)].reduce(
      (latest, [id, deletedAt]) => {
        if (
          !latest[id] ||
          Date.parse(deletedAt) > Date.parse(latest[id])
        ) {
          latest[id] = deletedAt;
        }
        return latest;
      },
      {} as ConversationTombstones
    )
  );
  const byId = new Map<string, Conversation>();

  for (const conversation of [...local, ...external]) {
    const existing = byId.get(conversation.id);
    if (
      !existing ||
      Date.parse(conversation.updatedAt) > Date.parse(existing.updatedAt)
    ) {
      byId.set(conversation.id, conversation);
    }
  }

  for (const [id, deletedAt] of Object.entries(tombstones)) {
    const conversation = byId.get(id);
    if (
      conversation &&
      Date.parse(deletedAt) >= Date.parse(conversation.updatedAt)
    ) {
      byId.delete(id);
    }
  }

  return {
    conversations: sortConversations([...byId.values()]),
    tombstones
  };
}

export function pruneConversationTombstones(
  tombstones: ConversationTombstones,
  now = Date.now()
) {
  return Object.fromEntries(
    Object.entries(tombstones).filter(([, deletedAt]) => {
      const timestamp = Date.parse(deletedAt);
      return Number.isFinite(timestamp) && now - timestamp < TOMBSTONE_RETENTION_MS;
    })
  );
}
