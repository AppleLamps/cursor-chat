import { CODEBASE_SYSTEM_PROMPT } from "@/lib/system-prompt";

type PromptContext = {
  repoUrl?: string;
  branch?: string;
};

export function wrapUserPrompt(userPrompt: string, context?: PromptContext) {
  const repoContext =
    context?.repoUrl?.trim()
      ? `Repository under investigation: ${context.repoUrl.trim()}${
          context.branch?.trim() ? ` (branch: ${context.branch.trim()})` : ""
        }`
      : null;

  return `${CODEBASE_SYSTEM_PROMPT}${
    repoContext ? `\n\n${repoContext}` : ""
  }

---

User question:
${userPrompt.trim()}`;
}
