"use client";

import { PanelLeftIcon } from "lucide-react";
import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import { APP_NAME, type AgentMode } from "@/lib/defaults";
import ModeToggle, { agentModeLabel } from "@/components/chat/ModeToggle";
import { Button } from "@/components/ui/button";

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
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={onOpenMobileSidebar}
          className="md:hidden"
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <PanelLeftIcon />
        </Button>
        {!sidebarOpen ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={onToggleSidebar}
            className="hidden md:inline-flex"
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            <PanelLeftIcon />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="md:hidden"
        >
          New chat
        </Button>
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <p className="truncate text-sm font-semibold text-foreground">{APP_NAME}</p>
          <span className="text-border">/</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onChangeRepo}
            className="max-w-[min(44vw,520px)] px-2 font-mono"
            title={repoLabel}
            aria-label={`Change repository: ${repoLabel}`}
          >
            <span className="block min-w-0 truncate">{repoLabel}</span>
          </Button>
          {canChangeAgentMode ? (
            <ModeToggle
              agentMode={agentMode}
              onChange={onAgentModeChange}
              size="compact"
            />
          ) : (
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                isImplementMode(agentMode)
                  ? "bg-amber-100 text-amber-900"
                  : isPlanMode(agentMode)
                    ? "bg-blue-100 text-blue-900"
                    : "bg-muted text-muted-foreground"
              }`}
              title="Mode is locked after the first message. Start a new chat to switch."
            >
              {agentModeLabel(agentMode)}
            </span>
          )}
          {prUrl ? (
            <Button asChild variant="outline" size="xs" className="uppercase tracking-[0.08em]">
              <a href={prUrl} target="_blank" rel="noreferrer">
                PR
              </a>
            </Button>
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onChangeRepo}
          className="hidden max-w-[42vw] px-2 font-mono sm:inline-flex md:hidden"
          title={repoLabel}
          aria-label={`Change repository: ${repoLabel}`}
        >
          <span className="block min-w-0 truncate">{repoLabel}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="hidden sm:inline-flex"
        >
          New chat
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onShare}
          disabled={!canShare}
          className="hidden sm:inline-flex"
          title={shareStatus || "Share conversation"}
        >
          {shareStatus || "Share"}
        </Button>
      </div>
    </header>
  );
}
