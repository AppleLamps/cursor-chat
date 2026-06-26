"use client";

import { RefObject, useCallback, useState } from "react";
import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import { ChatStreamError, consumeChatStream } from "@/lib/chat-stream";
import { MAX_CHAT_IMAGES } from "@/lib/chat-images";
import { createStreamBuffer } from "@/lib/stream-buffer";
import { mergeThinkingText } from "@/lib/thinking";
import { DEFAULT_BRANCH, type AgentMode } from "@/lib/defaults";
import type {
  ApiError,
  ChatTokenUsage,
  Conversation,
  ImageAttachment,
  Message,
  PdfAttachment
} from "@/lib/chat-types";
import {
  conversationTranscript,
  titleFromMessages,
  uid
} from "@/lib/chat-conversation";
import { copyText } from "@/lib/clipboard";
import { repoLabel } from "@/lib/repo";
import { uniqueSortedSources } from "@/lib/sources";

type UseChatSendOptions = {
  apiKey: string | null;
  activeConversation: Conversation | null;
  activeAgentMode: AgentMode;
  messages: Message[];
  pendingImages: ImageAttachment[];
  pendingPdfs: PdfAttachment[];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  clearDraft: () => void;
  openRepoPicker: (mode: "initial" | "change") => void;
  activeConversationIdRef: RefObject<string>;
  replaceMessagesForConversation: (
    conversationId: string,
    messages: Message[],
    agentId?: string | null,
    agentSessionToken?: string | null
  ) => void;
  patchMessageForConversation: (
    conversationId: string,
    messageId: string,
    patch: Partial<Message>
  ) => void;
  mergeSourceForConversation: (
    conversationId: string,
    messageId: string,
    source: string
  ) => void;
  setExternalSyncPaused: (paused: boolean) => void;
};

