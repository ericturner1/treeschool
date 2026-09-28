import { NextResponse } from "next/server";
import { getRequestUser } from "../../../../lib/auth/request-user";
import {
  getMobileMembership,
  verifyMobileApplePurchase,
} from "../../../../lib/mobile/apple-subscriptions";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

export async function GET(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  try {
    return NextResponse.json(await getMobileMembership(currentUser.id));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not load your membership.") },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { signedTransaction?: string } | null;
  if (!body?.signedTransaction) {
    return NextResponse.json({ error: "signedTransaction is required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await verifyMobileApplePurchase({
      userId: currentUser.id,
      signedTransaction: body.signedTransaction
    }));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not verify this App Store purchase.") },
      { status: 400 }
    );
  }
}
