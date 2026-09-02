import { NextResponse } from "next/server";
import { getRequestUser } from "../../../../lib/auth/request-user";
import {
  registerMobilePushDevice,
  unregisterMobilePushDevice,
  type MobilePushDeviceInput
} from "../../../../lib/mobile/push-devices";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

async function deviceInput(request: Request, userId: string): Promise<MobilePushDeviceInput | null> {
  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
    environment?: unknown;
    bundleId?: unknown;
  } | null;
  if (
    typeof body?.token !== "string" ||
    (body.environment !== "sandbox" && body.environment !== "production") ||
    typeof body.bundleId !== "string"
  ) return null;
  return {
    userId,
    token: body.token,
    environment: body.environment,
    bundleId: body.bundleId
  };
}

export async function POST(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const input = await deviceInput(request, currentUser.id);
  if (!input) {
    return NextResponse.json(
      { error: "A valid iPhone notification token is required." },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await registerMobilePushDevice(input), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not enable notifications on this phone.") },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const input = await deviceInput(request, currentUser.id);
  if (!input) {
    return NextResponse.json(
      { error: "A valid iPhone notification token is required." },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await unregisterMobilePushDevice(input));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not disable notifications on this phone.") },
      { status: 400 }
    );
  }
}
