import { timingSafeEqual } from "node:crypto";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const publicRateLimitBuckets = new Map<string, RateLimitBucket>();
const MAX_RATE_LIMIT_BUCKETS = 10_000;
const SENSITIVE_ERROR_PATTERN = /(?:\bpostgres\b|\bdrizzle\b|\bsqlstate\b|\bdatabase\b|\bconstraint\b|\brelation\s+["']|\bcolumn\s+["']|syntax error at or near|invalid input syntax for type|remaining connection slots|econn(?:refused|reset)|enotfound|etimedout|authorization\s*:|password\s*=|api[_ -]?key|-----begin .*private key-----|\bat\s+[^\s]+:\d+:\d+)/i;

function clientAddress(request: Request) {
  const raw =
    request.headers.get("x-forwarded-for")?.split(",", 1)[0] ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const normalized = raw.trim().replace(/[^0-9a-f:.\-]/gi, "").slice(0, 80);
  return normalized || "unknown";
}

function publicRateLimitRule(pathname: string, method: string) {
  if (method !== "POST") return null;
  if (pathname === "/public/funnels/leads") {
    return { key: "lead", limit: 30, windowMs: 10 * 60_000 };
  }
  if (pathname === "/public/funnels/events" || pathname === "/public/funnels/code-events") {
    return { key: "event", limit: 600, windowMs: 60_000 };
  }
  return null;
}

function pruneRateLimitBuckets(now: number) {
  for (const [key, bucket] of publicRateLimitBuckets) {
    if (bucket.resetAt <= now) publicRateLimitBuckets.delete(key);
  }
  while (publicRateLimitBuckets.size >= MAX_RATE_LIMIT_BUCKETS) {
    const oldestKey = publicRateLimitBuckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    publicRateLimitBuckets.delete(oldestKey);
  }
}

export function authorizeInternalRequest(request: Request, secret: string | undefined) {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/internal/")) return null;
  if (!secret) {
    return Response.json(
      { error: "Internal API authentication is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const suppliedSecret = request.headers.get("x-treeschool-internal-secret") ?? "";
  const expected = Buffer.from(secret);
  const supplied = Buffer.from(suppliedSecret);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return Response.json(
      { error: "Unauthorized internal request." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  return null;
}

export function checkPublicRateLimit(request: Request, now = Date.now()) {
  const pathname = new URL(request.url).pathname;
  const rule = publicRateLimitRule(pathname, request.method.toUpperCase());
  if (!rule) return null;
  if (publicRateLimitBuckets.size >= MAX_RATE_LIMIT_BUCKETS) pruneRateLimitBuckets(now);

  const key = `${rule.key}:${clientAddress(request)}`;
  const current = publicRateLimitBuckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + rule.windowMs }
    : current;
  bucket.count += 1;
  publicRateLimitBuckets.set(key, bucket);
  if (bucket.count <= rule.limit) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return Response.json(
    { error: "Too many requests. Please wait and try again." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(rule.limit)
      }
    }
  );
}

export function checkPublicRequestSize(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (
    request.method.toUpperCase() !== "POST" ||
    ![
      "/public/funnels/leads",
      "/public/funnels/events",
      "/public/funnels/code-events"
    ].includes(pathname)
  ) {
    return null;
  }
  const limit = 128 * 1024;
  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= limit) return null;
  return Response.json(
    { error: "Request body is too large." },
    {
      status: 413,
      headers: {
        "Cache-Control": "no-store",
        "X-Max-Body-Bytes": String(limit)
      }
    }
  );
}

export function publicErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (!message || message.length > 500 || SENSITIVE_ERROR_PATTERN.test(message)) {
    console.error(JSON.stringify({
      event: "client_error_redacted",
      errorName: error.name || "Error"
    }));
    return fallback;
  }
  return message;
}

export function resetHttpSecurityForTests() {
  publicRateLimitBuckets.clear();
}
