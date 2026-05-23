import { CODEBASE_SYSTEM_PROMPT } from "@/lib/system-prompt";

type PromptContext = {
  repoUrl?: string;
  branch?: string;
};

export function buildAgentInstructions(context?: PromptContext) {
  const repoContext =
    context?.repoUrl?.trim()
      ? `Repository under investigation: ${context.repoUrl.trim()}${
          context.branch?.trim() ? ` (branch: ${context.branch.trim()})` : ""
        }`
      : null;

  return `${CODEBASE_SYSTEM_PROMPT}${
    repoContext ? `\n\n${repoContext}` : ""
  }`;
}

export function buildUserPrompt(userPrompt: string) {
  return userPrompt.trim();
}

export function defaultImagePrompt() {
  return "What's in this image?";
}
