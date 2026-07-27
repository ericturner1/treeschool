import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  resolveLocale
} from "./lib/i18n/config";
import {
  AUTH_SESSION_ACTIVITY_COOKIE_NAME,
  AUTH_SESSION_COOKIE_MAX_AGE_SECONDS,
  hasAuthSessionGoneIdle
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

function removeRequestCookie(cookieHeader: string, name: string) {
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .filter((cookie) => cookie.split("=", 1)[0] !== name)
    .join("; ");
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

async function requestRefreshedSession({
  supabaseUrl,
  anonKey,
  refreshToken
}: {
  supabaseUrl: string;
  anonKey: string;
  refreshToken: string;
}) {
  const performRefresh = () => fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store"
  }).catch(() => null);

  let response = await performRefresh();

  // A dropped response can happen after Supabase has already rotated the token.
  // Retrying immediately is safe inside Supabase's refresh-token reuse interval.
  if (!response || response.status >= 500) {
    response = await performRefresh();
  }

  if (!response?.ok) {
    let errorCode = "unknown";

    try {
      const payload = await response?.json() as { error_code?: string; code?: string };
      errorCode = payload?.error_code ?? payload?.code ?? errorCode;
    } catch {
      // The response status and safe error code below are sufficient diagnostics.
    }

    console.warn(JSON.stringify({
      event: "auth_session_refresh_failed",
      status: response?.status ?? 0,
      errorCode
    }));
    return null;
  }

  const payload = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token || !payload.refresh_token) {
    console.warn(JSON.stringify({
      event: "auth_session_refresh_failed",
      status: response.status,
      errorCode: "missing_session_tokens"
    }));
    return null;
  }

  console.info(JSON.stringify({
    event: "auth_session_refreshed",
    expiresIn: payload.expires_in ?? null
  }));

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in
  };
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
  const lastActivitySeconds = request.cookies.get(AUTH_SESSION_ACTIVITY_COOKIE_NAME)?.value;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionWentIdle = Boolean(
    (accessToken || refreshToken) &&
    hasAuthSessionGoneIdle(lastActivitySeconds, nowSeconds)
  );
  if (sessionWentIdle) {
    let cookieHeader = requestHeaders.get("cookie") ?? "";
    cookieHeader = removeRequestCookie(cookieHeader, ACCESS_TOKEN_COOKIE_NAME);
    cookieHeader = removeRequestCookie(cookieHeader, REFRESH_TOKEN_COOKIE_NAME);
    cookieHeader = removeRequestCookie(cookieHeader, AUTH_SESSION_ACTIVITY_COOKIE_NAME);
    requestHeaders.set("cookie", cookieHeader);
  }
  const effectiveAccessToken = sessionWentIdle ? undefined : accessToken;
  const effectiveRefreshToken = sessionWentIdle ? undefined : refreshToken;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const usesLocalDevSession = effectiveAccessToken?.startsWith(LOCAL_DEV_TOKEN_PREFIX) === true ||
    effectiveRefreshToken?.startsWith("local-dev-refresh:") === true;
  if (
    request.nextUrl.pathname.startsWith("/p/") &&
    lastActivitySeconds &&
    !sessionWentIdle &&
    !effectiveAccessToken &&
    !effectiveRefreshToken
  ) {
    console.warn(JSON.stringify({
      event: "auth_session_cookies_missing",
      hasActivityCookie: true
    }));
  }
  if (
    effectiveRefreshToken &&
    (!effectiveAccessToken || tokenExpiresSoon(effectiveAccessToken)) &&
    (!supabaseUrl || !anonKey)
  ) {
    console.error(JSON.stringify({
      event: "auth_session_refresh_unavailable",
      missingSupabaseUrl: !supabaseUrl,
      missingAnonKey: !anonKey
    }));
  }
  const shouldRefreshSession = Boolean(
    !usesLocalDevSession &&
    effectiveRefreshToken &&
    (!effectiveAccessToken || tokenExpiresSoon(effectiveAccessToken)) &&
    supabaseUrl &&
    anonKey
  );
  let refreshedSession: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  } | null = null;

  if (shouldRefreshSession && effectiveRefreshToken && supabaseUrl && anonKey) {
    refreshedSession = await requestRefreshedSession({
      supabaseUrl,
      anonKey,
      refreshToken: effectiveRefreshToken
    });

    if (refreshedSession) {
      let cookieHeader = requestHeaders.get("cookie") ?? "";
      cookieHeader = setRequestCookie(cookieHeader, ACCESS_TOKEN_COOKIE_NAME, refreshedSession.access_token);
      cookieHeader = setRequestCookie(cookieHeader, REFRESH_TOKEN_COOKIE_NAME, refreshedSession.refresh_token);
      requestHeaders.set("cookie", cookieHeader);
    }
    // A failed refresh deliberately leaves the HttpOnly refresh cookie alone.
    // Concurrent requests can race during token rotation; a stale request must
    // not erase a newer successful session. Explicit sign-out still clears it.
  }

  // A successful refresh rotates the refresh token. On safe requests, finish
  // renewal with a browser round-trip so the rotated cookies are committed
  // before the protected page renders. This avoids losing Set-Cookie headers
  // while a downstream Server Component response is being composed.
  const response = refreshedSession && (request.method === "GET" || request.method === "HEAD")
    ? NextResponse.redirect(request.nextUrl.clone(), 307)
    : NextResponse.next({ request: { headers: requestHeaders } });

  if (sessionWentIdle) {
    response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
    response.cookies.delete(REFRESH_TOKEN_COOKIE_NAME);
    response.cookies.delete(AUTH_SESSION_ACTIVITY_COOKIE_NAME);
  }

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

  const hasHealthySession = Boolean(
    !sessionWentIdle &&
    (
      refreshedSession ||
      (
        effectiveAccessToken &&
        (usesLocalDevSession || !tokenExpiresSoon(effectiveAccessToken))
      )
    )
  );
  if (hasHealthySession) {
    response.cookies.set(AUTH_SESSION_ACTIVITY_COOKIE_NAME, String(nowSeconds), {
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