export function useChatSend({
  apiKey,
  activeConversation,
  activeAgentMode,
  messages,
  pendingImages,
  pendingPdfs,
  inputRef,
  clearDraft,
  openRepoPicker,
  activeConversationIdRef,
  replaceMessagesForConversation,
  patchMessageForConversation,
  mergeSourceForConversation,
  setExternalSyncPaused
}: UseChatSendOptions) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerNote, setComposerNote] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string, retry = false, baseMessages = messages) => {
      const trimmed = content.trim();
      const imagesForMessage = retry ? [] : pendingImages;
      const pdfsForMessage = retry ? [] : pendingPdfs;
      const messageContent =
        trimmed ||
        (pdfsForMessage.length > 0
          ? "What are the main points in this document?"
          : "What's in this image?");

      if (
        (!trimmed &&
          imagesForMessage.length === 0 &&
          pdfsForMessage.length === 0) ||
        isSending
      ) {
        return;
      }

      if (!activeConversation?.repoUrl) {
        setError("Select a repository before sending a message.");
        openRepoPicker(activeConversation ? "change" : "initial");
        return;
      }

      if (!apiKey) {
        setError("Connect a Cursor API key before sending a message.");
        return;
      }

      const conversationId = activeConversation.id;
      const conversationRepoUrl = activeConversation.repoUrl;
      const conversationBranch = activeConversation.branch || DEFAULT_BRANCH;
      const conversationAgentId = activeConversation.agentId;
      const conversationAgentSessionToken =
        activeConversation.agentSessionToken;
      const conversationAgentMode = activeAgentMode;

      if (pdfsForMessage.length > 0) {
        setError("PDF attachments are not supported. Use images or text.");
        return;
      }

      if (imagesForMessage.length > MAX_CHAT_IMAGES) {
        setError(`You can attach up to ${MAX_CHAT_IMAGES} images per message.`);
        return;
      }

      let implementConfirmed = false;

      if (isImplementMode(conversationAgentMode) && !conversationAgentId) {
        implementConfirmed = window.confirm(
          `Run Implement mode on ${repoLabel(conversationRepoUrl)} (${conversationBranch})?\n\nThe Cursor agent may edit files, commit changes, open a pull request, and use your Cursor account.`
        );

        if (!implementConfirmed) {
          setComposerNote("Implement mode cancelled before starting.");
          return;
        }
      }

      setError(null);
      setComposerNote(null);
      setIsSending(true);
      setExternalSyncPaused(true);

      const userMessage: Message = {
        id: uid(),
        role: "user",
        content: messageContent,
        createdAt: new Date().toISOString(),
        imageAttachments:
          imagesForMessage.length > 0 ? imagesForMessage : undefined,
        pdfAttachments: pdfsForMessage.length > 0 ? pdfsForMessage : undefined
      };

      const cleanMessages = baseMessages.filter((message) => !message.error);
      const optimisticMessages = retry
        ? cleanMessages
        : [...cleanMessages, userMessage];

      replaceMessagesForConversation(conversationId, optimisticMessages);

      if (!retry) {
        clearDraft();
      }

      const assistantId = uid();
      let assistantContent = "";
      let assistantThinking = "";
      let assistantActivity = "Starting Cursor cloud agent...";
      let assistantSources: string[] = [];
      let assistantPrUrl: string | undefined;
      let assistantRunId: string | undefined;
      let assistantRequestId: string | undefined;
      let assistantDurationMs: number | undefined;
      let assistantUsage: ChatTokenUsage | undefined;
      let assistantModelId: string | undefined;
      let resolvedAgentId = conversationAgentId;
      let resolvedAgentSessionToken = conversationAgentSessionToken;
      const streamingAssistant: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        streaming: true,
        activity: assistantActivity
      };

      replaceMessagesForConversation(conversationId, [
        ...optimisticMessages,
        streamingAssistant
      ]);

      const streamBuffer = createStreamBuffer(50, (snapshot) => {
        patchMessageForConversation(conversationId, assistantId, {
          content: snapshot.content,
          thinking: snapshot.thinking || undefined,
          activity: snapshot.activity || undefined
        });
      });
      streamBuffer.setActivity(assistantActivity);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            prompt: messageContent,
            repoUrl: conversationRepoUrl,
            branch: conversationBranch,
            agentId: conversationAgentId,
            agentSessionToken: conversationAgentSessionToken,
            agentMode: conversationAgentMode,
            implementConfirmed,
            images: imagesForMessage.map((image) => ({
              url: image.url,
              mimeType: image.mimeType
            }))
          })
        });

        const contentType = response.headers.get("content-type") || "";

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as ApiError;
          throw new Error(data.error || "The request failed. Please try again.");
        }

        if (!contentType.includes("text/event-stream")) {
          throw new Error("Expected a streaming response from the server.");
        }

        await consumeChatStream(response, {
          onAgent: (agentIdFromStream, agentSessionTokenFromStream) => {
            resolvedAgentId = agentIdFromStream;
            if (agentSessionTokenFromStream) {
              resolvedAgentSessionToken = agentSessionTokenFromStream;
            }
          },
          onText: (delta) => {
            assistantContent += delta;
            streamBuffer.appendText(delta);
          },
          onThinking: (payload) => {
            assistantThinking = mergeThinkingText(assistantThinking, payload);
            streamBuffer.setThinking(assistantThinking);
          },
          onActivity: (activity) => {
            assistantActivity = activity;
            streamBuffer.setActivity(activity);
          },
          onSource: (path) => {
            assistantSources = uniqueSortedSources([...assistantSources, path]);
            mergeSourceForConversation(conversationId, assistantId, path);
          },
          onDone: (payload) => {
            resolvedAgentId = payload.agentId;
            if (payload.agentSessionToken) {
              resolvedAgentSessionToken = payload.agentSessionToken;
            }
            if (payload.result?.trim()) {
              assistantContent = payload.result.trim();
              streamBuffer.setContent(assistantContent);
            }
            if (payload.thinking?.trim()) {
              assistantThinking = mergeThinkingText(assistantThinking, {
                text: payload.thinking.trim()
              });
              streamBuffer.setThinking(assistantThinking);
            }
            if (payload.prUrl?.trim()) {
              assistantPrUrl = payload.prUrl.trim();
            }
            assistantRunId = payload.runId;
            assistantRequestId = payload.requestId;
            assistantDurationMs = payload.durationMs;
            assistantUsage = payload.usage;
            assistantModelId = payload.modelId;
          }
        });

        streamBuffer.flushNow();

        if (!assistantContent.trim()) {
          throw new Error("Cursor returned no assistant content.");
        }

        const assistantMessage: Message = {
          id: assistantId,
          role: "assistant",
          content: assistantContent,
          createdAt: streamingAssistant.createdAt,
          streaming: false,
          thinking: assistantThinking || undefined,
          sources: assistantSources,
          prUrl: assistantPrUrl,
          runId: assistantRunId,
          requestId: assistantRequestId,
          durationMs: assistantDurationMs,
          usage: assistantUsage,
          modelId: assistantModelId
        };
        const finalMessages = [...optimisticMessages, assistantMessage];
        replaceMessagesForConversation(
          conversationId,
          finalMessages,
          resolvedAgentId,
          resolvedAgentSessionToken
        );
        if (activeConversationIdRef.current === conversationId) {
          setComposerNote(
            assistantPrUrl
              ? "Changes submitted. Pull request link is in the answer."
              : isImplementMode(conversationAgentMode)
                ? "Task completed by Cursor cloud agent."
                : isPlanMode(conversationAgentMode)
                  ? "Plan generated by Cursor cloud agent."
                  : "Answer generated by Cursor cloud agent."
          );
        }
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Something went wrong.";
        const errorMessage: Message = {
          id: assistantId,
          role: "assistant",
          content: message,
          createdAt: streamingAssistant.createdAt,
          error: true,
          streaming: false,
          runId: caught instanceof ChatStreamError ? caught.runId : undefined,
          requestId:
            caught instanceof ChatStreamError ? caught.requestId : undefined
        };
        const finalMessages = [...optimisticMessages, errorMessage];
        if (activeConversationIdRef.current === conversationId) {
          setError(message);
        }
        replaceMessagesForConversation(conversationId, finalMessages, null, null);
      } finally {
        setExternalSyncPaused(false);
        setIsSending(false);
        inputRef.current?.focus();
      }
    },
    [
      activeAgentMode,
      activeConversation,
      activeConversationIdRef,
      apiKey,
      clearDraft,
      inputRef,
      isSending,
      mergeSourceForConversation,
      messages,
      openRepoPicker,
      patchMessageForConversation,
      pendingImages,
      pendingPdfs,
      replaceMessagesForConversation,
      setExternalSyncPaused
    ]
  );

  const retryAssistantMessage = useCallback(
    (messageId: string) => {
      const messageIndex = messages.findIndex((message) => message.id === messageId);
      if (messageIndex <= 0) return;

      const previousMessages = messages.slice(0, messageIndex);
      const previousUserMessage = [...previousMessages]
        .reverse()
        .find((message) => message.role === "user");

      if (!previousUserMessage) {
        setError("No user message found to retry.");
        return;
      }

      const nextMessages = previousMessages.filter((message) => !message.error);
      if (activeConversation) {
        replaceMessagesForConversation(activeConversation.id, nextMessages);
      }
      void sendMessage(previousUserMessage.content, true, nextMessages);
    },
    [activeConversation, messages, replaceMessagesForConversation, sendMessage]
  );

  const retryLast = useCallback(() => {
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.content;
    if (!lastUserMessage) return;
    void sendMessage(lastUserMessage, true);
  }, [messages, sendMessage]);

  const copyMessage = useCallback(async (message: Message) => {
    try {
      await copyText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1500);
    } catch {
      setError("Could not copy that message.");
    }
  }, []);

  const shareConversation = useCallback(async () => {
    if (messages.length === 0) {
      setComposerNote("Start a chat before sharing.");
      return;
    }

    const title = activeConversation?.title || titleFromMessages(messages);
    const text = conversationTranscript(title, messages);

    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        setShareStatus("Shared");
      } else {
        await copyText(text);
        setShareStatus("Copied");
        setComposerNote("Conversation transcript copied to clipboard.");
      }

      window.setTimeout(() => setShareStatus(null), 1500);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("Could not share this conversation.");
    }
  }, [activeConversation, messages]);

  return {
    isSending,
    error,
    setError,
    composerNote,
    setComposerNote,
    copiedMessageId,
    shareStatus,
    sendMessage,
    retryAssistantMessage,
    retryLast,
    copyMessage,
    shareConversation
  };
}
