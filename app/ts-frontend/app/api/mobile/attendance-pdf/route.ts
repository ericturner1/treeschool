import { getRequestUser } from "../../../../lib/auth/request-user";
import { publicErrorMessage } from "../../../../lib/security/request-guards";
import { downloadStudentReport } from "../../../../lib/student-reports/server";

export async function GET(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId")?.trim();
  const yearId = url.searchParams.get("yearId")?.trim();
  if (!profileId || !yearId) {
    return Response.json(
      { error: "Student profile and school year are required." },
      { status: 400 },
    );
  }

  try {
    const response = await downloadStudentReport({
      parentUserId: currentUser.id,
      profileId,
      yearId,
      reportKind: "attendance",
    });
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": response.headers.get("Content-Disposition") ??
          'attachment; filename="treeschool-attendance-report.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error, "Could not prepare the attendance report.") },
      { status: 400 },
    );
  }
}
