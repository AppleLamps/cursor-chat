import { NextResponse } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

/** Per IP, per route. Good enough for single-node and casual public deploys. */
export const RATE_LIMITS = {
  chat: { limit: 12, windowMs: 60_000 },
  repos: { limit: 30, windowMs: 60_000 }
} as const;

export const MAX_API_BODY_BYTES = 96_000;

function pruneBuckets(now: number) {
  if (buckets.size <= 5_000) return;

  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkRateLimit(
  route: keyof typeof RATE_LIMITS,
  request: Request
) {
  const { limit, windowMs } = RATE_LIMITS[route];
  const key = `${route}:${getClientIp(request)}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    pruneBuckets(now);
    return { allowed: true as const };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
  }

  bucket.count += 1;
  pruneBuckets(now);
  return { allowed: true as const };
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

export function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests. Please wait a moment and try again." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) }
    }
  );
}
