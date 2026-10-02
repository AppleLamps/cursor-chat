import { parseSseBuffer } from "@/lib/sse";
import type { CursorLoginResult } from "@/lib/cursor-login";

export class CursorLoginError extends Error {}

/**
 * Runs Cursor's browser sign-in through the server and resolves with the minted
 * key. `onUrl` receives the page the user must open to approve it.
 */
export async function startCursorLogin({
  onUrl,
  signal
}: {
  onUrl: (url: string) => void;
  signal?: AbortSignal;
}): Promise<CursorLoginResult> {
  let response: Response;

  try {
    response = await fetch("/api/auth/cursor/login", { method: "POST", signal });
  } catch (error) {
    if (signal?.aborted) throw new CursorLoginError("Sign-in cancelled.");
    throw new CursorLoginError(
      error instanceof Error ? error.message : "Could not reach the server."
    );
  }

  if (!response.ok || !response.body) {
    let message = "Cursor sign-in is unavailable right now.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the generic message.
    }
    throw new CursorLoginError(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.rest;

      for (const { event, data } of parsed.events) {
        const name = event as string;

        if (name === "url" && typeof data.url === "string") {
          onUrl(data.url);
        } else if (name === "done" && typeof data.apiKey === "string") {
          return {
            apiKey: data.apiKey,
            email: typeof data.email === "string" ? data.email : undefined,
            expiresAtMs:
              typeof data.expiresAtMs === "number" ? data.expiresAtMs : undefined
          };
        } else if (name === "error") {
          throw new CursorLoginError(
            typeof data.message === "string" ? data.message : "Cursor sign-in failed."
          );
        }
      }
    }
  } catch (error) {
    if (error instanceof CursorLoginError) throw error;
    if (signal?.aborted) throw new CursorLoginError("Sign-in cancelled.");
    throw new CursorLoginError("The connection dropped before sign-in finished.");
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  throw new CursorLoginError("Cursor sign-in ended before it finished. Try again.");
}
