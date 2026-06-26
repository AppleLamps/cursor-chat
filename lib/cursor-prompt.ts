import type { AgentMode } from "@/lib/defaults";
import { DEFAULT_AGENT_MODE } from "@/lib/defaults";
import { isImplementMode, isPlanMode } from "@/lib/agent-mode";
import { IMPLEMENT_SYSTEM_PROMPT } from "@/lib/implement-prompt";
import { PLAN_SYSTEM_PROMPT } from "@/lib/plan-prompt";
import { CODEBASE_SYSTEM_PROMPT } from "@/lib/system-prompt";
import type { SDKImage } from "@cursor/sdk";

type PromptContext = {
  repoUrl?: string;
  branch?: string;
  mode?: AgentMode;
};

function systemPromptForMode(mode: AgentMode) {
  if (isImplementMode(mode)) return IMPLEMENT_SYSTEM_PROMPT;
  if (isPlanMode(mode)) return PLAN_SYSTEM_PROMPT;
  return CODEBASE_SYSTEM_PROMPT;
}

function userMessageLabelForMode(mode: AgentMode) {
  if (isImplementMode(mode)) return "User task:";
  if (isPlanMode(mode)) return "User planning request:";
  return "User question:";
}

export function buildAgentInstructions(context?: PromptContext) {
  const mode = context?.mode ?? DEFAULT_AGENT_MODE;
  const repoContext =
    context?.repoUrl?.trim()
      ? `Repository under investigation: ${context.repoUrl.trim()}${
          context.branch?.trim() ? ` (branch: ${context.branch.trim()})` : ""
        }`
      : null;

  return `${systemPromptForMode(mode)}${
    repoContext ? `\n\n${repoContext}` : ""
  }`;
}

export function buildUserPrompt(userPrompt: string) {
  return userPrompt.trim();
}

export function defaultImagePrompt() {
  return "What's in this image?";
}

export function buildFirstAgentMessage(
  promptText: string,
  context: PromptContext,
  images?: SDKImage[]
) {
  const mode = context.mode ?? DEFAULT_AGENT_MODE;
  const text = `${buildAgentInstructions(context)}

---

${userMessageLabelForMode(mode)}
${promptText}`;

  return images?.length ? { text, images } : text;
}
