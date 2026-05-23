"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  ConversationLike,
  RECENT_CHATS_VISIBLE,
  groupConversationsByRepo,
  relativeTimeLabel
} from "@/lib/conversations";

type SidebarRecentsProps = {
  conversations: ConversationLike[];
  activeConversationId: string;
  onOpenConversation: (conversation: ConversationLike) => void;
  onRenameConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
};

export default function SidebarRecents({
  conversations,
  activeConversationId,
  onOpenConversation,
  onRenameConversation,
  onDeleteConversation
}: SidebarRecentsProps) {
  const groups = useMemo(
    () => groupConversationsByRepo(conversations),
    [conversations]
  );

  const activeRepoKey = useMemo(() => {
    const active = conversations.find(
      (conversation) => conversation.id === activeConversationId
    );

    return active?.repoUrl?.trim() || "__none__";
  }, [conversations, activeConversationId]);

  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(
    () => new Set([activeRepoKey])
  );
  const [seeAllRepos, setSeeAllRepos] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedRepos((current) => {
      if (current.has(activeRepoKey)) {
        return current;
      }

      return new Set([...current, activeRepoKey]);
    });
  }, [activeRepoKey]);

  function toggleRepo(repoKey: string) {
    setExpandedRepos((current) => {
      const next = new Set(current);

      if (next.has(repoKey)) {
        next.delete(repoKey);
      } else {
        next.add(repoKey);
      }

      return next;
    });
  }

  function toggleSeeAll(repoKey: string) {
    setSeeAllRepos((current) => {
      const next = new Set(current);

      if (next.has(repoKey)) {
        next.delete(repoKey);
      } else {
        next.add(repoKey);
      }

      return next;
    });
  }

  if (conversations.length === 0) {
    return <p className="px-3 py-2 text-sm text-[#8a8a8a]">No chats yet</p>;
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => {
        const expanded = expandedRepos.has(group.repoKey);
        const showAll = seeAllRepos.has(group.repoKey);
        const visibleConversations = showAll
          ? group.conversations
          : group.conversations.slice(0, RECENT_CHATS_VISIBLE);
        const hiddenCount = group.conversations.length - RECENT_CHATS_VISIBLE;

        return (
          <div key={group.repoKey} className="rounded-lg">
            <button
              type="button"
              onClick={() => toggleRepo(group.repoKey)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-[#303030] transition hover:bg-[#ececec] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
              aria-expanded={expanded}
              title={group.label}
            >
              <IconFolder className="h-4 w-4 shrink-0 text-[#666]" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {group.shortLabel}
              </span>
              <IconChevron open={expanded} />
            </button>

            {expanded ? (
              <div className="mt-0.5 space-y-0.5 pb-1 pl-2">
                {visibleConversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeConversationId}
                    onOpen={() => onOpenConversation(conversation)}
                    onRename={() => onRenameConversation(conversation.id)}
                    onDelete={() => onDeleteConversation(conversation.id)}
                  />
                ))}

                {!showAll && hiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleSeeAll(group.repoKey)}
                    className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-[#777] transition hover:bg-[#ececec] hover:text-[#333] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
                  >
                    See all ({group.conversations.length})
                  </button>
                ) : null}

                {showAll && hiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleSeeAll(group.repoKey)}
                    className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-[#777] transition hover:bg-[#ececec] hover:text-[#333] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
                  >
                    Show less
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onOpen,
  onRename,
  onDelete
}: {
  conversation: ConversationLike;
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1 rounded-lg ${
        active ? "bg-[#ececec]" : "hover:bg-[#ececec]"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
        title={conversation.title}
      >
        <span className="min-w-0 flex-1 truncate text-sm text-[#404040]">
          {conversation.title}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-[#8a8a8a]">
          {relativeTimeLabel(conversation.updatedAt)}
        </span>
      </button>
      <button
        type="button"
        onClick={onRename}
        className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#777] transition hover:bg-[#dedede] hover:text-[#111] group-hover:flex"
        aria-label={`Rename ${conversation.title}`}
        title="Rename"
      >
        <IconEdit className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="mr-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#777] transition hover:bg-[#dedede] hover:text-[#111] group-hover:flex"
        aria-label={`Delete ${conversation.title}`}
        title="Delete"
      >
        <IconClose className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function IconFolder({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 shrink-0 text-[#777] transition ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconEdit({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconClose({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
