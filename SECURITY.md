# Security Notes

AskCursor is a bring-your-own-key application. Users provide their own Cursor API
key, and optional GitHub token, at runtime. The application forwards those
credentials only as needed for repository listing, branch listing, and Cursor
cloud agent requests.

## Privileged Agent And Browser Capabilities

Some deployments or connected agent environments may expose privileged browser
automation tools. These capabilities are intentional when enabled, but they are
high risk and should be documented in security, privacy, and compliance reviews.

| Capability | Risk |
| --- | --- |
| `browser_evaluate` | Runs arbitrary JavaScript in the active page. |
| `browser_cdp` | Provides broad Chrome DevTools Protocol access. |
| `browser_network_replay` with `credentials: "include"` | Can replay requests with page cookies or other ambient credentials. |
| Screenshots, DOM capture, page storage, cookies, and local storage access | May expose PII, session data, tokens, or sensitive business data visible to the page. |

Redaction and filtering can reduce accidental exposure, but they are best-effort
controls. They should not be treated as a guarantee that secrets, PII, session
identifiers, or regulated data will be removed from captured page content.

Recommended controls for environments that enable these tools:

- Obtain clear user authorization before inspecting authenticated browser state.
- Avoid using privileged browser tools on pages containing payment data, health
  data, credentials, administrative consoles, or other regulated information
  unless that access is explicitly required and approved.
- Do not persist screenshots, DOM dumps, storage contents, cookies, network
  payloads, or replayed responses unless the user explicitly requests it and the
  retention policy allows it.
- Treat logs and traces as sensitive whenever they may include browser-derived
  content.
- Prefer the narrowest tool that can complete the task, and avoid request replay
  with credentials unless it is required for the user-requested workflow.

## Credential Handling

- Cursor API keys and GitHub tokens are entered by the user in the browser.
- Optional "remember on this device" storage uses browser `localStorage`.
- The server does not persist user API keys.
- Hosting and observability systems should avoid logging request bodies because
  chat and repository requests may include user-provided credentials or prompts.

## Deployment Requirements

Production deployments must configure durable request controls and stable agent
session signing. Missing request-control storage intentionally fails closed.

Required production variables:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ASKCURSOR_AGENT_SESSION_SECRET`
