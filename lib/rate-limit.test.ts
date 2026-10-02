import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CLAIM_SLOT_SCRIPT,
  RATE_BUCKET_SCRIPT,
  REFRESH_SLOT_SCRIPT,
  checkRateLimit,
  claimChatConcurrencySlot,
  getClientIp,
  normalizeClientIp,
  readControlBody,
  readJsonBody
} from "@/lib/rate-limit";

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

describe("readJsonBody shape", () => {
  it.each(["null", "[]", "42", '"text"'])("rejects %s as a body", async (raw) => {
    const result = await readJsonBody(streamRequest([raw]), 32);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });
});

describe("normalizeClientIp", () => {
  it("collapses IPv6 addresses to their /64 so one household is one bucket", () => {
    const a = normalizeClientIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    const b = normalizeClientIp("2001:db8:1:2:1111:2222:3333:4444");

    expect(a).toBe("2001:0db8:0001:0002::/64");
    expect(b).toBe(a);
    expect(normalizeClientIp("2001:db8:1:3::1")).not.toBe(a);
  });

  it("expands :: before taking the prefix", () => {
    expect(normalizeClientIp("2001:db8::1")).toBe("2001:0db8:0000:0000::/64");
    expect(normalizeClientIp("::1")).toBe("0000:0000:0000:0000::/64");
  });

  it("keeps IPv4 as is and unwraps IPv4-mapped IPv6", () => {
    expect(normalizeClientIp("203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeClientIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeClientIp("[2001:db8::1]:443")).toBe(
      normalizeClientIp("2001:db8::1")
    );
  });
});

describe("getClientIp", () => {
  afterEach(() => {
    delete process.env.ASKCURSOR_TRUSTED_IP_HEADER;
  });

  it("uses the first forwarded address by default", () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }
    });

    expect(getClientIp(request)).toBe("203.0.113.9");
  });

  it("reads only the configured header when one is trusted", () => {
    process.env.ASKCURSOR_TRUSTED_IP_HEADER = "X-Real-IP";
    const request = new Request("https://example.test", {
      headers: {
        "x-forwarded-for": "198.51.100.1",
        "x-real-ip": "203.0.113.9"
      }
    });

    expect(getClientIp(request)).toBe("203.0.113.9");
  });
});

describe("in-memory limits", () => {
  it("counts the preflight guard per client", async () => {
    const request = () =>
      new Request("https://example.test", {
        headers: { "x-forwarded-for": "192.0.2.77" }
      });

    for (let i = 0; i < 60; i += 1) {
      expect((await checkRateLimit("chatPreflight", request())).allowed).toBe(true);
    }
    const blocked = await checkRateLimit("chatPreflight", request());

    expect(blocked.allowed).toBe(false);
  });

  it("caps one caller's concurrent streams without blocking others", async () => {
    const mine = [];
    for (let i = 0; i < 3; i += 1) {
      const slot = await claimChatConcurrencySlot("key-a");
      expect(slot.allowed).toBe(true);
      mine.push(slot);
    }

    const fourth = await claimChatConcurrencySlot("key-a");
    expect(fourth).toMatchObject({ allowed: false, reason: "per-user" });

    const other = await claimChatConcurrencySlot("key-b");
    expect(other.allowed).toBe(true);

    for (const slot of [...mine, other]) {
      if (slot.allowed) await slot.release();
    }

    const afterRelease = await claimChatConcurrencySlot("key-a");
    expect(afterRelease.allowed).toBe(true);
    if (afterRelease.allowed) await afterRelease.release();
  });

  it("limits control routes and reads their smaller body", async () => {
    const request = (body: string) =>
      new Request("https://example.test", {
        method: "POST",
        headers: { "x-forwarded-for": "192.0.2.88" },
        body
      });

    const ok = await readControlBody<{ a: number }>(request('{"a":1}'));
    expect(ok).toEqual({ ok: true, body: { a: 1 } });

    const huge = await readControlBody(request(JSON.stringify({ a: "x".repeat(17_000) })));
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.response.status).toBe(413);
  });
});

// The Lua scripts only run on a real Redis, so they are exercised against a
// throwaway redis-server when one is installed and skipped otherwise.
const hasRedis = (() => {
  try {
    execFileSync("redis-server", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasRedis)("Redis scripts", () => {
  const port = 6400 + Math.floor(Math.random() * 500);
  let server: ChildProcess;
  let dir: string;

  const run = (script: string, keys: string[], args: Array<string | number>) => {
    const file = join(dir, `s${Math.random().toString(36).slice(2)}.lua`);
    writeFileSync(file, script);
    return execFileSync(
      "redis-cli",
      ["-p", String(port), "--eval", file, ...keys, ",", ...args.map(String)],
      { encoding: "utf8" }
    ).trim();
  };
  const cli = (...args: string[]) =>
    execFileSync("redis-cli", ["-p", String(port), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "askcursor-redis-"));
    server = spawn(
      "redis-server",
      ["--port", String(port), "--save", "", "--appendonly", "no", "--dir", dir],
      { stdio: "ignore" }
    );
    for (let i = 0; i < 50; i += 1) {
      try {
        if (cli("ping") === "PONG") return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error("redis-server did not start");
  });

  afterAll(() => {
    server?.kill();
  });

  it("counts atomically and heals a counter that lost its expiry", () => {
    expect(run(RATE_BUCKET_SCRIPT, ["bucket"], [60_000]).split("\n")[0]).toContain("1");
    run(RATE_BUCKET_SCRIPT, ["bucket"], [60_000]);
    expect(cli("get", "bucket")).toBe("2");

    cli("persist", "bucket");
    expect(Number(cli("pttl", "bucket"))).toBe(-1);
    run(RATE_BUCKET_SCRIPT, ["bucket"], [60_000]);
    expect(Number(cli("pttl", "bucket"))).toBeGreaterThan(0);
  });

  it("claims global and per-user slots, refuses past either cap, and refreshes", () => {
    const claim = (id: string, now: number, globalMax: number, userMax: number) =>
      run(
        CLAIM_SLOT_SCRIPT,
        ["g", "u"],
        [now, globalMax, id, now + 60_000, 900, userMax]
      );

    expect(claim("a", 1000, 5, 2)).toBe("1");
    expect(claim("b", 1000, 5, 2)).toBe("1");
    expect(claim("c", 1000, 5, 2)).toBe("2"); // this user is full
    cli("del", "u");
    expect(claim("d", 1000, 2, 5)).toBe("0"); // deployment is full

    // Expired leases are swept on the next claim.
    expect(claim("e", 1000 + 120_000, 2, 2)).toBe("1");

    expect(run(REFRESH_SLOT_SCRIPT, ["g", "u"], ["e", 999_999_999, 900])).toBe("1");
    expect(run(REFRESH_SLOT_SCRIPT, ["g", "u"], ["missing", 999_999_999, 900])).toBe("0");
  });
});
