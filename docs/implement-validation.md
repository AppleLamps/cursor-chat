# Implement workflow validation

Base: `1325dc5808377f46e268bdfb0523bc5a88b52212`, confirmed against remote main
before committing. The workspace initially had no checkout or local changes.
The compact transcript/composer and prior Stop/history repairs remain in place.

## Contract evidence

Validated against installed `@cursor/sdk@1.0.35` declarations in
`dist/esm/options.d.ts`, `run.d.ts`, `cloud-api-client.d.ts`, and the cloud
implementation in `dist/esm/448.js`.

- `Agent.create` allocates the cloud handle; first `send` posts agent creation.
  Subsequent sends on a resumed handle use the per-agent runs endpoint.
- Creation explicitly selects `repos[].startingRef`,
  `workOnCurrentBranch:false`, `autoCreatePR:true`, and skips reviewer requests.
  The SDK has no PR base-branch or draft creation option; the app displays actual
  GitHub metadata instead of assuming these values.
- Disposal aborts the client stream. It does not cancel durable cloud work.
  `Agent.cancelRun` posts cancellation; the app reads authoritative status
  afterward and reconciles `run_not_cancellable` finish races.
- SDK run Git metadata contains branches and PR URLs, not changed files.
  Changed files come from read-only GitHub PR-file requests.

Official references reviewed:

- [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript#cloudagentoptions)
- [Cursor Cloud Agents endpoints](https://cursor.com/docs/cloud-agent/api/endpoints#get-a-run)
- [GitHub pull request REST endpoints](https://docs.github.com/en/rest/pulls/pulls)

## Reproducible checks

```powershell
npm ci --ignore-scripts --cache ..\.npm-cache
npm run check
# Use a synthetic local signing secret, never a production credential.
$env:ASKCURSOR_AGENT_SESSION_SECRET = 'synthetic-local-build-secret-not-a-real-credential'
npm run build
npm audit --omit=dev --audit-level=low
npm audit --audit-level=low
git diff --check
```

Results: lint exits successfully with 26 nonblocking warnings; typecheck passes;
380 tests pass in 60 files, with 2 pre-existing conditional skips; production
build passes. Production audit reports 0 vulnerabilities. The full audit reports
21 development dependency findings (15 high, 5 moderate, 1 low). Dependencies and
lockfile were left unchanged; dependency cleanup was outside this task.

Regression coverage includes protected starting refs and feature refs; real SDK
HTTP-boundary contract tests; stable launch retry identity; missing agents;
signed repository/agent ownership; policy changes during observation; terminal
Git metadata; PR-only results; cancellation acknowledgement and finish races;
cross-chat Stop; late status responses; cumulative PR files and truncation;
GitHub authentication, SSO/access, rate-limit failures; and the documented
Implement hook profile's parsing/decisions. All external responses are mocked.

## Visual QA and limits

Local Chromium QA used a synthetic saved Implement conversation and intercepted
all application API requests. Desktop 1365×900 and mobile 390×844 screenshots
show the current PR state, actual head/base, and expanded changed files. Neither
viewport had horizontal overflow or page errors. The workspace's supporting
artifacts are under `../output/playwright/`; `../qa-implement.cjs` reproduces the
fixture with the cached Playwright runtime.

No real cloud agent was run, branch pushed, PR created/merged, credential changed,
or auth grant requested. Live account/provider behavior still needs a separately
approved integration run. Existing PR revisions continue through the current
agent; selecting an arbitrary existing PR as a new agent's target is not exposed
by this interface. File lists require a reported PR and show cumulative PR
changes, not a per-turn diff. GitHub verification failures retain Cursor's
reported branches/links while marking PR state unverified.

Next dev generated local `AGENTS.md`/`CLAUDE.md` during QA. Their contents were
read and retained with supporting artifacts, without adding generated tooling
instructions to this application change.
