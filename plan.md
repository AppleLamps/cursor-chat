# Plan: Repurpose Ech4o → Ask the Codebase (Cursor SDK)

Transform `cursor-repo-chat` from an OpenRouter chat app into a BYOK "ask the codebase" portal powered by `@cursor/sdk`. Users enter their own Cursor API key (stored locally), pick a repo, and ask questions in plain language with file-backed answers.

---

## Goals

- Non-engineers (PM, support, sales eng) can ask how the product works and get answers grounded in real code
- Each user brings their own Cursor API key (stored on their device, not on the server)
- Read-only Q&A: explore and explain, never modify the repo
- Reuse the existing ChatGPT-style UI (sidebar, conversations, markdown, retry/copy)
- Target repo is configurable per conversation (default repo in settings)

## Non-goals (v1)

- Server-side API key storage or team service accounts
- SSO / user authentication
- Slack bot integration
- Multi-repo agents in a single thread
- PR creation or code changes
- Replacing Cursor IDE for engineers

---

## Current state (shipped)

| Piece | Status |
|---|---|
| Backend | `app/api/chat/route.ts` → `@cursor/sdk` cloud agents + SSE |
| Auth | BYOK — user's Cursor API key in browser `localStorage` |
| UI | Chat shell + onboarding + repo picker + streaming + sources |
| History | UI stores messages locally; API sends latest prompt + `agentId` |
| Storage | `codebase-chat-*` localStorage keys |
| Prompt | Read-only codebase Q&A in `lib/system-prompt.ts` |
| Node | 20.x (`package.json` engines) |

## Target state

All MVP phases (1–5) are complete. Future improvements:

| Piece | Future |
|---|---|
| Read-only mode | Wire SDK/API `mode: "plan"` when exposed in `@cursor/sdk` |
| Abuse controls | Rate limiting + body size limits on `/api/*` before public deploy |
| Node | Optional bump to 22.x when hosting supports it |

---

## Architecture

```
Browser
  localStorage: apiKey, conversations[{ agentId, repoUrl, messages }]
  ChatApp → POST /api/chat (SSE) with { apiKey, agentId?, repoUrl, prompt }
       │
       ▼
Next.js API routes (stateless — never persist apiKey)
  /api/repos   → Cursor.repositories.list({ apiKey })
  /api/chat    → Agent.create | Agent.resume → agent.send → run.stream()
       │
       ▼
Cursor Cloud Agent (mode: "plan", cloned repo, read-only hooks)
```

### Read-only enforcement (three layers)

1. **System prompt** in `lib/system-prompt.ts`: non-engineer audience, cite files, no edits
2. **`.cursor/hooks.json`** in the target repo blocking write/edit/destructive shell tools
3. **SDK/API `mode: "plan"`** (future) — REST API supports it; `@cursor/sdk` v1.0.13 does not expose it yet

---

## Data model changes

### Extend `Conversation` (in `ChatApp.tsx`)

```ts
type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  manualTitle?: boolean;
  agentId?: string;    // Cursor cloud agent ID (bc-...)
  repoUrl?: string;    // e.g. https://github.com/org/repo
  branch?: string;     // default "main"
};
```

### New localStorage keys

```ts
"codebase-chat-api-key-v1"
"codebase-chat-remember-key-v1"   // "true" | "false"
"codebase-chat-default-repo-v1"   // optional default repo URL
"codebase-chat-conversations-v1"    // replace ech4o-conversations-v1
"codebase-chat-sidebar-v1"          // replace ech4o-sidebar-v1
```

### New `lib/storage.ts`

- `getApiKey()` / `setApiKey()` / `clearApiKey()`
- `getRememberKey()` / `setRememberKey()`
- `getDefaultRepo()` / `setDefaultRepo()`

---

## File-by-file plan

### New files

| File | Purpose |
|---|---|
| `lib/storage.ts` | Browser localStorage helpers for API key and defaults |
| `lib/cursor-prompt.ts` | Wrap user prompt with system instructions before send |
| `components/Onboarding.tsx` | API key entry + remember checkbox + link to integrations dashboard |
| `components/RepoPicker.tsx` | Fetch and select repo (calls `/api/repos`) |
| `components/SettingsPanel.tsx` | Change key, clear key, default repo, branch |
| `app/api/repos/route.ts` | `Cursor.repositories.list({ apiKey })` |
| `app/api/chat/route.ts` | **Rewrite** — Cursor SDK + SSE (replace OpenRouter) |

### Modify

| File | Changes |
|---|---|
| `components/ChatApp.tsx` | Gate on API key; add repo to conversation; SSE streaming; pass `apiKey` + `agentId`; store `agentId` on first response; update branding |
| `lib/system-prompt.ts` | Replace Ech4o persona with codebase Q&A prompt |
| `lib/defaults.ts` | Remove `DEFAULT_MODEL`; add `DEFAULT_BRANCH`, codebase `SUGGESTED_PROMPTS` |
| `package.json` | Add `@cursor/sdk`; bump `engines.node` to `22.x` |
| `.env.example` | Remove OpenRouter vars (or mark optional/removed) |
| `README.md` | Document BYOK flow, Cursor SDK, no server API key required |
| `app/layout.tsx` | Update metadata title/description |

### Remove or defer

| File / feature | Action |
|---|---|
| OpenRouter env vars | Remove from `.env.example` and README |
| `responseMode` / Extended toggle | Remove from UI (v1) |
| OpenRouter cache composer notes | Remove |
| `trimMessagesForRequest` for API payload | Keep for display only if needed; API sends single prompt |
| IP rate limiting (OpenRouter-specific) | Optional: keep lightweight limit or remove |
| PDF/image attachments | Defer v2 (SDK supports images; not core to codebase Q&A) |
| Voice input | Keep as-is (optional polish) |

