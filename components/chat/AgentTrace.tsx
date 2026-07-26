"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  BrainIcon,
  ChevronDownIcon,
  FileSearchIcon,
  GitBranchIcon,
  HourglassIcon,
  LoaderIcon,
  PencilLineIcon,
  SearchIcon,
  SparklesIcon,
  TerminalIcon,
  WorkflowIcon
} from "lucide-react";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import {
  activityExplanation,
  buildTraceItems,
  countTraceSteps,
  formatElapsedTime,
  type AgentActivityKind,
  type AgentActivityStep,
  type AgentTraceEntry,
  type AgentTraceItem
} from "@/lib/agent-activity";

const STEP_ICONS: Record<AgentActivityKind, typeof SearchIcon> = {
  start: SparklesIcon,
  search: SearchIcon,
  read: FileSearchIcon,
  edit: PencilLineIcon,
  command: TerminalIcon,
  git: GitBranchIcon,
  task: WorkflowIcon,
  reasoning: BrainIcon,
  writing: PencilLineIcon,
  waiting: HourglassIcon,
  generic: WorkflowIcon
};

/**
 * The run's reasoning and tool calls rendered directly in the conversation
 * flow, in the order they happened. Nothing here scrolls on its own: the trace
 * grows down the page like any other message so the newest work stays in view.
 */
export default function AgentTrace({
  content,
  activityLog = [],
  trace,
  sourceCount = 0,
  startedAt,
  durationMs,
  streaming
}: {
  content: string;
  activityLog?: string[];
  trace?: AgentTraceEntry[];
  sourceCount?: number;
  startedAt: string;
  durationMs?: number;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(streaming));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const userToggledRef = useRef(false);
  const items = useMemo(
    () => buildTraceItems(trace, { activityLog, thinking: content }),
    [trace, activityLog, content]
  );
  const lastStep = useMemo(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.type === "step") return item.step;
    }
    return undefined;
  }, [items]);
  const activeStep = streaming ? lastStep : undefined;
  const stepCount = countTraceSteps(items);

  useEffect(() => {
    // Collapse once the run ends unless the reader has taken over the toggle.
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

  const stepCountLabel = `${stepCount} ${stepCount === 1 ? "step" : "steps"}`;
  const sourceLabel = sourceCount
    ? ` · ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}`
    : "";
  // Expanded, the timeline already spells out the live step, so the header
  // summarizes instead of repeating it.
  const summary = streaming
    ? open
      ? `Working · ${stepCountLabel}`
      : lastStep?.label || "Starting the Cursor cloud agent…"
    : `${
        durationMs && durationMs > 0
          ? `Worked for ${formatElapsedTime(Math.round(durationMs / 1_000))} · `
          : ""
      }${stepCountLabel}${sourceLabel}`;

  return (
    <div className="mb-4 w-full">
      <button
        type="button"
        onClick={() => {
          userToggledRef.current = true;
          setOpen((current) => !current);
        }}
        className="-ml-1 flex max-w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        aria-expanded={open ? "true" : "false"}
      >
        {streaming ? (
          <LoaderIcon aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <BrainIcon aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        <span
          className={`truncate font-medium ${streaming ? "shimmer" : ""}`}
          aria-live="polite"
        >
          {summary}
        </span>
        {streaming ? (
          <span className="shrink-0 tabular-nums text-muted-foreground/80">
            {formatElapsedTime(elapsedSeconds)}
          </span>
        ) : null}
        <ChevronDownIcon
          aria-hidden="true"
          className={`size-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && items.length ? (
        <ol className="mt-1.5 space-y-0 border-l border-border pl-0">
          {items.map((item, index) => (
            <TraceItem
              key={item.id}
              item={item}
              isLast={index === items.length - 1}
              isActive={
                streaming === true &&
                item.type === "step" &&
                item.step === activeStep
              }
              elapsedSeconds={elapsedSeconds}
            />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function TraceItem({
  item,
  isLast,
  isActive,
  elapsedSeconds
}: {
  item: AgentTraceItem;
  isLast: boolean;
  isActive: boolean;
  elapsedSeconds: number;
}) {
  if (item.type === "reasoning") {
    return (
      // Indented to line up with step labels rather than their icons.
      <li className={`relative pl-10 ${isLast ? "" : "pb-3"}`}>
        <div className="text-xs leading-5 text-muted-foreground">
          <MarkdownMessage content={item.text} isUser={false} size="sm" />
        </div>
      </li>
    );
  }

  return (
    <TimelineStep
      step={item.step}
      isLast={isLast}
      isActive={isActive}
      elapsedSeconds={elapsedSeconds}
    />
  );
}

function TimelineStep({
  step,
  isLast,
  isActive,
  elapsedSeconds
}: {
  step: AgentActivityStep;
  isLast: boolean;
  isActive: boolean;
  elapsedSeconds: number;
}) {
  const Icon = step.state === "failed" ? AlertCircleIcon : STEP_ICONS[step.kind];

  return (
    <li className={`relative flex gap-2 pl-4 ${isLast ? "" : "pb-3"}`}>
      <span
        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center ${
          step.state === "failed"
            ? "text-destructive"
            : isActive
              ? "text-foreground"
              : "text-muted-foreground"
        }`}
      >
        {isActive ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <Icon className="size-3" />
        )}
      </span>
      <div className="min-w-0">
        <p
          className={`flex flex-wrap items-center gap-1.5 text-xs leading-5 ${
            isActive
              ? "font-medium text-foreground"
              : step.state === "failed"
                ? "text-destructive"
                : "text-muted-foreground"
          }`}
        >
          <span className={isActive ? "shimmer" : undefined}>{step.label}</span>
          {step.repeatCount > 1 ? (
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              ×{step.repeatCount}
            </span>
          ) : null}
        </p>
        {isActive ? (
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground/80">
            {activityExplanation(step.label)}
          </p>
        ) : null}
        {isActive && elapsedSeconds >= 20 ? (
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground/80">
            Still working normally. Larger repositories and code reviews can take
            a few minutes.
          </p>
        ) : null}
      </div>
    </li>
  );
}
