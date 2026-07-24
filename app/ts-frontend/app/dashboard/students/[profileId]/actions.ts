"use server";

import { redirect } from "next/navigation";
import {
  addCurriculumToStudent,
  getStudentStreakSettings,
  removeCurriculumFromStudent,
  updateStudentGradingScheme,
  updateStudentStreakSettings
} from "../../../../lib/accounts/server";
import { getCurrentUser } from "../../../../lib/auth/server";

function getField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function requireCurrentUser() {
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser.email) {
    redirect("/signin?message=Please sign in again.");
  }

  return currentUser as {
    id: string;
    email: string;
  };
}

export async function addCurriculumAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const profileId = getField(formData, "profileId");
  const nodeId = getField(formData, "nodeId");

  if (!profileId || !nodeId) {
    redirect("/p/dashboard?error=Profile and curriculum are required.");
  }

  await addCurriculumToStudent({
    parentUserId: currentUser.id,
    profileId,
    nodeId
  });

  redirect(`/p/student/${profileId}/lesson-plan?message=Curriculum added.`);
}

export async function removeCurriculumAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const profileId = getField(formData, "profileId");
  const nodeId = getField(formData, "nodeId");

  if (!profileId || !nodeId) {
    redirect("/p/dashboard?error=Profile and curriculum are required.");
  }

  await removeCurriculumFromStudent({
    parentUserId: currentUser.id,
    profileId,
    nodeId
  });

  redirect(`/p/student/${profileId}/lesson-plan?message=Curriculum removed.`);
}

export async function updateStreakSettingsAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const profileId = getField(formData, "profileId");
  const mode = getField(formData, "mode");
  const timeZone = getField(formData, "timeZone");
  const pausedWeekdaysRaw = getField(formData, "pausedWeekdays");
  const pausedWeeksRaw = getField(formData, "pausedWeeks");

  if (!profileId || (mode !== "daily" && mode !== "weekly")) {
    redirect("/p/dashboard?error=Profile and streak mode are required.");
  }

  const pausedWeekdays = pausedWeekdaysRaw
    ? JSON.parse(pausedWeekdaysRaw)
    : [];
  const pausedWeeks = pausedWeeksRaw
    ? JSON.parse(pausedWeeksRaw)
    : [];

  await updateStudentStreakSettings({
    parentUserId: currentUser.id,
    profileId,
    mode,
    timeZone,
    pausedWeekdays,
    pausedWeeks
  });

  const nextSettings = await getStudentStreakSettings({
    parentUserId: currentUser.id,
    profileId
  });

  redirect(
    `/p/student/${profileId}/settings?message=${encodeURIComponent(
      nextSettings.mode === "daily"
        ? "Daily streak settings saved."
        : "Weekly streak settings saved."
    )}`
  );
}

export async function updateGradingSchemeAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const profileId = getField(formData, "profileId");
  const gradingScheme = getField(formData, "gradingScheme");

  if (!profileId || (gradingScheme !== "us" && gradingScheme !== "jp")) {
    redirect("/p/dashboard?error=Profile and grading scheme are required.");
  }

  await updateStudentGradingScheme({
    parentUserId: currentUser.id,
    profileId,
    gradingScheme
  });

  redirect(`/p/student/${profileId}/settings`);
}
