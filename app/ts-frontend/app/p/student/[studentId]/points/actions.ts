"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../../lib/auth/server";
import {
  awardStudentPoints,
  completeStudentPointIconUpload,
  discardStudentPointIconUpload,
  prepareStudentPointIconUpload,
  redeemStudentPoints,
  type StudentPointIconKey,
  updateStudentPointSettings
} from "../../../../../lib/points/server";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function safeReturnPath(formData: FormData) {
  const value = field(formData, "returnPath");
  return value.startsWith("/p/student/") ? value : "/p/dashboard";
}

function withMessage(path: string, key: "message" | "error", value: string) {
  const url = new URL(path, "https://treehomeschool.com");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

async function currentUserId() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin");
  return user.id;
}

export async function awardStudentPointsAction(formData: FormData) {
  const returnPath = safeReturnPath(formData);
  let error: string | null = null;
  try {
    await awardStudentPoints({
      parentUserId: await currentUserId(),
      profileId: field(formData, "profileId"),
      amount: Number(field(formData, "amount")),
      reason: field(formData, "reason")
    });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Could not award points.";
  }
  if (error) redirect(withMessage(returnPath, "error", error));
  revalidatePath(returnPath);
  redirect(withMessage(returnPath, "message", "Points awarded."));
}

export async function redeemStudentPointsAction(formData: FormData) {
  const returnPath = safeReturnPath(formData);
  let error: string | null = null;
  try {
    await redeemStudentPoints({
      parentUserId: await currentUserId(),
      profileId: field(formData, "profileId"),
      amount: Number(field(formData, "amount")),
      reason: field(formData, "reason")
    });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Could not use points.";
  }
  if (error) redirect(withMessage(returnPath, "error", error));
  revalidatePath(returnPath);
  redirect(withMessage(returnPath, "message", "Points used."));
}

export async function updateStudentPointSettingsAction(formData: FormData) {
  const returnPath = safeReturnPath(formData);
  let error: string | null = null;
  let stagedIcon: { profileId: string; objectPath: string; parentUserId: string } | null = null;
  try {
    const parentUserId = await currentUserId();
    const profileId = field(formData, "profileId");
    const customIcon = formData.get("customIcon");
    const hasCustomIcon = customIcon instanceof File && customIcon.size > 0;
    if (hasCustomIcon) {
      const prepared = await prepareStudentPointIconUpload({
        parentUserId,
        profileId,
        contentType: customIcon.type,
        sizeBytes: customIcon.size
      });
      stagedIcon = { parentUserId, profileId, objectPath: prepared.objectPath };
      const uploaded = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": prepared.contentType },
        body: customIcon
      });
      if (!uploaded.ok) {
        throw new Error("The custom icon could not be uploaded. Please try again.");
      }
    }
    await updateStudentPointSettings({
      parentUserId,
      profileId,
      singularName: field(formData, "singularName"),
      pluralName: field(formData, "pluralName"),
      iconKey: (hasCustomIcon ? "star" : field(formData, "iconKey")) as StudentPointIconKey,
      autoAwardLessonCompletion: formData.get("autoAwardLessonCompletion") === "on"
    });
    if (stagedIcon) {
      await completeStudentPointIconUpload(stagedIcon);
      stagedIcon = null;
    }
  } catch (caught) {
    if (stagedIcon) {
      await discardStudentPointIconUpload(stagedIcon).catch(() => undefined);
    }
    error = caught instanceof Error ? caught.message : "Could not save point settings.";
  }
  if (error) redirect(withMessage(returnPath, "error", error));
  revalidatePath(returnPath);
  redirect(withMessage(returnPath, "message", "Point settings saved."));
}
