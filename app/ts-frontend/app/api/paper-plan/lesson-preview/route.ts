import { getCurrentUser } from "../../../../lib/auth/server";
import { downloadPaperPlanLessonPreview } from "../../../../lib/paper-plans/server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const weeklyPlanItemId = url.searchParams.get("weeklyPlanItemId");
  if (!weeklyPlanItemId) {
    return Response.json({ error: "weeklyPlanItemId is required." }, { status: 400 });
  }

  try {
    const response = await downloadPaperPlanLessonPreview({
      parentUserId: user.id,
      weeklyPlanItemId
    });
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": response.headers.get("Content-Disposition") ?? 'inline; filename="lesson-preview.pdf"',
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to build the lesson preview." },
      { status: 400 }
    );
  }
}
