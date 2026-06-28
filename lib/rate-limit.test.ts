import { describe, expect, it } from "vitest";
import { readJsonBody } from "@/lib/rate-limit";

function streamRequest(chunks: string[], headers?: HeadersInit) {
  const encoder = new TextEncoder();
  let index = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;

      if (chunk === undefined) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(chunk));
    }
  });

  return new Request("https://example.test/api/chat", {
    method: "POST",
    headers,
    body,
    duplex: "half"
  } as RequestInit & { duplex: "half" });
}

describe("readJsonBody", () => {
  it("parses valid JSON without relying on a content-length header", async () => {
    const result = await readJsonBody<{ ok: boolean }>(
      streamRequest(['{"ok":true}']),
      32
    );

    expect(result).toEqual({ ok: true, body: { ok: true } });
  });

  it("rejects streamed bodies that exceed the byte limit without content-length", async () => {
    const result = await readJsonBody(
      streamRequest(['{"value":"', "1234567890", '"}']),
      12
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
      await expect(result.response.json()).resolves.toEqual({
        error: "Request body is too large."
      });
    }
  });

  it("rejects bodies that exceed a smaller real limit despite a lower content-length header", async () => {
    const result = await readJsonBody(
      streamRequest(['{"value":"', "1234567890", '"}'], {
        "content-length": "8"
      }),
      12
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
    }
  });

  it("rejects malformed JSON after reading within the byte limit", async () => {
    const result = await readJsonBody(streamRequest(["not-json"]), 32);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });
});
