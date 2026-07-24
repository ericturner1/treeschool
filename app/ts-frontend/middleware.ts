import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  resolveLocale
} from "./lib/i18n/config";
import {
  AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
} from "./lib/auth/session-policy";

const ACCESS_TOKEN_COOKIE_NAME = "treeschool_access_token";
const REFRESH_TOKEN_COOKIE_NAME = "treeschool_refresh_token";
const LOCAL_DEV_TOKEN_PREFIX = "treeschool-local-dev:";

function setRequestCookie(cookieHeader: string, name: string, value: string) {
  const cookies = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .filter((cookie) => cookie.split("=", 1)[0] !== name);
  cookies.push(`${name}=${value}`);
  return cookies.join("; ");
}

function tokenExpiresSoon(token: string) {
  try {
    const segment = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, "="))) as { exp?: number };
    return !payload.exp || payload.exp <= Math.floor(Date.now() / 1000) + 300;
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const legacyStudentPlanMatch = request.nextUrl.pathname.match(
    /^\/parent\/student\/([^/]+)\/curriculum(\/.*)?$/
  );
  if (legacyStudentPlanMatch) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = `/p/student/${legacyStudentPlanMatch[1]}/lesson-plan${legacyStudentPlanMatch[2] ?? ""}`;
    return NextResponse.redirect(canonicalUrl, 308);
  }

  if (request.nextUrl.pathname === "/parent" || request.nextUrl.pathname.startsWith("/parent/")) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = request.nextUrl.pathname.replace(/^\/parent(?=\/|$)/, "/p");
    return NextResponse.redirect(canonicalUrl, 308);
  }

  if (request.nextUrl.pathname === "/parents" || request.nextUrl.pathname.startsWith("/parents/")) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = request.nextUrl.pathname
      .replace(/^\/parents\/curriculums?(?=\/|$)/, "/p/curriculums")
      .replace(/^\/parents(?=\/|$)/, "/p");
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const legacyGeneratorPrefix = request.nextUrl.pathname === "/pack" || request.nextUrl.pathname.startsWith("/pack/")
    ? "/pack"
    : request.nextUrl.pathname === "/lesson-plan-generator" || request.nextUrl.pathname.startsWith("/lesson-plan-generator/")
      ? "/lesson-plan-generator"
      : null;

  if (legacyGeneratorPrefix) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = request.nextUrl.pathname.replace(
      legacyGeneratorPrefix,
      "/homeschool-lesson-plan-generator"
    );
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const queryLocale = request.nextUrl.searchParams.get("lang") ?? undefined;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const locale = resolveLocale(queryLocale ?? cookieLocale ?? DEFAULT_LOCALE);
  const requestHeaders = new Headers(request.headers);
  const countryCode =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("cloudfront-viewer-country") ??
    request.headers.get("x-appengine-country") ??
    request.headers.get("x-country-code");
  if (countryCode) requestHeaders.set("x-treeschool-ip-country", countryCode);

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const usesLocalDevSession = accessToken?.startsWith(LOCAL_DEV_TOKEN_PREFIX) === true ||
    refreshToken?.startsWith("local-dev-refresh:") === true;
  const shouldRefreshSession = Boolean(
    !usesLocalDevSession &&
    refreshToken &&
    (!accessToken || tokenExpiresSoon(accessToken)) &&
    supabaseUrl &&
    anonKey
  );
  let refreshedSession: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  } | null = null;

  if (shouldRefreshSession && refreshToken && supabaseUrl && anonKey) {
    const refreshResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store"
    }).catch(() => null);

    if (refreshResponse?.ok) {
      refreshedSession = (await refreshResponse.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in?: number;
      };
      let cookieHeader = requestHeaders.get("cookie") ?? "";
      cookieHeader = setRequestCookie(cookieHeader, ACCESS_TOKEN_COOKIE_NAME, refreshedSession.access_token);
      cookieHeader = setRequestCookie(cookieHeader, REFRESH_TOKEN_COOKIE_NAME, refreshedSession.refresh_token);
      requestHeaders.set("cookie", cookieHeader);
    }
    // A failed refresh deliberately leaves the HttpOnly refresh cookie alone.
    // Concurrent requests can race during token rotation; a stale request must
    // not erase a newer successful session. Explicit sign-out still clears it.
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (queryLocale || cookieLocale !== locale) {
    response.cookies.set(LOCALE_COOKIE_NAME, locale, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365
    });
  }

  if (refreshedSession) {
      response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, refreshedSession.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: refreshedSession.expires_in ?? 3600
      });
      response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, refreshedSession.refresh_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
      });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
