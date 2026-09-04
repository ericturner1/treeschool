import { NextResponse } from "next/server";
import { getRecentAccountActivity, listHouseholdProfiles } from "../../../../lib/accounts/server";
import { getStudentSchoolCalendar } from "../../../../lib/attendance/server";
import { getRequestUser } from "../../../../lib/auth/request-user";
import { buildMobileHomePayload } from "../../../../lib/mobile/home";
import { getPaperPlan } from "../../../../lib/paper-plans/server";
import { getStudentPoints } from "../../../../lib/points/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

export async function GET(request: Request) {
  const currentUser = await getRequestUser(request);
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const requestedProfileId = url.searchParams.get("profileId")?.trim();
    // Older installed builds reject activity types they do not recognize.
    const includePdfDownloads = Number(url.searchParams.get("activityVersion")) >= 2;
    const students = (await listHouseholdProfiles(currentUser.id)).filter(
      (profile) => profile.role === "STUDENT",
    );
    const selected = requestedProfileId
      ? students.find((student) => student.id === requestedProfileId)
      : students[0];
    if (!selected) {
      return NextResponse.json(
        { error: requestedProfileId ? "Student profile was not found." : "Add a student profile to continue." },
        { status: 404 },
      );
    }

    const calendarDate = new Date().toISOString().slice(0, 10);
    const [plan, calendar, points, recentActivity] = await Promise.all([
      getPaperPlan({
        parentUserId: currentUser.id,
        profileId: selected.id,
      }),
      getStudentSchoolCalendar({
        parentUserId: currentUser.id,
        profileId: selected.id,
        dateFrom: calendarDate,
        dateTo: calendarDate,
      }),
      getStudentPoints({
        parentUserId: currentUser.id,
        profileId: selected.id,
        historyLimit: 1,
      }),
      getRecentAccountActivity({
        userId: currentUser.id,
        profileId: selected.id,
        limit: 10,
        includePdfDownloads,
      }),
    ]);
    return NextResponse.json(
      buildMobileHomePayload({
        students,
        selectedProfileId: selected.id,
        plan,
        calendar,
        points,
        recentActivity: recentActivity.events,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not load your Treeschool home." ) },
      { status: 400 },
    );
  }
}
