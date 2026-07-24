"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../../lib/auth/server";
import {
  createPaperLearningYear,
  deletePaperPlanDocument,
  getPaperPlan,
  restorePreviousPaperPlan,
  savePaperPlanDaySubjectGrade,
  retryFailedPaperPlanPlanning,
  setPaperPlanWeekCompression,
  startPaperPlanPlanning,
  updatePaperLearningYear,
  updatePaperPlanDocument,
  uploadPaperPlanDocument
} from "../../../../../lib/paper-plans/server";
import {
  attachNativeWorkbook,
  createNativeWorkbookCheckout
} from "../../../../../lib/native-workbooks/server";
import {
  evaluatePaperPlanCompleteness,
  type CurriculumCompletenessActionResult
} from "../../../../../lib/curriculum-completeness/server";

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
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

async function requireUserId(formData?: FormData) {
  const user = await getCurrentUser();
  if (!user?.id) {
    const profileId = formData ? field(formData, "profileId") : "";
    const next = profileId ? `/p/student/${profileId}/lesson-plan` : "/p/dashboard";
    redirect(`/signin?next=${encodeURIComponent(next)}&message=${encodeURIComponent("Please sign in again. Your saved setup is waiting for you.")}`);
  }
  return user.id;
}

function destination(profileId: string, key: "message" | "error", message: string, clearDraft = false) {
  return `/p/student/${profileId}/lesson-plan?${key}=${encodeURIComponent(message)}${clearDraft ? "&clearDraft=1" : ""}`;
}

function revalidateCurriculum(profileId: string) {
  if (profileId) {
    revalidatePath(`/p/student/${profileId}/lesson-plan`);
  }
}

async function ensureLearningYearForNativeWorkbooks(input: {
  parentUserId: string;
  profileId: string;
  studentName: string;
  learningYearId?: string | null;
  preferredPrintPageSize?: string | null;
}) {
  if (input.learningYearId) return input.learningYearId;
  const currentPlan = await getPaperPlan({
    parentUserId: input.parentUserId,
    profileId: input.profileId
  });
  if (currentPlan.year?.id) return currentPlan.year.id;
  const year = await createPaperLearningYear({
    parentUserId: input.parentUserId,
    profileId: input.profileId,
    title: `${input.studentName || "Student"}'s learning year`,
    totalWeeks: 36,
    teachingDaysPerWeek: 5,
    printPageSize: input.preferredPrintPageSize || null
  }) as { id: string };
  return year.id;
}

export async function addNativeWorkbooksToPlanAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  const workbookIds = Array.from(new Set(
    formData.getAll("workbookId").map((value) => String(value).trim()).filter(Boolean)
  )).slice(0, 30);
  if (workbookIds.length === 0) {
    redirect(destination(profileId, "error", "Choose at least one Treeschool workbook."));
  }

  try {
    const learningYearId = await ensureLearningYearForNativeWorkbooks({
      parentUserId,
      profileId,
      studentName: field(formData, "studentName"),
      learningYearId: field(formData, "learningYearId") || null,
      preferredPrintPageSize: field(formData, "preferredPrintPageSize") || null
    });
    let added = 0;
    for (const workbookId of workbookIds) {
      const result = await attachNativeWorkbook({ userId: parentUserId, workbookId, learningYearId });
      if (result.attached) added += result.attachedCount ?? 1;
    }
    revalidateCurriculum(profileId);
    redirect(destination(
      profileId,
      "message",
      `${added || workbookIds.length} Treeschool workbook${(added || workbookIds.length) === 1 ? "" : "s"} added. Review the materials, then create the lesson plan.`
    ));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not add the selected workbooks."));
  }
}

export async function purchaseNativeWorkbookForPlanAction(formData: FormData) {
  const user = await getCurrentUser();
  const profileId = field(formData, "profileId");
  if (!user?.id) redirect(`/signin?next=${encodeURIComponent(`/p/student/${profileId}/lesson-plan`)}`);

  let checkoutUrl: string | null = null;
  try {
    const learningYearId = await ensureLearningYearForNativeWorkbooks({
      parentUserId: user.id,
      profileId,
      studentName: field(formData, "studentName"),
      learningYearId: field(formData, "learningYearId") || null,
      preferredPrintPageSize: field(formData, "preferredPrintPageSize") || null
    });
    const returnPath = `/p/student/${profileId}/lesson-plan`;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100").replace(/\/$/, "");
    const session = await createNativeWorkbookCheckout({
      userId: user.id,
      email: user.email,
      workbookId: field(formData, "workbookId"),
      addToLearningYearId: learningYearId,
      successUrl: `${baseUrl}/bookstore/success?session_id={CHECKOUT_SESSION_ID}&returnPath=${encodeURIComponent(returnPath)}`,
      cancelUrl: `${baseUrl}${returnPath}?nativeWorkbooks=1&checkout=canceled`
    });
    checkoutUrl = session.url;
    if (!checkoutUrl) throw new Error("Stripe did not return a checkout link.");
  } catch (error) {
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not start workbook checkout."));
  }
  redirect(checkoutUrl!);
}

