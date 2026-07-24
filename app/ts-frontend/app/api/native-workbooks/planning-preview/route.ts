import { getCurrentUser } from "../../../../lib/auth/server";
import { getNativeWorkbookPlanningPreview } from "../../../../lib/native-workbooks/server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const learningYearId = url.searchParams.get("learningYearId");
  const documentId = url.searchParams.get("documentId");
  if (!learningYearId || !documentId) {
    return Response.json({ error: "learningYearId and documentId are required." }, { status: 400 });
  }

  try {
    return Response.json(await getNativeWorkbookPlanningPreview({
      userId: user.id,
      learningYearId,
      documentId
    }));
  } catch {
    return Response.json({
      error: "Treeschool couldn't load this workbook's indexed lessons. Please try again."
    }, { status: 400 });
  }
}
