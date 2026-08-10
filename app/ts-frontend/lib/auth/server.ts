import { cookies, type UnsafeUnwrappedCookies } from "next/headers";
import {
  AUTH_SESSION_ACTIVITY_COOKIE_NAME,
  AUTH_SESSION_COOKIE_MAX_AGE_SECONDS,
  AUTH_SESSION_TRACE_COOKIE_NAME,
  createAuthSessionTraceId
} from "./session-policy";
import { backendFetch } from "../backend/server";

export const ACCESS_TOKEN_COOKIE_NAME = "treeschool_access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "treeschool_refresh_token";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";
const LOCAL_DEV_TOKEN_PREFIX = "treeschool-local-dev:";

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user?: {
    email?: string;
  };
};

type AuthResult =
  | {
      ok: true;
      session: SupabaseSession | null;
      message?: string;
    }
  | {
      ok: false;
      error: string;
    };

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

function isLocalDevAuthEnabled() {
  return process.env.NODE_ENV !== "production";
}

function getLocalDevPassword() {
  return process.env.TREESCHOOL_DEV_AUTH_PASSWORD ?? "111111";
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return {
    url,
    anonKey
  };
}

function buildHeaders(anonKey: string) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json"
  };
}

type LocalDevUser = {
  id: string;
  email: string;
};

function encodeLocalDevToken(user: LocalDevUser) {
  return `${LOCAL_DEV_TOKEN_PREFIX}${Buffer.from(JSON.stringify(user), "utf8").toString("base64url")}`;
}

function decodeLocalDevToken(accessToken: string): AuthUser | null {
  if (!accessToken.startsWith(LOCAL_DEV_TOKEN_PREFIX)) {
    return null;
  }

  try {
    const encoded = accessToken.slice(LOCAL_DEV_TOKEN_PREFIX.length);
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<LocalDevUser>;

    if (!parsed.id || !parsed.email) {
      return null;
    }

    return {
      id: parsed.id,
      email: parsed.email,
      user_metadata: {
        first_name: parsed.email.split("@")[0] ?? "Parent"
      }
    };
  } catch {
    return null;
  }
}

async function getLocalDevUserByEmail(email: string) {
  const response = await backendFetch(
    `${getBackendUrl()}/internal/accounts/local-dev-user?email=${encodeURIComponent(email)}`,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    user?: LocalDevUser;
  };

  return payload.user ?? null;
}

async function signInWithLocalDevPassword(email: string, password: string): Promise<AuthResult> {
  if (!isLocalDevAuthEnabled() || password !== getLocalDevPassword()) {
    return {
      ok: false,
      error: "Invalid email or password."
    };
  }

  const user = await getLocalDevUserByEmail(email);

  if (!user) {
    return {
      ok: false,
      error: "No local dev user exists for that email."
    };
  }

  return {
    ok: true,
    session: {
      access_token: encodeLocalDevToken(user),
      refresh_token: `local-dev-refresh:${user.id}`,
      expires_in: 60 * 60 * 24 * 30,
      user
    }
  };
}

export async function signUpWithPassword(
  email: string,
  password: string,
  emailRedirectTo?: string
): Promise<AuthResult> {
  const config = getSupabaseConfig();

  if (!config) {
    return {
      ok: false,
      error: "Missing Supabase environment variables."
    };
  }

  const response = await fetch(`${config.url}/auth/v1/signup`, {
    method: "POST",
    headers: buildHeaders(config.anonKey),
    body: JSON.stringify({
      email,
      password,
      ...(emailRedirectTo ? { options: { emailRedirectTo } } : {})
    }),
    cache: "no-store"
  });

  const payload = await response.json();

  if (!response.ok) {
    return {
      ok: false,
      error: payload.msg ?? payload.error_description ?? payload.error ?? "Something went wrong."
    };
  }

  const session =
    payload.access_token && payload.refresh_token
      ? {
          access_token: payload.access_token as string,
          refresh_token: payload.refresh_token as string,
          expires_in: payload.expires_in as number | undefined,
          user: payload.user as SupabaseSession["user"]
        }
      : null;

  return {
    ok: true,
    session,
    message: session ? undefined : "Check your email to confirm your account before signing in."
  };
}

