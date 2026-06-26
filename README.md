# AskCursor

[AskCursor](https://askcursor.app) is a Next.js app for asking questions about your repositories in plain language. Each user brings their own [Cursor API key](https://cursor.com/dashboard/integrations), picks a connected GitHub repo, and chats with a Cursor cloud agent that reads the codebase and answers for non-engineers..

## Features

- BYOK onboarding with optional "remember on this device" storage in browser `localStorage`
- Optional GitHub personal access token for branch listing (stored locally like the Cursor key)
- Repository picker backed by `Cursor.repositories.list()` with per-conversation branch selection
- **Ask mode** (default): read-only Q&A for non-engineers
- **Implement mode** (optional): scoped code changes with automatic pull request creation via `autoCreatePR`
- Cursor cloud agents via `@cursor/sdk@1.0.22` (`Agent.create` / `Agent.resume`)
- Streaming answers over SSE with live tool activity and collapsible **Thinking** panel
- Markdown responses with styled code blocks, one-click copy, and **View pull request** links when a PR is opened
- Image attachments (PNG, JPEG, WebP, GIF — file upload or public URL, up to 5 per message)
- Collapsible **Sources** panel with GitHub links for files the agent read
- Persistent local conversation history with rename and delete
- System prompt sent once per conversation (first message only), scaled for simple and complex questions or tasks
- Default model: `composer-2.5` (see `lib/defaults.ts`)

## Tech Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- `@cursor/sdk`

## Requirements

- Node.js 22.13 or newer
- npm
- A Cursor account with GitHub repos connected for cloud agents

## Environment Variables

No server-side Cursor API key is required. Users enter their own Cursor API key in the UI.

Production deployments must also configure durable request controls and a stable
agent-session signing secret:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ASKCURSOR_AGENT_SESSION_SECRET`
- `ASKCURSOR_MAX_ACTIVE_CHAT_STREAMS` (optional, defaults to `50`)

```bash
cp .env.example .env.local
```

The `.env.example` file documents the BYOK model. You do not need these secrets
for local development; local dev falls back to in-memory request controls.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Build for production:

```bash
npm run build
npm run start
```

## How it works

1. The browser stores the user's Cursor API key (optional) and conversation metadata in `localStorage`.
2. When starting a new chat, the user picks **Ask** or **Implement** mode. Mode is locked after the first message.
3. `POST /api/repos` lists repositories available to that key.
4. `POST /api/branches` lists branches for a selected repo when a GitHub token is provided.
5. `POST /api/chat` creates or resumes a cloud agent against the selected repo and branch, then streams SSE events:
   - `agent`, `status`, `text`, `thinking`, `tool`, `source`, `done`, `error`
6. **First message** in a conversation: the server validates mode policy, then `Agent.create()` and `agent.send()` run with the mode-specific system prompt, repo/branch context, and the user's message combined in one payload (`buildFirstAgentMessage()` in `lib/cursor-prompt.ts`).
   - **Ask mode:** read-only prompt; `skipReviewerRequest: true`
   - **Implement mode:** implementation prompt; `autoCreatePR: true`
7. **Follow-up messages**: `Agent.resume()` then `agent.send()` with plain user text only — the system prompt is not repeated.
8. The `done` event may include `prUrl` when Implement mode opens a pull request.
9. Each conversation stores a Cursor `agentId` plus a signed server-issued session token so follow-ups keep agent context only for the same API key, repo, branch, and mode.
10. If resume fails (expired agent), the server starts a fresh cloud agent automatically.

The server is a stateless proxy: it uses the caller's API key for each request and does not persist keys.

## Chat modes

| Mode | Use case | Agent behavior |
|------|----------|----------------|
| **Ask** | PMs, support, compliance — understand the codebase | Read-only investigation and explanation |
| **Implement** | Small scoped fixes, docs updates, tests | Edit code, commit, open a PR |

Implement mode requires write access to the target repo through the user's Cursor GitHub integration. Organization policies may block cloud agent pushes.

Server-side guardrails in `lib/agent-policy.ts` make Implement mode a privileged path:

- Fresh Implement runs require explicit user confirmation in the UI and `implementConfirmed: true` at the API boundary.
- Protected branches are blocked by default: `main`, `master`, `prod`, `production`, `release`, `release/*`, and `hotfix/*`.
- Deployments can disable Implement mode or restrict it by owner, repo, and branch with the `ASKCURSOR_IMPLEMENT_*` environment variables documented in `.env.example`.
- Follow-up runs must present the signed `agentSessionToken` issued with the original `agentId`; mismatched repo, branch, mode, or API key starts are rejected.

## Read-only enforcement (Ask mode)

Ask mode uses two active layers plus a future SDK option:

1. **System prompt** (`lib/system-prompt.ts`) — sent on the **first message only** via `buildFirstAgentMessage()`. It instructs read-only investigation, depth-matched answers, an investigation playbook (README → search → tests → trace), backtick file citations, image/screenshot handling, and an engineering handoff sentence when users ask for code changes.
2. **Repo hooks** — add `.cursor/hooks.json` in the **target repository** for hard enforcement. See [`docs/hooks.example.json`](docs/hooks.example.json). Production deployments should require these hooks for repositories that are used in Ask mode, because prompt instructions alone are not a hard security boundary.

The example hooks block destructive shell commands and git mutations. MCP tools are still allowed — tighten `beforeMCPExecution` in the target repo if needed.

## Implement mode and repo hooks

Implement mode expects the target repository **not** to use the read-only hooks profile. Optionally add [`docs/hooks.implement.example.json`](docs/hooks.implement.example.json) for a lighter safety net that still allows git commit/push.

**Not used for either mode:** `@cursor/sdk@1.0.22` exposes an agent conversation `mode` option (`"agent"` or `"plan"`), but this app still uses its own **Ask** and **Implement** product modes plus first-message instructions. Revisit this mapping before wiring SDK plan mode into Ask mode.

## Security notes

- API keys are sent from the browser to this app's server on repo load and chat requests, then forwarded to Cursor. They are not stored server-side.
- Optional "remember on this device" stores the key in `localStorage`, which is readable by any script on the page (standard XSS risk).
- **Implement mode writes to the repository** and opens pull requests billed to the user's Cursor account. It is server-gated by confirmation, signed agent sessions, optional allowlists, and protected-branch blocking.
- **Rate limiting:** durable Redis-backed limits on `/api/chat` (12/min Ask, 6/min Implement), `/api/repos` (30/min), and `/api/branches` (60/min). Chat also limits by Cursor API key hash and caps active streams with `ASKCURSOR_MAX_ACTIVE_CHAT_STREAMS`. In production, missing or unavailable Redis request controls fail closed with `503`.
- **Session signing:** production requires `ASKCURSOR_AGENT_SESSION_SECRET` (or `AUTH_SECRET` / `NEXTAUTH_SECRET`) so signed agent resume tokens survive deploys and cold starts.
- **Repository input:** chat requests only accept normalized `https://github.com/{owner}/{repo}` URLs and valid Git branch/ref names before calling the Cursor SDK.
- Ensure hosting logs do not capture request bodies containing API keys.

## Project Structure

```text
app/
  api/chat/route.ts       Cursor SDK streaming route (create/resume + SSE)
  api/repos/route.ts      Repository listing route
  api/branches/route.ts   GitHub branch listing route
components/
  ChatApp.tsx             Main chat UI, markdown, thinking/sources/PR links
  Onboarding.tsx          API key gate
  RepoPicker.tsx          Repository, branch, and mode picker
  SidebarRecents.tsx      Conversation sidebar
lib/
  agent-mode.ts           AgentMode parsing helpers
  chat-stream.ts          SSE consumer (client)
  cursor-prompt.ts        First-message vs follow-up prompt builders
  defaults.ts             App constants (model, branch presets, prompts)
  chat-images.ts          Image payload parsing for Cursor SDK
  conversations.ts        Conversation types and helpers
  github.ts               GitHub branch API helpers
  implement-prompt.ts     Implement-mode system prompt
  repo.ts                 Repository fetch helpers
  sources.ts              Source path extraction + GitHub links
  sse.ts                  SSE event types and formatting
  stream-buffer.ts        Streaming text buffer utilities
  thinking.ts             Thinking text extraction and merge helpers
  rate-limit.ts           In-memory per-IP rate limits + body size guard
  storage.ts              Browser localStorage helpers
  system-prompt.ts        Read-only codebase Q&A instructions
docs/
  hooks.example.json           Read-only hooks for Ask mode target repos
  hooks.implement.example.json Optional lighter hooks for Implement mode
```

## Deployment

Deploy like any Next.js app (for example on Vercel). No server-side Cursor API
key is required, but production request controls and session signing need
environment variables.

1. Push the repository to GitHub.
2. Import the project in your hosting provider.
3. Configure `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `ASKCURSOR_AGENT_SESSION_SECRET`.
4. Point [askcursor.app](https://askcursor.app) at your deployment.
5. Users connect by pasting their own Cursor API key at runtime.

Usage is billed to each user's Cursor account through normal cloud agent consumption.

## Notes

- Conversation history, API keys (optional), default repo, and default chat mode live in browser `localStorage`.
- Chat mode is chosen when starting a new chat and cannot be changed after the first message — start a new chat to switch modes.
- Changing the repository or branch on a thread clears its `agentId` so the next message starts a fresh cloud agent with the system prompt re-sent.
- Failed chat responses clear the stored `agentId` so the next retry can start clean.
- Text-only or image+text chat (up to 5 images per message via Cursor SDK).
- PDF attachments are not supported.
- GitHub token is only used to list branches via `/api/branches`; it is not sent to Cursor.
