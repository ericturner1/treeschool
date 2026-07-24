import { NextResponse } from "next/server";
import { getBlogImageResponse } from "../../../../../../lib/blog/server";

export async function GET(_request: Request, { params }: { params: { postId: string; filename: string } }) {
  const upstream = await getBlogImageResponse(params);
  if (!upstream.ok) {
    return NextResponse.json({ error: "Blog image not found." }, { status: upstream.status === 404 ? 404 : 502 });
  }
  return new NextResponse(await upstream.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
