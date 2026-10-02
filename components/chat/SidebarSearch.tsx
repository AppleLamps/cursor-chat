"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { Conversation } from "@/lib/chat-types";
import { relativeTimeLabel } from "@/lib/conversations";
import { searchConversations } from "@/lib/history-search";

/**
 * Search box plus results. `children` is what to show when the box is empty
 * (the normal project list), so the sidebar keeps one scroll area.
 */
export default function SidebarSearch({
  conversations,
  activeConversationId,
  onOpenConversation,
  children
}: {
  conversations: Conversation[];
  activeConversationId: string;
  onOpenConversation: (conversation: Conversation) => void;
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searching = query.trim().length > 0;

  // Only scan the history while there is something to look for.
  const hits = useMemo(
    () => (deferredQuery.trim() ? searchConversations(conversations, deferredQuery) : []),
    [conversations, deferredQuery]
  );

  return (
    <>
      <div className="mt-4 px-1">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.stopPropagation();
              setQuery("");
            }
          }}
          placeholder="Search chats"
          aria-label="Search chats"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full rounded-lg border border-[#e0e0e0] bg-white px-3 py-2 text-sm text-[#202123] outline-none transition placeholder:text-[#9a9a9a] focus:border-[#bdbdbd] focus:ring-2 focus:ring-[#ececec]"
        />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {searching ? (
          <div aria-live="polite">
            <p className="px-2 pb-1 text-xs font-semibold text-[#6b6b6b]">
              {hits.length === 0
                ? "No chats match"
                : `${hits.length} ${hits.length === 1 ? "chat" : "chats"}`}
            </p>
            <ul className="space-y-0.5">
              {hits.map(({ conversation, snippet }) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onOpenConversation(conversation)}
                    aria-current={conversation.id === activeConversationId ? "true" : undefined}
                    className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left transition hover:bg-[#ececec] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bdbdbd] md:min-h-0 ${
                      conversation.id === activeConversationId ? "bg-[#ececec]" : ""
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-[#404040]">
                        {conversation.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-[#8a8a8a]">
                        {relativeTimeLabel(conversation.updatedAt)}
                      </span>
                    </span>
                    {snippet ? (
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-[#777]">
                        {snippet}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          children
        )}
      </div>
    </>
  );
}
