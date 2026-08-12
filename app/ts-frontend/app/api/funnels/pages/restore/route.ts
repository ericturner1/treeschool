import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth/server";
import { restoreAdminFunnelPageRevision } from "../../../../../lib/funnels/server";
import { publicErrorMessage } from "../../../../../lib/security/request-guards";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await restoreAdminFunnelPageRevision({
      userId: user.id,
      funnelId: String(body.funnelId ?? ""),
      stepId: String(body.stepId ?? ""),
      pageId: String(body.pageId ?? ""),
      revisionNumber: Number(body.revisionNumber)
    });
    revalidatePath("/admin/funnels");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not restore the page revision.") },
      { status: 400 }
    );
  }
}
