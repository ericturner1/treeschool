import { NextResponse } from "next/server";
import { getRequestUser } from "../../../../lib/auth/request-user";
import {
  awardStudentPoints,
  depositStudentPointsToBank,
  getStudentPoints,
  redeemStudentPoints,
  withdrawStudentPointsFromBank,
} from "../../../../lib/points/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

const actions = ["award", "redeem", "deposit", "withdraw"] as const;
type MobilePointAction = (typeof actions)[number];

function validAmount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100_000;
}

export async function GET(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const profileId = new URL(request.url).searchParams.get("profileId")?.trim();
  if (!profileId) {
    return NextResponse.json({ error: "Student profile is required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await getStudentPoints({
      parentUserId: currentUser.id,
      profileId,
      historyLimit: 30,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not load points.") },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    profileId?: unknown;
    action?: unknown;
    amount?: unknown;
    reason?: unknown;
  } | null;
  const profileId = typeof body?.profileId === "string" ? body.profileId.trim() : "";
  const action = actions.includes(body?.action as MobilePointAction)
    ? body?.action as MobilePointAction
    : null;
  const amount = body?.amount;
  if (!profileId || !action || !validAmount(amount)) {
    return NextResponse.json(
      { error: "Student, action, and a whole-number amount from 1 to 100,000 are required." },
      { status: 400 },
    );
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if ((action === "award" || action === "redeem") && !reason) {
    return NextResponse.json({ error: "Enter a reason." }, { status: 400 });
  }

  try {
    const base = {
      parentUserId: currentUser.id,
      profileId,
      amount,
    };
    switch (action) {
      case "award":
        await awardStudentPoints({ ...base, reason });
        break;
      case "redeem":
        await redeemStudentPoints({ ...base, reason });
        break;
      case "deposit":
        await depositStudentPointsToBank(base);
        break;
      case "withdraw":
        await withdrawStudentPointsFromBank(base);
        break;
    }
    return NextResponse.json(await getStudentPoints({
      parentUserId: currentUser.id,
      profileId,
      historyLimit: 30,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not update points.") },
      { status: 400 },
    );
  }
}
