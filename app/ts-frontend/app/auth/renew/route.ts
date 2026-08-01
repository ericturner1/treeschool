import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME
} from "../../../lib/auth/server";
import { refreshSupabaseSession } from "../../../lib/auth/refresh-session";
import { safeAuthRenewalReturnPath } from "../../../lib/auth/renewal-path";
import {
  AUTH_SESSION_ACTIVITY_COOKIE_NAME,
  AUTH_SESSION_COOKIE_MAX_AGE_SECONDS,
  AUTH_SESSION_RENEWAL_RETRY_LIMIT,
  AUTH_SESSION_TRACE_COOKIE_NAME,
  createAuthSessionTraceId,
  hasAuthSessionGoneIdle
} from "../../../lib/auth/session-policy";
import { recordAuthSessionDiagnostic } from "../../../lib/auth/session-diagnostics";

function clearAuthCookies(response: NextResponse) {
  response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
  response.cookies.delete(REFRESH_TOKEN_COOKIE_NAME);
  response.cookies.delete(AUTH_SESSION_ACTIVITY_COOKIE_NAME);
}

function setTraceCookie(
  response: NextResponse,
  request: NextRequest,
  traceId: string
) {
  response.cookies.set(AUTH_SESSION_TRACE_COOKIE_NAME, traceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
  });
}

function signInUrl(request: NextRequest, next: string) {
  const url = new URL("/p/signin", request.url);
  url.searchParams.set("next", next);
  url.searchParams.set(
    "message",
    "Your secure session needs to be renewed. Please sign in again."
  );
  return url;
}

function retryUrl(request: NextRequest, next: string, attempt: number) {
  const url = new URL("/auth/renew", request.url);
  url.searchParams.set("next", next);
  url.searchParams.set("attempt", String(attempt));
  return url;
}

export async function GET(request: NextRequest) {
  const next = safeAuthRenewalReturnPath(
    request.nextUrl.searchParams.get("next")
  );
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  const lastActivity = request.cookies.get(
    AUTH_SESSION_ACTIVITY_COOKIE_NAME
  )?.value;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const parsedAttempt = Number(request.nextUrl.searchParams.get("attempt") ?? "0");
  const attempt = Number.isInteger(parsedAttempt) && parsedAttempt > 0
    ? parsedAttempt
    : 0;
  const traceId =
    request.cookies.get(AUTH_SESSION_TRACE_COOKIE_NAME)?.value ??
    createAuthSessionTraceId();
  const parsedLastActivity = Number(lastActivity);
  const activityAgeSeconds =
    Number.isFinite(parsedLastActivity) && parsedLastActivity > 0
      ? Math.max(0, nowSeconds - parsedLastActivity)
      : null;

  console.info(
    JSON.stringify({
      event: "auth_session_renewal_started",
      traceId,
      returnPath: next,
      hasRefreshCookie: Boolean(refreshToken),
      hasActivityCookie: Boolean(lastActivity),
      activityAgeSeconds,
      attempt
    })
  );

  if (
    !refreshToken ||
    hasAuthSessionGoneIdle(lastActivity, nowSeconds)
  ) {
    const response = NextResponse.redirect(signInUrl(request, next), 303);
    clearAuthCookies(response);
    setTraceCookie(response, request, traceId);
    console.warn(
      JSON.stringify({
        event: "auth_session_renewal_unavailable",
        traceId,
        reason: refreshToken ? "idle_timeout" : "missing_refresh_cookie",
        activityAgeSeconds,
        returnPath: next
      })
    );
    await recordAuthSessionDiagnostic({
      traceId,
      event: "renewal_unavailable",
      reason: refreshToken ? "idle_timeout" : "missing_refresh_cookie",
      path: next,
      metadata: {
        activityAgeSeconds,
        attempt
      }
    });
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    const response = NextResponse.redirect(signInUrl(request, next), 303);
    setTraceCookie(response, request, traceId);
    console.error(
      JSON.stringify({
        event: "auth_session_renewal_unavailable",
        traceId,
        reason: "missing_supabase_config",
        returnPath: next
      })
    );
    await recordAuthSessionDiagnostic({
      traceId,
      event: "renewal_unavailable",
      reason: "missing_supabase_config",
      path: next,
      metadata: { attempt }
    });
    return response;
  }

  const result = await refreshSupabaseSession({
    supabaseUrl,
    anonKey,
    refreshToken
  });

  if (!result.ok) {
    const willRetry = attempt < AUTH_SESSION_RENEWAL_RETRY_LIMIT;
    const response = NextResponse.redirect(
      willRetry
        ? retryUrl(request, next, attempt + 1)
        : signInUrl(request, next),
      303
    );
    if (!willRetry) clearAuthCookies(response);
    setTraceCookie(response, request, traceId);
    console.warn(
      JSON.stringify({
        event: "auth_session_renewal_failed",
        traceId,
        status: result.status,
        errorCode: result.errorCode,
        attempt,
        willRetry,
        returnPath: next
      })
    );
    await recordAuthSessionDiagnostic({
      traceId,
      event: "renewal_failed",
      reason: result.errorCode,
      path: next,
      statusCode: result.status,
      metadata: {
        attempt,
        willRetry,
        mode: "route"
      }
    });
    return response;
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  const secure = request.nextUrl.protocol === "https:";

  // Keep the expired access token available to middleware long enough to
  // renew it. Its JWT expiry still prevents it from authorizing requests.
  response.cookies.set(
    ACCESS_TOKEN_COOKIE_NAME,
    result.session.access_token,
    {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
    }
  );
  response.cookies.set(
    REFRESH_TOKEN_COOKIE_NAME,
    result.session.refresh_token,
    {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
    }
  );
  response.cookies.set(
    AUTH_SESSION_ACTIVITY_COOKIE_NAME,
    String(nowSeconds),
    {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
    }
  );
  setTraceCookie(response, request, traceId);

  console.info(
    JSON.stringify({
      event: "auth_session_renewed",
      traceId,
      expiresIn: result.session.expires_in ?? null,
      returnPath: next
    })
  );

  return response;
}
