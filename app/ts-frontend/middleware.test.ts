import { afterEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const originalFetch = globalThis.fetch;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function jwtWithExpiry(exp: number) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ exp })}.signature`;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
});

test("hands safe session renewal to a route that can commit rotated cookies atomically", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

  const fetchMock = mock(async () => {
    throw new Error("Safe GET renewal should not happen in Edge middleware.");
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const request = new NextRequest("https://www.treehomeschool.com/p/dashboard", {
    method: "GET",
    headers: {
      cookie: [
        `treeschool_access_token=${jwtWithExpiry(Math.floor(Date.now() / 1000) - 60)}`,
        "treeschool_refresh_token=original-refresh-token",
        `treeschool_last_activity=${Math.floor(Date.now() / 1000) - 3600}`
      ].join("; ")
    }
  });

  const response = await middleware(request);

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    "https://www.treehomeschool.com/auth/renew?next=%2Fp%2Fdashboard"
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test("renews an expiring session inline for an unsafe request", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

  const refreshedAccessToken = jwtWithExpiry(Math.floor(Date.now() / 1000) + 3600);
  globalThis.fetch = mock(async () => Response.json({
    access_token: refreshedAccessToken,
    refresh_token: "rotated-refresh-token",
    expires_in: 3600
  })) as typeof fetch;

  const request = new NextRequest(
    "https://www.treehomeschool.com/p/student/gajou/lesson-plan",
    {
      method: "POST",
      headers: {
        cookie: [
          `treeschool_access_token=${jwtWithExpiry(Math.floor(Date.now() / 1000) - 60)}`,
          "treeschool_refresh_token=original-refresh-token",
          `treeschool_last_activity=${Math.floor(Date.now() / 1000) - 3600}`
        ].join("; ")
      }
    }
  );

  const response = await middleware(request);
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(200);
  expect(setCookie).toContain(`treeschool_access_token=${refreshedAccessToken}`);
  expect(setCookie).toContain("treeschool_refresh_token=rotated-refresh-token");
  expect(setCookie).toContain("treeschool_last_activity=");
});