export async function createPaperLearningYearAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  try {
    await createPaperLearningYear({
      parentUserId,
      profileId,
      title: field(formData, "title"),
      totalWeeks: Number(field(formData, "totalWeeks") || 36),
      startDate: field(formData, "startDate") || undefined,
      endDate: field(formData, "endDate") || undefined,
      teachingDaysPerWeek: Number(field(formData, "teachingDaysPerWeek") || 5)
    });
  } catch (error) {
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not create learning year."));
  }
  revalidateCurriculum(profileId);
  redirect(destination(profileId, "message", "Learning year created. Add your first subject bundle."));
}

export async function createPlanFromGeneratorAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  const studentName = field(formData, "studentName") || "Student";
  const holidayWeeks = Math.max(0, Math.min(51, Math.round(Number(field(formData, "holidayWeeks") || 16))));
  const teachingDaysPerWeek = Math.max(1, Math.min(7, Math.round(Number(field(formData, "teachingDaysPerWeek") || 5))));
  const subjectIndexes = formData
    .getAll("subjectIndexes")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (subjectIndexes.length === 0) {
    redirect(destination(profileId, "error", "Add at least one subject and its files."));
  }

  let uploadedFileCount = 0;
  try {
    const year = await createPaperLearningYear({
      parentUserId,
      profileId,
      title: `${studentName}'s learning year`,
      totalWeeks: 52 - holidayWeeks,
      startDate: field(formData, "startDate") || undefined,
      endDate: field(formData, "endDate") || undefined,
      teachingDaysPerWeek,
      printPageSize: field(formData, "preferredPrintPageSize") || null
    }) as { id: string };

    for (const index of subjectIndexes) {
      const files = formData
        .getAll(`preCheckoutFiles-${index}`)
        .filter((file): file is File => file instanceof File && file.size > 0);
      if (files.length === 0) {
        throw new Error("Add at least one file for every subject.");
      }
      if (files.some((file) => !isSupportedCurriculumFile(file))) {
        throw new Error("Choose only PDF, text, or image files.");
      }

      const subjectLabel = field(formData, `subjectLabel-${index}`);
      const parentNotes = field(formData, `parentNotes-${index}`);

      await uploadPaperPlanDocument({
        parentUserId,
        learningYearId: year.id,
        label: subjectLabel || files[0]?.name || "Curriculum files",
        subjectLabel: subjectLabel || null,
        documentRole: "mixed",
        clientUploadId: field(formData, `subjectUploadId-${index}`) || null,
        materialSetId: field(formData, `materialSetId-${index}`) || null,
        prerequisiteMaterialSetId: field(formData, `prerequisiteMaterialSetId-${index}`) || null,
        parentNotes: parentNotes || null,
        subjectDaysPerWeek: field(formData, `subjectDaysPerWeek-${index}`)
          ? Number(field(formData, `subjectDaysPerWeek-${index}`))
          : null,
        files
      });
      uploadedFileCount += files.length;
    }

  } catch (error) {
    redirect(destination(
      profileId,
      "error",
      error instanceof Error ? error.message : "Could not create the learning year."
    ));
  }
  revalidateCurriculum(profileId);
  redirect(destination(
    profileId,
    "message",
    `${uploadedFileCount} file${uploadedFileCount === 1 ? "" : "s"} uploaded. Treeschool is reading the material now; the academic review will open automatically when it is ready.`,
    true
  ));
}

export async function addMaterialsFromGeneratorAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  const learningYearId = field(formData, "learningYearId");
  const subjectIndexes = formData
    .getAll("subjectIndexes")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!learningYearId || subjectIndexes.length === 0) {
    redirect(destination(profileId, "error", "Add at least one subject and its files."));
  }

  let uploadedFileCount = 0;
  try {
    for (const index of subjectIndexes) {
      const files = formData
        .getAll(`preCheckoutFiles-${index}`)
        .filter((file): file is File => file instanceof File && file.size > 0);
      if (files.length === 0) throw new Error("Add at least one file for every subject.");
      if (files.some((file) => !isSupportedCurriculumFile(file))) {
        throw new Error("Choose only PDF, text, or image files.");
      }

      const subjectLabel = field(formData, `subjectLabel-${index}`);
      const parentNotes = field(formData, `parentNotes-${index}`);

      await uploadPaperPlanDocument({
        parentUserId,
        learningYearId,
        label: subjectLabel || files[0]?.name || "Curriculum files",
        subjectLabel: subjectLabel || null,
        documentRole: "mixed",
        clientUploadId: field(formData, `subjectUploadId-${index}`) || null,
        materialSetId: field(formData, `materialSetId-${index}`) || null,
        prerequisiteMaterialSetId: field(formData, `prerequisiteMaterialSetId-${index}`) || null,
        parentNotes: parentNotes || null,
        subjectDaysPerWeek: field(formData, `subjectDaysPerWeek-${index}`)
          ? Number(field(formData, `subjectDaysPerWeek-${index}`))
          : null,
        files
      });
      uploadedFileCount += files.length;
    }
  } catch (error) {
    redirect(destination(
      profileId,
      "error",
      error instanceof Error ? error.message : "Could not upload curriculum materials."
    ));
  }

  revalidateCurriculum(profileId);
  redirect(destination(
    profileId,
    "message",
    `${uploadedFileCount} file${uploadedFileCount === 1 ? "" : "s"} uploaded. Treeschool has started reading the PDFs.`,
    true
  ));
}

export async function uploadPaperPlanDocumentAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  const indexes = formData.getAll("subjectIndexes").map((value) => String(value).trim()).filter(Boolean);
  const subjectIndexes = indexes.length > 0 ? indexes : ["legacy"];
  const uploadedSubjects: Array<{
    subjectId: string | null;
    subjectLabel: string;
    parentNotes: string | null;
    documentRole: string;
    files: File[];
  }> = [];

  for (const index of subjectIndexes) {
    const filesKey = index === "legacy" ? "files" : `files-${index}`;
    const files = formData
      .getAll(filesKey)
      .filter((file): file is File => file instanceof File && file.size > 0);
    if (files.length === 0) continue;
    if (files.some((file) => !isSupportedCurriculumFile(file))) {
      redirect(destination(profileId, "error", "Choose only PDF, text, or image files."));
    }
    const selectedSubject = field(formData, index === "legacy" ? "subjectId" : `subjectId-${index}`);
    const customSubjectLabel = field(formData, index === "legacy" ? "subjectLabel" : `customSubjectLabel-${index}`);
    const legacySubjectLabel = field(formData, index === "legacy" ? "subjectLabel" : `subjectLabel-${index}`);
    const subjectId =
      selectedSubject && selectedSubject !== "__custom__" && !selectedSubject.startsWith("custom:")
        ? selectedSubject
        : null;
    const subjectLabel = selectedSubject.startsWith("custom:")
      ? selectedSubject.replace(/^custom:/, "")
      : customSubjectLabel || legacySubjectLabel;
    uploadedSubjects.push({
      subjectId,
      subjectLabel,
      parentNotes: field(formData, index === "legacy" ? "parentNotes" : `subjectNotes-${index}`) || null,
      documentRole: field(formData, index === "legacy" ? "documentRole" : `documentRole-${index}`),
      files
    });
  }

  if (uploadedSubjects.length === 0) {
    redirect(destination(profileId, "error", "Add at least one PDF, text, or image file."));
  }

  const learningYearId = field(formData, "learningYearId");
  try {
    for (const subject of uploadedSubjects) {
      const fallbackLabel =
        subject.subjectLabel ||
        subject.files[0]?.name.replace(/\.[^.]+$/i, "").replace(/[_-]+/g, " ").trim() ||
        "Curriculum files";
      await uploadPaperPlanDocument({
        parentUserId,
        learningYearId,
        label: fallbackLabel,
        subjectId: subject.subjectId,
        subjectLabel: subject.subjectLabel || null,
        documentRole: subject.documentRole,
        parentNotes: subject.parentNotes,
        files: subject.files
      });
    }
  } catch (error) {
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not upload curriculum files."));
  }
  revalidateCurriculum(profileId);
  const fileCount = uploadedSubjects.reduce((total, subject) => total + subject.files.length, 0);
  redirect(destination(profileId, "message", `${fileCount} file${fileCount === 1 ? "" : "s"} uploaded across ${uploadedSubjects.length} subject${uploadedSubjects.length === 1 ? "" : "s"}. Treeschool has started reading the PDFs.`));
}

export async function startPaperPlanPlanningAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  try {
    await startPaperPlanPlanning({
      parentUserId,
      learningYearId: field(formData, "learningYearId")
    });
  } catch (error) {
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not start planning."));
  }
  revalidateCurriculum(profileId);
  redirect(destination(profileId, "message", "Planning has started. You can leave this page and check back any time."));
}

export async function retryFailedPaperPlanPlanningAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  let count = 1;
  try {
    const result = await retryFailedPaperPlanPlanning({
      parentUserId,
      learningYearId: field(formData, "learningYearId")
    }) as { weeklyJobsRetried?: number };
    count = result.weeklyJobsRetried ?? 1;
  } catch (error) {
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not retry planning."));
  }
  revalidateCurriculum(profileId);
  redirect(destination(
    profileId,
    "message",
    `Retrying ${count} unfinished ${count === 1 ? "week" : "weeks"}. All completed planning work has been preserved.`
  ));
}

