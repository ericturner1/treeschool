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

test("lets the auth renewal route rotate credentials exactly once", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

  const fetchMock = mock(async () => {
    throw new Error("The renewal route, not middleware, owns this refresh.");
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const request = new NextRequest(
    "https://www.treehomeschool.com/auth/renew?next=%2Fp%2Fdashboard",
    {
      method: "GET",
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
  expect(fetchMock).not.toHaveBeenCalled();
  expect(setCookie).not.toContain("treeschool_access_token=");
  expect(setCookie).not.toContain("treeschool_refresh_token=");
});

test("persistently assigns first-grade curriculum visitors to one experiment variant", async () => {
  const firstResponse = await middleware(
    new NextRequest(
      "https://www.treehomeschool.com/first-grade-curriculum"
    )
  );
  const firstSetCookie = firstResponse.headers.get("set-cookie") ?? "";
  const variant = firstSetCookie.match(
    /treeschool_fg_curriculum_variant=([ab])/
  )?.[1];
  const visitorId = firstSetCookie.match(
    /treeschool_funnel_visitor_id=([0-9a-f-]+)/
  )?.[1];

  expect(variant === "a" || variant === "b").toBe(true);
  expect(visitorId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );

  const repeatResponse = await middleware(
    new NextRequest(
      "https://www.treehomeschool.com/first-grade-curriculum",
      {
        headers: {
          cookie: [
            `treeschool_fg_curriculum_variant=${variant}`,
            `treeschool_funnel_visitor_id=${visitorId}`
          ].join("; ")
        }
      }
    )
  );
  const repeatSetCookie = repeatResponse.headers.get("set-cookie") ?? "";

  expect(repeatSetCookie).toContain(
    `treeschool_fg_curriculum_variant=${variant}`
  );
  expect(repeatSetCookie).toContain(
    `treeschool_funnel_visitor_id=${visitorId}`
  );
});

test("persistently identifies visitors across managed funnel steps", async () => {
  const firstResponse = await middleware(
    new NextRequest("https://www.treehomeschool.com/f/japanese-course")
  );
  const firstSetCookie = firstResponse.headers.get("set-cookie") ?? "";
  const visitorId = firstSetCookie.match(
    /treeschool_funnel_visitor_id=([0-9a-f-]+)/
  )?.[1];

  expect(visitorId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  expect(firstSetCookie).not.toContain("treeschool_fg_curriculum_variant=");

  const repeatResponse = await middleware(
    new NextRequest(
      "https://www.treehomeschool.com/f/japanese-course/checkout",
      {
        headers: {
          cookie: `treeschool_funnel_visitor_id=${visitorId}`
        }
      }
    )
  );
  const repeatSetCookie = repeatResponse.headers.get("set-cookie") ?? "";

  expect(repeatSetCookie).toContain(
    `treeschool_funnel_visitor_id=${visitorId}`
  );
  expect(repeatSetCookie).not.toContain("treeschool_fg_curriculum_variant=");
});
