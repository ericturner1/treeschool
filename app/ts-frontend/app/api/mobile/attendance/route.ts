import { NextResponse } from "next/server";
import { createManualAttendance, getStudentAttendance } from "../../../../lib/attendance/server";
import { getRequestUser } from "../../../../lib/auth/request-user";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

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
    return NextResponse.json(await getStudentAttendance({
      parentUserId: currentUser.id,
      profileId,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not load attendance.") },
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
    learningYearId?: unknown;
    attendanceDate?: unknown;
    activityType?: unknown;
    masterSubjectKey?: unknown;
    curriculumAreaKey?: unknown;
    customElectiveId?: unknown;
    customElectiveName?: unknown;
    subjectLabel?: unknown;
    title?: unknown;
    notes?: unknown;
    minutes?: unknown;
    extraCreditPoints?: unknown;
  } | null;
  const profileId = typeof body?.profileId === "string" ? body.profileId.trim() : "";
  if (!profileId) {
    return NextResponse.json({ error: "Student profile is required." }, { status: 400 });
  }

  const optionalText = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  const optionalNumber = (value: unknown) =>
    typeof value === "number" ? value : null;

  try {
    const learningYearId = optionalText(body?.learningYearId) ?? (
      await getStudentAttendance({
        parentUserId: currentUser.id,
        profileId,
      })
    ).selectedYearId;
    await createManualAttendance({
      parentUserId: currentUser.id,
      profileId,
      learningYearId,
      attendanceDate: typeof body?.attendanceDate === "string" ? body.attendanceDate : "",
      activityType: typeof body?.activityType === "string" ? body.activityType : "",
      masterSubjectKey: optionalText(body?.masterSubjectKey),
      curriculumAreaKey: optionalText(body?.curriculumAreaKey),
      customElectiveId: optionalText(body?.customElectiveId),
      customElectiveName: optionalText(body?.customElectiveName),
      subjectLabel: optionalText(body?.subjectLabel),
      title: typeof body?.title === "string" ? body.title : "",
      notes: optionalText(body?.notes),
      minutes: optionalNumber(body?.minutes),
      extraCreditPoints: optionalNumber(body?.extraCreditPoints),
    });
    return NextResponse.json({ recorded: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not record learning activity.") },
      { status: 400 },
    );
  }
}