export async function evaluatePaperPlanCompletenessAction(
  formData: FormData
): Promise<CurriculumCompletenessActionResult> {
  const parentUserId = await requireUserId(formData);
  try {
    return {
      ok: true,
      result: await evaluatePaperPlanCompleteness({
        parentUserId,
        learningYearId: field(formData, "learningYearId")
      })
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not review curriculum completeness."
    };
  }
}

export async function deletePaperPlanDocumentAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  try {
    await deletePaperPlanDocument({
      parentUserId,
      documentId: field(formData, "documentId")
    });
  } catch (error) {
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not remove file."));
  }
  revalidateCurriculum(profileId);
  redirect(destination(profileId, "message", "File removed. Rebuild the weekly plan when ready."));
}

export async function deletePaperPlanDocumentByIdAction(documentId: string, formData: FormData) {
  formData.set("documentId", documentId);
  return deletePaperPlanDocumentAction(formData);
}

export async function updatePaperPlanDocumentAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  try {
    await updatePaperPlanDocument({
      parentUserId,
      documentId: field(formData, "editDocumentId"),
      label: field(formData, "editDocumentLabel"),
      subjectLabel: field(formData, "editSubjectLabel") || null,
      parentNotes: field(formData, "editParentNotes") || null,
      subjectDaysPerWeek: field(formData, "editSubjectDaysPerWeek")
        ? Number(field(formData, "editSubjectDaysPerWeek"))
        : null,
      prerequisiteMaterialSetId: field(formData, "editPrerequisiteMaterialSetId") || null
    });
  } catch (error) {
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not update material."));
  }
  revalidateCurriculum(profileId);
  redirect(destination(profileId, "message", "Material updated. Rebuild the weekly plan when ready."));
}

export async function updatePlanDetailsAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  const holidayWeeks = Math.max(0, Math.min(51, Math.round(Number(field(formData, "holidayWeeks") || 16))));
  const teachingDaysPerWeek = Math.max(1, Math.min(7, Math.round(Number(field(formData, "teachingDaysPerWeek") || 5))));
  try {
    await updatePaperLearningYear({
      parentUserId,
      learningYearId: field(formData, "learningYearId"),
      totalWeeks: 52 - holidayWeeks,
      startDate: field(formData, "startDate") || null,
      endDate: field(formData, "endDate") || null,
      teachingDaysPerWeek,
      printPageSize: field(formData, "preferredPrintPageSize") || null
    });
  } catch (error) {
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not update plan details."));
  }
  revalidateCurriculum(profileId);
  redirect(destination(profileId, "message", "Plan preferences updated. Replan future weeks when ready."));
}

export async function restorePreviousPlanAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  try {
    await restorePreviousPaperPlan({
      parentUserId,
      learningYearId: field(formData, "learningYearId")
    });
  } catch (error) {
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not restore the previous plan."));
  }
  revalidateCurriculum(profileId);
  redirect(destination(profileId, "message", "Previous plan restored. Started and completed weeks were preserved."));
}

export async function savePaperPlanDaySubjectGradeAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  const rawScore = field(formData, "score");
  const removed = field(formData, "removeGrade") === "yes" || rawScore === "";
  try {
    await savePaperPlanDaySubjectGrade({
      parentUserId,
      weeklyPlanId: field(formData, "weeklyPlanId"),
      dayNumber: Number(field(formData, "dayNumber")),
      subjectKey: field(formData, "subjectKey"),
      score: removed ? null : Number(rawScore)
    });
  } catch (error) {
    redirect(destination(profileId, "error", error instanceof Error ? error.message : "Could not save grade."));
  }
  revalidateCurriculum(profileId);
  revalidatePath(`/p/student/${profileId}/grades`);
  redirect(destination(profileId, "message", removed ? "Grade removed." : "Grade saved."));
}

export async function setPaperPlanWeekCompressionAction(formData: FormData) {
  const parentUserId = await requireUserId(formData);
  const profileId = field(formData, "profileId");
  const compressed = field(formData, "compressed") === "true";
  let result: { sourcePages?: number };
  try {
    result = await setPaperPlanWeekCompression({
      parentUserId,
      weeklyPlanId: field(formData, "weeklyPlanId"),
      compressed
    }) as { sourcePages?: number };
  } catch (error) {
    redirect(destination(
      profileId,
      "error",
      error instanceof Error ? error.message : "Could not adjust the weekly practice pages."
    ));
  }
  revalidateCurriculum(profileId);
  redirect(destination(
    profileId,
    "message",
    compressed
      ? `Repeated practice removed. The updated PDF is ${result.sourcePages ?? "fewer"} workbook pages.`
      : "Repeated practice restored and the weekly PDF rebuilt."
  ));
}
