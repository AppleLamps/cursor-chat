"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDotDashedIcon,
  CopyIcon,
  FileTextIcon,
  GitPullRequestIcon,
  RefreshCwIcon
} from "lucide-react";
import { DEFAULT_BRANCH } from "@/lib/defaults";
import type { Message, PdfAttachment } from "@/lib/chat-types";
import { roleLabel, timeLabel } from "@/lib/chat-conversation";
import { formatTokenUsage, telemetryTitle } from "@/lib/chat-telemetry";
import { githubBlobUrl } from "@/lib/sources";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import { Button } from "@/components/ui/button";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger
} from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  Message as MessageRow,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";

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
  const hasTrace =
    !isUser &&
    (Boolean(message.thinking?.trim()) || Boolean(message.activityLog?.length));
  const showStreamingPlaceholder =
    isStreaming && !message.content.trim() && !message.thinking?.trim();
  const showActivity =
    isStreaming &&
    message.activity &&
    !message.activityLog?.length &&
    !["Thinking...", "Thinking…"].includes(message.activity);
  const tokenUsageLabel = formatTokenUsage(message.usage);
  const tokenUsageTitle = telemetryTitle({
    usage: message.usage,
    requestId: message.requestId,
    runId: message.runId,
    modelId: message.modelId,
    durationMs: message.durationMs
  });
  const align = isUser ? "end" : "start";

  return (
    <MessageRow align={align}>
      <MessageContent>
        {isUser && hasImageAttachments ? (
          <AttachmentGroup className="max-w-[340px] self-end">
            {imageAttachments.map((image) => (
              <Attachment
                key={image.id}
                orientation="vertical"
                className="w-36 overflow-hidden"
                title={image.name}
              >
                <AttachmentMedia variant="image" className="h-28">
                  <img src={image.url} alt={image.name} />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{image.name}</AttachmentTitle>
                  <AttachmentDescription>{image.mimeType}</AttachmentDescription>
                </AttachmentContent>
              </Attachment>
            ))}
          </AttachmentGroup>
        ) : null}

        {isUser && hasPdfAttachments ? (
          <PdfAttachmentGroup attachments={pdfAttachments} align="end" />
        ) : null}

        <Bubble
          align={align}
          variant={isUser ? "default" : message.error ? "destructive" : "ghost"}
          className={isUser ? "max-w-[78%]" : "w-full max-w-3xl"}
        >
          <BubbleContent className={isUser ? undefined : "w-full"}>
            {hasTrace ? (
              <TracePanel
                content={message.thinking || ""}
                activityLog={message.activityLog}
                sourceCount={message.sources?.length}
                streaming={isStreaming}
              />
            ) : null}
            <MarkdownMessage content={message.content} isUser={isUser} />
            {showStreamingPlaceholder ? (
              <Marker className="mt-2">
                <MarkerContent className="shimmer">Generating response...</MarkerContent>
              </Marker>
            ) : null}
            {showActivity ? (
              <Marker className="mt-3">
                <MarkerContent className="shimmer">{message.activity}</MarkerContent>
              </Marker>
            ) : null}
            {!isUser && !message.error && message.prUrl ? (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <a href={message.prUrl} target="_blank" rel="noreferrer">
                  <GitPullRequestIcon />
                  View pull request
                </a>
              </Button>
            ) : null}
            {!isUser && !message.error && message.sources?.length ? (
              <SourcesPanel
                sources={message.sources}
                repoUrl={repoUrl}
                branch={branch || DEFAULT_BRANCH}
              />
            ) : null}
            {!isUser && hasPdfAttachments ? (
              <PdfAttachmentGroup attachments={pdfAttachments} align="start" compact />
            ) : null}
          </BubbleContent>
        </Bubble>

        <MessageFooter className="gap-2">
          <span>{roleLabel(message.role)}</span>
          <span aria-hidden="true">/</span>
          <time>{timeLabel(message.createdAt)}</time>
          {!isUser && !message.error && tokenUsageLabel ? (
            <>
              <span aria-hidden="true">/</span>
              <span title={tokenUsageTitle || undefined}>{tokenUsageLabel}</span>
            </>
          ) : null}
          {!isUser && !message.error && !isStreaming ? (
            <span className="inline-flex items-center gap-1 transition sm:opacity-0 sm:group-hover/message:opacity-100 sm:focus-within:opacity-100">
              <Button type="button" variant="ghost" size="xs" onClick={onCopy}>
                <CopyIcon />
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
                <RefreshCwIcon />
                Retry
              </Button>
            </span>
          ) : null}
        </MessageFooter>
      </MessageContent>
    </MessageRow>
  );
}

