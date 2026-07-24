import { getCurrentUser } from "../../../../lib/auth/server";
import { downloadNativeWorkbookLessonPreview } from "../../../../lib/native-workbooks/server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const learningYearId = url.searchParams.get("learningYearId");
  const documentId = url.searchParams.get("documentId");
  const learningUnitId = url.searchParams.get("learningUnitId");
  if (!learningYearId || !documentId || !learningUnitId) {
    return Response.json({ error: "learningYearId, documentId, and learningUnitId are required." }, { status: 400 });
  }

  try {
    const response = await downloadNativeWorkbookLessonPreview({
      userId: user.id,
      learningYearId,
      documentId,
      learningUnitId
    });
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": response.headers.get("Content-Disposition") ?? 'inline; filename="workbook-lesson.pdf"',
        "Cache-Control": "private, no-store"
      }
    });
  } catch {
    return Response.json({
      error: "Treeschool couldn't open these lesson pages. Please try again."
    }, { status: 400 });
  }
}
