import { NextRequest } from "next/server";
import { getActiveProfileCookie } from "../../../../lib/accounts/active-profile";
import { getCurrentUser } from "../../../../lib/auth/server";
import { backendFetch } from "../../../../lib/backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  const activeProfile = getActiveProfileCookie();
  const body = (await request.json().catch(() => ({}))) as { profileId?: string };

  if (!currentUser?.id || !activeProfile || activeProfile.role !== "STUDENT") {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!body.profileId || body.profileId !== activeProfile.id) {
    return Response.json({ error: "Invalid profile." }, { status: 400 });
  }

  const response = await backendFetch(`${getBackendUrl()}/internal/streaks/activity`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      profileId: body.profileId
    }),
    cache: "no-store"
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return Response.json(payload ?? { error: "Failed to record streak activity." }, { status: response.status });
  }

  return Response.json(payload);
}
