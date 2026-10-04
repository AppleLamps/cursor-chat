# AskCursor

Ask questions, plan changes, and run scoped implementation tasks against your
GitHub repositories with Cursor cloud agents.

[AskCursor](https://askcursor.app) is a self-hostable Next.js application built
around a bring-your-own-key model. Users connect a Cursor API key, select one of
their linked repositories, and work in one of three purpose-built modes:
read-only Q&A, implementation planning, or guarded code changes with automatic
pull request creation.

## Highlights

- **Three workflows:** Ask, Plan, and Implement modes for different levels of
  access and intent.
- **Bring your own key:** Cursor credentials are supplied at runtime, kept in
  session storage by default, and never persisted by the server.
- **Repository-aware conversations:** Select a repository, branch, and model
  before starting a chat.
- **Streaming agent activity:** Follow responses, tool activity, sources, and
  reasoning summaries in real time over Server-Sent Events.
- **Guarded implementation:** Explicit confirmation, signed agent sessions,
  separate working branches, and optional deployment allowlists limit write-capable
  runs.
- **Rich chat experience:** Markdown, syntax-highlighted code, image
  attachments, source links, usage telemetry, and persistent local history.

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 22.13 or later
- npm
- A [Cursor](https://cursor.com/) account with at least one connected GitHub
  repository
- A Cursor API key from the
  [Cursor integrations dashboard](https://cursor.com/dashboard/integrations)

### Run locally

```bash
git clone https://github.com/AppleLamps/cursor-chat.git
cd cursor-chat
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter your Cursor API key,
and choose a repository. The included `.env.example` works as documentation;
local development does not require Redis or a server-side Cursor key.

To enable the branch picker, users may also connect GitHub. The token is sent
only to the branch-listing endpoint and is not forwarded to Cursor.

#### "Connect Cursor" button

The first screen offers **Connect Cursor**, which uses the SDK's browser sign-in
(`Cursor.auth.login()`): the user approves in a Cursor page and the app receives
a named `AskCursor` API key that expires after 90 days. Nothing needs to be
configured, and the key is not stored on the server (`store: null`, so the SDK
does not write it to the server's credential file). Pasting a key still works.

The sign-in request stays open while the user approves, so it is rate limited
(5 per minute per client), capped at 25 pending per server instance, and given
5 minutes. If the connection drops (a backgrounded mobile tab can lose it), the user
taps Connect again or pastes a key.

#### "Connect GitHub" button (optional)

GitHub also supports OAuth, so a deployment can offer a **Connect GitHub**
button instead of asking users to create a personal access token:

1. Create a [GitHub OAuth App](https://github.com/settings/developers) with the
   authorization callback URL `https://<your-host>/api/auth/github/callback`
   (`http://localhost:3000/api/auth/github/callback` for local development).
2. Set `ASKCURSOR_GITHUB_CLIENT_ID` and `ASKCURSOR_GITHUB_CLIENT_SECRET`.

When both are set the button appears; users can still paste a token instead.
When they are unset the app behaves exactly as before.

### Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run lint` | Run ESLint (Next.js core-web-vitals and TypeScript rules) |
| `npm run typecheck` | Validate TypeScript without emitting files |
| `npm run test` | Run the Vitest test suite |
| `npm run check` | Lint, type-check, and test in one go (what CI runs before building) |
| `npm run build` | Create an optimized production build |
| `npm run start` | Serve the production build |

## Chat modes

| Mode | Intended use | Behavior |
| --- | --- | --- |
| **Ask** | Understand a codebase | Read-only by instruction (system prompt only) |
| **Plan** | Design a safe change | Read-only by instruction, run in the SDK's `plan` mode |
| **Implement** | Complete a scoped task | May edit code, commit changes, and open a pull request |

The selected mode is fixed after the first message. Start a new conversation to
switch modes.

Ask is enforced only through its system prompt; Plan adds the SDK's `plan`
mode. The Cursor SDK has no hard read-only switch for cloud agents, so neither
is a security boundary, and a prompt-injected repository could still try to make
an Ask run write. For a real boundary, install the example
[read-only Cursor hooks](docs/hooks.example.json) in each target repository, or
use a Cursor key and GitHub integration that cannot write to it.

Implement mode is intentionally privileged:

- The user must explicitly confirm the first write-capable run.
- Protected branches are denied by default, including `main`, `master`,
  `production`, `release/*`, and `hotfix/*`. `refs/heads/main` is treated as
  `main`.
- Deployments can disable the mode or restrict allowed owners, repositories, and
  branches.
- Follow-up requests require a signed session token bound to the API key,
  repository, branch, mode, and model.
- The target repository must permit writes through the user's Cursor GitHub
  integration and must not use the read-only hooks profile.

An optional [Implement-mode hooks example](docs/hooks.implement.example.json)
provides a lighter repository safety policy while preserving commit and push
access.

## Core capabilities

- Repository discovery through `Cursor.repositories.list()`
- Optional GitHub-backed branch discovery
- Selectable `composer-2.5` and `grok-4.5` models
- Cursor agent creation and resume through `@cursor/sdk`
- Automatic recovery when a previous cloud agent no longer exists
- Streaming text, status, tool, source, and completion events
- Expandable agent trace with ordered activity and reasoning summaries
- GitHub source links for files inspected by the agent
- Pull request links returned by successful Implement runs
- PNG, JPEG, WebP, and GIF attachments, up to five images per message
- Local conversation history with rename, delete, undo delete, search across
  titles and message text, and cross-tab synchronization
- Chat export and import (Settings): a JSON file with your questions, answers
  and attached images, but never keys or cloud agent links. Import adds new
  chats and takes an imported copy only when it is newer
- Per-response duration, model, request ID, and token usage when reported by
  Cursor

## How it works

1. The user enters a Cursor API key and, optionally, a GitHub token.
2. The browser requests the repositories available to the Cursor account.
3. The user selects a repository, branch, mode, and model.
4. The first message creates a Cursor cloud agent with the selected context and
   the appropriate mode policy.
5. `/api/chat` streams agent events to the browser over SSE.
6. The browser stores the returned agent ID and signed session token for
   validated follow-up requests.
7. Implement runs retain Cursor's current branch/PR metadata across terminal
   states. The status panel verifies PR state and cumulative changed files using
   read-only GitHub requests. Refresh status rechecks the same run, without
   starting an agent or submitting a prompt.

The selected branch is a **starting ref**, including `main`, rather than a direct
write target. Implement explicitly sets `workOnCurrentBranch: false` and
`autoCreatePR: true`. Follow-ups use `Agent.resume()` and `send()` on the same
agent. An unavailable Implement agent produces an actionable error instead of
silently starting fresh work without the original task/PR context. Changing a
repository, starting ref, or model after messages exist creates a separate chat.

A completed Cursor run does not prove that a PR was created, is open, or was
merged. Cursor's Git metadata is current **per-agent state**, even when reading
a historical run; the panel labels it accordingly and retains multiple branches.
The verified PR base/head and open/draft/closed/merged state come from GitHub.
Changed files are cumulative PR changes, capped at 300 with truncation indicated.
Without a reported PR, changed files are unavailable; tool-read sources are not
presented as edited files. Private PR verification requires a GitHub token with
read access to Pull requests (and any required organization SSO approval).
That token is never supplied to Cursor and cannot fix Cursor integration access.

Dropped launch responses retry the original turn and private deterministic agent
identity; known run IDs reconnect through `Agent.getRun()` without resubmitting
the prompt. Stop checks authoritative status after cancellation and preserves a
run that already finished. Existing run observation and cancellation remain
available when deployment write policy changes. Older Implement session tokens
may be observed/stopped, but new writes require a new chat under the explicit
branch-isolation contract.

The server acts as a stateless credential proxy. Cursor API keys are forwarded
for each relevant request but are not stored server-side. Conversation history,
credentials explicitly selected for device storage, defaults, attachments, and
agent metadata remain in browser storage.

## Configuration

Copy the documented environment template before making deployment-specific
changes:

```bash
cp .env.example .env.local
```

### Production requirements

Production deployments require durable rate limiting and a stable session
signing secret:

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ASKCURSOR_AGENT_SESSION_SECRET=
```

`AUTH_SECRET` or `NEXTAUTH_SECRET` may be used as the signing-secret fallback.
Without a configured secret, production builds fail closed. Local development
uses an in-memory rate limiter and a per-process signing secret by default.

Generate a suitable signing secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Optional controls

| Variable | Purpose |
| --- | --- |
| `ASKCURSOR_MAX_ACTIVE_CHAT_STREAMS` | Maximum concurrent chat streams; defaults to `50` |
| `ASKCURSOR_MAX_ACTIVE_STREAMS_PER_USER` | Maximum concurrent streams per Cursor key; defaults to `3` |
| `ASKCURSOR_TRUSTED_IP_HEADER` | Header carrying the real client IP behind your proxy (for example `x-real-ip`); unset uses `x-forwarded-for` |
| `ASKCURSOR_GITHUB_OAUTH_SCOPE` | `repo` (default) or `public_repo` for the Connect GitHub flow |
| `ASKCURSOR_ENABLE_IMPLEMENT_MODE` | Set to `false` to disable Implement mode |
| `ASKCURSOR_IMPLEMENT_ALLOWED_OWNERS` | Comma-separated owner allowlist |
| `ASKCURSOR_IMPLEMENT_ALLOWED_REPOS` | Comma-separated repository allowlist |
| `ASKCURSOR_IMPLEMENT_ALLOWED_BRANCHES` | Comma-separated starting-ref allowlist |

The legacy `ASKCURSOR_IMPLEMENT_PROTECTED_BRANCHES` and
`ASKCURSOR_ALLOW_PROTECTED_IMPLEMENT_BRANCHES` controls no longer gate starting
refs. Direct writes to the selected ref are disabled in SDK configuration.
Use the starting-ref allowlist to restrict allowed checkout origins.

Allowlist values support `*` wildcards. See [.env.example](.env.example) for
configuration notes and examples.

## Architecture

```text
app/
  api/
    agents/lifecycle/        Archive, unarchive, or delete a cloud agent
    artifacts/               List an agent's artifacts (and /download)
    auth/github/             Optional "Connect GitHub" OAuth start and callback
    branches/route.ts        GitHub branch discovery
    chat/route.ts            Cursor agent lifecycle and SSE streaming
    chat/cancel/route.ts     Explicit run cancellation
    models/route.ts          Cursor model catalog
    repos/route.ts           Cursor repository discovery
components/
  chat/                      Chat interface and message presentation
  ChatApp.tsx                Application shell and chat orchestration
  Onboarding.tsx             Runtime credential onboarding
  RepoPicker.tsx             Repository, branch, mode, and model selection
hooks/
  useAuthSettings.ts         Local credential preferences and OAuth hash handling
  useChatSend.ts             Send, stop, retry, and share orchestration
  useConversationStore.ts    Persistent conversation state
lib/
  agent-policy.ts            Implement-mode authorization rules
  agent-session.ts           Signed agent resume sessions
  cursor-prompt.ts           First-message and follow-up payloads
  rate-limit.ts              Rate limits, body guards, and stream slots
  sse.ts                     Streaming event definitions
  system-prompt.ts           Ask-mode policy
  plan-prompt.ts             Plan-mode policy
  implement-prompt.ts        Implement-mode policy
docs/
  hooks.example.json         Read-only target-repository hooks
  hooks.implement.example.json
                              Write-capable safety hooks
```

The interface is built with Next.js App Router, React, TypeScript, Tailwind CSS,
shadcn components, Radix UI primitives, and the Cursor SDK. Upstash Redis backs
production request controls.

## Security

AskCursor handles user-supplied credentials and can launch write-capable cloud
agents. Review [SECURITY.md](SECURITY.md) before deploying it.

Key operational considerations:

- Cursor API keys and optional GitHub tokens pass through the application server
  but are not persisted there.
- Credentials use `sessionStorage` by default. Choosing **Remember on this
  device** stores them in `localStorage`,
  which carries the usual cross-site scripting risk.
- Hosting and observability systems must not log request bodies containing
  credentials or prompts.
- Production rate limits use Redis and fail closed when durable request controls
  are unavailable.
- Implement mode can be restricted to approved repositories and starting refs;
  SDK-managed commits use a separate working branch. Target-repository hooks
  and GitHub branch rules should also enforce write restrictions.
- Browser or agent environments with privileged automation capabilities require
  an additional security and privacy review.

Current application limits (per client IP, and for chat also per Cursor key) are
12 Ask or Plan chat requests per minute, 6 Implement requests per minute, 30
repository requests per minute, 30 model-catalog requests per minute, and 60
branch requests per minute. Chat concurrency is also capped deployment-wide.

## Deployment

AskCursor can be deployed as a standard Next.js application, including on
[Vercel](https://vercel.com/):

1. Fork or push this repository to GitHub.
2. Import it into the hosting provider.
3. Configure the required production environment variables.
4. Deploy and point your domain at the application.
5. Have each user connect their own Cursor API key at runtime.

No shared server-side Cursor key is required. Cursor cloud-agent usage is billed
to the account associated with each user's key.

## Limitations

- PDF attachments are not supported.
- Image attachments must be PNG, JPEG, WebP, or GIF.
- The GitHub token is used only for branch listing.
- Mode changes require a new conversation.
- Changing the repository, branch, or model resets the cloud-agent context.
- Read-only prompts should be paired with repository hooks when hard enforcement
  is required.
