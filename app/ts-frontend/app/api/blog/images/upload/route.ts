import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth/server";
import { publicErrorMessage } from "../../../../../lib/security/request-guards";
import {
  completeBlogImageUpload,
  discardBlogImageUpload,
  prepareBlogImageUpload
} from "../../../../../lib/blog/server";

async function currentAdminUserId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

export async function POST(request: Request) {
  const userId = await currentAdminUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await request.json() as { postId?: string; contentType?: string; sizeBytes?: number };
  if (!body.postId) return NextResponse.json({ error: "postId is required." }, { status: 400 });
  try {
    return NextResponse.json(await prepareBlogImageUpload({
      userId,
      postId: body.postId,
      contentType: body.contentType ?? "",
      sizeBytes: Number(body.sizeBytes)
    }));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not prepare the blog image upload.") },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const userId = await currentAdminUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await request.json() as { postId?: string; objectPath?: string };
  if (!body.postId || !body.objectPath) {
    return NextResponse.json({ error: "postId and objectPath are required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await completeBlogImageUpload({ userId, postId: body.postId, objectPath: body.objectPath }));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not save the blog image.") },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const userId = await currentAdminUserId();
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = await request.json() as { postId?: string; objectPath?: string };
  if (!body.postId || !body.objectPath) {
    return NextResponse.json({ error: "postId and objectPath are required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await discardBlogImageUpload({ userId, postId: body.postId, objectPath: body.objectPath }));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not discard the blog image upload.") },
      { status: 400 }
    );
  }
}
