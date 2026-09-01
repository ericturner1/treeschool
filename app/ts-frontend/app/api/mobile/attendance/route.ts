import { NextResponse } from "next/server";
import { getStudentAttendance } from "../../../../lib/attendance/server";
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
