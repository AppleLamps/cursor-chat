"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DEFAULT_BRANCH, type AgentMode, type ModelId } from "@/lib/defaults";
import type { Conversation, Message } from "@/lib/chat-types";
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
  serializeConversationsForStorage
} from "@/lib/chat-attachment-storage";
import {
  activeConversation as getActiveConversation,
  conversationReducer
} from "@/lib/chat-reducer";
import {
  STORAGE_KEYS,
  getDefaultAgentMode,
  getDefaultBranch,
  getDefaultModelId,
  getDefaultRepo,
  setDefaultAgentMode,
  setDefaultBranch,
  setDefaultModelId,
  setDefaultRepo
} from "@/lib/storage";

type UseConversationStoreOptions = {
  apiKey: string | null;
  onError: (message: string) => void;
};

const STORAGE_KEY = STORAGE_KEYS.CONVERSATIONS;

async function parseStoredConversations(raw: string | null) {
  const parsed = raw ? (JSON.parse(raw) as unknown) : [];
  return Array.isArray(parsed)
    ? sortConversations(
        await hydrateConversationsFromStorage(
          parsed.filter(isConversation).map(normalizeConversation)
        )
      )
    : [];
}

export function useConversationStore({
  apiKey,
  onError
}: UseConversationStoreOptions) {
  const [state, dispatch] = useReducer(conversationReducer, {
    conversations: [],
    activeConversationId: createConversation().id
  });
  const [hasHydrated, setHasHydrated] = useState(false);
  const seededDefaultConversationRef = useRef(false);
  const persistenceRunRef = useRef(0);
  const externalSyncPausedRef = useRef(false);
  const pendingExternalStorageRef = useRef<string | null | undefined>(undefined);

  const activeConversation = getActiveConversation(state);
  const messages = activeConversation?.messages ?? [];
  const activeAgentMode = resolveConversationAgentMode(activeConversation);
  const activeModelId = resolveConversationModelId(activeConversation);
  const activeConversationIdRef = useRef(state.activeConversationId);
  activeConversationIdRef.current = state.activeConversationId;

  const hydrateExternalStorage = useCallback(
    async (raw: string | null, preferredActiveId?: string) => {
      const saved = await parseStoredConversations(raw);
      dispatch({
        type: "hydrate",
        conversations: saved,
        activeConversationId: preferredActiveId
      });
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrateHistory() {
      try {
        const saved = await parseStoredConversations(
          window.localStorage.getItem(STORAGE_KEY)
        );

        if (cancelled) return;

        if (saved.length > 0) {
          dispatch({
            type: "hydrate",
            conversations: saved,
            activeConversationId: saved[0]?.id
          });
        }
      } catch {
        if (!cancelled) {
          window.localStorage.removeItem(STORAGE_KEY);
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

  useEffect(() => {
    if (!hasHydrated) return;

    const run = persistenceRunRef.current + 1;
    persistenceRunRef.current = run;

    void (async () => {
      try {
        const {
          conversations: serializedConversations,
          activeImageKeys
        } = await serializeConversationsForStorage(state.conversations);

        if (persistenceRunRef.current !== run) return;

        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(serializedConversations)
        );
        void pruneStoredImages(activeImageKeys).catch(() => undefined);
      } catch {
        if (persistenceRunRef.current === run) {
          onError("Could not save chat history in this browser.");
        }
      }
    })();
  }, [state.conversations, hasHydrated, onError]);

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
        getDefaultModelId()
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

  const createAndActivateConversation = useCallback((conversation: Conversation) => {
    dispatch({ type: "create", conversation });
  }, []);

  const activateConversation = useCallback((conversation: Conversation) => {
    dispatch({ type: "activate", conversation });
  }, []);

  const updateConversationRepo = useCallback(
    (id: string, repoUrl: string, branch: string, modelId: ModelId) => {
      dispatch({ type: "change-repo", id, repoUrl, branch, modelId });
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
    (modelId: ModelId) => {
      if (!activeConversation || messages.length > 0) return;
      dispatch({ type: "change-model", id: activeConversation.id, modelId });
    },
    [activeConversation, messages.length]
  );

  const deleteConversation = useCallback((id: string) => {
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
      modelId: ModelId
    ) => {
      setDefaultRepo(repoUrl);
      setDefaultBranch(branch);
      setDefaultAgentMode(agentMode);
      setDefaultModelId(modelId);
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
      createAndActivateConversation,
      activateConversation,
      updateConversationRepo,
      setActiveConversationAgentMode,
      setActiveConversationModelId,
      deleteConversation,
      renameConversation,
      replaceMessagesForConversation,
      patchMessageForConversation,
      mergeSourceForConversation,
      setExternalSyncPaused,
      rememberRepoSelection,
      resetDefaultSeed
    ]
  );
}
