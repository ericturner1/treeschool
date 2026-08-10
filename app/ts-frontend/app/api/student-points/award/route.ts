import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";
import { awardStudentPoints } from "../../../../lib/points/server";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const body = (await request.json()) as {
    profileId?: string;
    amount?: number;
    reason?: string;
  };
  if (!body.profileId) {
    return NextResponse.json({ error: "Student profile is required." }, { status: 400 });
  }
  if (!Number.isInteger(body.amount) || Number(body.amount) < 1 || Number(body.amount) > 100_000) {
    return NextResponse.json({ error: "Enter a whole-number amount between 1 and 100,000." }, { status: 400 });
  }
  if (!body.reason?.trim()) {
    return NextResponse.json({ error: "Choose or enter a reason." }, { status: 400 });
  }

  try {
    const transaction = await awardStudentPoints({
      parentUserId: currentUser.id,
      profileId: body.profileId,
      amount: Number(body.amount),
      reason: body.reason
    });
    return NextResponse.json({
      saved: true,
      transactionId: transaction.id,
      amount: transaction.amount
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not award points.") },
      { status: 400 }
    );
  }
}
