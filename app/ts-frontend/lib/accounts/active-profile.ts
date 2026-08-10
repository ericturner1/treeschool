import { cookies, type UnsafeUnwrappedCookies } from "next/headers";

export const ACTIVE_PROFILE_ID_COOKIE_NAME = "treeschool_active_profile_id";
export const ACTIVE_PROFILE_ROLE_COOKIE_NAME = "treeschool_active_profile_role";

export type ActiveProfileRole = "PARENT" | "STUDENT";

export function getActiveProfileCookie() {
  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies);
  const id = cookieStore.get(ACTIVE_PROFILE_ID_COOKIE_NAME)?.value;
  const role = cookieStore.get(ACTIVE_PROFILE_ROLE_COOKIE_NAME)?.value as
    | ActiveProfileRole
    | undefined;

  if (!id || (role !== "PARENT" && role !== "STUDENT")) {
    return null;
  }

  return { id, role };
}

export function setActiveProfileCookie(profile: {
  id: string;
  role: ActiveProfileRole;
}) {
  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies);

  cookieStore.set(ACTIVE_PROFILE_ID_COOKIE_NAME, profile.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  cookieStore.set(ACTIVE_PROFILE_ROLE_COOKIE_NAME, profile.role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearActiveProfileCookie() {
  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies);
  cookieStore.delete(ACTIVE_PROFILE_ID_COOKIE_NAME);
  cookieStore.delete(ACTIVE_PROFILE_ROLE_COOKIE_NAME);
}