export async function sendMagicLink(
  email: string,
  emailRedirectTo?: string,
  options: { createUser?: boolean } = {}
): Promise<AuthResult> {
  const config = getSupabaseConfig();

  if (!config) {
    return {
      ok: false,
      error: "Missing Supabase environment variables."
    };
  }

  const endpoint = new URL("/auth/v1/otp", config.url);
  if (emailRedirectTo) {
    endpoint.searchParams.set("redirect_to", emailRedirectTo);
  }

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: buildHeaders(config.anonKey),
    body: JSON.stringify({
      email,
      create_user: options.createUser === true,
      ...(emailRedirectTo ? { options: { emailRedirectTo } } : {})
    }),
    cache: "no-store"
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      error: payload.message ?? payload.msg ?? payload.error_description ?? payload.error ?? "Could not send verification email."
    };
  }

  return {
    ok: true,
    session: null,
    message: "Check your email for the verification link."
  };
}

async function verifyEmailCredential(
  body: Record<string, string>,
  allowSessionlessSuccess = false
): Promise<AuthResult> {
  const config = getSupabaseConfig();

  if (!config) {
    return { ok: false, error: "Missing Supabase environment variables." };
  }

  const response = await fetch(`${config.url}/auth/v1/verify`, {
    method: "POST",
    headers: buildHeaders(config.anonKey),
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      error: payload.msg ?? payload.error_description ?? payload.error ?? "That sign-in code is invalid or has expired."
    };
  }

  if (!payload.access_token || !payload.refresh_token) {
    return allowSessionlessSuccess
      ? {
          ok: true,
          session: null,
          message: payload.msg ?? "Email address confirmed."
        }
      : {
          ok: false,
          error: payload.msg ?? payload.error_description ?? payload.error ?? "That sign-in code is invalid or has expired."
        };
  }

  return {
    ok: true,
    session: {
      access_token: payload.access_token as string,
      refresh_token: payload.refresh_token as string,
      expires_in: payload.expires_in as number | undefined,
      user: payload.user as SupabaseSession["user"]
    }
  };
}

export function verifyEmailOtp(email: string, token: string) {
  return verifyEmailCredential({ email: email.trim().toLowerCase(), token: token.trim(), type: "email" });
}

export async function verifyEmailTokenHash(
  tokenHash: string,
  preferredType?: "email" | "magiclink" | "signup" | "email_change"
) {
  const normalizedTokenHash = tokenHash.trim();
  let lastResult: AuthResult = {
    ok: false,
    error: "That sign-in link is invalid or has expired."
  };

  const types = [
    ...(preferredType ? [preferredType] : []),
    "email",
    "magiclink",
    "signup",
    "email_change"
  ].filter((type, index, values) => values.indexOf(type) === index) as Array<
    "email" | "magiclink" | "signup" | "email_change"
  >;

  for (const type of types) {
    const result = await verifyEmailCredential(
      { token_hash: normalizedTokenHash, type },
      type === "email_change"
    );
    if (result.ok) return result;
    lastResult = result;
  }

  return lastResult;
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  const config = getSupabaseConfig();

  if (!config) {
    return {
      ok: false,
      error: "Missing Supabase environment variables."
    };
  }

  let response: Response;

  try {
    response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: buildHeaders(config.anonKey),
      body: JSON.stringify({
        email,
        password
      }),
      cache: "no-store"
    });
  } catch {
    return signInWithLocalDevPassword(email, password);
  }

  const payload = await response.json();

  if (!response.ok) {
    const localDevResult = await signInWithLocalDevPassword(email, password);

    if (localDevResult.ok) {
      return localDevResult;
    }

    return {
      ok: false,
      error: payload.error_description ?? payload.error ?? "Invalid email or password."
    };
  }

  return {
    ok: true,
    session: {
      access_token: payload.access_token as string,
      refresh_token: payload.refresh_token as string,
      expires_in: payload.expires_in as number | undefined,
      user: payload.user as SupabaseSession["user"]
    }
  };
}

