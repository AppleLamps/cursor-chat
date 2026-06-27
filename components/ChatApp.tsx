"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import Onboarding from "@/components/Onboarding";
import RepoPicker from "@/components/RepoPicker";
import ChatHeader from "@/components/chat/ChatHeader";
import Composer from "@/components/chat/Composer";
import EmptyState from "@/components/chat/EmptyState";
import ErrorBanner from "@/components/chat/ErrorBanner";
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
import { createConversation } from "@/lib/chat-conversation";
import type { Conversation, RepoPickerMode } from "@/lib/chat-types";
import { DEFAULT_BRANCH, type AgentMode } from "@/lib/defaults";
import { repoLabel } from "@/lib/repo";
import {
  STORAGE_KEYS,
  getDefaultAgentMode,
  getDefaultBranch,
  getDefaultRepo
} from "@/lib/storage";
import { useAttachments } from "@/hooks/useAttachments";
import { useAuthSettings } from "@/hooks/useAuthSettings";
import { useChatSend } from "@/hooks/useChatSend";
import { useConversationStore } from "@/hooks/useConversationStore";
import { useRepoCatalog } from "@/hooks/useRepoCatalog";
import { useVoiceInput } from "@/hooks/useVoiceInput";

const SIDEBAR_STORAGE_KEY = STORAGE_KEYS.SIDEBAR;

export default function ChatApp() {
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [repoPickerMode, setRepoPickerMode] =
    useState<RepoPickerMode>("initial");

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setChatErrorRef = useRef<(message: string | null) => void>(() => undefined);
  const setComposerNoteRef = useRef<(message: string | null) => void>(
    () => undefined
  );

  const auth = useAuthSettings();
  const repos = useRepoCatalog(auth.apiKey, auth.hasAuthHydrated);
  const conversations = useConversationStore({
    apiKey: auth.apiKey,
    onError: (message) => setChatErrorRef.current(message)
  });

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
    mergeSourceForConversation: conversations.mergeSourceForConversation,
    setExternalSyncPaused: conversations.setExternalSyncPaused
  });
  setChatErrorRef.current = chat.setError;
  setComposerNoteRef.current = chat.setComposerNote;

  const voice = useVoiceInput({
    input,
    setInput,
    setComposerNote: chat.setComposerNote
  });

  useEffect(() => {
    const storedSidebar = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (storedSidebar) {
      setSidebarOpen(storedSidebar !== "collapsed");
    }
  }, []);

  useEffect(() => {
    if (!conversations.hasHydrated) return;
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
    agentMode: AgentMode
  ) {
    if (rememberAsDefault) {
      conversations.rememberRepoSelection(repoUrl, branch, agentMode);
    }

    if (repoPickerMode === "change" && conversations.activeConversation) {
      conversations.updateConversationRepo(
        conversations.activeConversation.id,
        repoUrl,
        branch
      );
      setRepoPickerOpen(false);
      chat.setError(null);
      return;
    }

    activateConversation(createConversation(repoUrl, branch, agentMode));
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
      createConversation(repoUrl, branch, conversations.activeAgentMode)
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

  function deleteConversation(id: string) {
    conversations.deleteConversation(id);

    if (id === conversations.activeConversationId) {
      setInput("");
      attachments.clearPendingAttachments();
      chat.setError(null);
    }
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
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void chat.sendMessage(input);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
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

  const activeRepoLabel = conversations.activeConversation?.repoUrl
    ? `${repoLabel(conversations.activeConversation.repoUrl)} · ${
        conversations.activeConversation.branch || DEFAULT_BRANCH
      }`
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

  if (!auth.hasAuthHydrated || !conversations.hasHydrated) {
    return (
      <main className="flex h-screen items-center justify-center bg-white text-sm text-[#8a8a8a]">
        Loading...
      </main>
    );
  }

  if (!auth.apiKey) {
    return <Onboarding onComplete={auth.completeOnboarding} />;
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
        onRetry={() => void repos.loadRepositories(auth.apiKey!)}
        onSelect={handleRepoSelect}
      />
    );
  }

  return (
    <main className="flex h-screen overflow-hidden bg-background text-foreground">
      <ChatSidebars
        conversations={conversations.conversations}
        activeConversationId={conversations.activeConversationId}
        apiKey={auth.apiKey}
        githubToken={auth.githubToken}
        defaultRepoLabel={defaultRepoLabel}
        mobileSidebarOpen={mobileSidebarOpen}
        sidebarOpen={sidebarOpen}
        onCloseMobileSidebar={() => setMobileSidebarOpen(false)}
        onCollapseSidebar={() => setSidebarOpen(false)}
        onNewChat={resetChat}
        onNewMobileChat={startMobileNewChatSameRepo}
        onNewChatInAnotherRepo={startNewChatInAnotherRepo}
        onNewMobileChatInAnotherRepo={startMobileNewChatInAnotherRepo}
        onOpenConversation={openConversation}
        onOpenMobileConversation={openMobileConversation}
        onRenameConversation={conversations.renameConversation}
        onDeleteConversation={deleteConversation}
        onSignOut={handleSignOut}
        onClearGitHubToken={auth.clearGitHubToken}
        onSaveGitHubToken={auth.saveGitHubToken}
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
            allowModeSelection={repoPickerMode !== "change"}
            title={
              repoPickerMode === "new-chat"
                ? "Start a chat in another repository"
                : "Change repository"
            }
            description={
              repoPickerMode === "new-chat"
                ? undefined
                : "Update which codebase this conversation should use."
            }
            submitLabel={repoPickerMode === "new-chat" ? "Start chat" : "Save"}
            onRetry={() => void repos.loadRepositories(auth.apiKey!)}
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
          onToggleSidebar={() => setSidebarOpen((current) => !current)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />

        <MessageScrollerProvider
          autoScroll
          defaultScrollPosition="end"
          scrollEdgeThreshold={48}
          scrollPreviousItemPeek={96}
        >
          <MessageScroller className="flex-1">
            <MessageScrollerViewport className="px-4 pb-52 pt-8 sm:px-6 sm:pb-44">
              {conversations.messages.length === 0 ? (
                <MessageScrollerContent className="min-h-full">
                  <EmptyState
                    agentMode={conversations.activeAgentMode}
                    onAgentModeChange={conversations.setActiveConversationAgentMode}
                    onPick={(prompt) => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                  />
                </MessageScrollerContent>
              ) : (
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
                        onCopy={() => void chat.copyMessage(message)}
                        onRetry={() => chat.retryAssistantMessage(message.id)}
                      />
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              )}
            </MessageScrollerViewport>
            <MessageScrollerButton className="bottom-36" />
          </MessageScroller>
        </MessageScrollerProvider>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-background/0 px-4 pb-4 pt-12 sm:px-6">
          <div className="pointer-events-auto">
            {chat.error && (
              <ErrorBanner
                message={chat.error}
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
          </div>
        </div>
      </section>
    </main>
  );
}
