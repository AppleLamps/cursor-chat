# AskCursor

[AskCursor](https://askcursor.app) is a Next.js app for asking questions about your repositories in plain language. Each user brings their own [Cursor API key](https://cursor.com/dashboard/integrations), picks a connected GitHub repo, and chats with a Cursor cloud agent that reads the codebase and answers for non-engineers.

## Features

- BYOK onboarding with optional "remember on this device" storage in browser `localStorage`
- Repository picker backed by `Cursor.repositories.list()`
- Cursor cloud agents via `@cursor/sdk` (`Agent.create` / `Agent.resume`)
- Streaming answers over SSE with live tool activity
- Image attachments (PNG, JPEG, WebP, GIF — file upload or public URL, up to 5 per message)
- Collapsible **Sources** panel with GitHub links for files the agent read
- Persistent local conversation history with rename and delete
- Read-only system prompt scaled for simple and complex codebase questions
- Default model: `composer-2.5` (see `lib/defaults.ts`)

## Tech Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- `@cursor/sdk`

## Requirements

- Node.js 20 or newer
- npm
- A Cursor account with GitHub repos connected for cloud agents

## Environment Variables

No server-side API keys are required. Users enter their own Cursor API key in the UI.

```bash
cp .env.example .env.local
```

The `.env.example` file documents the BYOK model. You do not need secrets for local development.

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

1. The browser stores the user's API key locally (optional) and conversation metadata in `localStorage`.
2. `POST /api/repos` lists repositories available to that key.
3. `POST /api/chat` creates or resumes a cloud agent against the selected repo and streams SSE events:
   - `agent`, `status`, `text`, `tool`, `source`, `done`, `error`
4. Each conversation stores a Cursor `agentId` so follow-up questions keep context.
5. If resume fails (expired agent), the server starts a fresh cloud agent automatically.

The server is a stateless proxy: it uses the caller's API key for each request and does not persist keys.

## Read-only enforcement

AskCursor uses three layers:

1. **System prompt** (`lib/system-prompt.ts`) — instructs read-only investigation and explanation
2. **Repo hooks** — add `.cursor/hooks.json` in the **target repository** for hard enforcement. See [`docs/hooks.example.json`](docs/hooks.example.json).
3. **SDK plan mode** (future) — the Cloud Agents REST API supports `mode: "plan"`, but `@cursor/sdk` v1.0.13 does not expose it yet. When the SDK adds support, wire it in `app/api/chat/route.ts`.

The example hooks block destructive shell commands. MCP tools are still allowed — tighten `beforeMCPExecution` in the target repo if needed.

## Security notes

- API keys are sent from the browser to this app's server on repo load and chat requests, then forwarded to Cursor. They are not stored server-side.
- Optional "remember on this device" stores the key in `localStorage`, which is readable by any script on the page (standard XSS risk).
- **Rate limiting:** in-memory per-IP limits on `/api/chat` (12/min) and `/api/repos` (30/min). Chat requests allow up to ~20 MB bodies (for image attachments); other API routes use a smaller default cap.
- Ensure hosting logs do not capture request bodies containing API keys.

## Project Structure

```text
app/
  api/chat/route.ts     Cursor SDK streaming route
  api/repos/route.ts    Repository listing route
components/
  ChatApp.tsx           Main chat UI
  Onboarding.tsx        API key gate
  RepoPicker.tsx        Repository + branch picker
lib/
  chat-stream.ts        SSE consumer
  cursor-prompt.ts      System prompt wrapper
  defaults.ts           App constants (model, prompts)
  chat-images.ts        Image payload parsing for Cursor SDK
  repo.ts               Repository fetch helpers
  sources.ts            Source path extraction + GitHub links
  sse.ts                SSE helpers
  rate-limit.ts         In-memory per-IP rate limits + body size guard
  storage.ts            Browser localStorage helpers
  system-prompt.ts      Codebase Q&A instructions
docs/
  hooks.example.json    Example read-only hooks for target repos
```

## Deployment

Deploy like any Next.js app (for example on Vercel). No server secrets are required.

1. Push the repository to GitHub.
2. Import the project in your hosting provider.
3. Deploy with default Next.js settings.
4. Point [askcursor.app](https://askcursor.app) at your deployment.
5. Users connect by pasting their own Cursor API key at runtime.

Usage is billed to each user's Cursor account through normal cloud agent consumption.

## Notes

- Conversation history, API key (optional), and default repo live in browser `localStorage`.
- Changing the repository on a thread clears its `agentId` so the next message starts a fresh cloud agent.
- Failed chat responses clear the stored `agentId` so the next retry can start clean.
- Text-only or image+text chat (up to 5 images per message via Cursor SDK)
- PDF attachments are not supported.
