"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_BRANCH } from "@/lib/defaults";
import type { Message } from "@/lib/chat-types";
import { roleLabel, timeLabel } from "@/lib/chat-conversation";
import { formatTokenUsage, telemetryTitle } from "@/lib/chat-telemetry";
import { githubBlobUrl } from "@/lib/sources";
import MarkdownMessage from "@/components/chat/MarkdownMessage";

export default function MessageBubble({
  message,
  repoUrl,
  branch,
  copied,
  onCopy,
  onRetry
}: {
  message: Message;
  repoUrl?: string;
  branch?: string;
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
}) {
  const isUser = message.role === "user";
  const imageAttachments = message.imageAttachments || [];
  const pdfAttachments = message.pdfAttachments || [];
  const hasImageAttachments = imageAttachments.length > 0;
  const hasPdfAttachments = pdfAttachments.length > 0;
  const isStreaming = message.streaming === true;
  const showStreamingPlaceholder =
    isStreaming && !message.content.trim() && !message.thinking?.trim();
  const showActivity =
    isStreaming &&
    message.activity &&
    !["Thinking...", "Thinking…"].includes(message.activity);
  const tokenUsageLabel = formatTokenUsage(message.usage);
  const tokenUsageTitle = telemetryTitle({
    usage: message.usage,
    requestId: message.requestId,
    runId: message.runId,
    modelId: message.modelId,
    durationMs: message.durationMs
  });

  return (
    <article className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`${isUser ? "max-w-[78%]" : "w-full max-w-3xl"}`}>
        {isUser && (hasImageAttachments || hasPdfAttachments) ? (
          <div className="mb-2 flex flex-col items-end gap-2">
            {hasImageAttachments ? (
              <div className="grid max-w-[340px] grid-cols-1 gap-2">
                {imageAttachments.map((image) => (
                  <img
                    key={image.id}
                    src={image.url}
                    alt={image.name}
                    className="max-h-64 w-full rounded-[1.35rem] object-cover"
                  />
                ))}
              </div>
            ) : null}
            {hasPdfAttachments ? (
              <div className="flex max-w-[340px] flex-col gap-2">
                {pdfAttachments.map((pdf) => (
                  <a
                    key={pdf.id}
                    href={pdf.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5 text-left text-sm text-[#111] shadow-sm transition hover:bg-[#f7f7f8]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ff4f45] text-xs font-bold text-white">
                      PDF
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{pdf.name}</span>
                      <span className="text-xs text-[#777]">PDF</span>
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={isUser ? "flex justify-end" : "flex w-full justify-start"}>
          <div
            className={
              isUser
                ? "rounded-[1.35rem] bg-[#0d0d0d] px-4 py-3 text-white"
                : message.error
                  ? "w-full min-w-0 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-950"
                  : "w-full min-w-0 px-1 py-1 text-[#111]"
            }
          >
            {!isUser && message.thinking?.trim() ? (
              <ThinkingPanel content={message.thinking} streaming={isStreaming} />
            ) : null}
            <MarkdownMessage content={message.content} isUser={isUser} />
            {showStreamingPlaceholder ? (
              <div className="mt-2 space-y-2">
                <div className="h-3 w-64 max-w-full animate-pulse rounded-full bg-[#ececec]" />
                <div className="h-3 w-48 max-w-full animate-pulse rounded-full bg-[#ececec]" />
              </div>
            ) : null}
            {showActivity ? (
              <p className="mt-3 text-sm text-[#8a8a8a]">{message.activity}</p>
            ) : null}
            {!isUser && !message.error && message.prUrl ? (
              <a
                href={message.prUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#d9d9d9] bg-white px-4 py-2 text-sm font-medium text-[#202123] transition hover:bg-[#f7f7f8] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
              >
                View pull request
              </a>
            ) : null}
            {!isUser && !message.error && message.sources?.length ? (
              <SourcesPanel
                sources={message.sources}
                repoUrl={repoUrl}
                branch={branch || DEFAULT_BRANCH}
              />
            ) : null}
            {!isUser && hasPdfAttachments ? (
              <div className="mt-3 flex flex-col gap-2">
                {pdfAttachments.map((pdf) => (
                  <a
                    key={pdf.id}
                    href={pdf.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-xs items-center gap-2 rounded-md bg-[#f2f2f2] px-2 py-1 text-xs text-[#555] underline-offset-4 hover:underline"
                  >
                    <span>▯</span>
                    <span className="truncate">{pdf.name}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div
          className={`mt-2 flex items-center gap-3 px-1 text-xs text-[#8a8a8a] ${
            isUser ? "justify-end" : "justify-start"
          }`}
        >
          <span>{roleLabel(message.role)}</span>
          <span>•</span>
          <time>{timeLabel(message.createdAt)}</time>
          {!isUser && !message.error && tokenUsageLabel ? (
            <>
              <span>•</span>
              <span title={tokenUsageTitle || undefined}>{tokenUsageLabel}</span>
            </>
          ) : null}
          {!isUser && !message.error && !isStreaming ? (
            <span className="hidden items-center gap-2 opacity-0 transition group-hover:inline-flex group-hover:opacity-100 sm:inline-flex">
              <button
                type="button"
                onClick={onCopy}
                className="rounded px-1 py-0.5 hover:bg-[#f2f2f2] hover:text-[#444] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={onRetry}
                className="rounded px-1 py-0.5 hover:bg-[#f2f2f2] hover:text-[#444] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
              >
                Retry
              </button>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ThinkingPanel({
  content,
  streaming
}: {
  content: string;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(streaming));
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streaming) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [streaming]);

  useEffect(() => {
    if (!streaming || !open || !previewRef.current) return;
    previewRef.current.scrollTop = previewRef.current.scrollHeight;
  }, [content, streaming, open]);

  return (
    <div className="mb-3 w-full rounded-xl border border-[#ececec] bg-[#fafafa]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-[#555] transition hover:text-[#111] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
        aria-expanded={open ? "true" : "false"}
      >
        <span className="font-medium">{streaming ? "Thinking..." : "Thinking"}</span>
        <IconChevron open={open} />
      </button>
      {open ? (
        <div
          ref={previewRef}
          className="max-h-40 overflow-y-auto border-t border-[#ececec] px-3 py-2.5"
        >
          <p className="whitespace-pre-wrap text-xs leading-5 text-[#666]">{content}</p>
        </div>
      ) : null}
    </div>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-4 w-4 text-[#777] transition ${open ? "rotate-180" : ""}`}
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

function SourcesPanel({
  sources,
  repoUrl,
  branch
}: {
  sources: string[];
  repoUrl?: string;
  branch: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 border-t border-[#ececec] pt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between text-left text-sm text-[#555] transition hover:text-[#111] focus:outline-none focus:ring-2 focus:ring-[#d9d9d9]"
        aria-expanded={open ? "true" : "false"}
      >
        <span className="font-medium">Sources ({sources.length})</span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <ul className="mt-2 space-y-1">
          {sources.map((path) => {
            const href = repoUrl ? githubBlobUrl(repoUrl, branch, path) : null;

            return (
              <li key={path} className="font-mono text-xs text-[#666]">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all underline-offset-4 hover:underline"
                  >
                    {path}
                  </a>
                ) : (
                  <span className="break-all">{path}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
