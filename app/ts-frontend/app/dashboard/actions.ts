"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createStudentHouseholdProfile,
  listHouseholdProfiles,
  syncStudentProfileToAge
} from "../../lib/accounts/server";
import {
  getActiveProfileCookie,
  setActiveProfileCookie
} from "../../lib/accounts/active-profile";
import { getCurrentUser, verifyPassword } from "../../lib/auth/server";

function getField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getSafeRedirectTarget(input: string) {
  if (!input || !input.startsWith("/") || input.startsWith("//")) {
    return "/p/dashboard";
  }

  return input;
}

function getRequestOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configuredOrigin) return configuredOrigin;
  const headerStore = headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3100";
  const protocol = headerStore.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

async function requireCurrentUser() {
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser.email) {
    redirect("/signin?message=Please sign in again.");
  }

  return currentUser as {
    id: string;
    email: string;
    user_metadata?: {
      first_name?: string;
      full_name?: string;
      name?: string;
    };
  };
}

async function getHousehold(userId: string) {
  const householdProfiles = await listHouseholdProfiles(userId);
  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");

  if (!parentProfile) {
    throw new Error("Parent profile not found.");
  }

  return {
    householdProfiles,
    parentProfile
  };
}

export async function createStudentProfileAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const firstName = getField(formData, "firstName");
  const birthDate = getField(formData, "birthDate");
  const gradeLevel = Number(getField(formData, "gradeLevel"));
  const learningProfileNotes = getField(formData, "learningProfileNotes");
  const subjectStrengths = Object.fromEntries(
    ["mathematics", "reading", "writing_grammar", "science", "social_studies"]
      .map((subject) => [subject, getField(formData, `strength-${subject}`)])
      .filter(([, value]) => Boolean(value))
  );

  if (!firstName || !birthDate || Number.isNaN(gradeLevel)) {
    return { ok: false, error: "Please provide first name, birth date, and grade level." };
  }

  try {
    const origin = getRequestOrigin();
    const result = await createStudentHouseholdProfile({
      parentUserId: currentUser.id,
      firstName,
      birthDate,
      gradeLevel,
      learningProfileNotes,
      subjectStrengths,
      successUrl: `${origin}/p/dashboard?student_checkout=success`,
      cancelUrl: `${origin}/p/dashboard?student_checkout=canceled`
    });
    if (result.kind === "checkout") {
      return {
        ok: true,
        checkoutUrl: result.url,
        paymentCopy: result.paymentCopy
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The student could not be created. Please try again."
    };
  }

  revalidatePath("/p/dashboard");
  return { ok: true };
}

export async function returnToParentAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const password = getField(formData, "password");
  const redirectTo = getSafeRedirectTarget(getField(formData, "redirectTo"));
  const { parentProfile } = await getHousehold(currentUser.id);

  if (!password) {
    redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}error=Enter your password to return to the parent profile.`);
  }

  const valid = await verifyPassword(currentUser.email, password);

  if (!valid) {
    redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}error=Incorrect password.`);
  }

  setActiveProfileCookie({
    id: parentProfile.id,
    role: parentProfile.role
  });

  redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}message=Profile switched.`);
}

export async function syncStudentToAgeAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const profileId = getField(formData, "profileId");

  if (!profileId) {
    redirect("/p/dashboard?error=Profile is required.");
  }

  await syncStudentProfileToAge({
    parentUserId: currentUser.id,
    profileId
  });

  redirect("/p/dashboard?message=Vocabulary synced to age.");
}

export async function initializeActiveProfileAction() {
  const currentUser = await requireCurrentUser();
  const { parentProfile } = await getHousehold(currentUser.id);
  const activeProfile = getActiveProfileCookie();

  if (!activeProfile) {
    setActiveProfileCookie({
      id: parentProfile.id,
      role: parentProfile.role
    });
  }
}
