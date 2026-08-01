import { afterEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { GET } from "./route";

const originalFetch = globalThis.fetch;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const originalBackendUrl = process.env.INTERNAL_BACKEND_URL;
const originalInternalSecret = process.env.INTERNAL_API_SECRET;

function requestFor(attempt?: number) {
  const url = new URL("https://www.treehomeschool.com/auth/renew");
  url.searchParams.set("next", "/p/dashboard");
  if (attempt != null) url.searchParams.set("attempt", String(attempt));

  return new NextRequest(url, {
    headers: {
      cookie: [
        "treeschool_refresh_token=refresh-token",
        `treeschool_last_activity=${Math.floor(Date.now() / 1000) - 3600}`,
        "treeschool_session_trace=57d46746-94ea-4f36-b8a1-e279843ee583"
      ].join("; ")
    }
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  process.env.INTERNAL_BACKEND_URL = originalBackendUrl;
  process.env.INTERNAL_API_SECRET = originalInternalSecret;
});

function configureTestEnvironment() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  delete process.env.INTERNAL_BACKEND_URL;
  delete process.env.INTERNAL_API_SECRET;
}

test("keeps auth cookies and retries once after a refresh failure", async () => {
  configureTestEnvironment();
  globalThis.fetch = mock(async () =>
    Response.json({ error_code: "refresh_token_already_used" }, { status: 400 })
  ) as typeof fetch;

  const response = await GET(requestFor());
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://www.treehomeschool.com/auth/renew?next=%2Fp%2Fdashboard&attempt=1"
  );
  expect(setCookie).not.toContain("treeschool_refresh_token=;");
  expect(setCookie).not.toContain("treeschool_access_token=;");
});

test("clears stale auth cookies only after the retry also fails", async () => {
  configureTestEnvironment();
  globalThis.fetch = mock(async () =>
    Response.json({ error_code: "refresh_token_already_used" }, { status: 400 })
  ) as typeof fetch;

  const response = await GET(requestFor(1));
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toContain("/p/signin?");
  expect(setCookie).toContain("treeschool_refresh_token=");
  expect(setCookie).toContain("treeschool_access_token=");
});

test("a retry can recover with the browser's newly rotated refresh token", async () => {
  configureTestEnvironment();
  globalThis.fetch = mock(async () =>
    Response.json({
      access_token: "fresh-access-token",
      refresh_token: "fresh-refresh-token",
      expires_in: 3600
    })
  ) as typeof fetch;

  const response = await GET(requestFor(1));
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://www.treehomeschool.com/p/dashboard"
  );
  expect(setCookie).toContain("treeschool_access_token=fresh-access-token");
  expect(setCookie).toContain("treeschool_refresh_token=fresh-refresh-token");
});
