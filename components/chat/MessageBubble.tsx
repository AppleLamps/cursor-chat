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
import ArtifactsPanel from "@/components/chat/ArtifactsPanel";
import type { Conversation } from "@/lib/chat-types";
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
  onRetry,
  artifactScope
}: {
  message: Message;
  repoUrl?: string;
  branch?: string;
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
  artifactScope?: {
    apiKey: string;
    conversation: Conversation;
  };
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
                startedAt={message.createdAt}
                streaming={isStreaming}
              />
            ) : null}
            <MarkdownMessage content={message.content} isUser={isUser} />
            {showStreamingPlaceholder && !hasTrace ? (
              <Marker className="mt-2">
                <MarkerContent className="shimmer">Starting the agent…</MarkerContent>
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
            {!isUser &&
            !message.error &&
            !isStreaming &&
            artifactScope?.apiKey &&
            artifactScope.conversation.agentId &&
            artifactScope.conversation.agentSessionToken &&
            artifactScope.conversation.repoUrl ? (
              <ArtifactsPanel
                scope={{
                  apiKey: artifactScope.apiKey,
                  agentId: artifactScope.conversation.agentId,
                  agentSessionToken: artifactScope.conversation.agentSessionToken,
                  repoUrl: artifactScope.conversation.repoUrl,
                  branch: artifactScope.conversation.branch || DEFAULT_BRANCH,
                  agentMode: artifactScope.conversation.agentMode || "qa",
                  model:
                    artifactScope.conversation.model || {
                      id: artifactScope.conversation.modelId || "composer-2.5"
                    }
                }}
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
  startedAt,
  streaming
}: {
  content: string;
  activityLog?: string[];
  sourceCount?: number;
  startedAt: string;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(streaming));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const userToggledRef = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const traceText = content.trim();
  const uniqueActivityLog = activityLog.filter(
    (item, index) => item.trim() && item !== activityLog[index - 1]
  );
  const currentActivity =
    uniqueActivityLog[uniqueActivityLog.length - 1] ||
    "Starting the Cursor cloud agent…";
  const completedActivityLog = streaming
    ? uniqueActivityLog.slice(0, -1)
    : uniqueActivityLog;
  const recentCompletedActivity = completedActivityLog.slice(-5);
  const hiddenActivityCount =
    completedActivityLog.length - recentCompletedActivity.length;

  useEffect(() => {
    if (!userToggledRef.current) {
      setOpen(Boolean(streaming));
    }
  }, [streaming]);

  useEffect(() => {
    if (!streaming) {
      setElapsedSeconds(0);
      return;
    }

    const startedAtMs = Date.parse(startedAt);
    const updateElapsed = () => {
      setElapsedSeconds(
        Number.isFinite(startedAtMs)
          ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1_000))
          : 0
      );
    };
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(interval);
  }, [startedAt, streaming]);

  useEffect(() => {
    if (!streaming || !open || !previewRef.current) return;
    previewRef.current.scrollTop = previewRef.current.scrollHeight;
  }, [content, currentActivity, streaming, open]);

  return (
    <div className="mb-4 w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      {streaming ? (
        <div className="h-0.5 overflow-hidden bg-muted" aria-hidden="true">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-foreground/70" />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          userToggledRef.current = true;
          setOpen((current) => !current);
        }}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm transition hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring/50"
        aria-expanded={open ? "true" : "false"}
      >
        <span className="flex min-w-0 items-center gap-2">
          {streaming ? (
            <CircleDotDashedIcon className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <CheckCircle2Icon className="size-4 text-muted-foreground" />
          )}
          <span className="min-w-0">
            <span className="block font-semibold text-foreground">
              {streaming ? "Agent is working" : "Agent work completed"}
            </span>
            <span
              className="mt-0.5 block truncate text-xs font-normal text-muted-foreground"
              aria-live="polite"
            >
              {streaming
                ? currentActivity
                : `${uniqueActivityLog.length} progress ${uniqueActivityLog.length === 1 ? "step" : "steps"}`}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {streaming ? (
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
              {formatElapsedTime(elapsedSeconds)}
            </span>
          ) : null}
          {sourceCount > 0 ? (
            <span className="hidden rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground sm:inline">
              {sourceCount} sources
            </span>
          ) : null}
          <ChevronDownIcon
            aria-hidden="true"
            className={`size-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open ? (
        <div
          ref={previewRef}
          className="max-h-80 overflow-y-auto border-t border-border bg-muted/20 px-3 py-3"
        >
          {streaming ? (
            <div
              className="rounded-lg border border-border bg-background px-3 py-2.5"
              role="status"
            >
              <div className="flex items-start gap-2.5">
                <CircleDotDashedIcon className="mt-0.5 size-4 shrink-0 animate-spin text-foreground" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {currentActivity}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {activityExplanation(currentActivity)}
                  </p>
                </div>
              </div>
              {elapsedSeconds >= 20 ? (
                <p className="mt-2 border-t border-border pt-2 text-[11px] leading-4 text-muted-foreground">
                  Still working normally. Larger repositories and code reviews can
                  take a few minutes.
                </p>
              ) : null}
            </div>
          ) : null}
          {recentCompletedActivity.length ? (
            <div className={streaming ? "mt-3" : ""}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {streaming ? "Completed" : "Progress"}
                </p>
                {hiddenActivityCount > 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    +{hiddenActivityCount} earlier
                  </span>
                ) : null}
              </div>
              <ol className="space-y-1.5">
                {recentCompletedActivity.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-2 text-xs text-muted-foreground">
                    <CheckCircle2Icon
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 leading-5">{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {traceText ? (
            <div className="mt-3 border-t border-border pt-3">
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

function formatElapsedTime(seconds: number) {
  if (seconds < 1) return "Just started";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function activityExplanation(activity: string) {
  const normalized = activity.toLowerCase();

  if (normalized.includes("writing") || normalized.includes("response")) {
    return "The repository work is complete and the answer is being composed.";
  }
  if (normalized.includes("reasoning") || normalized.includes("thinking")) {
    return "Reviewing the gathered evidence and deciding what matters.";
  }
  if (normalized.includes("waiting for the final run result")) {
    return "Live updates ended, but the durable Cursor run is still being checked.";
  }
  if (normalized.startsWith("finished")) {
    return "Processing that result and deciding the next step.";
  }
  if (
    normalized.includes("reading") ||
    normalized.includes("searching") ||
    normalized.includes("scanning")
  ) {
    return "Inspecting the repository before producing an answer.";
  }
  if (
    normalized.includes("command") ||
    normalized.includes("updating") ||
    normalized.includes("tool")
  ) {
    return "Operating on the repository and checking the outcome.";
  }
  return "The agent is connected and progress will update here.";
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
