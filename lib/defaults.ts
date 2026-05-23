export const APP_NAME = "AskCursor";

export type AgentMode = "qa" | "implement";

export const DEFAULT_AGENT_MODE: AgentMode = "qa";

export const DEFAULT_BRANCH = "main";

export const CURSOR_MODEL = "composer-2.5";

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

export const SUGGESTED_IMPLEMENT_PROMPTS = [
  "Fix a typo in the README",
  "Add a unit test for the main utility function",
  "Update the README to document the setup steps",
  "Fix the broken link in the docs",
  "Add a type annotation where TypeScript is failing",
  "Rename a misleading variable in the entry point file"
];