function PdfAttachmentGroup({
  attachments,
  align,
  compact
}: {
  attachments: PdfAttachment[];
  align: "start" | "end";
  compact?: boolean;
}) {
  return (
    <AttachmentGroup
      className={align === "end" ? "mb-1 max-w-[340px] self-end" : "mt-4"}
    >
      {attachments.map((pdf) => (
        <Attachment
          key={pdf.id}
          size={compact ? "sm" : "default"}
          className={compact ? "max-w-xs" : "max-w-[340px]"}
        >
          <AttachmentTrigger asChild>
            <a href={pdf.url} target="_blank" rel="noreferrer" aria-label={`Open ${pdf.name}`}>
              <span className="sr-only">Open {pdf.name}</span>
            </a>
          </AttachmentTrigger>
          <AttachmentMedia>
            <FileTextIcon />
          </AttachmentMedia>
          <AttachmentContent className="pr-2">
            <AttachmentTitle>{pdf.name}</AttachmentTitle>
            <AttachmentDescription>PDF</AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      ))}
    </AttachmentGroup>
  );
}

function TracePanel({
  content,
  activityLog = [],
  sourceCount = 0,
  streaming
}: {
  content: string;
  activityLog?: string[];
  sourceCount?: number;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const userToggledRef = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const traceText = content.trim();
  const uniqueActivityLog = activityLog.filter(
    (item, index) => item.trim() && item !== activityLog[index - 1]
  );

  useEffect(() => {
    if (streaming && !userToggledRef.current) {
      setOpen(true);
    }
  }, [streaming]);

  useEffect(() => {
    if (!streaming || !open || !previewRef.current) return;
    previewRef.current.scrollTop = previewRef.current.scrollHeight;
  }, [content, streaming, open]);

  return (
    <div className="mb-4 w-full overflow-hidden rounded-xl border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => {
          userToggledRef.current = true;
          setOpen((current) => !current);
        }}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-background/60 focus:outline-none focus:ring-2 focus:ring-ring/50"
        aria-expanded={open ? "true" : "false"}
      >
        <span className="flex min-w-0 items-center gap-2">
          {streaming ? (
            <CircleDotDashedIcon className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <CheckCircle2Icon className="size-4 text-muted-foreground" />
          )}
          <span className="font-semibold text-foreground">
            {streaming ? "Tracing agent flow" : "Agent trace"}
          </span>
          {sourceCount > 0 ? (
            <span className="hidden rounded-md bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
              {sourceCount} sources
            </span>
          ) : null}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className={`size-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          ref={previewRef}
          className="max-h-96 overflow-y-auto border-t border-border bg-background/40 px-3 py-3"
        >
          {uniqueActivityLog.length ? (
            <ol className="space-y-2.5">
              {uniqueActivityLog.map((item, index) => {
                const active = streaming && index === uniqueActivityLog.length - 1;

                return (
                  <li key={`${item}-${index}`} className="flex gap-2.5">
                    <span
                      className={`mt-1 size-2 shrink-0 rounded-full ${
                        active ? "bg-foreground" : "bg-border"
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`min-w-0 text-xs leading-5 ${
                        active ? "font-medium text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {item}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
          {traceText ? (
            <div className={uniqueActivityLog.length ? "mt-3 border-t border-border pt-3" : ""}>
              <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                Reasoning summary
              </p>
              <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                {traceText}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
    <div className="mt-4 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between text-left text-sm text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        aria-expanded={open ? "true" : "false"}
      >
        <span className="font-medium">Sources ({sources.length})</span>
        <ChevronDownIcon
          aria-hidden="true"
          className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <ul className="mt-2 space-y-1">
          {sources.map((path) => {
            const href = repoUrl ? githubBlobUrl(repoUrl, branch, path) : null;

            return (
              <li key={path} className="font-mono text-xs text-muted-foreground">
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
