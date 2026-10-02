import { createHash, randomUUID } from "node:crypto";
import { isIPv6 } from "node:net";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let redisClient: Redis | null | undefined;
let memoryActiveStreams = 0;

const REDIS_KEY_PREFIX = "askcursor";
const CHAT_STREAM_SLOT_KEY = `${REDIS_KEY_PREFIX}:chat:active-stream-leases`;
const CHAT_STREAM_SLOT_TTL_SECONDS = 15 * 60;
const CHAT_STREAM_SLOT_LEASE_MS = 60_000;
const CHAT_STREAM_SLOT_HEARTBEAT_MS = 20_000;
const DEFAULT_MAX_ACTIVE_CHAT_STREAMS = 50;
const DEFAULT_MAX_ACTIVE_STREAMS_PER_USER = 3;

/** Per route defaults. Production uses Redis; local development can use memory. */
export const RATE_LIMITS = {
  chat: { limit: 12, windowMs: 60_000 },
  chatImplement: { limit: 6, windowMs: 60_000 },
  repos: { limit: 30, windowMs: 60_000 },
  models: { limit: 30, windowMs: 60_000 },
  branches: { limit: 60, windowMs: 60_000 },
  githubAuth: { limit: 20, windowMs: 60_000 },
  /** Each Cursor sign-in holds a request open while it waits for the browser. */
  cursorLogin: { limit: 5, windowMs: 60_000 },
  /** Cheap per-IP guard that runs before a chat body is even read. */
  chatPreflight: { limit: 60, windowMs: 60_000 },
  /** Cancel, archive/delete, and artifact calls. */
  agentControl: { limit: 60, windowMs: 60_000 }
} as const;

export const MAX_API_BODY_BYTES = 96_000;
/** Cancel, lifecycle, and artifact requests carry a few small fields. */
export const MAX_CONTROL_BODY_BYTES = 16_000;

type RateLimitAllowed = { allowed: true };
type RateLimitBlocked = {
  allowed: false;
  retryAfterSeconds: number;
  unavailable?: false;
};
type RateLimitUnavailable = { allowed: false; unavailable: true };

export type RateLimitResult =
  | RateLimitAllowed
  | RateLimitBlocked
  | RateLimitUnavailable;

export type ChatConcurrencySlot =
  | { allowed: true; release: () => Promise<void> }
  | {
      allowed: false;
      retryAfterSeconds: number;
      unavailable?: false;
      /** "per-user": this caller already has its share of runs going. */
      reason?: "per-user";
    }
  | { allowed: false; unavailable: true };

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getRedisClient() {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

function hashValue(value: string) {
  return createHash("sha256").update(value.trim()).digest("base64url");
}

function normalizeIdentity(value: string) {
  return value.trim().toLowerCase().slice(0, 256) || "unknown";
}

function pruneBuckets(now: number) {
  if (buckets.size <= 5_000) return;

  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}

/**
 * Reduces a client address to the unit we rate limit on. IPv6 users routinely
 * hold a whole /64, so using the full address would give one person effectively
 * unlimited buckets; IPv4-mapped addresses collapse to their IPv4 form.
 */
export function normalizeClientIp(value: string) {
  let ip = value.trim().toLowerCase();
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    ip = end > 0 ? ip.slice(1, end) : ip.slice(1);
  }
  ip = ip.split("%")[0];

  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];
  if (!isIPv6(ip)) return normalizeIdentity(ip);

  // Turn a dotted IPv4 tail into two hextets so "::" expansion counts right.
  const dotted = ip.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const [, head, a, b, c, d] = dotted;
    const hex = (x: string, y: string) =>
      ((Number(x) << 8) | Number(y)).toString(16);
    ip = `${head}${hex(a, b)}:${hex(c, d)}`;
  }

  const [left, right] = ip.split("::");
  const leading = left ? left.split(":") : [];
  const trailing = right ? right.split(":") : [];
  const missing = ip.includes("::") ? 8 - leading.length - trailing.length : 0;
  const groups = [...leading, ...Array(Math.max(0, missing)).fill("0"), ...trailing]
    .map((group) => group.padStart(4, "0"))
    .slice(0, 4);

  return `${groups.join(":")}::/64`;
}

