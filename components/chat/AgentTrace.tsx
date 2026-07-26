"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  BrainIcon,
  CheckIcon,
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
  buildActivitySteps,
  formatElapsedTime,
  type AgentActivityKind,
  type AgentActivityStep
} from "@/lib/agent-activity";

const VISIBLE_STEPS_WHILE_STREAMING = 5;

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

export default function AgentTrace({
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
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const userToggledRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const traceText = content.trim();
  const steps = useMemo(() => buildActivitySteps(activityLog), [activityLog]);
  const currentStep = streaming ? steps[steps.length - 1] : undefined;
  const currentLabel = currentStep?.label || "Starting the Cursor cloud agent…";
  const hiddenStepCount =
    streaming && !showAllSteps
      ? Math.max(0, steps.length - VISIBLE_STEPS_WHILE_STREAMING)
      : 0;
  const visibleSteps = hiddenStepCount ? steps.slice(hiddenStepCount) : steps;

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
    if (!streaming || !open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [content, currentLabel, streaming, open]);

  const stepCountLabel = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  // The header and the timeline would otherwise both spell out the live step,
  // so the header falls back to a summary whenever the timeline is visible.
  const headerDetail = streaming
    ? open
      ? traceText
        ? `${stepCountLabel} · reasoning streaming`
        : stepCountLabel
      : currentLabel
    : `${stepCountLabel}${sourceCount > 0 ? ` · ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}` : ""}`;

  return (
    <div className="mb-4 w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      {streaming ? (
        <div className="h-0.5 overflow-hidden bg-muted" aria-hidden="true">
          <div className="h-full w-1/3 animate-[trace-sweep_1.6s_ease-in-out_infinite] rounded-full bg-foreground/70" />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          userToggledRef.current = true;
          setOpen((current) => !current);
        }}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring/50"
        aria-expanded={open ? "true" : "false"}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {streaming ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <CheckIcon className="size-3.5" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-foreground">
              {streaming ? "Agent is working" : "Agent work completed"}
            </span>
            <span
              className={`mt-0.5 block truncate text-xs font-normal text-muted-foreground ${
                streaming && !open ? "shimmer" : ""
              }`}
              aria-live="polite"
            >
              {headerDetail}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {streaming ? (
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
              {formatElapsedTime(elapsedSeconds)}
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
          ref={scrollRef}
          className="max-h-96 overflow-y-auto border-t border-border bg-muted/20 px-3 py-3"
        >
          {hiddenStepCount ? (
            <button
              type="button"
              onClick={() => setShowAllSteps(true)}
              className="mb-2 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              Show {hiddenStepCount} earlier {hiddenStepCount === 1 ? "step" : "steps"}
            </button>
          ) : null}
          {visibleSteps.length ? (
            <ol className="relative space-y-0">
              {visibleSteps.map((step, index) => (
                <TimelineStep
                  key={step.id}
                  step={step}
                  isLast={index === visibleSteps.length - 1}
                  isActive={streaming === true && step === currentStep}
                  elapsedSeconds={elapsedSeconds}
                />
              ))}
            </ol>
          ) : null}
          {traceText ? (
            <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <BrainIcon aria-hidden="true" className="size-3.5" />
                Reasoning
                {streaming ? (
                  <span className="font-normal normal-case tracking-normal text-muted-foreground/80">
                    live
                  </span>
                ) : null}
              </p>
              <div className="text-muted-foreground">
                <MarkdownMessage content={traceText} isUser={false} size="sm" />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
    <li className="relative flex gap-2.5 pb-3 last:pb-0">
      {!isLast ? (
        <span
          aria-hidden="true"
          className="absolute left-[11px] top-6 bottom-0 w-px bg-border"
        />
      ) : null}
      <span
        className={`relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full border ${
          step.state === "failed"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : isActive
              ? "border-foreground/30 bg-background text-foreground"
              : "border-border bg-background text-muted-foreground"
        }`}
      >
        {isActive ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <Icon className="size-3" />
        )}
      </span>
      <div className="min-w-0 pt-0.5">
        <p
          className={`flex flex-wrap items-center gap-1.5 text-xs leading-5 ${
            isActive
              ? "font-semibold text-foreground"
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
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
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
