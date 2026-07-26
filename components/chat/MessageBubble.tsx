"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
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
import AgentTrace from "@/components/chat/AgentTrace";
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
    (Boolean(message.thinking?.trim()) ||
      Boolean(message.activityLog?.length) ||
      Boolean(message.trace?.length));
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
              <AgentTrace
                content={message.thinking || ""}
                activityLog={message.activityLog}
                trace={message.trace}
                sourceCount={message.sources?.length}
                startedAt={message.createdAt}
                durationMs={message.durationMs}
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
