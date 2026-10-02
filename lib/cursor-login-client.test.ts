import { afterEach, describe, expect, it, vi } from "vitest";
import { CursorLoginError, startCursorLogin } from "@/lib/cursor-login-client";

function sseResponse(chunks: string[], init: ResponseInit = {}) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      }
    }),
    { status: 200, ...init }
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("startCursorLogin", () => {
  it("reports the URL and resolves with the key, even when events are split across chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          'event: url\ndata: {"url":"https://cursor.com/l',
          'ogin"}\n\n: heartbeat\n\nevent: done\ndata: {"apiKey":"k","email":"a@b.c","expiresAtMs":5}\n\n'
        ])
      )
    );
    const onUrl = vi.fn();

    await expect(startCursorLogin({ onUrl })).resolves.toEqual({
      apiKey: "k",
      email: "a@b.c",
      expiresAtMs: 5
    });
    expect(onUrl).toHaveBeenCalledWith("https://cursor.com/login");
  });

  it("surfaces an error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(['event: error\ndata: {"message":"Denied."}\n\n'])
      )
    );

    await expect(startCursorLogin({ onUrl: vi.fn() })).rejects.toThrow("Denied.");
  });

  it("surfaces an HTTP error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"error":"Too many requests."}', { status: 429 })
      )
    );

    await expect(startCursorLogin({ onUrl: vi.fn() })).rejects.toThrow(
      "Too many requests."
    );
  });

  it("fails clearly when the stream ends early", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([])));

    await expect(startCursorLogin({ onUrl: vi.fn() })).rejects.toBeInstanceOf(
      CursorLoginError
    );
  });
});
