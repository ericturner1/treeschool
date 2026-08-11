const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RateLimitRule = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const MAX_RATE_LIMIT_BUCKETS = 10_000;
const SENSITIVE_ERROR_PATTERN = /(?:\bpostgres\b|\bdrizzle\b|\bsqlstate\b|\bdatabase\b|\bconstraint\b|\brelation\s+["']|\bcolumn\s+["']|syntax error at or near|invalid input syntax for type|remaining connection slots|econn(?:refused|reset)|enotfound|etimedout|authorization\s*:|password\s*=|api[_ -]?key|-----begin .*private key-----|\bat\s+[^\s]+:\d+:\d+)/i;

function configuredAppOrigin() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

function rateLimitRule(method: string, pathname: string): RateLimitRule | null {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "GET" && pathname === "/api/native-workbooks/product-previews") {
    return { key: "workbook-product-preview", limit: 30, windowMs: 60_000 };
  }
  if (!UNSAFE_METHODS.has(normalizedMethod)) return null;
  if (pathname === "/signin") {
    return { key: "signin", limit: 20, windowMs: 15 * 60_000 };
  }
  if (pathname === "/signup") {
    return { key: "signup", limit: 10, windowMs: 60 * 60_000 };
  }
  if (pathname === "/auth/session") {
    return { key: "auth-session", limit: 20, windowMs: 15 * 60_000 };
  }
  if (pathname === "/api/funnels/leads") {
    return { key: "funnel-lead", limit: 15, windowMs: 10 * 60_000 };
  }
  if (pathname === "/api/funnels/events" || pathname === "/api/funnels/code-events") {
    return { key: "funnel-event", limit: 240, windowMs: 60_000 };
  }
  if (
    pathname === "/api/funnels/one-click-offer" ||
    pathname === "/api/post-checkout-offers/first-grade-japanese"
  ) {
    return { key: "checkout-offer", limit: 30, windowMs: 10 * 60_000 };
  }
  if (pathname === "/api/plan-pack/complete") {
    return { key: "plan-pack-upload", limit: 10, windowMs: 60 * 60_000 };
  }
  if (
    pathname === "/api/plan-pack/uploads/prepare" ||
    pathname === "/api/plan-pack/uploads/complete"
  ) {
    return { key: "plan-pack-staged-upload", limit: 60, windowMs: 60 * 60_000 };
  }
  return null;
}

function requestBodyLimit(pathname: string) {
  if (pathname === "/auth/session") return 64 * 1024;
  if (
    pathname === "/api/funnels/leads" ||
    pathname === "/api/funnels/events" ||
    pathname === "/api/funnels/code-events" ||
    pathname === "/api/funnels/one-click-offer" ||
    pathname === "/api/post-checkout-offers/first-grade-japanese"
  ) {
    return 128 * 1024;
  }
  if (
    pathname === "/api/plan-pack/uploads/prepare" ||
    pathname === "/api/plan-pack/uploads/complete"
  ) {
    return 512 * 1024;
  }
  return null;
}

function clientAddress(request: Request) {
  const raw =
    request.headers.get("x-forwarded-for")?.split(",", 1)[0] ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const normalized = raw.trim().replace(/[^0-9a-f:.\-]/gi, "").slice(0, 80);
  return normalized || "unknown";
}

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
  while (rateLimitBuckets.size >= MAX_RATE_LIMIT_BUCKETS) {
    const oldestKey = rateLimitBuckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    rateLimitBuckets.delete(oldestKey);
  }
}

export function checkRequestRateLimit(
  request: Request,
  pathname: string,
  now = Date.now()
) {
  const rule = rateLimitRule(request.method, pathname);
  if (!rule) return null;
  if (rateLimitBuckets.size >= MAX_RATE_LIMIT_BUCKETS) pruneExpiredBuckets(now);

  const key = `${rule.key}:${clientAddress(request)}`;
  const current = rateLimitBuckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + rule.windowMs }
    : current;
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  if (bucket.count <= rule.limit) return null;
  return {
    limit: rule.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
}

export function hasTrustedRequestOrigin(request: Request, pathname: string) {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return true;
  if (pathname === "/api/billing/stripe-webhook") return true;

  const origin = request.headers.get("origin");
  if (origin) {
    if (origin === "null") return false;
    try {
      const allowedOrigins = new Set([new URL(request.url).origin]);
      const configured = configuredAppOrigin();
      if (configured) allowedOrigins.add(configured);
      return allowedOrigins.has(new URL(origin).origin);
    } catch {
      return false;
    }
  }

  // SameSite cookies cover older clients that omit Origin. Modern browsers
  // also send Sec-Fetch-Site, which lets us reject an explicit cross-site POST.
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

export function oversizedRequestBody(request: Request, pathname: string) {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return null;
  const limit = requestBodyLimit(pathname);
  if (!limit) return null;
  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > limit ? { limit } : null;
}

export function publicErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  return !message || message.length > 500 || SENSITIVE_ERROR_PATTERN.test(message)
    ? fallback
    : message;
}

export function resetRequestGuardsForTests() {
  rateLimitBuckets.clear();
}
