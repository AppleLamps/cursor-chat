"use client";

import { memo, useId, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FileTextIcon,
  GitPullRequestIcon,
  PackageIcon,
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
import ImplementationPanel from "@/components/chat/ImplementationPanel";
import { safePullRequestUrl } from "@/lib/implementation";
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

function MessageBubble({
  message,
  repoUrl,
  branch,
  copied,
  canRegenerate = false,
  onCopy,
  onRetry,
  artifactScope
}: {
  message: Message;
  repoUrl?: string;
  branch?: string;
  copied: boolean;
  /** Only the latest answer can be regenerated, and never in Implement mode. */
  canRegenerate?: boolean;
  /** Stable callbacks that take the message, so memoised bubbles can be skipped. */
  onCopy: (message: Message) => void;
  onRetry: (messageId: string) => void;
  artifactScope?: {
    apiKey: string;
    githubToken?: string | null;
    conversation: Conversation;
  };
}) {
  const isUser = message.role === "user";
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [artifactsRequested, setArtifactsRequested] = useState(false);
  const sourcesId = useId();
  const artifactsId = useId();
  const artifactsTriggerId = useId();
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
      <MessageContent className={isUser ? undefined : "gap-1.5"}>
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
            {!isUser && !message.implementation && !message.error && safePullRequestUrl(message.prUrl, repoUrl) ? (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <a href={message.prUrl} target="_blank" rel="noreferrer">
                  <GitPullRequestIcon />
                  View pull request
                </a>
              </Button>
            ) : null}
            {!isUser && message.implementation ? <ImplementationPanel outcome={message.implementation} scope={artifactScope} /> : null}
            {!isUser && hasPdfAttachments ? (
              <PdfAttachmentGroup attachments={pdfAttachments} align="start" compact />
            ) : null}
          </BubbleContent>
        </Bubble>

        {isUser ? (
          <MessageFooter className="gap-2">
            <span>{roleLabel(message.role)}</span>
            <span aria-hidden="true">/</span>
            <time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>
          </MessageFooter>
        ) : (
          <>
            <MessageFooter className="w-full max-w-3xl flex-wrap gap-x-1 gap-y-0.5 px-0">
              {!message.error && message.sources?.length ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="min-h-11 gap-1.5 md:min-h-7"
                  onClick={() => setSourcesOpen((current) => !current)}
                  aria-expanded={sourcesOpen}
                  aria-controls={sourcesOpen ? sourcesId : undefined}
                >
                  <FileTextIcon aria-hidden="true" />
                  Sources ({message.sources.length})
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={`transition ${sourcesOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              ) : null}
              {!message.error && !isStreaming && artifactScope?.apiKey &&
              artifactScope.conversation.agentId &&
              artifactScope.conversation.agentSessionToken &&
              artifactScope.conversation.repoUrl ? (
                <Button
                  id={artifactsTriggerId}
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="min-h-11 gap-1.5 md:min-h-7"
                  onClick={() => {
                    setArtifactsRequested(true);
                    setArtifactsOpen((current) => !current);
                  }}
                  aria-expanded={artifactsOpen}
                  aria-controls={artifactsRequested ? artifactsId : undefined}
                >
                  <PackageIcon aria-hidden="true" />
                  Artifacts
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={`transition ${artifactsOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              ) : null}
              {!message.error && !isStreaming ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="min-h-11 min-w-11 md:min-h-7 md:min-w-7"
                    aria-label={copied ? "Copied answer" : "Copy answer"}
                    title={copied ? "Copied" : "Copy answer"}
                    onClick={() => onCopy(message)}
                  >
                    {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
                  </Button>
                  {canRegenerate ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="min-h-11 min-w-11 md:min-h-7 md:min-w-7"
                      aria-label="Retry answer"
                      title="Retry answer"
                      onClick={() => onRetry(message.id)}
                    >
                      <RefreshCwIcon aria-hidden="true" />
                    </Button>
                  ) : null}
                </>
              ) : null}
              <span className="ml-auto inline-flex min-h-7 items-center gap-2 whitespace-nowrap pl-2 text-[11px] font-normal text-muted-foreground/75">
                {!message.error && tokenUsageLabel ? (
                  <span title={tokenUsageTitle || undefined}>{tokenUsageLabel}</span>
                ) : null}
                <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
                  {timeLabel(message.createdAt)}
                </time>
              </span>
            </MessageFooter>
            {!message.error && sourcesOpen && message.sources?.length ? (
              <SourcesPanel
                id={sourcesId}
                sources={message.sources}
                repoUrl={repoUrl}
                branch={branch || DEFAULT_BRANCH}
              />
            ) : null}
            {!message.error && !isStreaming && artifactsRequested &&
            artifactScope?.apiKey && artifactScope.conversation.agentId &&
            artifactScope.conversation.agentSessionToken && artifactScope.conversation.repoUrl ? (
              <ArtifactsPanel
                id={artifactsId}
                labelledBy={artifactsTriggerId}
                open={artifactsOpen}
                scope={{
                  apiKey: artifactScope.apiKey,
                  agentId: artifactScope.conversation.agentId,
                  agentSessionToken: artifactScope.conversation.agentSessionToken,
                  repoUrl: artifactScope.conversation.repoUrl,
                  branch: artifactScope.conversation.branch || DEFAULT_BRANCH,
                  agentMode: artifactScope.conversation.agentMode || "qa",
                  model: artifactScope.conversation.model || {
                    id: artifactScope.conversation.modelId || "composer-2.5"
                  }
                }}
              />
            ) : null}
          </>
        )}
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
  id,
  sources,
  repoUrl,
  branch
}: {
  id: string;
  sources: string[];
  repoUrl?: string;
  branch: string;
}) {
  return (
    <ul
      id={id}
      aria-label="Source files"
      tabIndex={0}
      className="w-full max-w-3xl max-h-40 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/20 px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:max-h-48"
    >
      {sources.map((path) => {
        const href = repoUrl ? githubBlobUrl(repoUrl, branch, path) : null;

        return (
          <li key={path} className="font-mono text-xs text-muted-foreground">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center break-all rounded-sm py-1 underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:min-h-7"
              >
                {path}
              </a>
            ) : (
              <span className="block break-all py-1">{path}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default memo(MessageBubble);
