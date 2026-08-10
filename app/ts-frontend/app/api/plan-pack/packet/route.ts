import { NextResponse } from "next/server";
import { downloadPlanPackPacket } from "../../../../lib/plan-pack/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const intakeId = url.searchParams.get("intakeId");
  const checkoutSessionId = url.searchParams.get("session_id");
  const weeklyPlanId = url.searchParams.get("weeklyPlanId");
  const format = url.searchParams.get("format") === "days" ? "days" : "week";

  if (!intakeId || !checkoutSessionId || !weeklyPlanId) {
    return NextResponse.json(
      { error: "intakeId, session_id, and weeklyPlanId are required." },
      { status: 400 }
    );
  }

  try {
    const response = await downloadPlanPackPacket({
      intakeId,
      checkoutSessionId,
      weeklyPlanId,
      format
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
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to download weekly PDF.") },
      { status: 400 }
    );
  }
}
