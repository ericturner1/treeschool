import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";
import { getAdminFunnelPathAvailability } from "../../../../lib/funnels/server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  const excludeStepId = url.searchParams.get("excludeStepId");
  if (!path) {
    return NextResponse.json({ error: "path is required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await getAdminFunnelPathAvailability(
      user.id,
      path,
      excludeStepId
    ));
  } catch (error) {
    return NextResponse.json({
      error: publicErrorMessage(error, "Could not check the URL path.")
    }, { status: 400 });
  }
}
