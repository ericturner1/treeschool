"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendMagicLink } from "../../lib/auth/server";
import {
  completePlanPackUpload,
  createPlanPackCheckout,
  createPlanPackIntake,
  setPlanPackWeekCompression,
  type PlanPackDraft
} from "../../lib/plan-pack/server";
import { isPrintPageSize } from "../../lib/print-page-sizes";

function getRequestOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const headerStore = headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3100";
  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${host}`;
}

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function safePath(path: string, fallback: string) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }
  return path;
}

function buildPath(pathname: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function parseDraft(formData: FormData): PlanPackDraft {
  const studentGradeLevel = Number(field(formData, "studentGradeLevel"));
  const holidayWeeks = Math.max(0, Math.min(51, Math.round(Number(field(formData, "holidayWeeks") || 16))));
  const teachingDaysPerWeek = Math.max(
    1,
    Math.min(7, Math.round(Number(field(formData, "teachingDaysPerWeek") || 5)))
  );
  const subjectIndexes = formData
    .getAll("subjectIndexes")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const subjects = subjectIndexes
    .map((index) => ({
      materialSetId: field(formData, `materialSetId-${index}`),
      prerequisiteMaterialSetId: field(formData, `prerequisiteMaterialSetId-${index}`) || null,
      subjectLabel: field(formData, `subjectLabel-${index}`),
      documentRole: "mixed",
      parentNotes: field(formData, `parentNotes-${index}`) || null,
      daysPerWeek: field(formData, `subjectDaysPerWeek-${index}`)
        ? Number(field(formData, `subjectDaysPerWeek-${index}`))
        : null
    }))
    .filter((subject) => subject.subjectLabel);
  const nativeCatalogItemIds = Array.from(new Set(
    formData.getAll("nativeCatalogItemIds").map((value) => String(value).trim()).filter(Boolean)
  ));

  return {
    studentName: field(formData, "studentName") || null,
    studentGradeLevel: Number.isFinite(studentGradeLevel) ? studentGradeLevel : null,
    learningYearTitle: null,
    holidayWeeks,
    teachingDaysPerWeek,
    startDate: field(formData, "startDate") || null,
    endDate: field(formData, "endDate") || null,
    preferredPrintPageSize: field(formData, "preferredPrintPageSize") as PlanPackDraft["preferredPrintPageSize"],
    totalWeeks: 52 - holidayWeeks,
    nativeCatalogItemIds,
    subjects
  };
}

function isSupportedCurriculumFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type.includes("pdf") ||
    name.endsWith(".pdf") ||
    type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name) ||
    type.startsWith("text/") ||
    /\.(txt|md|markdown|csv|tsv)$/i.test(name)
  );
}

export async function startPlanPackSetupAction(formData: FormData) {
  const email = field(formData, "email").toLowerCase();
  const draft = parseDraft(formData);
  const checkoutKind = "subscription" as const;

  if (!email || !email.includes("@")) {
    redirect(buildPath("/homeschool-lesson-plan-generator", { error: "Enter a valid email address." }));
  }

  if (draft.subjects.length === 0 && draft.nativeCatalogItemIds.length === 0) {
    redirect(buildPath("/homeschool-lesson-plan-generator", { error: "Add at least one workbook or subject you plan to teach." }));
  }

  if (!isPrintPageSize(draft.preferredPrintPageSize)) {
    redirect(buildPath("/homeschool-lesson-plan-generator", { error: "Choose a preferred print page size." }));
  }

  if (field(formData, "termsAccepted") !== "yes") {
    redirect(buildPath("/homeschool-lesson-plan-generator", { error: "Accept the Terms and Privacy Policy before continuing." }));
  }

  const origin = getRequestOrigin();

  let intake: Awaited<ReturnType<typeof createPlanPackIntake>>;
  try {
    intake = await createPlanPackIntake({ email, draft });
  } catch (error) {
    redirect(buildPath("/homeschool-lesson-plan-generator", { error: error instanceof Error ? error.message : "Could not start setup." }));
  }

  const draftStorageKey = field(formData, "draftStorageKey");
  const successUrl = `${origin}/homeschool-lesson-plan-generator/upload?intakeId=${intake.intakeId}&session_id={CHECKOUT_SESSION_ID}${
    draftStorageKey ? `&draftKey=${encodeURIComponent(draftStorageKey)}` : ""
  }`;
  const cancelUrl = `${origin}/homeschool-lesson-plan-generator?checkout=canceled`;
  let session: Awaited<ReturnType<typeof createPlanPackCheckout>>;
  try {
    session = await createPlanPackCheckout({
      intakeId: intake.intakeId,
      successUrl,
      cancelUrl,
      checkoutKind
    });
  } catch (error) {
    redirect(buildPath("/homeschool-lesson-plan-generator", {
      error: error instanceof Error ? error.message : "Could not open secure checkout. Please try again."
    }));
  }

  if (!session.url) {
    redirect(buildPath("/homeschool-lesson-plan-generator", { error: "Stripe checkout is not configured yet." }));
  }

  const resumePath = buildPath("/homeschool-lesson-plan-generator/resume", {
    intakeId: intake.intakeId,
    draftKey: draftStorageKey || undefined,
    checkoutKind
  });
  await sendMagicLink(
    email,
    `${origin}/auth/confirm?next=${encodeURIComponent(resumePath)}`,
    { createUser: true }
  ).catch(() => undefined);

  redirect(session.url);
}

export async function uploadPlanPackFilesAction(formData: FormData) {
  const intakeId = field(formData, "intakeId");
  const checkoutSessionId = field(formData, "checkoutSessionId");
  const returnPath = safePath(field(formData, "returnPath"), "/homeschool-lesson-plan-generator");
  const draftJson = field(formData, "draftJson");

  if (!intakeId || !checkoutSessionId || !draftJson) {
    redirect(buildPath(returnPath, { error: "Missing checkout information. Please return from Stripe again." }));
  }

  let draft: PlanPackDraft;
  try {
    draft = JSON.parse(draftJson) as PlanPackDraft;
  } catch {
    redirect(buildPath(returnPath, { error: "Could not read the saved subject plan." }));
  }

  const subjectIndexes = formData
    .getAll("subjectIndexes")
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isFinite(value));
  const files = subjectIndexes.flatMap((subjectIndex) =>
    formData
      .getAll(`files-${subjectIndex}`)
      .filter((file): file is File => file instanceof File && file.size > 0)
      .map((file) => ({ subjectIndex, file }))
  );

  if (files.length === 0) {
    redirect(buildPath(returnPath, { error: "Add at least one PDF, text, or image file." }));
  }

  if (files.some(({ file }) => !isSupportedCurriculumFile(file))) {
    redirect(buildPath(returnPath, { error: "Choose only PDF, text, or image files." }));
  }

  try {
    await completePlanPackUpload({
      intakeId,
      checkoutSessionId,
      draft,
      files
    });
  } catch (error) {
    redirect(
      buildPath(returnPath, {
        error: error instanceof Error ? error.message : "Could not upload curriculum files."
      })
    );
  }

  redirect(buildPath(returnPath, { message: "Files uploaded. Treeschool is processing your printable weeks now." }));
}

export async function setPlanPackWeekCompressionAction(formData: FormData) {
  const returnPath = safePath(
    field(formData, "returnPath"),
    "/homeschool-lesson-plan-generator/upload"
  );
  const compressed = field(formData, "compressed") === "true";
  let result: { sourcePages?: number };
  try {
    result = await setPlanPackWeekCompression({
      intakeId: field(formData, "intakeId"),
      checkoutSessionId: field(formData, "checkoutSessionId"),
      weeklyPlanId: field(formData, "weeklyPlanId"),
      compressed
    }) as { sourcePages?: number };
  } catch (error) {
    redirect(buildPath(returnPath, {
      error: error instanceof Error ? error.message : "Could not adjust the weekly practice pages."
    }));
  }
  redirect(buildPath(returnPath, {
    message: compressed
      ? `Repeated practice removed. The updated PDF is ${result.sourcePages ?? "fewer"} workbook pages.`
      : "Repeated practice restored and the weekly PDF rebuilt."
  }));
}
