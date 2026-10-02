"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DEFAULT_BRANCH, type AgentMode, type ModelId } from "@/lib/defaults";
import type { Conversation, Message } from "@/lib/chat-types";
import type { ModelSelection } from "@/lib/model-client";
import {
  createConversation,
  isConversation,
  latestPrUrl,
  latestUserMessage,
  normalizeConversation,
  resolveConversationAgentMode,
  resolveConversationModelId,
  sortConversations
} from "@/lib/chat-conversation";
import {
  hydrateConversationsFromStorage,
  pruneStoredImages,
  serializeConversationsForStorage,
  serializeConversationsSync,
  writePendingImages
} from "@/lib/chat-attachment-storage";
import { backupCorruptHistory, persistHistory } from "@/lib/history-storage";
import {
  activeConversation as getActiveConversation,
  conversationReducer
} from "@/lib/chat-reducer";
import {
  STORAGE_KEYS,
  getDefaultAgentMode,
  getDefaultBranch,
  getDefaultModelId,
  getDefaultModel,
  getDefaultRepo,
  setDefaultAgentMode,
  setDefaultBranch,
  setDefaultModelId,
  setDefaultModel,
  setDefaultRepo
} from "@/lib/storage";
import {
  decodeConversationStorage,
  encodeConversationStorage,
  mergeConversationSnapshots,
  type ConversationTombstones
} from "@/lib/conversation-sync";

type UseConversationStoreOptions = {
  apiKey: string | null;
};

const STORAGE_KEY = STORAGE_KEYS.CONVERSATIONS;

/** Wait this long after the last change before writing the whole history. */
const PERSIST_DEBOUNCE_MS = 600;

const STORAGE_FULL_WARNING =
  "Browser storage is full, so new messages are not being saved. Delete old chats to free space.";
const STORAGE_TRIMMED_WARNING =
  "Browser storage is nearly full. Older chats lost their reasoning trace to make room.";
const STORAGE_BLOCKED_WARNING =
  "This browser is blocking site storage, so your chats will be lost when you close the tab.";
const STORAGE_UNREADABLE_WARNING =
  "Your saved chats could not be read. A backup copy was kept in this browser.";

async function parseStoredConversations(raw: string | null) {
  const decoded = decodeConversationStorage(raw);
  const now = Date.now();
  const conversations = sortConversations(
    await hydrateConversationsFromStorage(
      decoded.conversations
        .filter(isConversation)
        // Explicit arrow: map would pass the index as normalizeConversation's `now`.
        .map((conversation) => normalizeConversation(conversation, now))
    )
  );
  return { conversations, tombstones: decoded.tombstones };
}

