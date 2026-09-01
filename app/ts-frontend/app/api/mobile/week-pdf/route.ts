import { getRequestUser } from "../../../../lib/auth/request-user";
import { downloadPaperPlanPacket } from "../../../../lib/paper-plans/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

export async function GET(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }
  const weeklyPlanId = new URL(request.url).searchParams.get("weeklyPlanId")?.trim();
  if (!weeklyPlanId) {
    return Response.json({ error: "Week is required." }, { status: 400 });
  }
  try {
    const response = await downloadPaperPlanPacket({
      parentUserId: currentUser.id,
      weeklyPlanId,
      format: "week",
      layout: "standard",
    });
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": response.headers.get("Content-Disposition") ??
          'attachment; filename="treeschool-week.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error, "Could not prepare the weekly PDF.") },
      { status: 400 },
    );
  }
}
