"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Onboarding from "@/components/Onboarding";
import { startCursorLogin } from "@/lib/cursor-login-client";
import RepoPicker from "@/components/RepoPicker";
import ChatHeader from "@/components/chat/ChatHeader";
import Composer from "@/components/chat/Composer";
import EmptyState from "@/components/chat/EmptyState";
import ErrorBanner from "@/components/chat/ErrorBanner";
import StorageWarning from "@/components/chat/StorageWarning";
import UndoToast from "@/components/chat/UndoToast";
import ChatSidebars from "@/components/chat/ChatSidebars";
import MessageBubble from "@/components/chat/MessageBubble";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from "@/components/ui/message-scroller";
import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import { createConversation, resolveConversationModel } from "@/lib/chat-conversation";
import type { Conversation, RepoPickerMode } from "@/lib/chat-types";
import {
  DEFAULT_BRANCH,
  modelLabel,
  type AgentMode,
} from "@/lib/defaults";
import type { ModelSelection } from "@/lib/model-client";
import { downloadHistoryFile, readHistoryFile } from "@/lib/history-transfer-client";
import { describeImport } from "@/lib/history-transfer";
import { repoLabel } from "@/lib/repo";
import { isCoarsePointer, shouldSendOnEnter } from "@/lib/touch";
import {
  STORAGE_KEYS,
  getDefaultAgentMode,
  getDefaultBranch,
  getDefaultModel,
  getDefaultRepo
} from "@/lib/storage";
import { useAppViewport } from "@/hooks/useAppViewport";
import { useAttachments } from "@/hooks/useAttachments";
import { useAuthSettings } from "@/hooks/useAuthSettings";
import { useChatSend } from "@/hooks/useChatSend";
import { useComposerDock } from "@/hooks/useComposerDock";
import { useConversationStore } from "@/hooks/useConversationStore";
import { useRepoCatalog } from "@/hooks/useRepoCatalog";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useModelCatalog } from "@/hooks/useModelCatalog";

const SIDEBAR_STORAGE_KEY = STORAGE_KEYS.SIDEBAR;

