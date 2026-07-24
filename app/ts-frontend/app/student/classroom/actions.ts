"use server";

import { redirect } from "next/navigation";
import { createLessonForSubject } from "../../../lib/lessons/server";
import { getCurrentUser } from "../../../lib/auth/server";

function getField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function startLessonAction(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser?.id) {
    redirect("/signin?message=Please sign in again.");
  }

  const profileId = getField(formData, "profileId");
  const subjectId = getField(formData, "subjectId");

  if (!profileId || !subjectId) {
    redirect("/student/classroom?error=Lesson target is required.");
  }

  const lesson = await createLessonForSubject({
    profileId,
    subjectId
  });

  redirect(`/student/lesson/${lesson.id}`);
}
