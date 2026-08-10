import { NextResponse } from "next/server";
import { bootstrapParentAccount, listHouseholdProfiles } from "../../../lib/accounts/server";
import { setActiveProfileCookie } from "../../../lib/accounts/active-profile";
import {
  getUserForAccessToken,
  setSessionCookies,
  type AuthUser,
  type SupabaseSession
} from "../../../lib/auth/server";

async function prepareParentAccount(user: AuthUser & { id: string; email: string }) {
  await bootstrapParentAccount({
    userId: user.id,
    email: user.email,
    firstName: user.user_metadata?.first_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name
  });

  const householdProfiles = await listHouseholdProfiles(user.id);
  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");

  if (!parentProfile) {
    throw new Error("Parent profile not found after account bootstrap.");
  }
  return parentProfile;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as Partial<SupabaseSession> | null;

  if (!payload?.access_token || !payload.refresh_token) {
    return NextResponse.json({ error: "Missing auth tokens." }, { status: 400 });
  }

  const user = await getUserForAccessToken(payload.access_token);
  if (!user?.id || !user.email) {
    return NextResponse.json(
      { error: "The authentication session is invalid or expired." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  let parentProfile;
  try {
    parentProfile = await prepareParentAccount(user as AuthUser & { id: string; email: string });
  } catch {
    return NextResponse.json(
      { error: "Could not finish setting up the account." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const traceId = setSessionCookies({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
    user: payload.user
  });
  setActiveProfileCookie({
    id: parentProfile.id,
    role: parentProfile.role
  });
  console.info(JSON.stringify({
    event: "auth_session_established",
    traceId,
    entryPoint: "browser_session_callback"
  }));

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
