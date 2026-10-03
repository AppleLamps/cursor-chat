"use client";

import { RefObject, useCallback, useRef, useState } from "react";
import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import {
  ChatStreamError,
  consumeChatStream,
  isRecoverableStreamFailure
} from "@/lib/chat-stream";
import { isCoarsePointer } from "@/lib/touch";
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
import type { ModelSelection } from "@/lib/model-client";
import {
  conversationTranscript,
  resolveConversationModelId,
  resolveConversationModel,
  titleFromMessages,
  uid
} from "@/lib/chat-conversation";
import { copyText } from "@/lib/clipboard";
import { repoLabel } from "@/lib/repo";
import { uniqueSortedSources } from "@/lib/sources";
import { useAgentRequestController } from "@/hooks/useAgentRequestController";

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
  patchAgentSessionForConversation: (
    conversationId: string,
    agentId: string,
    agentSessionToken?: string
  ) => void;
  mergeSourceForConversation: (
    conversationId: string,
    messageId: string,
    source: string
  ) => void;
  setExternalSyncPaused: (paused: boolean) => void;
};

type ActiveRunIdentity = {
  agentId: string;
  agentSessionToken?: string;
  runId: string;
  repoUrl: string;
  branch: string;
  agentMode: AgentMode;
  modelId: string;
  model: ModelSelection;
};

/**
 * Retry re-attaches to the old run only when the connection was lost (the run
 * may still be going or have finished). In every other case it sends the prompt
 * again under a new turn id, so the server treats it as a new run instead of
 * replaying the old one.
 */
function recoveryFor(
  assistantMessage: Message | undefined,
  userMessage: Message
): Pick<Message, "runId" | "turnId"> {
  return assistantMessage?.error &&
    assistantMessage.recoverable &&
    assistantMessage.runId
    ? { runId: assistantMessage.runId, turnId: userMessage.turnId }
    : { turnId: uid() };
}

/** How long Stop waits before warning that agent startup is taking a while. */
const STOP_WAIT_FOR_RUN_MS = 20_000;
/** Heartbeat so a reload can tell a live reply from an abandoned one. */
const MESSAGE_HEARTBEAT_MS = 10_000;

/**
 * Asks the server to cancel a cloud run. Resolves false when it could not be
 * confirmed, so the UI never claims a run stopped when it may still be going.
 */
