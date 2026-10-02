"use client";

import type { Conversation } from "@/lib/chat-types";
import SidebarPanel from "@/components/chat/SidebarPanel";

export default function ChatSidebars({
  conversations,
  activeConversationId,
  apiKey,
  githubToken,
  defaultRepoLabel,
  mobileSidebarOpen,
  sidebarOpen,
  onCloseMobileSidebar,
  onCollapseSidebar,
  onNewChat,
  onNewMobileChat,
  onNewChatInAnotherRepo,
  onNewMobileChatInAnotherRepo,
  onOpenConversation,
  onOpenMobileConversation,
  onRenameConversation,
  onDeleteConversation,
  onSignOut,
  onClearGitHubToken,
  onSaveGitHubToken,
  onConnectGitHub,
  githubConnectError
}: {
  conversations: Conversation[];
  activeConversationId: string;
  apiKey: string;
  githubToken?: string | null;
  defaultRepoLabel?: string | null;
  mobileSidebarOpen: boolean;
  sidebarOpen: boolean;
  onCloseMobileSidebar: () => void;
  onCollapseSidebar: () => void;
  onNewChat: () => void;
  onNewMobileChat: () => void;
  onNewChatInAnotherRepo: () => void;
  onNewMobileChatInAnotherRepo: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onOpenMobileConversation: (conversation: Conversation) => void;
  onRenameConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSignOut: () => void;
  onClearGitHubToken: () => void;
  onSaveGitHubToken: (token: string) => boolean;
  onConnectGitHub?: () => void;
  githubConnectError?: string | null;
}) {
  return (
    <>
      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close sidebar"
            className="absolute inset-0 bg-black/25"
            onClick={onCloseMobileSidebar}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[min(20rem,86vw)] flex-col border-r border-[#e8e8e8] bg-[#f9f9f9] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] shadow-[12px_0_40px_rgba(0,0,0,0.12)]">
            <SidebarPanel
              conversations={conversations}
              activeConversationId={activeConversationId}
              apiKey={apiKey}
              githubToken={githubToken}
              onNewChat={onNewMobileChat}
              onNewChatInAnotherRepo={onNewMobileChatInAnotherRepo}
              onOpenConversation={onOpenMobileConversation}
              onRenameConversation={onRenameConversation}
              onDeleteConversation={onDeleteConversation}
              onSignOut={onSignOut}
              onClearGitHubToken={onClearGitHubToken}
              onSaveGitHubToken={onSaveGitHubToken}
              onConnectGitHub={onConnectGitHub}
              githubConnectError={githubConnectError}
              defaultRepoLabel={defaultRepoLabel}
              onCollapse={onCloseMobileSidebar}
              collapseLabel="Close sidebar"
            />
          </aside>
        </div>
      ) : null}

      {sidebarOpen ? (
        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-[#e8e8e8] bg-[#f9f9f9] md:flex">
          <SidebarPanel
            conversations={conversations}
            activeConversationId={activeConversationId}
            apiKey={apiKey}
            githubToken={githubToken}
            onNewChat={onNewChat}
            onNewChatInAnotherRepo={onNewChatInAnotherRepo}
            onOpenConversation={onOpenConversation}
            onRenameConversation={onRenameConversation}
            onDeleteConversation={onDeleteConversation}
            onSignOut={onSignOut}
            onClearGitHubToken={onClearGitHubToken}
            onSaveGitHubToken={onSaveGitHubToken}
            onConnectGitHub={onConnectGitHub}
            githubConnectError={githubConnectError}
            defaultRepoLabel={defaultRepoLabel}
            onCollapse={onCollapseSidebar}
            collapseLabel="Collapse sidebar"
          />
        </aside>
      ) : null}
    </>
  );
}
