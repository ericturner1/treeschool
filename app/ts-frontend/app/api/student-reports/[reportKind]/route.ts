import { getCurrentUser } from "../../../../lib/auth/server";
import {
  downloadStudentReport,
  type StudentReportKind,
} from "../../../../lib/student-reports/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

export async function GET(
  request: Request,
  context: { params: Promise<{ reportKind?: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const { reportKind } = await context.params;
  if (reportKind !== "attendance" && reportKind !== "report-card") {
    return Response.json({ error: "Report not found." }, { status: 404 });
  }
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");
  const yearId = url.searchParams.get("yearId");
  if (!profileId || !yearId) {
    return Response.json({ error: "profileId and yearId are required." }, { status: 400 });
  }

  try {
    const response = await downloadStudentReport({
      parentUserId: user.id,
      profileId,
      yearId,
      reportKind: reportKind as StudentReportKind,
    });
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": response.headers.get("Content-Disposition") ?? `attachment; filename="student-${reportKind}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({
      error: publicErrorMessage(error, "Could not build this student report."),
    }, { status: 400 });
  }
}
