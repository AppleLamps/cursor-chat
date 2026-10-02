import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cursor } from "@cursor/sdk";
import { POST } from "@/app/api/auth/cursor/login/route";
import { CURSOR_LOGIN_TIMEOUT_MS } from "@/lib/cursor-login";
import { checkRateLimit } from "@/lib/rate-limit";

vi.mock("@cursor/sdk", () => ({
  Cursor: { auth: { login: vi.fn() } }
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn() };
});

const login = vi.mocked(Cursor.auth.login);
const limit = vi.mocked(checkRateLimit);

function request(signal?: AbortSignal) {
  return new Request("https://example.test/api/auth/cursor/login", {
    method: "POST",
    signal
  });
}

function events(text: string) {
  return text
    .split("\n\n")
    .filter((part) => part.startsWith("event:"))
    .map((part) => {
      const [event, data] = part.split("\n");
      return {
        event: event.slice(7),
        data: JSON.parse(data.slice(6)) as Record<string, unknown>
      };
    });
}

describe("Cursor login route", () => {
  beforeEach(() => {
    login.mockReset();
    limit.mockReset().mockResolvedValue({ allowed: true });
  });

  it("streams the sign-in URL then the minted key, without writing it to disk", async () => {
    login.mockImplementation(async (options) => {
      options?.onLoginUrl?.("https://cursor.com/loginDeepControl?c=1");
      return { apiKey: "key_abc", email: "me@example.com", apiKeyExpiresAtMs: 123 };
    });

    const response = await POST(request());
    const body = events(await response.text());

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(body).toEqual([
      { event: "url", data: { url: "https://cursor.com/loginDeepControl?c=1" } },
      {
        event: "done",
        data: { apiKey: "key_abc", email: "me@example.com", expiresAtMs: 123 }
      }
    ]);
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({
        openBrowser: false,
        store: null,
        apiKeyName: "AskCursor"
      })
    );
  });

  it("reports a failed sign-in as an error event", async () => {
    login.mockRejectedValue(new Error("Login was denied."));

    const body = events(await (await POST(request())).text());

    expect(body).toEqual([{ event: "error", data: { message: "Login was denied." } }]);
  });

  it("refuses to relay an unsafe sign-in link", async () => {
    login.mockImplementation(async (options) => {
      options?.onLoginUrl?.("javascript:alert(1)");
      await new Promise((_, reject) =>
        options?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
      );
      throw new Error("unreachable");
    });

    const body = events(await (await POST(request())).text());

    expect(body[0]).toEqual({
      event: "error",
      data: { message: "Cursor returned an unexpected sign-in link." }
    });
    expect(body.some((entry) => entry.event === "url")).toBe(false);
  });

  it("aborts the pending sign-in when the client goes away", async () => {
    let signal: AbortSignal | undefined;
    login.mockImplementation((options) => {
      signal = options?.signal;
      return new Promise(() => undefined);
    });

    const response = await POST(request());
    const reader = response.body!.getReader();
    await reader.cancel();

    expect(signal?.aborted).toBe(true);
  });

  it("is rate limited", async () => {
    limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 9 });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(login).not.toHaveBeenCalled();
  });

  it("gives up after the sign-in window and says so", async () => {
    vi.useFakeTimers();
    try {
      login.mockImplementation(
        (options) =>
          new Promise((_, reject) =>
            options?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted"))
            )
          )
      );

      const response = await POST(request());
      const text = response.text();
      await vi.advanceTimersByTimeAsync(CURSOR_LOGIN_TIMEOUT_MS + 1);

      expect(events(await text)).toEqual([
        {
          event: "error",
          data: {
            message: "Cursor sign-in timed out. Start again, or paste a key instead."
          }
        }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
