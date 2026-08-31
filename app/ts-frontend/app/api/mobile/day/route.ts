import { NextResponse } from "next/server";
import { setPlanDaySubjectCompletion } from "../../../../lib/attendance/server";
import { getRequestUser } from "../../../../lib/auth/request-user";
import {
  getPaperPlan,
  getPaperPlanQrDestination,
  savePaperPlanDaySubjectGrade,
} from "../../../../lib/paper-plans/server";
import { buildMobileDayPayload } from "../../../../lib/paper-plans/mobile-day";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

function readDayNumber(value: unknown) {
  const dayNumber = Number(value);
  return Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 7
    ? dayNumber
    : null;
}

export async function GET(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const url = new URL(request.url);
  const weeklyPlanId = url.searchParams.get("weeklyPlanId")?.trim();
  const dayNumber = readDayNumber(url.searchParams.get("dayNumber"));
  if (!weeklyPlanId || dayNumber == null) {
    return NextResponse.json(
      { error: "weeklyPlanId and a valid dayNumber are required." },
      { status: 400 },
    );
  }

  try {
    const destination = await getPaperPlanQrDestination({
      parentUserId: currentUser.id,
      weeklyPlanId,
    });
    const plan = await getPaperPlan({
      parentUserId: currentUser.id,
      profileId: destination.profileId,
    });
    const week = plan.weeks.find((candidate) => candidate.id === weeklyPlanId);
    const payload = week
      ? buildMobileDayPayload({
          profileId: destination.profileId,
          week,
          dayNumber,
        })
      : null;

    return payload
      ? NextResponse.json(payload)
      : NextResponse.json(
          { error: "This day is not part of the selected lesson plan." },
          { status: 404 },
        );
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not load this lesson-plan day.") },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const body = (await request.json()) as {
    profileId?: string;
    weeklyPlanId?: string;
    dayNumber?: number;
    subjectKey?: string;
    score?: number;
  };
  const dayNumber = readDayNumber(body.dayNumber);
  if (
    !body.profileId ||
    !body.weeklyPlanId ||
    !body.subjectKey ||
    dayNumber == null ||
    typeof body.score !== "number" ||
    !Number.isFinite(body.score) ||
    body.score < 0 ||
    body.score > 100
  ) {
    return NextResponse.json(
      { error: "Lesson identity and a grade from 0 to 100 are required." },
      { status: 400 },
    );
  }

  try {
    const destination = await getPaperPlanQrDestination({
      parentUserId: currentUser.id,
      weeklyPlanId: body.weeklyPlanId,
    });
    if (destination.profileId !== body.profileId) {
      return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    }

    await savePaperPlanDaySubjectGrade({
      parentUserId: currentUser.id,
      weeklyPlanId: body.weeklyPlanId,
      dayNumber,
      subjectKey: body.subjectKey,
      score: body.score,
    });
    await setPlanDaySubjectCompletion({
      parentUserId: currentUser.id,
      profileId: body.profileId,
      weeklyPlanId: body.weeklyPlanId,
      dayNumber,
      subjectKey: body.subjectKey,
      completed: true,
    });

    return NextResponse.json({
      saved: true,
      score: body.score,
      completed: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not save the lesson.") },
      { status: 400 },
    );
  }
}
