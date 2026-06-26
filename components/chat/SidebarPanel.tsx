"use client";

import { FormEvent, ReactNode, useState } from "react";
import SidebarRecents from "@/components/SidebarRecents";
import type { Conversation } from "@/lib/chat-types";
import { APP_NAME } from "@/lib/defaults";
import { maskApiKey } from "@/lib/storage";

export default function SidebarPanel({
  conversations,
  activeConversationId,
  apiKey,
  githubToken,
  onNewChat,
  onNewChatInAnotherRepo,
  onOpenConversation,
  onRenameConversation,
  onDeleteConversation,
  onSignOut,
  onClearGitHubToken,
  onSaveGitHubToken,
  defaultRepoLabel,
  onCollapse,
  collapseLabel
}: {
  conversations: Conversation[];
  activeConversationId: string;
  apiKey: string;
  githubToken?: string | null;
  onNewChat: () => void;
  onNewChatInAnotherRepo: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onRenameConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSignOut: () => void;
  onClearGitHubToken: () => void;
  onSaveGitHubToken: (token: string) => boolean;
  defaultRepoLabel?: string | null;
  onCollapse: () => void;
  collapseLabel: string;
}) {
  const [showGitHubForm, setShowGitHubForm] = useState(false);
  const [githubInput, setGithubInput] = useState("");
  const [githubError, setGithubError] = useState<string | null>(null);

  function handleSaveGitHub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGithubError(null);

    if (!onSaveGitHubToken(githubInput)) {
      setGithubError("Enter a valid GitHub token.");
      return;
    }

    setGithubInput("");
    setShowGitHubForm(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="flex items-center justify-between gap-2">
        <BrandBlock />
        <button
          onClick={onCollapse}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#555] transition hover:bg-[#ececec] hover:text-[#111] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
          aria-label={collapseLabel}
          title={collapseLabel}
        >
          ◧
        </button>
      </div>

      <div className="mt-4 space-y-2">
        <SidebarButton label="New chat" icon={<IconEdit />} onClick={onNewChat} />
        <SidebarButton
          label="New chat in..."
          icon={<IconSwitch />}
          onClick={onNewChatInAnotherRepo}
        />
      </div>

      <div className="mt-6 px-2 text-xs font-semibold text-[#6b6b6b]">
        Projects
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        <SidebarRecents
          conversations={conversations}
          activeConversationId={activeConversationId}
          onOpenConversation={(item) => {
            const conversation = conversations.find(
              (entry) => entry.id === item.id
            );

            if (conversation) {
              onOpenConversation(conversation);
            }
          }}
          onRenameConversation={onRenameConversation}
          onDeleteConversation={onDeleteConversation}
        />
      </div>

      <div className="mt-auto border-t border-[#ececec] pt-3">
        <div className="rounded-xl border border-[#ececec] bg-[#fafafa] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8a8a]">
            Settings
          </p>

          {defaultRepoLabel ? (
            <div className="mt-3">
              <div className="flex items-start gap-2.5">
                <SidebarIcon>
                  <IconFolder />
                </SidebarIcon>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#8a8a8a]">Default repository</p>
                  <p
                    className="mt-0.5 truncate text-sm text-[#303030]"
                    title={defaultRepoLabel}
                  >
                    {defaultRepoLabel}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div
            className={
              defaultRepoLabel ? "mt-3 border-t border-[#ececec] pt-3" : "mt-3"
            }
          >
            <div className="flex items-start gap-2.5">
              <SidebarIcon>
                <IconGitHub />
              </SidebarIcon>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#8a8a8a]">GitHub token</p>
                {githubToken ? (
                  <p
                    className="mt-0.5 truncate font-mono text-sm text-[#303030]"
                    title="Connected GitHub token"
                  >
                    {maskApiKey(githubToken)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-[#303030]">Not connected</p>
                )}
              </div>
            </div>

            {githubToken ? (
              <SettingsAction
                label="Clear GitHub token"
                icon={<IconKeyOff />}
                onClick={onClearGitHubToken}
              />
            ) : showGitHubForm ? (
              <form onSubmit={handleSaveGitHub} className="mt-2 space-y-2">
                <input
                  type="password"
                  value={githubInput}
                  onChange={(event) => setGithubInput(event.target.value)}
                  placeholder="ghp_... or github_pat_..."
                  className="w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2 text-sm text-[#0d0d0d] outline-none transition focus:border-[#bdbdbd] focus:ring-2 focus:ring-[#ececec]"
                />
                {githubError ? (
                  <p className="text-xs text-red-700">{githubError}</p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGitHubForm(false);
                      setGithubInput("");
                      setGithubError(null);
                    }}
                    className="rounded-full border border-[#d9d9d9] px-3 py-1.5 text-xs font-medium text-[#444] transition hover:bg-[#f7f7f8]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-[#0d0d0d] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#303030]"
                  >
                    Save token
                  </button>
                </div>
              </form>
            ) : (
              <SettingsAction
                label="Add GitHub token"
                icon={<IconGitHub className="h-4 w-4" />}
                onClick={() => setShowGitHubForm(true)}
              />
            )}
          </div>

          <div className="mt-3 border-t border-[#ececec] pt-3">
            <div className="flex items-start gap-2.5">
              <SidebarIcon>
                <IconKey />
              </SidebarIcon>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#8a8a8a]">Cursor API key</p>
                <p
                  className="mt-0.5 truncate font-mono text-sm text-[#303030]"
                  title="Connected API key"
                >
                  {maskApiKey(apiKey)}
                </p>
              </div>
            </div>
            <SettingsAction
              label="Clear saved key"
              icon={<IconKeyOff />}
              onClick={onSignOut}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandBlock() {
  return (
    <div>
      <div className="flex items-center gap-2 px-2 py-1">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">
            {APP_NAME}
          </h1>
        </div>
      </div>
    </div>
  );
}

function SidebarIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#555] [&>svg]:h-4 [&>svg]:w-4">
      {children}
    </span>
  );
}

function SettingsAction({
  label,
  icon,
  onClick
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-[#444] transition hover:bg-[#ececec] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#777]">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function SidebarButton({
  label,
  icon,
  onClick
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-h-10 items-center gap-2.5 rounded-lg border border-[#e0e0e0] bg-white px-3 py-2.5 text-left text-sm font-medium leading-none text-[#303030] shadow-sm transition hover:border-[#d4d4d4] hover:bg-[#f8f8f8] active:border-[#cccccc] active:bg-[#f0f0f0] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
    >
      <SidebarIcon>{icon}</SidebarIcon>
      <span className="truncate">{label}</span>
    </button>
  );
}

function IconEdit({ className = "h-[18px] w-[18px]" }: { className?: string }) {
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

function IconFolder({ className = "h-[18px] w-[18px]" }: { className?: string }) {
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

function IconGitHub({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <path d="M12 2C6.477 2 2 6.586 2 12.253c0 4.336 2.865 7.996 6.839 9.288.5.092.682-.218.682-.483 0-.237-.009-.866-.013-1.699-2.782.621-3.369-1.349-3.369-1.349-.454-1.178-1.11-1.491-1.11-1.491-.908-.637.069-.624.069-.624 1.004.071 1.532 1.051 1.532 1.051.892 1.561 2.341 1.111 2.91.85.092-.662.35-1.111.636-1.367-2.221-.259-4.555-1.14-4.555-5.071 0-1.119.39-2.034 1.029-2.751-.103-.259-.446-1.308.098-2.727 0 0 .84-.273 2.75 1.037A9.3 9.3 0 0 1 12 6.836c.85.004 1.705.116 2.504.337 1.909-1.31 2.747-1.037 2.747-1.037.546 1.42.203 2.468.1 2.727.64.717 1.028 1.632 1.028 2.751 0 3.943-2.337 4.809-4.564 5.063.359.317.678.941.678 1.896 0 1.368-.012 2.47-.012 2.807 0 .268.18.58.688.481A10.02 10.02 0 0 0 22 12.253C22 6.586 17.523 2 12 2Z" />
    </svg>
  );
}

function IconKey({ className = "h-[18px] w-[18px]" }: { className?: string }) {
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
      <circle cx="8" cy="15" r="4" />
      <path d="m10.5 12.5 7-7" />
      <path d="m18 5 1 1" />
      <path d="m15 8 1 1" />
    </svg>
  );
}

function IconKeyOff({ className = "h-4 w-4" }: { className?: string }) {
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
      <path d="m2 2 20 20" />
      <path d="M6.5 6.5A4 4 0 0 0 5 10v4a2 2 0 0 0 2 2h2" />
      <path d="M10.5 10.5 18 18" />
      <path d="M18 10v4a2 2 0 0 1-2 2h-2" />
    </svg>
  );
}

function IconSwitch({ className = "h-4 w-4" }: { className?: string }) {
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
      <path d="M16 3h5v5" />
      <path d="M8 21H3v-5" />
      <path d="M21 3 14 10" />
      <path d="M3 21l7-7" />
    </svg>
  );
}
