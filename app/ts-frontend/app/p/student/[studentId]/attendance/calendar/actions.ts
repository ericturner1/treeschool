"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addStudentCalendarException,
  removeStudentCalendarException,
  updateStudentSchoolSchedule
} from "../../../../../../lib/attendance/server";
import { getCurrentUser } from "../../../../../../lib/auth/server";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function currentUserId() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/signin");
  return user.id;
}

function safeReturnPath(formData: FormData, profileId: string) {
  const candidate = value(formData, "returnPath");
  return candidate.startsWith("/p/student/")
    ? candidate
    : `/p/student/${profileId}/attendance/calendar`;
}

function finish(path: string, kind: "message" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${kind}=${encodeURIComponent(message)}`);
}

function revalidateStudentCalendar(profileId: string, path: string) {
  revalidatePath(path.split("?")[0]!);
  revalidatePath(`/p/student/${profileId}/attendance`);
  revalidatePath(`/p/student/${profileId}`);
  revalidatePath("/p/dashboard");
}

export async function updateSchoolWeekAction(formData: FormData) {
  const profileId = value(formData, "profileId");
  const returnPath = safeReturnPath(formData, profileId);
  try {
    await updateStudentSchoolSchedule({
      parentUserId: await currentUserId(),
      profileId,
      timeZone: value(formData, "timeZone") || "UTC",
      recurringDaysOff: formData
        .getAll("recurringDaysOff")
        .map(Number)
        .filter((day) => Number.isInteger(day))
    });
  } catch (error) {
    finish(returnPath, "error", error instanceof Error ? error.message : "Could not save the school week.");
  }
  revalidateStudentCalendar(profileId, returnPath);
  finish(returnPath, "message", "Regular school week saved.");
}

export async function addHolidayAction(formData: FormData) {
  const profileId = value(formData, "profileId");
  const returnPath = safeReturnPath(formData, profileId);
  try {
    await addStudentCalendarException({
      parentUserId: await currentUserId(),
      profileId,
      label: value(formData, "label"),
      exceptionKind: (value(formData, "exceptionKind") || "other") as
        | "holiday"
        | "school_break"
        | "vacation"
        | "personal_day"
        | "other",
      startDate: value(formData, "startDate"),
      endDate: value(formData, "endDate")
    });
  } catch (error) {
    finish(returnPath, "error", error instanceof Error ? error.message : "Could not add that planned break.");
  }
  revalidateStudentCalendar(profileId, returnPath);
  finish(returnPath, "message", "Planned break added. It will not interrupt the streak.");
}

export async function removeHolidayAction(formData: FormData) {
  const profileId = value(formData, "profileId");
  const returnPath = safeReturnPath(formData, profileId);
  try {
    await removeStudentCalendarException({
      parentUserId: await currentUserId(),
      profileId,
      exceptionId: value(formData, "exceptionId")
    });
  } catch (error) {
    finish(returnPath, "error", error instanceof Error ? error.message : "Could not remove that planned break.");
  }
  revalidateStudentCalendar(profileId, returnPath);
  finish(returnPath, "message", "Planned break removed.");
}