export function useConversationStore({ apiKey }: UseConversationStoreOptions) {
  const [state, dispatch] = useReducer(conversationReducer, {
    conversations: [],
    activeConversationId: createConversation().id
  });
  const [hasHydrated, setHasHydrated] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const seededDefaultConversationRef = useRef(false);
  const persistenceRunRef = useRef(0);
  const persistTimerRef = useRef<number | null>(null);
  const externalSyncPausedRef = useRef(false);
  const pendingExternalStorageRef = useRef<string | null | undefined>(undefined);
  const tombstonesRef = useRef<ConversationTombstones>({});
  const stateRef = useRef(state);
  stateRef.current = state;

  const activeConversation = getActiveConversation(state);
  const messages = activeConversation?.messages ?? [];
  const activeAgentMode = resolveConversationAgentMode(activeConversation);
  const activeModelId = resolveConversationModelId(activeConversation);
  const activeConversationIdRef = useRef(state.activeConversationId);
  activeConversationIdRef.current = state.activeConversationId;

  const hydrateExternalStorage = useCallback(
    async (raw: string | null, preferredActiveId?: string) => {
      const saved = await parseStoredConversations(raw);
      const merged = mergeConversationSnapshots(
        stateRef.current.conversations,
        saved.conversations,
        tombstonesRef.current,
        saved.tombstones
      );
      tombstonesRef.current = merged.tombstones;
      dispatch({
        type: "hydrate",
        conversations: merged.conversations,
        activeConversationId: preferredActiveId
      });
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrateHistory() {
      let raw: string | null = null;

      try {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        if (!cancelled) {
          setStorageWarning(STORAGE_BLOCKED_WARNING);
          setHasHydrated(true);
        }
        return;
      }

      try {
        const saved = await parseStoredConversations(raw);

        if (cancelled) return;

        tombstonesRef.current = saved.tombstones;
        if (saved.conversations.length > 0) {
          dispatch({
            type: "hydrate",
            conversations: saved.conversations,
            activeConversationId: saved.conversations[0]?.id
          });
        }
      } catch {
        if (!cancelled) {
          // Keep what we could not read before the next save replaces it.
          const kept = backupCorruptHistory(window.localStorage, STORAGE_KEY, raw);
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch {
            // Nothing more to do.
          }
          setStorageWarning(kept ? STORAGE_UNREADABLE_WARNING : STORAGE_BLOCKED_WARNING);
        }
      } finally {
        if (!cancelled) setHasHydrated(true);
      }
    }

    void hydrateHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  const persistNow = useCallback(async () => {
    const run = persistenceRunRef.current + 1;
    persistenceRunRef.current = run;

    try {
      const { conversations: serialized, activeImageKeys } =
        await serializeConversationsForStorage(stateRef.current.conversations);

      if (persistenceRunRef.current !== run) return;

      const outcome = persistHistory(
        window.localStorage,
        STORAGE_KEY,
        serialized,
        tombstonesRef.current
      );

      if (outcome.ok) {
        setStorageWarning((current) =>
          outcome.trimmed
            ? STORAGE_TRIMMED_WARNING
            : current === STORAGE_FULL_WARNING || current === STORAGE_TRIMMED_WARNING
              ? null
              : current
        );
        void pruneStoredImages(activeImageKeys).catch(() => undefined);
      } else {
        setStorageWarning(
          outcome.reason === "quota" ? STORAGE_FULL_WARNING : STORAGE_BLOCKED_WARNING
        );
      }
    } catch {
      if (persistenceRunRef.current === run) {
        setStorageWarning(STORAGE_BLOCKED_WARNING);
      }
    }
  }, []);

  // Save shortly after the last change rather than on every streamed token and
  // keystroke: the whole history is one JSON string, so each save is O(history).
  useEffect(() => {
    if (!hasHydrated) return;

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      void persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }, [state.conversations, hasHydrated, persistNow]);

  // A pending save must not be lost when the tab is hidden, closed or unmounted.
  // Synchronous on purpose: async work is not guaranteed to finish at pagehide.
  const flushPendingSave = useCallback(() => {
    if (persistTimerRef.current === null) return;

    window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = null;

    try {
      const { conversations, pendingWrites } = serializeConversationsSync(
        stateRef.current.conversations
      );
      void writePendingImages(pendingWrites);
      persistHistory(window.localStorage, STORAGE_KEY, conversations, tombstonesRef.current);
    } catch {
      // Best effort while the page is going away.
    }
  }, []);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "hidden") flushPendingSave();
    }

    window.addEventListener("pagehide", flushPendingSave);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pagehide", flushPendingSave);
      document.removeEventListener("visibilitychange", handleVisibility);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  useEffect(() => {
    if (!hasHydrated || !apiKey || seededDefaultConversationRef.current) return;

    if (state.conversations.length > 0) {
      seededDefaultConversationRef.current = true;
      return;
    }

    const defaultRepo = getDefaultRepo();
    if (!defaultRepo) return;

    seededDefaultConversationRef.current = true;
    dispatch({
      type: "create",
      conversation: createConversation(
        defaultRepo,
        getDefaultBranch() || DEFAULT_BRANCH,
        getDefaultAgentMode(),
        getDefaultModelId(),
        getDefaultModel()
      )
    });
  }, [hasHydrated, apiKey, state.conversations.length]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;

      if (externalSyncPausedRef.current) {
        pendingExternalStorageRef.current = event.newValue;
        return;
      }

      void hydrateExternalStorage(event.newValue, activeConversationIdRef.current);
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [hydrateExternalStorage]);

  const setExternalSyncPaused = useCallback(
    (paused: boolean) => {
      externalSyncPausedRef.current = paused;
      if (paused || pendingExternalStorageRef.current === undefined) return;

      const raw = pendingExternalStorageRef.current;
      pendingExternalStorageRef.current = undefined;
      void hydrateExternalStorage(raw, activeConversationIdRef.current);
    },
    [hydrateExternalStorage]
  );

  const dismissStorageWarning = useCallback(() => setStorageWarning(null), []);

  const createAndActivateConversation = useCallback((conversation: Conversation) => {
    delete tombstonesRef.current[conversation.id];
    dispatch({ type: "create", conversation });
  }, []);

  const activateConversation = useCallback((conversation: Conversation) => {
    dispatch({ type: "activate", conversation });
  }, []);

  const updateConversationRepo = useCallback(
    (id: string, repoUrl: string, branch: string, model: ModelSelection) => {
      dispatch({ type: "change-repo", id, repoUrl, branch, modelId: model.id, model });
    },
    []
  );

  const setActiveConversationAgentMode = useCallback(
    (mode: AgentMode) => {
      if (!activeConversation || messages.length > 0) return;
      dispatch({ type: "change-mode", id: activeConversation.id, mode });
    },
    [activeConversation, messages.length]
  );

  const setActiveConversationModelId = useCallback(
    (model: ModelSelection) => {
      if (!activeConversation || messages.length > 0) return;
      dispatch({ type: "change-model", id: activeConversation.id, modelId: model.id, model });
    },
    [activeConversation, messages.length]
  );

  const deleteConversation = useCallback((id: string) => {
    tombstonesRef.current[id] = new Date().toISOString();
    dispatch({ type: "delete", id });
  }, []);

  const renameConversation = useCallback(
    (id: string) => {
      const conversation = state.conversations.find((item) => item.id === id);
      if (!conversation) return;

      const nextTitle = window.prompt("Rename chat", conversation.title)?.trim();
      if (!nextTitle) return;

      dispatch({ type: "rename", id, title: nextTitle });
    },
    [state.conversations]
  );

  const replaceMessagesForConversation = useCallback(
    (
      conversationId: string,
      nextMessages: Message[],
      nextAgentId?: string | null,
      nextAgentSessionToken?: string | null
    ) => {
      dispatch({
        type: "replace-messages",
        conversationId,
        messages: nextMessages,
        agentId: nextAgentId,
        agentSessionToken: nextAgentSessionToken
      });
    },
    []
  );

  const patchMessageForConversation = useCallback(
    (conversationId: string, messageId: string, patch: Partial<Message>) => {
      dispatch({ type: "patch-message", conversationId, messageId, patch });
    },
    []
  );

  const patchAgentSessionForConversation = useCallback(
    (
      conversationId: string,
      agentId: string,
      agentSessionToken?: string
    ) => {
      dispatch({
        type: "patch-agent-session",
        conversationId,
        agentId,
        agentSessionToken
      });
    },
    []
  );

  const patchAgentLifecycleForConversation = useCallback(
    (
      conversationId: string,
      lifecycle: { archived?: boolean; deleted?: boolean }
    ) => {
      dispatch({
        type: "patch-agent-lifecycle",
        conversationId,
        ...lifecycle
      });
    },
    []
  );

  const mergeSourceForConversation = useCallback(
    (conversationId: string, messageId: string, source: string) => {
      dispatch({ type: "merge-source", conversationId, messageId, source });
    },
    []
  );

  const rememberRepoSelection = useCallback(
    (
      repoUrl: string,
      branch: string,
      agentMode: AgentMode,
      model: ModelSelection
    ) => {
      setDefaultRepo(repoUrl);
      setDefaultBranch(branch);
      setDefaultAgentMode(agentMode);
      setDefaultModel(model);
    },
    []
  );

  const resetDefaultSeed = useCallback(() => {
    seededDefaultConversationRef.current = false;
  }, []);

  return useMemo(
    () => ({
      conversations: state.conversations,
      activeConversationId: state.activeConversationId,
      activeConversation,
      activeConversationIdRef,
      messages,
      activeAgentMode,
      activeModelId,
      hasHydrated,
      storageWarning,
      dismissStorageWarning,
      canChangeAgentMode: messages.length === 0,
      lastUserMessage: latestUserMessage(messages),
      lastAssistantErrored: messages[messages.length - 1]?.error === true,
      latestPrUrl: latestPrUrl(messages),
      createAndActivateConversation,
      activateConversation,
      updateConversationRepo,
      setActiveConversationAgentMode,
      setActiveConversationModelId,
      deleteConversation,
      renameConversation,
      replaceMessagesForConversation,
      patchMessageForConversation,
      patchAgentSessionForConversation,
      patchAgentLifecycleForConversation,
      mergeSourceForConversation,
      setExternalSyncPaused,
      rememberRepoSelection,
      resetDefaultSeed
    }),
    [
      state.conversations,
      state.activeConversationId,
      activeConversation,
      messages,
      activeAgentMode,
      activeModelId,
      hasHydrated,
      storageWarning,
      dismissStorageWarning,
      createAndActivateConversation,
      activateConversation,
      updateConversationRepo,
      setActiveConversationAgentMode,
      setActiveConversationModelId,
      deleteConversation,
      renameConversation,
      replaceMessagesForConversation,
      patchMessageForConversation,
      patchAgentSessionForConversation,
      patchAgentLifecycleForConversation,
      mergeSourceForConversation,
      setExternalSyncPaused,
      rememberRepoSelection,
      resetDefaultSeed
    ]
  );
}
