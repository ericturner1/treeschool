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
  hasAuthSessionGoneIdle
} from "../../../lib/auth/session-policy";

function clearAuthCookies(response: NextResponse) {
  response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
  response.cookies.delete(REFRESH_TOKEN_COOKIE_NAME);
  response.cookies.delete(AUTH_SESSION_ACTIVITY_COOKIE_NAME);
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

export async function GET(request: NextRequest) {
  const next = safeAuthRenewalReturnPath(
    request.nextUrl.searchParams.get("next")
  );
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  const lastActivity = request.cookies.get(
    AUTH_SESSION_ACTIVITY_COOKIE_NAME
  )?.value;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (
    !refreshToken ||
    hasAuthSessionGoneIdle(lastActivity, nowSeconds)
  ) {
    const response = NextResponse.redirect(signInUrl(request, next), 303);
    clearAuthCookies(response);
    console.warn(
      JSON.stringify({
        event: "auth_session_renewal_unavailable",
        reason: refreshToken ? "idle_timeout" : "missing_refresh_cookie",
        returnPath: next
      })
    );
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    const response = NextResponse.redirect(signInUrl(request, next), 303);
    console.error(
      JSON.stringify({
        event: "auth_session_renewal_unavailable",
        reason: "missing_supabase_config",
        returnPath: next
      })
    );
    return response;
  }

  const result = await refreshSupabaseSession({
    supabaseUrl,
    anonKey,
    refreshToken
  });

  if (!result.ok) {
    const response = NextResponse.redirect(signInUrl(request, next), 303);
    clearAuthCookies(response);
    console.warn(
      JSON.stringify({
        event: "auth_session_renewal_failed",
        status: result.status,
        errorCode: result.errorCode,
        returnPath: next
      })
    );
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

  console.info(
    JSON.stringify({
      event: "auth_session_renewed",
      expiresIn: result.session.expires_in ?? null,
      returnPath: next
    })
  );

  return response;
}
