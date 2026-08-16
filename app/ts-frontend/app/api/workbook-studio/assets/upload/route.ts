import { getCurrentUser } from "../../../../../lib/auth/server";
import { publicErrorMessage } from "../../../../../lib/security/request-guards";
import {
  completeAdminWorkbookImageUpload,
  discardAdminWorkbookImageUpload,
  prepareAdminWorkbookImageUpload,
} from "../../../../../lib/workbook-studio/server";

async function requireUserId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return Response.json({ error: "Sign in again to upload workbook images." }, { status: 401 });
  }
  try {
    return Response.json(await prepareAdminWorkbookImageUpload({
      ...(await request.json() as Record<string, unknown>),
      userId,
    }));
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error, "Could not prepare the workbook image upload.") },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return Response.json({ error: "Sign in again to upload workbook images." }, { status: 401 });
  }
  try {
    return Response.json(await completeAdminWorkbookImageUpload({
      ...(await request.json() as Record<string, unknown>),
      userId,
    }));
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error, "Could not save the workbook image.") },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return Response.json({ error: "Sign in again to upload workbook images." }, { status: 401 });
  }
  try {
    return Response.json(await discardAdminWorkbookImageUpload({
      ...(await request.json() as Record<string, unknown>),
      userId,
    }));
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error, "Could not discard the workbook image.") },
      { status: 400 },
    );
  }
}
