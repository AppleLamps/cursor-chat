import { Cursor } from "@cursor/sdk";
import {
  CURSOR_LOGIN_TIMEOUT_MS,
  isSafeLoginUrl
} from "@/lib/cursor-login";
import {
  checkRateLimit,
  limiterUnavailableResponse,
  rateLimitedResponse
} from "@/lib/rate-limit";

// The request stays open while the user finishes signing in in their browser.
export const maxDuration = 300;

const MAX_PENDING_LOGINS = 25;
const HEARTBEAT_MS = 15_000;
let pendingLogins = 0;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive"
};

function sse(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Starts Cursor's browser sign-in (Cursor.auth.login) and streams its progress:
 * `url` (where the user signs in), then `done` (the minted key) or `error`.
 * Nothing is stored on the server: `store: null` stops the SDK from writing the
 * key to this machine's credential file.
 */
export async function POST(request: Request) {
  const rateLimit = await checkRateLimit("cursorLogin", request);
  if (!rateLimit.allowed) {
    return rateLimit.unavailable
      ? limiterUnavailableResponse()
      : rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  if (pendingLogins >= MAX_PENDING_LOGINS) {
    return rateLimitedResponse(15);
  }
  pendingLogins += 1;

  const abort = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, CURSOR_LOGIN_TIMEOUT_MS);
  const onRequestAbort = () => abort.abort();
  request.signal.addEventListener("abort", onRequestAbort, { once: true });

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    pendingLogins -= 1;
    clearTimeout(timeout);
    if (heartbeat) clearInterval(heartbeat);
    request.signal.removeEventListener("abort", onRequestAbort);
  };

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      closed = true;
      abort.abort();
      release();
    },
    start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        release();
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The consumer already went away.
        }
      };

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);

      Cursor.auth
        .login({
          openBrowser: false,
          store: null,
          apiKeyName: "AskCursor",
          signal: abort.signal,
          onLoginUrl: (url) => {
            if (!isSafeLoginUrl(url, process.env.NODE_ENV === "production")) {
              send("error", { message: "Cursor returned an unexpected sign-in link." });
              abort.abort();
              finish();
              return;
            }
            send("url", { url });
          }
        })
        .then((result) => {
          send("done", {
            apiKey: result.apiKey,
            email: result.email,
            expiresAtMs: result.apiKeyExpiresAtMs
          });
        })
        .catch((error: unknown) => {
          if (request.signal.aborted) return;
          send("error", {
            message: timedOut
              ? "Cursor sign-in timed out. Start again, or paste a key instead."
              : error instanceof Error && error.message
                ? error.message
                : "Cursor sign-in failed."
          });
        })
        .finally(finish);
    }
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
