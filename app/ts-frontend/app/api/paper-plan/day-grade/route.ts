import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { setPlanDaySubjectCompletion } from "../../../../lib/attendance/server";
import { savePaperPlanDaySubjectGrade } from "../../../../lib/paper-plans/server";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const body = (await request.json()) as {
    profileId?: string;
    weeklyPlanId?: string;
    dayNumber?: number;
    subjectKey?: string;
    score?: number | null;
  };
  if (!body.profileId || !body.weeklyPlanId || typeof body.dayNumber !== "number" || !Number.isInteger(body.dayNumber) || !body.subjectKey) {
    return NextResponse.json(
      { error: "profileId, weeklyPlanId, dayNumber, and subjectKey are required." },
      { status: 400 }
    );
  }
  if (body.score !== null && (typeof body.score !== "number" || !Number.isInteger(body.score) || body.score < 0 || body.score > 100)) {
    return NextResponse.json({ error: "Enter a whole-number grade from 0 to 100." }, { status: 400 });
  }

  try {
    await savePaperPlanDaySubjectGrade({
      parentUserId: currentUser.id,
      weeklyPlanId: body.weeklyPlanId,
      dayNumber: body.dayNumber,
      subjectKey: body.subjectKey,
      score: body.score ?? null
    });
    if (body.score != null) {
      await setPlanDaySubjectCompletion({
        parentUserId: currentUser.id,
        profileId: body.profileId,
        weeklyPlanId: body.weeklyPlanId,
        dayNumber: body.dayNumber,
        subjectKey: body.subjectKey,
        completed: true
      });
    }
    return NextResponse.json({ saved: true, score: body.score ?? null, completed: body.score != null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the grade." },
      { status: 400 }
    );
  }
}
