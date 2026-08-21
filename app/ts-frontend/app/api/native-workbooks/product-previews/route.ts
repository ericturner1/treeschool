import { getNativeWorkbookProduct } from "../../../../lib/native-workbooks/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim() ?? "";
  if (!slug || slug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return Response.json({ error: "Choose a valid workbook." }, { status: 400 });
  }

  try {
    const workbook = await getNativeWorkbookProduct({ slug });
    return Response.json({
      thumbnailUrl: workbook.thumbnailUrl,
      previewImages: workbook.previewImages ?? []
    }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch {
    return Response.json({ error: "Sample pages could not be loaded." }, { status: 404 });
  }
}
