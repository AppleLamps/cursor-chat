"use client";

import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import { APP_NAME, type AgentMode } from "@/lib/defaults";
import ModeToggle, { agentModeLabel } from "@/components/chat/ModeToggle";

export default function ChatHeader({
  onReset,
  onShare,
  canShare,
  shareStatus,
  sidebarOpen,
  repoLabel,
  agentMode,
  canChangeAgentMode,
  onAgentModeChange,
  prUrl,
  onChangeRepo,
  onToggleSidebar,
  onOpenMobileSidebar
}: {
  onReset: () => void;
  onShare: () => void;
  canShare: boolean;
  shareStatus: string | null;
  sidebarOpen: boolean;
  repoLabel: string;
  agentMode: AgentMode;
  canChangeAgentMode: boolean;
  onAgentModeChange: (mode: AgentMode) => void;
  prUrl?: string;
  onChangeRepo: () => void;
  onToggleSidebar: () => void;
  onOpenMobileSidebar: () => void;
}) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 bg-white px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onOpenMobileSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] md:hidden"
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          ◧
        </button>
        {!sidebarOpen ? (
          <button
            onClick={onToggleSidebar}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] md:flex"
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            ◧
          </button>
        ) : null}
        <button
          onClick={onReset}
          className="rounded-lg px-3 py-2 text-sm font-medium text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] md:hidden"
        >
          New chat
        </button>
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <p className="truncate text-sm font-semibold text-[#333]">{APP_NAME}</p>
          <span className="text-[#c7c7c7]">•</span>
          <button
            type="button"
            onClick={onChangeRepo}
            className="truncate font-mono text-xs text-[#777] transition hover:text-[#333] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
            title="Change repository"
          >
            {repoLabel}
          </button>
          {canChangeAgentMode ? (
            <ModeToggle
              agentMode={agentMode}
              onChange={onAgentModeChange}
              size="compact"
            />
          ) : (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                isImplementMode(agentMode)
                  ? "bg-[#fff4e5] text-[#9a5b00]"
                  : isPlanMode(agentMode)
                    ? "bg-[#eef3ff] text-[#2850a7]"
                    : "bg-[#f1f1f1] text-[#666]"
              }`}
              title="Mode is locked after the first message. Start a new chat to switch."
            >
              {agentModeLabel(agentMode)}
            </span>
          )}
          {prUrl ? (
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full border border-[#d9d9d9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#333] transition hover:bg-[#f7f7f8]"
            >
              PR
            </a>
          ) : null}
        </div>
        {canChangeAgentMode ? (
          <div className="flex min-w-0 items-center md:hidden">
            <ModeToggle
              agentMode={agentMode}
              onChange={onAgentModeChange}
              size="compact"
            />
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onChangeRepo}
          className="rounded-lg px-3 py-2 text-sm font-medium text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] md:hidden"
        >
          Repo
        </button>
        <button
          onClick={onReset}
          className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] sm:inline-flex"
        >
          New chat
        </button>
        <button
          onClick={onShare}
          disabled={!canShare}
          className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[#444] transition hover:bg-[#f2f2f2] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9] disabled:cursor-not-allowed disabled:text-[#b6b6b6] disabled:hover:bg-transparent sm:inline-flex"
          title={shareStatus || "Share conversation"}
        >
          {shareStatus || "Share"}
        </button>
      </div>
    </header>
  );
}
