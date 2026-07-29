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
import { refreshSupabaseSession } from "./lib/auth/refresh-session";
import { authRenewalPathFor } from "./lib/auth/renewal-path";

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
  const isSafeRequest =
    request.method === "GET" || request.method === "HEAD";
  const isSpeculativeRequest =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("rsc") === "1";
  const shouldUseRenewalRoute = Boolean(
    shouldRefreshSession &&
    isSafeRequest &&
    !isSpeculativeRequest &&
    !request.nextUrl.pathname.startsWith("/auth/")
  );

  // Rotate Supabase credentials in a normal Route Handler response. Vercel
  // reliably commits those Set-Cookie headers before the browser returns to
  // the requested page, avoiding an Edge middleware rotation race.
  if (shouldUseRenewalRoute) {
    const renewalUrl = request.nextUrl.clone();
    const renewalPath = authRenewalPathFor(request.nextUrl);
    const parsedRenewalPath = new URL(renewalPath, request.nextUrl);
    renewalUrl.pathname = parsedRenewalPath.pathname;
    renewalUrl.search = parsedRenewalPath.search;
    return NextResponse.redirect(renewalUrl, 307);
  }

  let refreshedSession: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  } | null = null;

  if (shouldRefreshSession && effectiveRefreshToken && supabaseUrl && anonKey) {
    const refreshResult = await refreshSupabaseSession({
      supabaseUrl,
      anonKey,
      refreshToken: effectiveRefreshToken
    });

    if (refreshResult.ok) {
      refreshedSession = refreshResult.session;
      let cookieHeader = requestHeaders.get("cookie") ?? "";
      cookieHeader = setRequestCookie(cookieHeader, ACCESS_TOKEN_COOKIE_NAME, refreshedSession.access_token);
      cookieHeader = setRequestCookie(cookieHeader, REFRESH_TOKEN_COOKIE_NAME, refreshedSession.refresh_token);
      requestHeaders.set("cookie", cookieHeader);
      console.info(JSON.stringify({
        event: "auth_session_refreshed_inline",
        method: request.method,
        path: request.nextUrl.pathname,
        expiresIn: refreshedSession.expires_in ?? null
      }));
    } else {
      console.warn(JSON.stringify({
        event: "auth_session_refresh_failed",
        method: request.method,
        path: request.nextUrl.pathname,
        status: refreshResult.status,
        errorCode: refreshResult.errorCode
      }));
    }
    // A failed refresh deliberately leaves the HttpOnly refresh cookie alone.
    // Concurrent requests can race during token rotation; a stale request must
    // not erase a newer successful session. Explicit sign-out still clears it.
  }

  // Unsafe requests cannot be redirected without losing their submitted data,
  // so an inline refresh updates both the downstream request and its response.
  const response = NextResponse.next({ request: { headers: requestHeaders } });

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
      maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
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
