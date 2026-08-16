import { getCurrentUser } from "../../../../../lib/auth/server";
import { getAdminWorkbookStudioCoverPreviewResponse } from "../../../../../lib/workbook-studio/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json({ error: "Sign in to preview this cover." }, { status: 401 });
  }

  const { projectId } = await context.params;
  const requestedFormat = new URL(request.url).searchParams.get("format");
  const format = requestedFormat === "png" || requestedFormat === "artwork"
    ? requestedFormat
    : "pdf";
  const response = await getAdminWorkbookStudioCoverPreviewResponse(
    user.id,
    projectId,
    format,
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
      "Content-Type": format === "pdf" ? "application/pdf" : "image/png",
      "Content-Disposition": `inline; filename=workbook-cover-${format === "artwork" ? "artwork.png" : `preview.${format}`}`,
      "Cache-Control": format === "pdf" ? "private, no-store" : "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
