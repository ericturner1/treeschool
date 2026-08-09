"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../../lib/auth/server";
import {
  createManualAttendance,
  createPlanDayAttendance,
  createPlanItemAttendance,
  removeAttendance,
  setPlanDaySubjectCompletion,
  updateManualAttendance
} from "../../../../../lib/attendance/server";

function value(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function pagePath(profileId: string) { return `/p/student/${profileId}/attendance`; }

async function userId() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/signin");
  return user.id;
}

export async function addManualAttendanceAction(formData: FormData) {
  const profileId = value(formData, "profileId");
  const path = pagePath(profileId);
  try {
    await createManualAttendance({
      parentUserId: await userId(),
      profileId,
      learningYearId: value(formData, "learningYearId") || null,
      attendanceDate: value(formData, "attendanceDate"),
      activityType: value(formData, "activityType"),
      subjectLabel: value(formData, "subjectLabel") || null,
      title: value(formData, "title"),
      notes: value(formData, "notes") || null,
      minutes: Number(value(formData, "minutes")) || null,
      extraCreditPoints: Number(value(formData, "extraCreditPoints")) || null
    });
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not save attendance.")}`);
  }
  revalidatePath(path);
  redirect(`${path}?message=${encodeURIComponent("Learning activity recorded.")}`);
}

export async function logPlanItemAttendanceAction(weeklyPlanItemId: string, formData: FormData) {
  const profileId = value(formData, "profileId");
  const returnPath = value(formData, "returnPath") || `/p/student/${profileId}/lesson-plan`;
  try {
    await createPlanItemAttendance({
      parentUserId: await userId(), profileId,
      weeklyPlanItemId,
      attendanceDate: value(formData, "attendanceDate") || null
    });
  } catch (error) {
    redirect(`${returnPath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not log attendance.")}`);
  }
  revalidatePath(returnPath);
  revalidatePath(pagePath(profileId));
  redirect(`${returnPath}?message=${encodeURIComponent("Attendance logged for today.")}`);
}

export async function logPlanDayAttendanceAction(formData: FormData) {
  const profileId = value(formData, "profileId");
  const returnPath = value(formData, "returnPath") || `/p/student/${profileId}/lesson-plan`;
  try {
    await createPlanDayAttendance({
      parentUserId: await userId(),
      profileId,
      weeklyPlanId: value(formData, "weeklyPlanId"),
      dayNumber: Number(value(formData, "dayNumber")),
      attendanceDate: value(formData, "attendanceDate") || null,
      subjectKeys: formData.getAll("subjectKeys").map((subject) => String(subject))
    });
  } catch (error) {
    redirect(`${returnPath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not log attendance.")}`);
  }
  revalidatePath(returnPath);
  revalidatePath(pagePath(profileId));
  redirect(`${returnPath}?message=${encodeURIComponent("Attendance recorded and progress updated.")}`);
}

export async function setPlanDaySubjectCompletionAction(formData: FormData) {
  const profileId = value(formData, "profileId");
  const returnPath = value(formData, "returnPath") || `/p/student/${profileId}/lesson-plan`;
  const completed = value(formData, "completed") === "true";
  try {
    await setPlanDaySubjectCompletion({
      parentUserId: await userId(),
      profileId,
      weeklyPlanId: value(formData, "weeklyPlanId"),
      dayNumber: Number(value(formData, "dayNumber")),
      subjectKey: value(formData, "subjectKey"),
      completed,
      attendanceDate: value(formData, "attendanceDate") || null
    });
  } catch (error) {
    redirect(`${returnPath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not update the lesson.")}`);
  }
  revalidatePath(returnPath);
  revalidatePath(pagePath(profileId));
  redirect(`${returnPath}?message=${encodeURIComponent(completed ? "Lesson marked done." : "Lesson completion undone.")}`);
}

export async function deleteAttendanceAction(formData: FormData) {
  const profileId = value(formData, "profileId");
  const path = pagePath(profileId);
  try {
    await removeAttendance({ parentUserId: await userId(), profileId, entryId: value(formData, "entryId") });
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not remove attendance.")}`);
  }
  revalidatePath(path);
  redirect(`${path}?message=${encodeURIComponent("Attendance entry removed.")}`);
}

export async function updateManualAttendanceAction(formData: FormData) {
  const profileId = value(formData, "profileId");
  const path = pagePath(profileId);
  try {
    await updateManualAttendance({
      parentUserId: await userId(),
      profileId,
      entryId: value(formData, "entryId"),
      attendanceDate: value(formData, "attendanceDate"),
      activityType: value(formData, "activityType"),
      subjectLabel: value(formData, "subjectLabel") || null,
      title: value(formData, "title"),
      notes: value(formData, "notes") || null,
      minutes: Number(value(formData, "minutes")) || null,
      extraCreditPoints: Number(value(formData, "extraCreditPoints")) || null
    });
  } catch (error) {
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not update attendance.")}`);
  }
  revalidatePath(path);
  redirect(`${path}?message=${encodeURIComponent("Learning activity updated.")}`);
}
