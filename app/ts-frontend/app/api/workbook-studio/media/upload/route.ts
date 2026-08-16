import { getCurrentUser } from "../../../../../lib/auth/server";
import { publicErrorMessage } from "../../../../../lib/security/request-guards";
import {
  completeAdminWorkbookSoundUpload,
  discardAdminWorkbookSoundUpload,
  prepareAdminWorkbookSoundUpload,
} from "../../../../../lib/workbook-studio/server";

async function requireUserId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return Response.json({ error: "Sign in again to upload workbook sounds." }, { status: 401 });
  }
  try {
    return Response.json(await prepareAdminWorkbookSoundUpload({
      ...(await request.json() as Record<string, unknown>),
      userId,
    }));
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error, "Could not prepare the workbook sound upload.") },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return Response.json({ error: "Sign in again to upload workbook sounds." }, { status: 401 });
  }
  try {
    return Response.json(await completeAdminWorkbookSoundUpload({
      ...(await request.json() as Record<string, unknown>),
      userId,
    }));
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error, "Could not save the workbook sound.") },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return Response.json({ error: "Sign in again to upload workbook sounds." }, { status: 401 });
  }
  try {
    return Response.json(await discardAdminWorkbookSoundUpload({
      ...(await request.json() as Record<string, unknown>),
      userId,
    }));
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error, "Could not discard the workbook sound.") },
      { status: 400 },
    );
  }
}
