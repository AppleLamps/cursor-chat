export const APP_NAME = "AskCursor";

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
