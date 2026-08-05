import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth/server";
import {
  completeAdminFunnelAssetUpload,
  discardAdminFunnelAssetUpload,
  prepareAdminFunnelAssetUpload
} from "../../../../../lib/funnels/server";

async function requireUserId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  try {
    return NextResponse.json(await prepareAdminFunnelAssetUpload({
      ...(await request.json() as Record<string, unknown>),
      userId
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare the image upload." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  try {
    return NextResponse.json(await completeAdminFunnelAssetUpload({
      ...(await request.json() as Record<string, unknown>),
      userId
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the image." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  try {
    return NextResponse.json(await discardAdminFunnelAssetUpload({
      ...(await request.json() as Record<string, unknown>),
      userId
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not discard the image." }, { status: 400 });
  }
}
