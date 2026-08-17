const allowedOrigins = [
  "dev.treehomeschool.com",
  process.env.NEXT_PUBLIC_APP_HOST,
  process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "")
].filter(Boolean);

const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : null;
  } catch {
    return null;
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://buy.stripe.com",
  [
    "script-src 'self' 'unsafe-inline'",
    ...(process.env.NODE_ENV === "production" ? [] : ["'unsafe-eval'"]),
    "https://www.googletagmanager.com",
    "https://connect.facebook.net"
  ].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  [
    "connect-src 'self'",
    "https://www.google-analytics.com",
    "https://*.google-analytics.com",
    "https://analytics.google.com",
    "https://*.analytics.google.com",
    "https://www.googletagmanager.com",
    "https://www.facebook.com",
    "https://connect.facebook.net",
    "https://storage.googleapis.com",
    "https://*.googleapis.com",
    supabaseOrigin,
    ...(process.env.NODE_ENV === "production" ? [] : ["ws:", "http:"])
  ].filter(Boolean).join(" "),
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : [])
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=(self), usb=()"
  }
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  allowedDevOrigins: allowedOrigins,
  experimental: {
    serverActions: {
      allowedOrigins,
      bodySizeLimit: "205mb"
    }
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  }
};

export default nextConfig;