/**
 * Which address to rate limit on. Vercel overwrites its forwarding headers, so
 * those are trustworthy there. Anywhere else the leftmost X-Forwarded-For entry
 * is whatever the client sent, so self-hosted deployments should name the one
 * header their own proxy sets via ASKCURSOR_TRUSTED_IP_HEADER.
 */
export function getClientIp(request: Request) {
  const trustedHeader = process.env.ASKCURSOR_TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (trustedHeader) {
    return normalizeClientIp(request.headers.get(trustedHeader) || "unknown");
  }

  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for");

  if (forwarded) {
    return normalizeClientIp(forwarded.split(",")[0] || "unknown");
  }

  return normalizeClientIp(request.headers.get("x-real-ip") || "unknown");
}

function memoryBucketKey(key: string) {
  return `memory:${key}`;
}

function redisBucketKey(key: string) {
  return `${REDIS_KEY_PREFIX}:rate:${key}`;
}

function consumeMemoryBucket(
  key: string,
  limit: number,
  windowMs: number
): RateLimitAllowed | RateLimitBlocked {
  const now = Date.now();
  const bucketKey = memoryBucketKey(key);
  const bucket = buckets.get(bucketKey);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    pruneBuckets(now);
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
  }

  bucket.count += 1;
  pruneBuckets(now);
  return { allowed: true };
}

/**
 * Fixed-window counter. INCR and PEXPIRE run as one script: as separate calls,
 * an instance frozen between them left a counter with no expiry, and that
 * caller stayed blocked forever. A key found without a TTL is repaired too.
 */
export const RATE_BUCKET_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

async function consumeRedisBucket(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitAllowed | RateLimitBlocked> {
  const [count, ttlMs] = await redis.eval<[number], [number, number]>(
    RATE_BUCKET_SCRIPT,
    [redisBucketKey(key)],
    [windowMs]
  );

  if (count <= limit) {
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000))
  };
}

type CheckRateLimitOptions = {
  apiKey?: string;
};

export async function checkRateLimit(
  route: keyof typeof RATE_LIMITS,
  request: Request,
  options: CheckRateLimitOptions = {}
): Promise<RateLimitResult> {
  const { limit, windowMs } = RATE_LIMITS[route];
  const keys = [`${route}:ip:${getClientIp(request)}`];
  const apiKey = options.apiKey?.trim();

  if ((route === "chat" || route === "chatImplement") && apiKey) {
    keys.push(`${route}:api-key:${hashValue(apiKey)}`);
  }

  const redis = getRedisClient();

  if (!redis) {
    if (isProduction()) return { allowed: false, unavailable: true };

    for (const key of keys) {
      const result = consumeMemoryBucket(key, limit, windowMs);
      if (!result.allowed) return result;
    }

    return { allowed: true };
  }

  try {
    for (const key of keys) {
      const result = await consumeRedisBucket(redis, key, limit, windowMs);
      if (!result.allowed) return result;
    }

    return { allowed: true };
  } catch (error) {
    console.error("Rate limit storage is unavailable.", error);
    return { allowed: false, unavailable: true };
  }
}

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function parseMaxActiveChatStreams() {
  return parsePositiveInteger(
    process.env.ASKCURSOR_MAX_ACTIVE_CHAT_STREAMS,
    DEFAULT_MAX_ACTIVE_CHAT_STREAMS
  );
}

function parseMaxActiveStreamsPerUser() {
  return parsePositiveInteger(
    process.env.ASKCURSOR_MAX_ACTIVE_STREAMS_PER_USER,
    DEFAULT_MAX_ACTIVE_STREAMS_PER_USER
  );
}

/**
 * Claims one stream slot in the global pool and in the caller's own pool, in a
 * single step. Returns 1 when claimed, 0 when the deployment is full, and 2
 * when this caller already holds its share. Without the per-caller pool, one
 * person starting runs as fast as the per-minute limit allows could hold every
 * slot and lock everyone else out.
 *
 * KEYS: [global, per-user]   ARGV: [now, globalMax, slotId, leaseUntil, ttl, userMax]
 */
