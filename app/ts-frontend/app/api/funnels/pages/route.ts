import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import {
  publishAdminFunnelPage,
  saveAdminFunnelPageDraft,
  unpublishAdminFunnelPage
} from "../../../../lib/funnels/server";

async function withUser(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) throw new Error("Please sign in again.");
  return { ...(await request.json() as Record<string, unknown>), userId: user.id };
}

export async function POST(request: Request) {
  try {
    const input = await withUser(request);
    const result = await saveAdminFunnelPageDraft(input);
    revalidatePath("/admin/funnels");
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the page draft.";
    return NextResponse.json({ error: message }, { status: message === "Please sign in again." ? 401 : 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const input = await withUser(request);
    const result = await publishAdminFunnelPage(input as Parameters<typeof publishAdminFunnelPage>[0]);
    revalidatePath("/admin/funnels");
    if (result.publicPath) revalidatePath(result.publicPath);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not publish the page.";
    return NextResponse.json({ error: message }, { status: message === "Please sign in again." ? 401 : 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const input = await withUser(request);
    const result = await unpublishAdminFunnelPage(input as Parameters<typeof unpublishAdminFunnelPage>[0]);
    revalidatePath("/admin/funnels");
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not unpublish the page.";
    return NextResponse.json({ error: message }, { status: message === "Please sign in again." ? 401 : 400 });
  }
}
