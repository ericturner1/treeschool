import { getPublicWorkbookSoundAssetResponse } from "../../../../../lib/workbook-studio/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; filename: string }> },
) {
  try {
    const params = await context.params;
    const response = await getPublicWorkbookSoundAssetResponse({
      ...params,
      rangeHeader: request.headers.get("range"),
    });
    if (!response.ok) {
      return Response.json(
        { error: response.status === 416 ? "Invalid audio range." : "Sound not found." },
        { status: response.status === 416 ? 416 : 404 },
      );
    }
    const headers = new Headers();
    for (const name of [
      "Content-Type",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
      "Cache-Control",
      "X-Content-Type-Options",
    ]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers,
    });
  } catch {
    return Response.json({ error: "Sound not found." }, { status: 404 });
  }
}
