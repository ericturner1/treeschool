import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth/server";
import { publicErrorMessage } from "../../../lib/security/request-guards";
import { updateStudentLearningProfile } from "../../../lib/accounts/server";

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const body = (await request.json()) as {
    profileId?: string;
    learningProfileNotes?: string;
    subjectStrengths?: Record<string, string>;
    schoolYearStartDate?: string | null;
    schoolYearEndDate?: string | null;
    updateSchoolYear?: boolean;
  };
  if (!body.profileId) {
    return NextResponse.json({ error: "profileId is required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateStudentLearningProfile({
      parentUserId: currentUser.id,
      profileId: body.profileId,
      learningProfileNotes: body.learningProfileNotes ?? "",
      subjectStrengths: body.subjectStrengths ?? {},
      schoolYearStartDate: body.schoolYearStartDate,
      schoolYearEndDate: body.schoolYearEndDate,
      updateSchoolYear: body.updateSchoolYear
    }));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not update the student profile.") },
      { status: 400 }
    );
  }
}
