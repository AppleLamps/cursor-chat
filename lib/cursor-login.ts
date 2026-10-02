/** How long one Cursor browser sign-in may stay pending before it is abandoned. */
export const CURSOR_LOGIN_TIMEOUT_MS = 5 * 60_000;

/**
 * The sign-in URL comes from the SDK, which builds it from CURSOR_WEBSITE_URL
 * when set. It is handed to the user's browser, so only accept a plain web URL
 * (https in production) rather than relaying whatever came back.
 */
export function isSafeLoginUrl(value: unknown, production: boolean) {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return url.protocol === "https:" || (!production && url.protocol === "http:");
  } catch {
    return false;
  }
}

export type CursorLoginResult = {
  apiKey: string;
  email?: string;
  expiresAtMs?: number;
};
