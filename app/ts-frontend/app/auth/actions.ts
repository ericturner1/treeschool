"use server";

import { redirect } from "next/navigation";
import {
  clearSessionCookies,
  getUserForAccessToken,
  setSessionCookies,
  sendMagicLink,
  verifyEmailOtp,
  verifyEmailTokenHash
} from "../../lib/auth/server";
import { bootstrapParentAccount, canSignInWithParentEmail, listHouseholdProfiles } from "../../lib/accounts/server";
import {
  clearActiveProfileCookie,
  setActiveProfileCookie
} from "../../lib/accounts/active-profile";

async function setParentAsActiveAccount(accessToken: string) {
  const user = await getUserForAccessToken(accessToken);

  if (!user?.id || !user.email) {
    return;
  }

  await bootstrapParentAccount({
    userId: user.id,
    email: user.email,
    firstName: user.user_metadata?.first_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name
  });

  const householdProfiles = await listHouseholdProfiles(user.id);
  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");

  if (!parentProfile) {
    return;
  }

  setActiveProfileCookie({
    id: parentProfile.id,
    role: parentProfile.role
  });
}

function getField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function buildPath(pathname: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function safeNext(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/p/dashboard";
}

async function finishPasswordlessSignIn(
  result: Awaited<ReturnType<typeof verifyEmailOtp>>,
  next: string,
  lang?: string
) {
  if (!result.ok || !result.session) {
    redirect(buildPath("/signin", {
      lang,
      next,
      error: result.ok ? "Could not finish sign-in." : result.error
    }));
  }

  setSessionCookies(result.session);
  try {
    await setParentAsActiveAccount(result.session.access_token);
  } catch {
    clearSessionCookies();
    redirect(buildPath("/signin", {
      lang,
      next,
      account: "missing"
    }));
  }
  redirect(safeNext(next));
}

export async function requestPasswordlessSignInAction(formData: FormData) {
  const email = getField(formData, "email").toLowerCase();
  const lang = getField(formData, "lang") || undefined;
  const next = safeNext(getField(formData, "next") || undefined);
  const origin = getField(formData, "origin").replace(/\/$/, "");

  if (!email || !email.includes("@")) {
    redirect(buildPath("/signin", { lang, next, error: "Enter a valid email address." }));
  }

  let eligible = false;
  try {
    eligible = await canSignInWithParentEmail(email);
  } catch (error) {
    redirect(buildPath("/signin", {
      lang,
      next,
      email,
      error: error instanceof Error ? error.message : "Could not verify this Treeschool account."
    }));
  }
  if (!eligible) {
    redirect(buildPath("/signin", { lang, next, email, account: "missing" }));
  }

  const callback = `${origin || process.env.NEXT_PUBLIC_APP_URL || ""}/auth/confirm?next=${encodeURIComponent(next)}`;
  const result = await sendMagicLink(email, callback, { createUser: false });
  if (!result.ok) {
    redirect(buildPath("/signin", { lang, next, email, error: result.error }));
  }

  redirect(buildPath("/signin", { lang, next, email, sent: "1" }));
}

export async function verifyEmailCodeAction(formData: FormData) {
  const email = getField(formData, "email").toLowerCase();
  const token = getField(formData, "token").replace(/\s+/g, "");
  const lang = getField(formData, "lang") || undefined;
  const next = safeNext(getField(formData, "next") || undefined);

  if (!/^\d{6,8}$/.test(token)) {
    redirect(buildPath("/signin", { lang, next, email, sent: "1", error: "Enter the code from your email." }));
  }

  await finishPasswordlessSignIn(await verifyEmailOtp(email, token), next, lang);
}

export async function verifyEmailTokenHashAction(formData: FormData) {
  const tokenHash = getField(formData, "tokenHash");
  const tokenType = getField(formData, "tokenType") === "email_change" ? "email_change" : undefined;
  const lang = getField(formData, "lang") || undefined;
  const next = safeNext(getField(formData, "next") || undefined);

  if (!tokenHash) {
    redirect(buildPath("/signin", { lang, next, error: "This sign-in link is incomplete." }));
  }

  const result = await verifyEmailTokenHash(tokenHash, tokenType);

  if (tokenType !== "email_change") {
    await finishPasswordlessSignIn(result, next, lang);
    return;
  }

  if (!result.ok) {
    redirect(buildPath("/auth/confirm", {
      lang,
      next,
      purpose: "email-change",
      error: result.error
    }));
  }

  if (!result.session) {
    redirect(buildPath("/auth/confirm", {
      lang,
      next,
      purpose: "email-change",
      confirmed: "1"
    }));
  }

  setSessionCookies(result.session);
  await setParentAsActiveAccount(result.session.access_token);
  redirect(next);
}

export async function signupAction(formData: FormData) {
  return requestPasswordlessSignInAction(formData);
}

export async function signinAction(formData: FormData) {
  return requestPasswordlessSignInAction(formData);
}

export async function logoutAction() {
  clearSessionCookies();
  clearActiveProfileCookie();
  redirect("/signin?message=You have been signed out.");
}
