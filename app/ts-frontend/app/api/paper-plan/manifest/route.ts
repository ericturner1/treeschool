import { getCurrentUser } from "../../../../lib/auth/server";
import { downloadWeeklyPlanManifest } from "../../../../lib/paper-plans/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const weeklyPlanId = url.searchParams.get("weeklyPlanId");
  if (!weeklyPlanId) {
    return Response.json({ error: "weeklyPlanId is required." }, { status: 400 });
  }

  try {
    const response = await downloadWeeklyPlanManifest({
      parentUserId: user.id,
      weeklyPlanId
    });
    const manifest = await response.json() as {
      week?: { weekNumber?: number };
    };
    const weekNumber = Number(manifest.week?.weekNumber) || 0;
    return new Response(`${JSON.stringify(manifest, null, 2)}\n`, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="treeschool-week-${weekNumber || "plan"}-manifest.json"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    const message = publicErrorMessage(error, "Failed to build the weekly plan manifest.");
    return Response.json(
      { error: message },
      { status: message === "Administrator access is required." ? 403 : 400 }
    );
  }
}