export async function verifyPassword(email: string, password: string) {
  const result = await signInWithPassword(email, password);
  return result.ok && Boolean(result.session);
}

export function setSessionCookies(session: SupabaseSession) {
  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies);
  const traceId = createAuthSessionTraceId();

  cookieStore.set(ACCESS_TOKEN_COOKIE_NAME, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // The JWT remains unusable after its own expiry, but retaining it lets
    // middleware recognize and renew the session instead of losing context.
    maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE_NAME, session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
  });

  cookieStore.set(
    AUTH_SESSION_ACTIVITY_COOKIE_NAME,
    String(Math.floor(Date.now() / 1000)),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
    }
  );
  cookieStore.set(AUTH_SESSION_TRACE_COOKIE_NAME, traceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
  });

  console.info(JSON.stringify({
    event: "auth_session_cookies_staged",
    traceId,
    cookieMaxAgeSeconds: AUTH_SESSION_COOKIE_MAX_AGE_SECONDS
  }));

  return traceId;
}

export function clearSessionCookies(reason = "explicit_signout") {
  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies);
  const traceId = cookieStore.get(AUTH_SESSION_TRACE_COOKIE_NAME)?.value;

  cookieStore.delete(ACCESS_TOKEN_COOKIE_NAME);
  cookieStore.delete(REFRESH_TOKEN_COOKIE_NAME);
  cookieStore.delete(AUTH_SESSION_ACTIVITY_COOKIE_NAME);
  cookieStore.delete(AUTH_SESSION_TRACE_COOKIE_NAME);

  console.info(JSON.stringify({
    event: "auth_session_cleared",
    traceId: traceId ?? null,
    reason
  }));
}

export type AuthUser = {
  id?: string;
  email?: string;
  new_email?: string;
  email_change_sent_at?: string;
  user_metadata?: {
    first_name?: string;
    full_name?: string;
    name?: string;
  };
};

export async function getUserForAccessToken(accessToken: string) {
  const localDevUser = decodeLocalDevToken(accessToken);

  if (localDevUser) {
    return localDevUser;
  }

  const config = getSupabaseConfig();

  if (!config || !accessToken) {
    return null;
  }

  let response: Response;

  try {
    response = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        ...buildHeaders(config.anonKey),
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AuthUser;
}

export async function getCurrentUser() {
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE_NAME)?.value;

  if (!accessToken) {
    return null;
  }

  return getUserForAccessToken(accessToken);
}

export async function requestCurrentUserEmailChange(
  newEmail: string,
  emailRedirectTo?: string
): Promise<AuthResult> {
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const config = getSupabaseConfig();

  if (!accessToken) {
    return { ok: false, error: "Your session has expired. Sign in again before changing your email." };
  }

  if (decodeLocalDevToken(accessToken)) {
    return {
      ok: false,
      error: "Sign in with an email link to test email changes in local development."
    };
  }

  if (!config) {
    return { ok: false, error: "Missing Supabase environment variables." };
  }

  const endpoint = new URL("/auth/v1/user", config.url);
  if (emailRedirectTo) endpoint.searchParams.set("redirect_to", emailRedirectTo);

  const response = await fetch(endpoint.toString(), {
    method: "PUT",
    headers: {
      ...buildHeaders(config.anonKey),
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ email: newEmail.trim().toLowerCase() }),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      error:
        payload.message ??
        payload.msg ??
        payload.error_description ??
        payload.error ??
        "Could not start the email change."
    };
  }

  return {
    ok: true,
    session: null,
    message: "Confirmation emails sent."
  };
}
