import { createHash, randomUUID } from "node:crypto";
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

/** Per route defaults. Production uses Redis; local development can use memory. */
export const RATE_LIMITS = {
  chat: { limit: 12, windowMs: 60_000 },
  chatImplement: { limit: 6, windowMs: 60_000 },
  repos: { limit: 30, windowMs: 60_000 },
  branches: { limit: 60, windowMs: 60_000 }
} as const;

export const MAX_API_BODY_BYTES = 96_000;

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
  | { allowed: false; retryAfterSeconds: number; unavailable?: false }
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

export function getClientIp(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for");

  if (forwarded) {
    return normalizeIdentity(forwarded.split(",")[0] || "unknown");
  }

  return normalizeIdentity(request.headers.get("x-real-ip") || "unknown");
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

async function consumeRedisBucket(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitAllowed | RateLimitBlocked> {
  const redisKey = redisBucketKey(key);
  const count = await redis.incr(redisKey);

  if (count === 1) {
    try {
      await redis.expire(redisKey, Math.ceil(windowMs / 1000));
    } catch (error) {
      await redis.del(redisKey).catch(() => undefined);
      throw error;
    }
  }

  if (count <= limit) {
    return { allowed: true };
  }

  const ttl = await redis.ttl(redisKey);
  return {
    allowed: false,
    retryAfterSeconds: ttl > 0 ? ttl : Math.ceil(windowMs / 1000)
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

function parseMaxActiveChatStreams() {
  const value = Number(process.env.ASKCURSOR_MAX_ACTIVE_CHAT_STREAMS);
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_ACTIVE_CHAT_STREAMS;
}

async function refreshRedisChatSlot(redis: Redis, slotId: string) {
  await redis.zadd(CHAT_STREAM_SLOT_KEY, {
    score: Date.now() + CHAT_STREAM_SLOT_LEASE_MS,
    member: slotId
  });
  await redis.expire(CHAT_STREAM_SLOT_KEY, CHAT_STREAM_SLOT_TTL_SECONDS);
}

export async function claimChatConcurrencySlot(): Promise<ChatConcurrencySlot> {
  const maxActiveStreams = parseMaxActiveChatStreams();
  const redis = getRedisClient();

  if (!redis) {
    if (isProduction()) return { allowed: false, unavailable: true };

    if (memoryActiveStreams >= maxActiveStreams) {
      return { allowed: false, retryAfterSeconds: 10 };
    }

    memoryActiveStreams += 1;
    let released = false;

    return {
      allowed: true,
      release: async () => {
        if (released) return;
        released = true;
        memoryActiveStreams = Math.max(0, memoryActiveStreams - 1);
      }
    };
  }

  const slotId = randomUUID();

  try {
    const claimed = await redis.eval<[number, number, string, number, number], number>(
      `
      redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
      local active = redis.call("ZCARD", KEYS[1])
      if active >= tonumber(ARGV[2]) then
        redis.call("EXPIRE", KEYS[1], ARGV[5])
        return 0
      end
      redis.call("ZADD", KEYS[1], ARGV[4], ARGV[3])
      redis.call("EXPIRE", KEYS[1], ARGV[5])
      return 1
      `,
      [CHAT_STREAM_SLOT_KEY],
      [
        Date.now(),
        maxActiveStreams,
        slotId,
        Date.now() + CHAT_STREAM_SLOT_LEASE_MS,
        CHAT_STREAM_SLOT_TTL_SECONDS
      ]
    );

    if (claimed !== 1) {
      return { allowed: false, retryAfterSeconds: 10 };
    }

    let released = false;
    let refreshPromise: Promise<void> | null = null;
    const heartbeat = setInterval(() => {
      if (released) return;

      refreshPromise = refreshRedisChatSlot(redis, slotId).catch((error) => {
        console.error("Failed to refresh chat concurrency slot.", error);
      });
    }, CHAT_STREAM_SLOT_HEARTBEAT_MS);
    heartbeat.unref?.();

    return {
      allowed: true,
      release: async () => {
        if (released) return;
        released = true;
        clearInterval(heartbeat);

        try {
          await refreshPromise;
          await redis.zrem(CHAT_STREAM_SLOT_KEY, slotId);
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

    return { ok: true, body: JSON.parse(rawBody) as T };
  } catch {
    return { ok: false, response: invalidJsonResponse() };
  }
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