export const CLAIM_SLOT_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
redis.call("ZREMRANGEBYSCORE", KEYS[2], "-inf", ARGV[1])
if redis.call("ZCARD", KEYS[2]) >= tonumber(ARGV[6]) then
  redis.call("EXPIRE", KEYS[2], ARGV[5])
  return 2
end
if redis.call("ZCARD", KEYS[1]) >= tonumber(ARGV[2]) then
  redis.call("EXPIRE", KEYS[1], ARGV[5])
  return 0
end
redis.call("ZADD", KEYS[1], ARGV[4], ARGV[3])
redis.call("ZADD", KEYS[2], ARGV[4], ARGV[3])
redis.call("EXPIRE", KEYS[1], ARGV[5])
redis.call("EXPIRE", KEYS[2], ARGV[5])
return 1
`;

/** KEYS: [global, per-user]   ARGV: [slotId, leaseUntil, ttl] */
export const REFRESH_SLOT_SCRIPT = `
if not redis.call("ZSCORE", KEYS[1], ARGV[1]) then
  return 0
end
redis.call("ZADD", KEYS[1], ARGV[2], ARGV[1])
redis.call("EXPIRE", KEYS[1], ARGV[3])
if redis.call("ZSCORE", KEYS[2], ARGV[1]) then
  redis.call("ZADD", KEYS[2], ARGV[2], ARGV[1])
  redis.call("EXPIRE", KEYS[2], ARGV[3])
