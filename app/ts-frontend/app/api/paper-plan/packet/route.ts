import { getCurrentUser } from "../../../../lib/auth/server";
import { downloadPaperPlanPacket } from "../../../../lib/paper-plans/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const weeklyPlanId = url.searchParams.get("weeklyPlanId");
  const format = url.searchParams.get("format") === "days" ? "days" : "week";
  const layout = url.searchParams.get("layout") === "two-up" ? "two-up" : "standard";
  if (!weeklyPlanId) {
    return Response.json({ error: "weeklyPlanId is required." }, { status: 400 });
  }

  try {
    const response = await downloadPaperPlanPacket({
      parentUserId: user.id,
      weeklyPlanId,
      format,
      layout
    });
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? (format === "days" ? "application/zip" : "application/pdf"),
        "Content-Disposition":
          response.headers.get("Content-Disposition") ?? (format === "days"
            ? 'attachment; filename="weekly-plan-separate-days.zip"'
            : 'attachment; filename="weekly-plan.pdf"'),
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error, "Failed to build weekly PDF.") },
      { status: 400 }
    );
  }
}