async function requestRunCancel(apiKey: string, run: ActiveRunIdentity) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/chat/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, ...run }),
        keepalive: true,
        signal: AbortSignal.timeout(10_000)
      });

      if (response.ok) {
        const result = await response.json();
        return result.cancelled === true && result.runId === run.runId;
      }

      // Auth/validation failures will not improve on a second try.
      const transient = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!transient) return false;
    } catch {
      // Network error: fall through to one retry.
    }

    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  return false;
}

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
  patchAgentSessionForConversation,
  mergeSourceForConversation,
  setExternalSyncPaused
}: UseChatSendOptions) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerNote, setComposerNote] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const activeRunRef = useRef<ActiveRunIdentity | null>(null);
  const cancellingRunRef = useRef<ActiveRunIdentity | null>(null);
  const cancelledRunIdRef = useRef<string | null>(null);
  const cancellationPromiseRef = useRef<Promise<void> | null>(null);
  // Synchronous guards: state lags a render, so two quick taps could both pass.
  const isSendingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const stopWaitTimerRef = useRef<number | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const { beginRequest, clearRequest, stopRequest } =
    useAgentRequestController();

  const clearStopWait = useCallback(() => {
    if (stopWaitTimerRef.current !== null) {
      window.clearTimeout(stopWaitTimerRef.current);
      stopWaitTimerRef.current = null;
    }
  }, []);

  // Keep the stream and Stop control attached until the server confirms cancel.
  // A late response must never abort a newer request or overwrite its status.
  const cancelRunAndAbort = useCallback(
    (run: ActiveRunIdentity) => {
      if (cancellingRunRef.current === run) return;
      cancellingRunRef.current = run;
      setComposerNote("Stopping... confirming cancellation with Cursor.");

      cancellationPromiseRef.current = (apiKey ? requestRunCancel(apiKey, run) : Promise.resolve(false)).then(
        (cancelled) => {
          if (cancellingRunRef.current === run) cancellingRunRef.current = null;
          if (activeRunRef.current !== run) return;
          if (cancelled) {
            cancelledRunIdRef.current = run.runId;
            setComposerNote("Agent run stopped.");
            stopRequest();
          } else {
            setComposerNote(
              "Could not confirm the run was cancelled. It may still be running and using your Cursor account. Still connected; press Stop to retry."
            );
          }
        }
      );
    },
    [apiKey, stopRequest]
  );

  const stopGenerating = useCallback(() => {
    if (!isSendingRef.current) return;

    const activeRun = activeRunRef.current;
    if (activeRun) {
      cancelRunAndAbort(activeRun);
      return;
    }

    // No run id yet (the agent is still starting). Aborting now would detach
    // from a run we could never cancel, so wait for the id and cancel it then.
    if (stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    setComposerNote("Stopping... waiting for the agent to start so it can be cancelled.");
    stopWaitTimerRef.current = window.setTimeout(() => {
      stopWaitTimerRef.current = null;
      if (!stopRequestedRef.current) return;
      setComposerNote(
        "Cancellation is still pending while the agent starts. Staying connected so it can be cancelled when its run ID arrives."
      );
    }, STOP_WAIT_FOR_RUN_MS);
  }, [cancelRunAndAbort]);

  const sendMessage = useCallback(
    async (
      content: string,
      retry = false,
      baseMessages = messages,
      retryAttachments?: Pick<Message, "imageAttachments" | "pdfAttachments">,
      recovery?: Pick<Message, "runId" | "turnId">
    ) => {
      const trimmed = content.trim();
      const imagesForMessage = retry
        ? retryAttachments?.imageAttachments ?? []
        : pendingImages;
      const pdfsForMessage = retry
        ? retryAttachments?.pdfAttachments ?? []
        : pendingPdfs;
      const messageContent =
        trimmed ||
        (pdfsForMessage.length > 0
          ? "What are the main points in this document?"
          : "What's in this image?");

      if (
        (!trimmed &&
          imagesForMessage.length === 0 &&
          pdfsForMessage.length === 0) ||
        isSending ||
        isSendingRef.current
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
      const conversationModelId = resolveConversationModelId(activeConversation);
      const conversationModel = resolveConversationModel(activeConversation);

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
      isSendingRef.current = true;
      stopRequestedRef.current = false;
      cancelledRunIdRef.current = null;
      setIsSending(true);
      setExternalSyncPaused(true);

      const turnId = retry
        ? recovery?.turnId ??
          [...baseMessages].reverse().find((message) => message.role === "user")
            ?.turnId ??
          uid()
        : uid();
      const userMessage: Message = {
        id: uid(),
        role: "user",
        content: messageContent,
        createdAt: new Date().toISOString(),
        imageAttachments:
          imagesForMessage.length > 0 ? imagesForMessage : undefined,
        pdfAttachments: pdfsForMessage.length > 0 ? pdfsForMessage : undefined,
        turnId
      };

      const cleanMessages = baseMessages.filter((message) => !message.error);
      const retriedUserMessageId = retry
        ? [...cleanMessages].reverse().find((message) => message.role === "user")
            ?.id
        : undefined;
      const optimisticMessages = retry
        ? cleanMessages.map((message) =>
            message.id === retriedUserMessageId && message.turnId !== turnId
              ? { ...message, turnId }
              : message
          )
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
      let reasoningStarted = false;
      let replyStarted = false;
      let resolvedAgentId = conversationAgentId;
      let resolvedAgentSessionToken = conversationAgentSessionToken;
      const streamingAssistant: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        streaming: true,
        heartbeatAt: Date.now(),
        activity: assistantActivity,
        activityLog: [assistantActivity],
        turnId
      };

      replaceMessagesForConversation(conversationId, [
        ...optimisticMessages,
        streamingAssistant
      ]);

      const streamBuffer = createStreamBuffer(50, (snapshot) => {
        patchMessageForConversation(conversationId, assistantId, {
          content: snapshot.content,
          thinking: snapshot.thinking || undefined,
          activity: snapshot.activity || undefined,
          activityLog: snapshot.activityLog.length
            ? snapshot.activityLog
            : undefined,
          trace: snapshot.trace.length ? snapshot.trace : undefined
        });
      });
      streamBuffer.setActivity(assistantActivity);
      const requestController = beginRequest();
      const heartbeat = window.setInterval(() => {
        patchMessageForConversation(conversationId, assistantId, {
          heartbeatAt: Date.now()
        });
      }, MESSAGE_HEARTBEAT_MS);

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
            modelId: conversationModelId,
            model: conversationModel,
            implementConfirmed,
            images: imagesForMessage.map((image) => ({
              url: image.url,
              mimeType: image.mimeType
            })),
            turnId,
            recoverRunId: recovery?.runId
          }),
          signal: requestController.signal
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
            patchAgentSessionForConversation(
              conversationId,
              agentIdFromStream,
              agentSessionTokenFromStream
            );
          },
          onRun: (payload) => {
            resolvedAgentId = payload.agentId;
            resolvedAgentSessionToken =
              payload.agentSessionToken ?? resolvedAgentSessionToken;
            assistantRunId = payload.runId;
            activeRunRef.current = {
              agentId: payload.agentId,
              agentSessionToken: payload.agentSessionToken,
              runId: payload.runId,
              repoUrl: conversationRepoUrl,
              branch: conversationBranch,
              agentMode: conversationAgentMode,
              modelId: conversationModelId,
              model: conversationModel
            };
            patchAgentSessionForConversation(
              conversationId,
              payload.agentId,
              payload.agentSessionToken
            );
            patchMessageForConversation(conversationId, assistantId, {
              runId: payload.runId,
              turnId
            });

            if (stopRequestedRef.current) {
              stopRequestedRef.current = false;
              clearStopWait();
              const run = activeRunRef.current;
              if (run) cancelRunAndAbort(run);
            }
          },
          onText: (delta) => {
            if (!replyStarted) {
              replyStarted = true;
              assistantActivity = "Writing the response…";
              streamBuffer.setActivity(assistantActivity);
            }
            assistantContent += delta;
            streamBuffer.appendText(delta);
          },
          onThinking: (payload) => {
            if (!reasoningStarted && !replyStarted) {
              reasoningStarted = true;
              assistantActivity = "Reasoning about the findings…";
              streamBuffer.setActivity(assistantActivity);
            }
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
            activeRunRef.current = null;
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
        const finalSnapshot = streamBuffer.getSnapshot();
        const finalActivityLog = finalSnapshot.activityLog;
        const finalTrace = finalSnapshot.trace;

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
          activityLog: finalActivityLog.length ? finalActivityLog : undefined,
          trace: finalTrace.length ? finalTrace : undefined,
          sources: assistantSources,
          prUrl: assistantPrUrl,
          runId: assistantRunId,
          requestId: assistantRequestId,
          durationMs: assistantDurationMs,
          usage: assistantUsage,
          modelId: assistantModelId,
          turnId
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
        // A dropped stream does not settle a cancellation already in flight.
        // Wait for its bounded result before deciding whether Retry reconnects.
        if (activeRunRef.current && cancellingRunRef.current === activeRunRef.current) {
          await cancellationPromiseRef.current;
        }
        const wasAborted =
          requestController.signal.aborted ||
          (caught instanceof DOMException && caught.name === "AbortError");
        const wasCancelled = Boolean(assistantRunId) &&
          cancelledRunIdRef.current === assistantRunId;
        const message = wasCancelled
          ? "Agent run stopped."
          : wasAborted
            ? "Disconnected from the agent. The run may still be active; reconnect to check it."
          : caught instanceof Error
            ? caught.message
            : "Something went wrong.";
        const failedRunId =
          (caught instanceof ChatStreamError ? caught.runId : undefined) ??
          assistantRunId;

        // Whatever streamed before the failure is still useful; keep it.
        streamBuffer.flushNow();
        const partial = streamBuffer.getSnapshot();
        const partialText = assistantContent.trim();

        const errorMessage: Message = {
          id: assistantId,
          role: "assistant",
          content: partialText ? `${assistantContent}\n\n_${message}_` : message,
          createdAt: streamingAssistant.createdAt,
          error: true,
          streaming: false,
          thinking: assistantThinking || undefined,
          activityLog: partial.activityLog.length ? partial.activityLog : undefined,
          trace: partial.trace.length ? partial.trace : undefined,
          sources: assistantSources.length ? assistantSources : undefined,
          runId: failedRunId,
          // Only a lost connection leaves a run worth re-attaching to; a failed
          // or cancelled run would just replay the same failure.
          recoverable:
            !wasCancelled && Boolean(failedRunId) &&
            (wasAborted || isRecoverableStreamFailure(caught)),
          requestId:
            caught instanceof ChatStreamError ? caught.requestId : undefined,
          turnId
        };
        const finalMessages = [...optimisticMessages, errorMessage];
        if (activeConversationIdRef.current === conversationId) {
          setError(message);
          setComposerNote(wasCancelled ? "Agent run stopped." : null);
        }
        replaceMessagesForConversation(
          conversationId,
          finalMessages,
          resolvedAgentId,
          resolvedAgentSessionToken
        );
      } finally {
        window.clearInterval(heartbeat);
        clearStopWait();
        stopRequestedRef.current = false;
        if (activeRunRef.current?.runId === assistantRunId) {
          activeRunRef.current = null;
        }
        clearRequest(requestController);
        isSendingRef.current = false;
        setExternalSyncPaused(false);
        setIsSending(false);
        // Refocusing on a phone would pop the keyboard over the answer.
        if (!isCoarsePointer()) inputRef.current?.focus();
      }
    },
    [
      activeAgentMode,
      activeConversation,
      activeConversationIdRef,
      apiKey,
      beginRequest,
      cancelRunAndAbort,
      clearDraft,
      clearRequest,
      clearStopWait,
      inputRef,
      isSending,
      mergeSourceForConversation,
      messages,
      openRepoPicker,
      patchMessageForConversation,
      patchAgentSessionForConversation,
      pendingImages,
      pendingPdfs,
      replaceMessagesForConversation,
      setExternalSyncPaused
    ]
  );

  // sendMessage changes identity on every streamed flush, so the retry
  // callbacks go through a ref to stay stable (the message list is memoised).
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  const retryAssistantMessage = useCallback(
    (messageId: string) => {
      if (isSendingRef.current) return;

      const currentMessages = messagesRef.current;
      const messageIndex = currentMessages.findIndex((message) => message.id === messageId);
      // Only the latest answer can be retried: the cloud agent already holds
      // every later turn, so rewinding the local copy would diverge from it.
      if (messageIndex <= 0 || messageIndex !== currentMessages.length - 1) return;

      const previousMessages = currentMessages.slice(0, messageIndex);
      const previousUserMessage = [...previousMessages]
        .reverse()
        .find((message) => message.role === "user");

      if (!previousUserMessage) {
        setError("No user message found to retry.");
        return;
      }

      const nextMessages = previousMessages.filter((message) => !message.error);
      void sendMessageRef.current(
        previousUserMessage.content,
        true,
        nextMessages,
        {
          imageAttachments: previousUserMessage.imageAttachments,
          pdfAttachments: previousUserMessage.pdfAttachments
        },
        recoveryFor(currentMessages[messageIndex], previousUserMessage)
      );
    },
    []
  );

  const retryLast = useCallback(() => {
    if (isSendingRef.current) return;

    const currentMessages = messagesRef.current;
    const lastUserMessage = [...currentMessages]
      .reverse()
      .find((message) => message.role === "user");
    if (!lastUserMessage) return;
    const lastAssistantMessage = [...currentMessages]
      .reverse()
      .find((message) => message.role === "assistant");
    void sendMessageRef.current(
      lastUserMessage.content,
      true,
      currentMessages,
      {
        imageAttachments: lastUserMessage.imageAttachments,
        pdfAttachments: lastUserMessage.pdfAttachments
      },
      recoveryFor(lastAssistantMessage, lastUserMessage)
    );
  }, []);

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
    stopGenerating,
    sendMessage,
    retryAssistantMessage,
    retryLast,
    copyMessage,
    shareConversation
  };
}
