import { getCurrentUser } from "../../../../../lib/auth/server";
import { getAdminWorkbookStudioCoverPreviewResponse } from "../../../../../lib/workbook-studio/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json({ error: "Sign in to preview this cover." }, { status: 401 });
  }

  const { projectId } = await context.params;
  const response = await getAdminWorkbookStudioCoverPreviewResponse(
    user.id,
    projectId,
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    return Response.json(
      { error: payload.error ?? "The cover preview is not available." },
      { status: response.status },
    );
  }

  return new Response(await response.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=workbook-cover-preview.pdf",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
