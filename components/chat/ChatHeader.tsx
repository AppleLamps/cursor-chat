"use client";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  EllipsisIcon,
  GitPullRequestIcon,
  PanelLeftIcon,
  ShareIcon,
  SquarePenIcon,
  Trash2Icon
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
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
  onOpenMobileSidebar,
  canManageCloudAgent,
  cloudAgentArchived,
  lifecycleBusy,
  onToggleCloudArchive,
  onDeleteCloudAgent
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
  canManageCloudAgent: boolean;
  cloudAgentArchived: boolean;
  lifecycleBusy: boolean;
  onToggleCloudArchive: () => void;
  onDeleteCloudAgent: () => void;
}) {
  // repoLabel is "owner/repo · branch": show them on two lines on phones.
  const [repoName, ...repoRest] = repoLabel.split(" · ");
  const repoBranch = repoRest.join(" · ");

  const lockedModeBadge = (
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
  );

  return (
    <>
      <header className="border-b border-border bg-background pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex h-14 items-center gap-1 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
          <Button
            type="button"
            variant="ghost"
            onClick={onOpenMobileSidebar}
            className="size-11 shrink-0 [&_svg:not([class*='size-'])]:size-5"
            aria-label="Open sidebar"
          >
            <PanelLeftIcon />
          </Button>
          <button
            type="button"
            onClick={onChangeRepo}
            className="flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-left font-mono font-medium text-foreground transition active:bg-muted"
            aria-label={`Change repository: ${repoLabel}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-4">{repoName}</span>
              {repoBranch ? (
                <span className="block truncate text-[11px] font-normal leading-4 text-muted-foreground">
                  {repoBranch}
                </span>
              ) : null}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
          {!canChangeAgentMode ? lockedModeBadge : null}
          <Button
            type="button"
            variant="ghost"
            onClick={onReset}
            className="size-11 shrink-0 [&_svg:not([class*='size-'])]:size-5"
            aria-label="New chat"
          >
            <SquarePenIcon />
          </Button>
          <ActionsMenu
            triggerClassName="size-11 shrink-0 [&_svg:not([class*='size-'])]:size-5"
            canShare={canShare}
            shareStatus={shareStatus}
            onShare={onShare}
            prUrl={prUrl}
            canManageCloudAgent={canManageCloudAgent}
            cloudAgentArchived={cloudAgentArchived}
            lifecycleBusy={lifecycleBusy}
            onToggleCloudArchive={onToggleCloudArchive}
            onDeleteCloudAgent={onDeleteCloudAgent}
          />
        </div>
        {canChangeAgentMode ? (
          <div className="pb-2.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
            <ModeToggle agentMode={agentMode} onChange={onAgentModeChange} />
          </div>
        ) : null}
      </header>

      <header className="hidden h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between gap-3 border-b border-border bg-background pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] md:flex">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {!sidebarOpen ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={onToggleSidebar}
                aria-label="Open sidebar"
                title="Open sidebar"
              >
                <PanelLeftIcon />
              </Button>
              <p className="truncate text-sm font-semibold text-foreground">{APP_NAME}</p>
              <span className="text-border">/</span>
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onChangeRepo}
            className="min-w-0 max-w-[min(44vw,520px)] shrink px-2 font-mono"
            title={repoLabel}
            aria-label={`Change repository: ${repoLabel}`}
          >
            <span className="block min-w-0 truncate">{repoLabel}</span>
          </Button>
          {canChangeAgentMode ? (
            <ModeToggle agentMode={agentMode} onChange={onAgentModeChange} size="compact" />
          ) : (
            lockedModeBadge
          )}
          {prUrl ? (
            <Button asChild variant="outline" size="xs" className="uppercase tracking-[0.08em]">
              <a href={prUrl} target="_blank" rel="noreferrer">
                PR
              </a>
            </Button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!sidebarOpen ? (
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
              New chat
            </Button>
          ) : null}
          {/* Narrower than lg (tablets, landscape phones) the actions fold into a menu. */}
          <div className="lg:hidden">
            <ActionsMenu
              triggerClassName="size-8"
              canShare={canShare}
              shareStatus={shareStatus}
              onShare={onShare}
              prUrl={undefined}
              canManageCloudAgent={canManageCloudAgent}
              cloudAgentArchived={cloudAgentArchived}
              lifecycleBusy={lifecycleBusy}
              onToggleCloudArchive={onToggleCloudArchive}
              onDeleteCloudAgent={onDeleteCloudAgent}
            />
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onShare}
              disabled={!canShare}
              title={shareStatus || "Share conversation"}
            >
              {shareStatus || "Share"}
            </Button>
            {canManageCloudAgent ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onToggleCloudArchive}
                  disabled={lifecycleBusy}
                  title={
                    cloudAgentArchived
                      ? "Restore this Cursor cloud agent"
                      : "Archive this Cursor cloud agent"
                  }
                >
                  {cloudAgentArchived ? "Unarchive agent" : "Archive agent"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={onDeleteCloudAgent}
                  disabled={lifecycleBusy}
                  title="Permanently delete this Cursor cloud agent (does not delete the local chat)"
                >
                  Delete cloud agent
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>
    </>
  );
}

function ActionsMenu({
  triggerClassName,
  canShare,
  shareStatus,
  onShare,
  prUrl,
  canManageCloudAgent,
  cloudAgentArchived,
  lifecycleBusy,
  onToggleCloudArchive,
  onDeleteCloudAgent
}: {
  triggerClassName: string;
  canShare: boolean;
  shareStatus: string | null;
  onShare: () => void;
  prUrl?: string;
  canManageCloudAgent: boolean;
  cloudAgentArchived: boolean;
  lifecycleBusy: boolean;
  onToggleCloudArchive: () => void;
  onDeleteCloudAgent: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={triggerClassName}
          aria-label="More actions"
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 min-w-60 rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none"
        >
          <MobileMenuItem
            icon={<ShareIcon />}
            label={shareStatus || "Share conversation"}
            disabled={!canShare}
            onSelect={onShare}
          />
          {prUrl ? (
            <MobileMenuItem
              icon={<GitPullRequestIcon />}
              label="View pull request"
              href={prUrl}
            />
          ) : null}
          {canManageCloudAgent ? (
            <>
              <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
              <DropdownMenu.Label className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Cursor cloud agent
              </DropdownMenu.Label>
              <MobileMenuItem
                icon={cloudAgentArchived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                label={cloudAgentArchived ? "Unarchive agent" : "Archive agent"}
                disabled={lifecycleBusy}
                onSelect={onToggleCloudArchive}
              />
              <MobileMenuItem
                icon={<Trash2Icon />}
                label="Delete cloud agent"
                disabled={lifecycleBusy}
                destructive
                onSelect={onDeleteCloudAgent}
              />
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MobileMenuItem({
  icon,
  label,
  onSelect,
  href,
  disabled,
  destructive
}: {
  icon: React.ReactNode;
  label: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const className = `flex h-11 w-full cursor-default select-none items-center gap-3 rounded-xl px-3 text-[15px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-muted [&_svg]:size-[18px] [&_svg]:shrink-0 ${
    destructive ? "text-destructive" : "text-foreground"
  }`;

  return (
    <DropdownMenu.Item
      asChild={Boolean(href)}
      disabled={disabled}
      onSelect={onSelect}
      className={className}
    >
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {icon}
          {label}
        </a>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </DropdownMenu.Item>
  );
}
