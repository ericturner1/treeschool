"use server";

import { redirect } from "next/navigation";
import { createLessonForSubject } from "../../../lib/lessons/server";
import { getCurrentStudentAccess } from "../../../lib/auth/student-access";

function getField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function startLessonAction(formData: FormData) {
  const profileId = getField(formData, "profileId");
  const subjectId = getField(formData, "subjectId");

  if (!profileId || !subjectId) {
    redirect("/student/classroom?error=Lesson target is required.");
  }

  const access = await getCurrentStudentAccess(profileId);
  if (!access) {
    redirect("/signin?message=Please sign in again.");
  }

  const lesson = await createLessonForSubject({
    profileId: access.student.id,
    subjectId
  });

  redirect(`/student/lesson/${lesson.id}`);
}
