import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";
import {
  createPlanDayAttendance,
  setPlanDaySubjectCompletion
} from "../../../../lib/attendance/server";

type CompletionBody = {
  profileId?: string;
  weeklyPlanId?: string;
  dayNumber?: number;
  subjectKey?: string;
  subjectKeys?: string[];
  completed?: boolean;
  attendanceDate?: string | null;
};

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const body = (await request.json()) as CompletionBody;
  if (!body.profileId || !body.weeklyPlanId || typeof body.dayNumber !== "number" || !Number.isInteger(body.dayNumber)) {
    return NextResponse.json(
      { error: "profileId, weeklyPlanId, and dayNumber are required." },
      { status: 400 }
    );
  }

  try {
    if (body.subjectKey && typeof body.completed === "boolean") {
      await setPlanDaySubjectCompletion({
        parentUserId: currentUser.id,
        profileId: body.profileId,
        weeklyPlanId: body.weeklyPlanId,
        dayNumber: body.dayNumber,
        subjectKey: body.subjectKey,
        completed: body.completed,
        attendanceDate: body.attendanceDate ?? null
      });
      return NextResponse.json({ saved: true, completed: body.completed });
    }

    const subjectKeys = Array.from(new Set(body.subjectKeys ?? [])).filter(Boolean);
    if (subjectKeys.length === 0) {
      return NextResponse.json({ error: "Choose at least one lesson." }, { status: 400 });
    }
    await createPlanDayAttendance({
      parentUserId: currentUser.id,
      profileId: body.profileId,
      weeklyPlanId: body.weeklyPlanId,
      dayNumber: body.dayNumber,
      subjectKeys,
      attendanceDate: body.attendanceDate ?? null
    });
    return NextResponse.json({ saved: true, completedSubjectKeys: subjectKeys });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not update the lesson.") },
      { status: 400 }
    );
  }
}