export default function ChatApp({
  githubOAuthEnabled = false
}: {
  githubOAuthEnabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarChosenRef = useRef(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [repoPickerMode, setRepoPickerMode] =
    useState<RepoPickerMode>("initial");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [undoDelete, setUndoDelete] = useState<Conversation | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setChatErrorRef = useRef<(message: string | null) => void>(() => undefined);
  const setComposerNoteRef = useRef<(message: string | null) => void>(
    () => undefined
  );

  useAppViewport();
  const composerDockRef = useComposerDock();
  const auth = useAuthSettings();
  const repos = useRepoCatalog(auth.apiKey, auth.hasAuthHydrated);
  const modelCatalog = useModelCatalog(auth.apiKey);
  const conversations = useConversationStore({ apiKey: auth.apiKey });

  const appendInput = useCallback((text: string) => {
    setInput((current) => [current.trim(), text].filter(Boolean).join("\n\n"));
  }, []);
  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  const attachments = useAttachments({
    appendInput,
    focusInput,
    setError: (message) => setChatErrorRef.current(message),
    setComposerNote: (message) => setComposerNoteRef.current(message)
  });

  const openRepoPicker = useCallback((mode: RepoPickerMode) => {
    setRepoPickerMode(mode);
    setRepoPickerOpen(true);
  }, []);

  const clearDraft = useCallback(() => {
    setInput("");
    attachments.clearPendingAttachments();
  }, [attachments]);

  const chat = useChatSend({
    apiKey: auth.apiKey,
    activeConversation: conversations.activeConversation,
    activeAgentMode: conversations.activeAgentMode,
    messages: conversations.messages,
    pendingImages: attachments.pendingImages,
    pendingPdfs: attachments.pendingPdfs,
    inputRef,
    clearDraft,
    openRepoPicker: (mode) => openRepoPicker(mode),
    activeConversationIdRef: conversations.activeConversationIdRef,
    replaceMessagesForConversation: conversations.replaceMessagesForConversation,
    patchMessageForConversation: conversations.patchMessageForConversation,
    patchAgentSessionForConversation:
      conversations.patchAgentSessionForConversation,
    mergeSourceForConversation: conversations.mergeSourceForConversation,
    setExternalSyncPaused: conversations.setExternalSyncPaused
  });
  setChatErrorRef.current = chat.setError;
  setComposerNoteRef.current = chat.setComposerNote;

  // Memoised so finished messages keep identical props while a reply streams.
  const lastAssistantId = useMemo(
    () =>
      [...conversations.messages].reverse().find((message) => message.role === "assistant")
        ?.id,
    [conversations.messages]
  );
  const artifactScope = useMemo(
    () =>
      conversations.activeConversation && auth.apiKey
        ? { apiKey: auth.apiKey, conversation: conversations.activeConversation }
        : undefined,
    [auth.apiKey, conversations.activeConversation]
  );

  const voice = useVoiceInput({
    input,
    setInput,
    setComposerNote: chat.setComposerNote
  });

  useEffect(() => {
    // A persistent sidebar only fits on wide screens; tablets and landscape
    // phones keep it closed (the header button still opens it).
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const storedSidebar = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    setSidebarOpen(wide && storedSidebar !== "collapsed");
  }, []);

  function chooseSidebar(next: boolean | ((current: boolean) => boolean)) {
    sidebarChosenRef.current = true;
    setSidebarOpen(next);
  }

  useEffect(() => {
    // Only persist an explicit choice, so a narrow-screen default never
    // overwrites the preference used on desktop.
    if (!conversations.hasHydrated || !sidebarChosenRef.current) return;
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      sidebarOpen ? "expanded" : "collapsed"
    );
  }, [sidebarOpen, conversations.hasHydrated]);

  function activateConversation(conversation: Conversation) {
    conversations.activateConversation(conversation);
    setInput("");
    attachments.clearPendingAttachments();
    chat.setError(null);
    inputRef.current?.focus();
  }

  function handleRepoSelect(
    repoUrl: string,
    branch: string,
    rememberAsDefault: boolean,
    agentMode: AgentMode,
    model: ModelSelection
  ) {
    if (rememberAsDefault) {
      conversations.rememberRepoSelection(repoUrl, branch, agentMode, model);
    }

    if (repoPickerMode === "change" && conversations.activeConversation) {
      conversations.updateConversationRepo(
        conversations.activeConversation.id,
        repoUrl,
        branch,
        model
      );
      setRepoPickerOpen(false);
      chat.setError(null);
      return;
    }

    activateConversation(createConversation(repoUrl, branch, agentMode, model.id, model));
    setRepoPickerOpen(false);
    setRepoPickerMode("initial");
    chat.setError(null);
  }

  function startNewChatSameRepo() {
    const repoUrl = conversations.activeConversation?.repoUrl || getDefaultRepo();
    const branch =
      conversations.activeConversation?.branch ||
      getDefaultBranch() ||
      DEFAULT_BRANCH;

    if (!repoUrl) {
      openRepoPicker("new-chat");
      return;
    }

    activateConversation(
      createConversation(
        repoUrl,
        branch,
        conversations.activeAgentMode,
        getDefaultModel().id,
        getDefaultModel()
      )
    );
  }

  function startNewChatInAnotherRepo() {
    openRepoPicker("new-chat");
  }

  function resetChat() {
    startNewChatSameRepo();
  }

  function openConversation(conversation: Conversation) {
    activateConversation(conversation);
  }

  function openMobileConversation(conversation: Conversation) {
    openConversation(conversation);
    setMobileSidebarOpen(false);
  }

  function startMobileNewChatSameRepo() {
    startNewChatSameRepo();
    setMobileSidebarOpen(false);
  }

  function startMobileNewChatInAnotherRepo() {
    startNewChatInAnotherRepo();
    setMobileSidebarOpen(false);
  }

  const expireUndoDelete = useCallback(() => setUndoDelete(null), []);

  function undoConversationDelete() {
    if (!undoDelete) return;
    // Re-adding clears the deletion marker, so other tabs bring it back too.
    conversations.createAndActivateConversation(undoDelete);
    setUndoDelete(null);
  }

  function deleteConversation(id: string) {
    const snapshot = conversations.conversations.find(
      (conversation) => conversation.id === id
    );
    conversations.deleteConversation(id);
    // An empty chat has nothing worth restoring.
    setUndoDelete(snapshot && snapshot.messages.length > 0 ? snapshot : null);

    if (id === conversations.activeConversationId) {
      setInput("");
      attachments.clearPendingAttachments();
      chat.setError(null);
    }
  }

  async function manageCloudAgent(action: "archive" | "unarchive" | "delete") {
    const conversation = conversations.activeConversation;
    if (
      !conversation?.agentId ||
      !conversation.agentSessionToken ||
      !conversation.repoUrl
    ) {
      chat.setError("This chat does not have an authorized Cursor cloud agent.");
      return;
    }

    if (
      action === "delete" &&
      !window.confirm(
        "Permanently delete this Cursor cloud agent? This cannot be undone. " +
          "Your local chat history will remain, but it can no longer continue that agent."
      )
    ) {
      return;
    }

    setLifecycleBusy(true);
    chat.setError(null);
    try {
      const response = await fetch("/api/agents/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          apiKey: auth.apiKey,
          agentId: conversation.agentId,
          agentSessionToken: conversation.agentSessionToken,
          repoUrl: conversation.repoUrl,
          branch: conversation.branch || DEFAULT_BRANCH,
          agentMode: conversations.activeAgentMode,
          model: resolveConversationModel(conversation)
        })
      });
      const result = (await response.json()) as {
        error?: string;
        archived?: boolean;
        deleted?: boolean;
      };
      if (!response.ok) {
        throw new Error(result.error || "The cloud agent lifecycle request failed.");
      }

      conversations.patchAgentLifecycleForConversation(conversation.id, {
        archived: result.archived,
        deleted: result.deleted
      });
      chat.setComposerNote(
        action === "delete"
          ? "Cursor cloud agent permanently deleted. Local chat history was kept."
          : action === "archive"
            ? "Cursor cloud agent archived."
            : "Cursor cloud agent restored."
      );
    } catch (error) {
      chat.setError(
        error instanceof Error
          ? error.message
          : "The cloud agent lifecycle request failed."
      );
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function importHistoryFile(file: File) {
    const parsed = await readHistoryFile(file);
    if (!parsed.ok) return { ok: false, message: parsed.error };

    const plan = conversations.importHistory(parsed.conversations);
    return { ok: true, message: describeImport(plan, parsed.skipped) };
  }

  function handleSignOut() {
    auth.signOut();
    repos.resetRepositories();
    setRepoPickerOpen(false);
    setRepoPickerMode("initial");
    conversations.resetDefaultSeed();
    setMobileSidebarOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void chat.sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (shouldSendOnEnter(event, isCoarsePointer())) {
      event.preventDefault();
      void chat.sendMessage(input);
    }
  }

  async function handleFileInput(files: FileList | null) {
    try {
      await attachments.addAttachments(files);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const activeModelLabel =
    modelCatalog.models.find((model) => model.id === conversations.activeModelId)
      ?.displayName ?? modelLabel(conversations.activeModelId);
  const activeRepoLabel = conversations.activeConversation?.repoUrl
    ? `${repoLabel(conversations.activeConversation.repoUrl)} · ${
        conversations.activeConversation.branch || DEFAULT_BRANCH
      } · ${activeModelLabel}`
    : "Select repository";
  const implementModeNote =
    isImplementMode(conversations.activeAgentMode) &&
    conversations.messages.length === 0
      ? "This chat can modify the repo and may open a pull request."
      : null;
  const planModeNote =
    isPlanMode(conversations.activeAgentMode) &&
    conversations.messages.length === 0
      ? "Plan mode inspects the repo and stays read-only."
      : null;
  const resolvedComposerNote = chat.composerNote ?? implementModeNote ?? planModeNote;
  const hasMessages = conversations.messages.length > 0;
  // An error saved with the chat (an interrupted reply found after a reload)
  // still needs a way to retry, not just an error from this session.
  const lastMessage = conversations.messages[conversations.messages.length - 1];
  const savedError =
    !chat.isSending && lastMessage?.role === "assistant" && lastMessage.error
      ? lastMessage.recoverable
        ? "This reply was interrupted. Retry to reconnect."
        : "The last reply did not complete."
      : null;
  const bannerError = chat.error ?? savedError;
  const canSend =
    (input.trim().length > 0 ||
      attachments.pendingImages.length > 0 ||
      attachments.pendingPdfs.length > 0) &&
    !chat.isSending &&
    !attachments.isReadingFiles;
  const needsInitialRepoPicker = Boolean(
    auth.apiKey &&
      conversations.hasHydrated &&
      !conversations.activeConversation?.repoUrl &&
      !repoPickerOpen
  );
  const defaultRepoLabel = getDefaultRepo() ? repoLabel(getDefaultRepo()!) : null;
  const composer = (
    <>
      {conversations.storageWarning && (
        <StorageWarning
          message={conversations.storageWarning}
          onDismiss={conversations.dismissStorageWarning}
        />
      )}
      {bannerError && (
        <ErrorBanner
          message={bannerError}
          canRetry={
            Boolean(conversations.lastUserMessage) ||
            conversations.lastAssistantErrored
          }
          onRetry={chat.retryLast}
        />
      )}
      <Composer
        value={input}
        images={attachments.pendingImages}
        pdfs={attachments.pendingPdfs}
        onChange={setInput}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        canSend={canSend}
        isSending={chat.isSending}
        onStop={chat.stopGenerating}
        isReadingFiles={attachments.isReadingFiles}
        isListening={voice.isListening}
        note={resolvedComposerNote}
        placeholder={
          isImplementMode(conversations.activeAgentMode)
            ? "Describe the change you want"
            : isPlanMode(conversations.activeAgentMode)
              ? "Describe what you want planned"
              : "Ask about this repository"
        }
        onAttachClick={() => fileInputRef.current?.click()}
        onHostedImageClick={attachments.addHostedImageUrl}
        onRemoveImage={attachments.removePendingImage}
        onRemovePdf={attachments.removePendingPdf}
        onToggleVoice={voice.toggleVoiceInput}
        inputRef={inputRef}
      />
      <input
        ref={fileInputRef}
        type="file"
        aria-label="Attach images"
        title="Attach images"
        className="hidden"
        multiple
        accept="image/gif,image/jpeg,image/png,image/webp"
        onChange={(event) => void handleFileInput(event.target.files)}
      />
    </>
  );

  if (!auth.hasAuthHydrated || !conversations.hasHydrated) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-white text-sm text-[#8a8a8a]">
        Loading...
      </main>
    );
  }

  if (!auth.apiKey) {
    return (
      <Onboarding
        onComplete={auth.completeOnboarding}
        githubToken={auth.githubToken}
        githubError={auth.githubConnectError}
        onConnectCursor={startCursorLogin}
        onConnectGitHub={githubOAuthEnabled ? auth.connectGitHub : undefined}
      />
    );
  }

  if (needsInitialRepoPicker) {
    return (
      <RepoPicker
        mode="page"
        repos={repos.repos}
        loading={repos.reposLoading}
        error={repos.reposError}
        githubToken={auth.githubToken}
        initialBranch={getDefaultBranch() || DEFAULT_BRANCH}
        initialAgentMode={getDefaultAgentMode()}
        initialModel={getDefaultModel()}
        models={modelCatalog.models}
        modelsLoading={modelCatalog.loading}
        usingFallbackModels={modelCatalog.usingFallback}
        onRetry={() => void repos.loadRepositories(auth.apiKey!)}
        onChangeCredentials={handleSignOut}
        onSelect={handleRepoSelect}
      />
    );
  }

  return (
    <main className="app-shell flex overflow-hidden bg-background text-foreground">
      <ChatSidebars
        conversations={conversations.conversations}
        activeConversationId={conversations.activeConversationId}
        apiKey={auth.apiKey}
        githubToken={auth.githubToken}
        defaultRepoLabel={defaultRepoLabel}
        mobileSidebarOpen={mobileSidebarOpen}
        sidebarOpen={sidebarOpen}
        onCloseMobileSidebar={() => setMobileSidebarOpen(false)}
        onCollapseSidebar={() => chooseSidebar(false)}
        onNewChat={resetChat}
        onNewMobileChat={startMobileNewChatSameRepo}
        onNewChatInAnotherRepo={startNewChatInAnotherRepo}
        onNewMobileChatInAnotherRepo={startMobileNewChatInAnotherRepo}
        onOpenConversation={openConversation}
        onOpenMobileConversation={openMobileConversation}
        onRenameConversation={conversations.renameConversation}
        onDeleteConversation={deleteConversation}
        onExportHistory={() => downloadHistoryFile(conversations.exportHistory())}
        onImportHistory={importHistoryFile}
        onSignOut={handleSignOut}
        onClearGitHubToken={auth.clearGitHubToken}
        onSaveGitHubToken={auth.saveGitHubToken}
        onConnectGitHub={
          githubOAuthEnabled ? () => auth.connectGitHub() : undefined
        }
        githubConnectError={auth.githubConnectError}
      />

      <section className="relative flex min-w-0 flex-1 flex-col bg-background">
        {repoPickerOpen ? (
          <RepoPicker
            mode="modal"
            repos={repos.repos}
            loading={repos.reposLoading}
            error={repos.reposError}
            githubToken={auth.githubToken}
            initialRepoUrl={conversations.activeConversation?.repoUrl || getDefaultRepo()}
            initialBranch={
              conversations.activeConversation?.branch ||
              getDefaultBranch() ||
              DEFAULT_BRANCH
            }
            initialAgentMode={
              repoPickerMode === "new-chat"
                ? getDefaultAgentMode()
                : conversations.activeAgentMode
            }
            initialModelId={
              repoPickerMode === "new-chat"
                ? getDefaultModel().id
                : conversations.activeModelId
            }
            initialModel={
              repoPickerMode === "new-chat"
                ? getDefaultModel()
                : resolveConversationModel(conversations.activeConversation)
            }
            models={modelCatalog.models}
            modelsLoading={modelCatalog.loading}
            usingFallbackModels={modelCatalog.usingFallback}
            allowModeSelection={repoPickerMode !== "change"}
            title={
              repoPickerMode === "new-chat"
                ? "Start a chat in another repository"
                : "Change repository or model"
            }
            description={
              repoPickerMode === "new-chat"
                ? undefined
                : "Update which codebase and model this conversation should use."
            }
            submitLabel={repoPickerMode === "new-chat" ? "Start chat" : "Save"}
            onRetry={() => void repos.loadRepositories(auth.apiKey!)}
            onChangeCredentials={handleSignOut}
            onSelect={handleRepoSelect}
            onCancel={() => setRepoPickerOpen(false)}
          />
        ) : null}

        <ChatHeader
          onReset={resetChat}
          onShare={chat.shareConversation}
          canShare={conversations.messages.length > 0}
          shareStatus={chat.shareStatus}
          sidebarOpen={sidebarOpen}
          repoLabel={activeRepoLabel}
          agentMode={conversations.activeAgentMode}
          canChangeAgentMode={conversations.canChangeAgentMode}
          onAgentModeChange={conversations.setActiveConversationAgentMode}
          prUrl={conversations.latestPrUrl}
          onChangeRepo={() =>
            openRepoPicker(
              conversations.activeConversation?.repoUrl ? "change" : "initial"
            )
          }
          onToggleSidebar={() => chooseSidebar((current) => !current)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          canManageCloudAgent={Boolean(
            conversations.activeConversation?.agentId &&
              conversations.activeConversation?.agentSessionToken
          )}
          cloudAgentArchived={
            conversations.activeConversation?.agentArchived === true
          }
          lifecycleBusy={lifecycleBusy}
          onToggleCloudArchive={() =>
            void manageCloudAgent(
              conversations.activeConversation?.agentArchived
                ? "unarchive"
                : "archive"
            )
          }
          onDeleteCloudAgent={() => void manageCloudAgent("delete")}
        />

        {undoDelete ? (
          <UndoToast
            message={`Deleted "${undoDelete.title}"`}
            onUndo={undoConversationDelete}
            onExpire={expireUndoDelete}
          />
        ) : null}

        {!hasMessages ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 md:py-8">
            {/* Phones: suggestions scroll, composer stays pinned to the bottom.
                md+: the original centered layout. */}
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col md:m-auto md:flex-none md:space-y-10 md:py-4">
              <div className="flex-1 py-6 md:flex-none md:py-0">
                <EmptyState
                  agentMode={conversations.activeAgentMode}
                  onPick={(prompt) => {
                    setInput(prompt);
                    inputRef.current?.focus();
                  }}
                />
              </div>
              <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-background via-background to-background/0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:-mx-6 sm:px-6 md:static md:m-0 md:bg-none md:p-0">
                {composer}
              </div>
            </div>
          </div>
        ) : (
          <>
            <MessageScrollerProvider
              autoScroll
              defaultScrollPosition="end"
              scrollEdgeThreshold={48}
              scrollPreviousItemPeek={96}
            >
              <MessageScroller className="flex-1">
                <MessageScrollerViewport className="pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(var(--composer-h,13rem)+1rem)] pt-6 sm:px-6 sm:pt-8">
                <MessageScrollerContent className="mx-auto max-w-3xl gap-6">
                  {conversations.messages.map((message) => (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={message.role === "user"}
                    >
                      <MessageBubble
                        message={message}
                        repoUrl={conversations.activeConversation?.repoUrl}
                        branch={conversations.activeConversation?.branch || DEFAULT_BRANCH}
                        copied={chat.copiedMessageId === message.id}
                        canRegenerate={
                          message.id === lastAssistantId &&
                          !message.error &&
                          !message.streaming &&
                          !chat.isSending &&
                          !isImplementMode(conversations.activeAgentMode)
                        }
                        onCopy={chat.copyMessage}
                        onRetry={chat.retryAssistantMessage}
                        artifactScope={
                          message.id === lastAssistantId ? artifactScope : undefined
                        }
                      />
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton className="!bottom-[calc(var(--composer-h,9rem)+0.5rem)]" />
              </MessageScroller>
            </MessageScrollerProvider>

            <div
              ref={composerDockRef}
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-background/0 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10 sm:px-6 sm:pb-4 sm:pt-12"
            >
              <div className="pointer-events-auto">{composer}</div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