end
return 1
`;

function userSlotKey(identity: string) {
  return `${CHAT_STREAM_SLOT_KEY}:user:${hashValue(identity)}`;
}

async function refreshRedisChatSlot(
  redis: Redis,
  slotId: string,
  userKey: string
) {
  await redis.eval<[string, number, number], number>(
    REFRESH_SLOT_SCRIPT,
    [CHAT_STREAM_SLOT_KEY, userKey],
    [
      slotId,
      Date.now() + CHAT_STREAM_SLOT_LEASE_MS,
      CHAT_STREAM_SLOT_TTL_SECONDS
    ]
  );
}

const memoryActiveByUser = new Map<string, number>();

/**
 * @param identity who is starting the run (the Cursor API key). Used only to
 * count that caller's own active streams; it is hashed before it is stored.
 */
export async function claimChatConcurrencySlot(
  identity?: string
): Promise<ChatConcurrencySlot> {
  const maxActiveStreams = parseMaxActiveChatStreams();
  const maxPerUser = parseMaxActiveStreamsPerUser();
  const redis = getRedisClient();
  const userId = identity?.trim() ? hashValue(identity) : null;

  if (!redis) {
    if (isProduction()) return { allowed: false, unavailable: true };

    if (userId && (memoryActiveByUser.get(userId) ?? 0) >= maxPerUser) {
      return { allowed: false, retryAfterSeconds: 10, reason: "per-user" };
    }

    if (memoryActiveStreams >= maxActiveStreams) {
      return { allowed: false, retryAfterSeconds: 10 };
    }

    memoryActiveStreams += 1;
    if (userId) memoryActiveByUser.set(userId, (memoryActiveByUser.get(userId) ?? 0) + 1);
    let released = false;

    return {
      allowed: true,
      release: async () => {
        if (released) return;
        released = true;
        memoryActiveStreams = Math.max(0, memoryActiveStreams - 1);
        if (userId) {
          const next = (memoryActiveByUser.get(userId) ?? 1) - 1;
          if (next <= 0) memoryActiveByUser.delete(userId);
          else memoryActiveByUser.set(userId, next);
        }
      }
    };
  }

  const slotId = randomUUID();
  // Callers with no identity share one pool, which keeps the global cap working.
  const userKey = userSlotKey(identity?.trim() || "anonymous");

  try {
    const claimed = await redis.eval<
      [number, number, string, number, number, number],
      number
    >(CLAIM_SLOT_SCRIPT, [CHAT_STREAM_SLOT_KEY, userKey], [
      Date.now(),
      maxActiveStreams,
      slotId,
      Date.now() + CHAT_STREAM_SLOT_LEASE_MS,
      CHAT_STREAM_SLOT_TTL_SECONDS,
      maxPerUser
    ]);

    if (claimed === 2) {
      return { allowed: false, retryAfterSeconds: 10, reason: "per-user" };
    }
    if (claimed !== 1) {
      return { allowed: false, retryAfterSeconds: 10 };
    }

    let released = false;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let refreshPromise: Promise<void> | null = null;

    const scheduleHeartbeat = () => {
      heartbeat = setTimeout(() => {
        if (released) return;

        refreshPromise = refreshRedisChatSlot(redis, slotId, userKey)
          .catch((error) => {
            console.error("Failed to refresh chat concurrency slot.", error);
          })
          .finally(() => {
            refreshPromise = null;
            if (!released) scheduleHeartbeat();
          });
      }, CHAT_STREAM_SLOT_HEARTBEAT_MS);
      heartbeat.unref?.();
    };

    scheduleHeartbeat();

    return {
      allowed: true,
      release: async () => {
        if (released) return;
        released = true;
        if (heartbeat) clearTimeout(heartbeat);

        try {
          await refreshPromise;
          await Promise.all([
            redis.zrem(CHAT_STREAM_SLOT_KEY, slotId),
            redis.zrem(userKey, slotId)
          ]);
        } catch (error) {
          console.error("Failed to release chat concurrency slot.", error);
        }
      }
    };
  } catch (error) {
    console.error("Chat concurrency storage is unavailable.", error);
    return { allowed: false, unavailable: true };
  }
}

export function bodyTooLargeResponse(
  request: Request,
  maxBytes = MAX_API_BODY_BYTES
) {
  const contentLength = request.headers.get("content-length");

  if (!contentLength) return null;

  const size = Number(contentLength);
  if (!Number.isFinite(size) || size <= maxBytes) return null;

  return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
}

type ReadJsonBodyResult<T> =
  | { ok: true; body: T }
  | { ok: false; response: NextResponse };

function invalidJsonResponse() {
  return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
}

export async function readJsonBody<T>(
  request: Request,
  maxBytes = MAX_API_BODY_BYTES
): Promise<ReadJsonBodyResult<T>> {
  const tooLarge = bodyTooLargeResponse(request, maxBytes);
  if (tooLarge) return { ok: false, response: tooLarge };

  if (!request.body) {
    return { ok: false, response: invalidJsonResponse() };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let rawBody = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Request body is too large." },
            { status: 413 }
          )
        };
      }

      rawBody += decoder.decode(value, { stream: true });
    }

    rawBody += decoder.decode();

    const parsed: unknown = JSON.parse(rawBody);
    // Every route reads named fields off the body, so null, arrays and bare
    // values would throw there and surface as an unhandled 500.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, response: invalidJsonResponse() };
    }

    return { ok: true, body: parsed as T };
  } catch {
    return { ok: false, response: invalidJsonResponse() };
  }
}

/**
 * Entry point for the small authenticated control routes (cancel, archive,
 * delete, artifacts): per-IP limit first, then a body read capped at
 * MAX_CONTROL_BODY_BYTES.
 */
export async function readControlBody<T>(
  request: Request
): Promise<ReadJsonBodyResult<T>> {
  const limit = await checkRateLimit("agentControl", request);
  if (!limit.allowed) {
    return {
      ok: false,
      response: limit.unavailable
        ? limiterUnavailableResponse()
        : rateLimitedResponse(limit.retryAfterSeconds)
    };
  }

  return readJsonBody<T>(request, MAX_CONTROL_BODY_BYTES);
}

export function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests. Please wait a moment and try again." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) }
    }
  );
}

export function limiterUnavailableResponse() {
  return NextResponse.json(
    {
      error:
        "Request controls are temporarily unavailable. Please try again later."
    },
    { status: 503 }
  );
}