---

## API design

### `POST /api/repos`

**Request:**
```json
{ "apiKey": "cursor_..." }
```

**Response:**
```json
{ "repos": [{ "url": "https://github.com/org/repo" }] }
```

### `POST /api/chat` (SSE)

**Request:**
```json
{
  "apiKey": "cursor_...",
  "prompt": "What happens when a user cancels mid-cycle?",
  "repoUrl": "https://github.com/org/repo",
  "branch": "main",
  "agentId": "bc-..." 
}
```

`agentId` omitted → create new agent. Present → `Agent.resume`.

**Response:** `text/event-stream`

Events (suggested):
- `agent` — `{ agentId }` (emit early on new threads)
- `text` — `{ delta }` assistant text chunk
- `tool` — `{ name, status, args? }` for activity indicator
- `source` — `{ path }` when a file is read/grepped (for Sources panel)
- `done` — `{ status, result? }`
- `error` — `{ message }`

**Server rules:**
- Never log `apiKey`
- Always call `run.wait()` after stream ends
- Distinguish `CursorAgentError` (startup) vs `result.status === "error"` (run failed)
- Dispose agent with `await using` or explicit close after run completes

---

## UI phases

### Phase 1: Onboarding gate

- [x] Show `Onboarding` until valid key is present (or session-only key in memory)
- [x] "Remember on this device" → `localStorage`
- [x] Settings: clear saved key
- [x] Block chat until key is set

### Phase 2: Repo selection

- [x] After key entry, fetch repos via `/api/repos`
- [x] Repo picker on new chat (or default from settings)
- [x] Show repo + branch in header (replace OpenRouter model label)
- [x] Persist `repoUrl` + `branch` on each `Conversation`

### Phase 3: SDK integration (non-streaming first)

- [x] Rewrite `/api/chat` with Cursor SDK
- [x] On first message: `Agent.create`, return `agentId`, save to conversation
- [x] On follow-up: `Agent.resume`, send latest prompt only
- [x] JSON response `{ reply, agentId }` to validate loop before SSE

### Phase 4: Streaming

- [x] Convert `/api/chat` to SSE
- [x] Client: `fetch` + `ReadableStream` reader (or EventSource if GET)
- [x] Update assistant message incrementally during stream
- [x] Replace static `LoadingBubble` with live text + optional tool status line

### Phase 5: Sources and polish

- [x] Parse `tool_call` events → collapsible Sources under assistant messages
- [x] Update `SUGGESTED_PROMPTS` for codebase questions
- [x] Sidebar footer: settings link instead of placeholder user
- [x] Rename branding (Ech4o → Codebase Chat)
- [x] Update README and remove OpenRouter deployment steps

---

## System prompt (outline)

Replace `lib/system-prompt.ts` with something like:

- Role: internal codebase expert for non-engineers
- Explain user-visible behavior first, then technical detail
- Always cite specific file paths when making claims
- Use plain language; define jargon briefly
- If uncertain or evidence is thin, say so explicitly
- **Do not** modify files, run destructive commands, or propose code changes
- Prefer reading relevant modules over guessing

Keep it short (~50–80 lines). The Ech4o 270-line persona is out of scope.

---

## Target repo setup (hooks)

Add to the **repository users will query** (not necessarily this app repo):

`.cursor/hooks.json` — block write/edit and destructive shell operations when agents run against that repo.

Document in README that repo maintainers should commit this for read-only enforcement.

---

## Dependencies

```bash
npm install @cursor/sdk
```

- Node 22+ (update `package.json` engines)
- Remove OpenRouter-specific docs; no new server env vars required for v1

---

## Testing checklist

Manual verification before production deploy:

- [ ] First visit: onboarding appears, chat blocked without key
- [ ] Remember key: survives refresh; unchecked: gone on tab close
- [ ] Invalid key: clear error, no crash
- [ ] Repo list loads for valid key
- [ ] New chat: creates cloud agent, returns `agentId`, answer streams
- [ ] Follow-up in same thread: context retained via `Agent.resume`
- [ ] Expired agent: server falls back to new agent automatically
- [ ] New chat thread: new agent, separate context
- [ ] Agent does not modify files (verify hooks + prompt)
- [ ] Sources appear for file reads
- [ ] Conversation rename/delete/new still works
- [ ] Clear key logs user back to onboarding
- [ ] Truncated SSE stream shows error, not partial success

---

## Migration notes (Ech4o → codebase chat)

- Bump localStorage key names to avoid loading old OpenRouter conversations as corrupted data
- Or: one-time migration that strips old conversations on first load
- Deploy to Vercel without `OPENROUTER_API_KEY` — app works as stateless BYOK proxy

---

## Future (post-v1)

- Model picker (`Cursor.models.list`)
- Slack `/ask-codebase` using same API routes
- Semantic cache for frequent questions
- Image attachments for UI screenshots ("what does this screen map to in code?")
- Branch picker per conversation
- Export thread with sources as markdown
- Optional server-side audit log (questions only, no keys)

---

## Suggested implementation order

1. `plan.md` ✅
2. `lib/storage.ts` + `Onboarding.tsx` + gate in `ChatApp`
3. `app/api/repos/route.ts` + `RepoPicker`
4. Rewrite `lib/system-prompt.ts` + `lib/defaults.ts`
5. Rewrite `app/api/chat/route.ts` (JSON, then SSE)
6. Wire `agentId` + streaming in `ChatApp`
7. Sources panel + header repo badge
8. README, `.env.example`, branding cleanup

Estimated scope: **~1–2 days** for MVP (phases 1–4), **+1 day** for sources and polish.
