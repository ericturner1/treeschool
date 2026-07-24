import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { proxyNativeWorkbookDownload } from "../../../../lib/native-workbooks/server";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    const purchaseId = request.nextUrl.searchParams.get("purchaseId");
    const user = purchaseId ? await getCurrentUser() : null;
    if (purchaseId && !user?.id) {
      return Response.json({ error: "Sign in to download this purchased workbook." }, { status: 401 });
    }
    const upstream = await proxyNativeWorkbookDownload({ token, purchaseId, userId: user?.id });
    const headers = new Headers();
    for (const name of ["content-type", "content-disposition", "cache-control"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not download the workbook." }, { status: 400 });
  }
}
