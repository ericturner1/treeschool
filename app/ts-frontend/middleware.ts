import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  resolveLocale
} from "./lib/i18n/config";
import {
  AUTH_SESSION_ACTIVITY_COOKIE_NAME,
  AUTH_SESSION_COOKIE_MAX_AGE_SECONDS,
  AUTH_SESSION_TRACE_COOKIE_NAME,
  createAuthSessionTraceId,
  hasAuthSessionGoneIdle
} from "./lib/auth/session-policy";
import { recordAuthSessionDiagnostic } from "./lib/auth/session-diagnostics";
import { refreshSupabaseSession } from "./lib/auth/refresh-session";
import { authRenewalPathFor } from "./lib/auth/renewal-path";
import {
  FIRST_GRADE_CURRICULUM_EXPERIMENT_MAX_AGE_SECONDS,
  FIRST_GRADE_CURRICULUM_VARIANT_COOKIE,
  FIRST_GRADE_CURRICULUM_VISITOR_COOKIE,
  normalizeFirstGradeCurriculumVariant,
  normalizeFunnelVisitorId,
  variantForVisitorId
} from "./lib/first-grade-curriculum/experiment";

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
  const isFirstGradeCurriculumExperiment =
    request.nextUrl.pathname === "/first-grade-curriculum";
  const isManagedFunnel =
    request.nextUrl.pathname === "/f" ||
    request.nextUrl.pathname.startsWith("/f/");
  const funnelVisitorId = isFirstGradeCurriculumExperiment || isManagedFunnel
    ? normalizeFunnelVisitorId(
        request.cookies.get(FIRST_GRADE_CURRICULUM_VISITOR_COOKIE)?.value
      ) ?? crypto.randomUUID()
    : null;
  const firstGradeCurriculumVariant =
    isFirstGradeCurriculumExperiment && funnelVisitorId
      ? normalizeFirstGradeCurriculumVariant(
          request.cookies.get(FIRST_GRADE_CURRICULUM_VARIANT_COOKIE)?.value
        ) ?? variantForVisitorId(funnelVisitorId)
      : null;
  if (funnelVisitorId) {
    requestHeaders.set("x-treeschool-funnel-visitor-id", funnelVisitorId);
    if (firstGradeCurriculumVariant) {
      requestHeaders.set(
        "x-treeschool-first-grade-curriculum-variant",
        firstGradeCurriculumVariant
      );
    }
  }
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
  const existingTraceId = request.cookies.get(AUTH_SESSION_TRACE_COOKIE_NAME)?.value;
  const traceId =
    existingTraceId ??
    (accessToken || refreshToken ? createAuthSessionTraceId() : undefined);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const parsedLastActivity = Number(lastActivitySeconds);
  const activityAgeSeconds =
    Number.isFinite(parsedLastActivity) && parsedLastActivity > 0
      ? Math.max(0, nowSeconds - parsedLastActivity)
      : null;
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
  const isProtectedPath =
    request.nextUrl.pathname === "/p" ||
    request.nextUrl.pathname.startsWith("/p/") ||
    request.nextUrl.pathname.startsWith("/admin/");
  if (sessionWentIdle) {
    console.info(JSON.stringify({
      event: "auth_session_idle_expired",
      traceId: traceId ?? null,
      path: request.nextUrl.pathname,
      activityAgeSeconds
    }));
    await recordAuthSessionDiagnostic({
      traceId: traceId ?? null,
      event: "idle_expired",
      reason: "idle_timeout",
      path: request.nextUrl.pathname,
      metadata: { activityAgeSeconds }
    });
  }
  if (
    isProtectedPath &&
    traceId &&
    !sessionWentIdle &&
    !effectiveAccessToken &&
    !effectiveRefreshToken
  ) {
    console.warn(JSON.stringify({
      event: "auth_session_credentials_missing",
      traceId,
      path: request.nextUrl.pathname,
      hasActivityCookie: Boolean(lastActivitySeconds),
      activityAgeSeconds
    }));
    await recordAuthSessionDiagnostic({
      traceId,
      event: "credentials_missing",
      reason: "access_and_refresh_cookies_missing",
      path: request.nextUrl.pathname,
      metadata: {
        hasActivityCookie: Boolean(lastActivitySeconds),
        activityAgeSeconds
      }
    });
  }
  if (
    isProtectedPath &&
    traceId &&
    effectiveAccessToken &&
    tokenExpiresSoon(effectiveAccessToken) &&
    !effectiveRefreshToken
  ) {
    console.warn(JSON.stringify({
      event: "auth_session_refresh_cookie_missing",
      traceId,
      path: request.nextUrl.pathname,
      hasActivityCookie: Boolean(lastActivitySeconds),
      activityAgeSeconds
    }));
    await recordAuthSessionDiagnostic({
      traceId,
      event: "refresh_cookie_missing",
      reason: "expired_access_without_refresh_cookie",
      path: request.nextUrl.pathname,
      metadata: {
        hasActivityCookie: Boolean(lastActivitySeconds),
        activityAgeSeconds
      }
    });
  }
  if (
    isProtectedPath &&
    lastActivitySeconds &&
    !sessionWentIdle &&
    !effectiveAccessToken &&
    !effectiveRefreshToken
  ) {
    console.warn(JSON.stringify({
      event: "auth_session_cookies_missing",
      traceId: traceId ?? null,
      path: request.nextUrl.pathname,
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
      traceId: traceId ?? null,
      path: request.nextUrl.pathname,
      missingSupabaseUrl: !supabaseUrl,
      missingAnonKey: !anonKey
    }));
    await recordAuthSessionDiagnostic({
      traceId: traceId ?? null,
      event: "refresh_unavailable",
      reason: "missing_supabase_config",
      path: request.nextUrl.pathname,
      metadata: {
        missingSupabaseUrl: !supabaseUrl,
        missingAnonKey: !anonKey
      }
    });
  }
  const shouldRefreshSession = Boolean(
    !usesLocalDevSession &&
    effectiveRefreshToken &&
    (!effectiveAccessToken || tokenExpiresSoon(effectiveAccessToken)) &&
    supabaseUrl &&
    anonKey
  );
  const isAuthPath = request.nextUrl.pathname.startsWith("/auth/");
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
    !isAuthPath
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
    const response = NextResponse.redirect(renewalUrl, 307);
    if (traceId) {
      response.cookies.set(AUTH_SESSION_TRACE_COOKIE_NAME, traceId, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
      });
    }
    console.info(JSON.stringify({
      event: "auth_session_renewal_requested",
      traceId: traceId ?? null,
      path: request.nextUrl.pathname,
      hasAccessCookie: Boolean(effectiveAccessToken),
      hasRefreshCookie: Boolean(effectiveRefreshToken),
      activityAgeSeconds
    }));
    return response;
  }

  let refreshedSession: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  } | null = null;

  // Auth route handlers own their credential lifecycle. In particular,
  // /auth/renew must rotate the refresh token exactly once; refreshing it in
  // middleware first would produce two competing rotated cookies.
  if (
    shouldRefreshSession &&
    !isAuthPath &&
    effectiveRefreshToken &&
    supabaseUrl &&
    anonKey
  ) {
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
        traceId: traceId ?? null,
        method: request.method,
        path: request.nextUrl.pathname,
        expiresIn: refreshedSession.expires_in ?? null
      }));
    } else {
      console.warn(JSON.stringify({
        event: "auth_session_refresh_failed",
        traceId: traceId ?? null,
        method: request.method,
        path: request.nextUrl.pathname,
        status: refreshResult.status,
        errorCode: refreshResult.errorCode
      }));
      await recordAuthSessionDiagnostic({
        traceId: traceId ?? null,
        event: "renewal_failed",
        reason: refreshResult.errorCode,
        path: request.nextUrl.pathname,
        statusCode: refreshResult.status,
        metadata: {
          method: request.method,
          mode: "inline"
        }
      });
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

  if (funnelVisitorId) {
    const experimentCookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: FIRST_GRADE_CURRICULUM_EXPERIMENT_MAX_AGE_SECONDS
    };
    if (firstGradeCurriculumVariant) {
      response.cookies.set(
        FIRST_GRADE_CURRICULUM_VARIANT_COOKIE,
        firstGradeCurriculumVariant,
        experimentCookieOptions
      );
    }
    response.cookies.set(
      FIRST_GRADE_CURRICULUM_VISITOR_COOKIE,
      funnelVisitorId,
      experimentCookieOptions
    );
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
    if (traceId) {
      response.cookies.set(AUTH_SESSION_TRACE_COOKIE_NAME, traceId, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
      });
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
