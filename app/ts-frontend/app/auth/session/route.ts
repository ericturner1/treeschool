import { NextResponse } from "next/server";
import { bootstrapParentAccount, listHouseholdProfiles } from "../../../lib/accounts/server";
import { setActiveProfileCookie } from "../../../lib/accounts/active-profile";
import {
  getUserForAccessToken,
  setSessionCookies,
  type SupabaseSession
} from "../../../lib/auth/server";

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

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<SupabaseSession>;

  if (!payload.access_token || !payload.refresh_token) {
    return NextResponse.json({ error: "Missing auth tokens." }, { status: 400 });
  }

  setSessionCookies({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
    user: payload.user
  });

  await setParentAsActiveAccount(payload.access_token);

  return NextResponse.json({ ok: true });
}
