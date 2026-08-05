import { NextResponse } from "next/server";
import { getFunnelAssetResponse } from "../../../../../../../lib/funnels/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ funnelId: string; stepId: string; filename: string }> }
) {
  try {
    const params = await context.params;
    const response = await getFunnelAssetResponse(params);
    if (!response.ok) return NextResponse.json({ error: "Image not found." }, { status: 404 });
    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
        "Cache-Control": response.headers.get("Cache-Control") ?? "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
}
