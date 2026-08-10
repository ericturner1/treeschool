import { NextRequest } from "next/server";
import { getCurrentStudentAccess } from "../../../../lib/auth/student-access";
import { backendFetch } from "../../../../lib/backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { profileId?: string };
  const access = await getCurrentStudentAccess(body.profileId);

  if (!access) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!body.profileId) {
    return Response.json({ error: "Invalid profile." }, { status: 400 });
  }

  const response = await backendFetch(`${getBackendUrl()}/internal/streaks/activity`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      profileId: access.student.id
    }),
    cache: "no-store"
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return Response.json(payload ?? { error: "Failed to record streak activity." }, { status: response.status });
  }

  return Response.json(payload);
}
