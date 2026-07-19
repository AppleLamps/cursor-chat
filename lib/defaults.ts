export const APP_NAME = "AskCursor";

export type AgentMode = "qa" | "plan" | "implement";

export const DEFAULT_AGENT_MODE: AgentMode = "qa";

export const DEFAULT_BRANCH = "main";

export const AVAILABLE_MODELS = [
  {
    id: "composer-2.5",
    label: "Composer 2.5",
    description: "Default balanced model for everyday repository Q&A and tasks"
  },
  {
    id: "grok-4.5",
    label: "Grok 4.5 High",
    description: "Higher-capability model for more demanding codebase work"
  }
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];

export const DEFAULT_MODEL_ID: ModelId = "composer-2.5";

export function parseModelId(value: unknown): ModelId {
  const modelId = typeof value === "string" ? value.trim() : "";
  return (
    AVAILABLE_MODELS.find((model) => model.id === modelId)?.id ??
    DEFAULT_MODEL_ID
  );
}

export function validateModelId(value: unknown):
  | { ok: true; value: ModelId }
  | { ok: false; error: string } {
  const modelId = typeof value === "string" ? value.trim() : "";

  if (!modelId) {
    return { ok: true, value: DEFAULT_MODEL_ID };
  }

  const model = AVAILABLE_MODELS.find((candidate) => candidate.id === modelId);

  if (!model) {
    return {
      ok: false,
      error: `Unsupported model. Choose one of: ${AVAILABLE_MODELS.map(
        (candidate) => candidate.id
      ).join(", ")}.`
    };
  }

  return { ok: true, value: model.id };
}

export function modelLabel(modelId: ModelId) {
  return (
    AVAILABLE_MODELS.find((model) => model.id === modelId)?.label ?? modelId
  );
}

export const BRANCH_PRESETS = [
  "main",
  "master",
  "develop",
  "staging",
  "production"
] as const;

export const SUGGESTED_PROMPTS = [
  "What does this repository do?",
  "How is the project structured?",
  "Where is the main entry point?",
  "What frameworks and libraries are used?",
  "How does data flow through the app?",
  "Where should a new developer start?"
];

export const SUGGESTED_PLAN_PROMPTS = [
  "Make a plan to add this feature safely",
  "Identify the files and tests this change would touch",
  "Find risks and edge cases before implementation",
  "Plan a refactor for this area without changing behavior",
  "Outline a rollout and verification checklist",
  "Compare possible approaches for this change"
];

export const SUGGESTED_IMPLEMENT_PROMPTS = [
  "Fix a typo in the README",
  "Add a unit test for the main utility function",
  "Update the README to document the setup steps",
  "Fix the broken link in the docs",
  "Add a type annotation where TypeScript is failing",
  "Rename a misleading variable in the entry point file"
];
