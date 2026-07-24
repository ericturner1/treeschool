import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth/server";
import {
  completeStudentProfilePhotoUpload,
  discardStudentProfilePhotoUpload,
  prepareStudentProfilePhotoUpload
} from "../../../lib/accounts/server";

async function requireParentUserId() {
  const currentUser = await getCurrentUser();
  return currentUser?.id ?? null;
}

export async function POST(request: Request) {
  const parentUserId = await requireParentUserId();
  if (!parentUserId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await request.json() as { profileId?: string; contentType?: string; sizeBytes?: number };
  if (!body.profileId) return NextResponse.json({ error: "profileId is required." }, { status: 400 });
  try {
    return NextResponse.json(await prepareStudentProfilePhotoUpload({
      parentUserId,
      profileId: body.profileId,
      contentType: body.contentType ?? "",
      sizeBytes: Number(body.sizeBytes)
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare the student photo upload." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const parentUserId = await requireParentUserId();
  if (!parentUserId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await request.json() as { profileId?: string; objectPath?: string };
  if (!body.profileId || !body.objectPath) {
    return NextResponse.json({ error: "profileId and objectPath are required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await completeStudentProfilePhotoUpload({
      parentUserId,
      profileId: body.profileId,
      objectPath: body.objectPath
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the student photo." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const parentUserId = await requireParentUserId();
  if (!parentUserId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await request.json() as { profileId?: string; objectPath?: string };
  if (!body.profileId || !body.objectPath) {
    return NextResponse.json({ error: "profileId and objectPath are required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await discardStudentProfilePhotoUpload({
      parentUserId,
      profileId: body.profileId,
      objectPath: body.objectPath
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not discard the student photo upload." },
      { status: 400 }
    );
  }
}
