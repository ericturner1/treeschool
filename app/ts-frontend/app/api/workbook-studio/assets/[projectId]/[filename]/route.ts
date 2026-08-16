import { getCurrentUser } from "../../../../../../lib/auth/server";
import { getAdminWorkbookImageAssetResponse } from "../../../../../../lib/workbook-studio/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; filename: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json({ error: "Sign in to view this workbook image." }, { status: 401 });
  }
  try {
    const params = await context.params;
    const response = await getAdminWorkbookImageAssetResponse({
      userId: user.id,
      projectId: params.projectId,
      filename: params.filename,
    });
    if (!response.ok) {
      return Response.json({ error: "Workbook image not found." }, { status: 404 });
    }
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
        "Cache-Control": response.headers.get("Cache-Control") ?? "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Workbook image not found." }, { status: 404 });
  }
}
