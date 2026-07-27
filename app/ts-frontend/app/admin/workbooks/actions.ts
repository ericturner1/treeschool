"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../../../lib/auth/server";
import {
  completeNativeWorkbookEdition,
  completeNativeWorkbookReplacement,
  completeNativeWorkbookBundle,
  completeNativeWorkbookUpload,
  deleteNativeWorkbook,
  discardNativeWorkbookEdition,
  discardNativeWorkbookBundleThumbnail,
  discardNativeWorkbookReplacement,
  discardNativeWorkbookBundle,
  discardNativeWorkbookUpload,
  prepareNativeWorkbookReplacement,
  prepareNativeWorkbookEdition,
  prepareNativeWorkbookBundle,
  prepareNativeWorkbookBundleThumbnail,
  prepareNativeWorkbookUpload,
  publishNativeWorkbook,
  retryNativeWorkbookIndexing,
  setNativeWorkbookPublished,
  setNativeWorkbookBundleRecommended,
  setNativeWorkbookBundlePublished,
  updateNativeWorkbookBundle,
  updateNativeWorkbookDetails
} from "../../../lib/native-workbooks/server";

async function requireUserId() {
  const user = await getCurrentUser();
  if (!user?.id) throw new Error("Sign in again to manage workbooks.");
  return user.id;
}

export async function prepareWorkbookUploadAction(input: {
  title: string;
  subject: string;
  curriculumSubjectId: string | null;
  addSubjectToTaxonomy: boolean;
  curriculumAreaKey: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  descriptionMode: "auto" | "custom";
  description: string;
  type: "core" | "elective";
  priceInCents: number;
  coverageTags: string;
  prerequisiteWorkbookId: string | null;
  editionLabel: string;
  pdfFilename: string;
  pdfMimeType: string;
}) {
  try {
    const userId = await requireUserId();
    return { ok: true as const, upload: await prepareNativeWorkbookUpload({ ...input, userId }) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not prepare upload." };
  }
}

export async function completeWorkbookUploadAction(input: { workbookId: string; versionId: string }) {
  try {
    const userId = await requireUserId();
    await completeNativeWorkbookUpload({ ...input, userId });
    revalidatePath("/admin/workbooks");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not queue indexing." };
  }
}

export async function prepareWorkbookBundleAction(input: {
  title: string;
  descriptionMode: "auto" | "custom";
  description: string;
  priceInCents: number;
  workbookIds: string[];
  thumbnailFilename: string;
  thumbnailMimeType: string;
  isRecommendedCurriculum: boolean;
  recommendedGradeLevel: number | null;
}) {
  try {
    const userId = await requireUserId();
    return { ok: true as const, upload: await prepareNativeWorkbookBundle({ ...input, userId, currencyCode: "USD" }) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not prepare the workbook bundle." };
  }
}

export async function completeWorkbookBundleAction(input: { bundleId: string }) {
  try {
    const userId = await requireUserId();
    await completeNativeWorkbookBundle({ ...input, userId });
    revalidatePath("/admin/workbooks");
    revalidatePath("/bookstore");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not complete the workbook bundle." };
  }
}

export async function discardWorkbookBundleAction(input: { bundleId: string }) {
  try {
    const userId = await requireUserId();
    await discardNativeWorkbookBundle({ ...input, userId });
    revalidatePath("/admin/workbooks");
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export async function prepareWorkbookBundleThumbnailAction(input: {
  bundleId: string;
  thumbnailFilename: string;
  thumbnailMimeType: string;
}) {
  try {
    const userId = await requireUserId();
    return { ok: true as const, upload: await prepareNativeWorkbookBundleThumbnail({ ...input, userId }) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not prepare the replacement bundle thumbnail."
    };
  }
}

export async function discardWorkbookBundleThumbnailAction(input: {
  bundleId: string;
  thumbnailObjectPath: string;
}) {
  try {
    const userId = await requireUserId();
    await discardNativeWorkbookBundleThumbnail({ ...input, userId });
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export async function updateWorkbookBundleAction(input: {
  bundleId: string;
  title: string;
  descriptionMode: "auto" | "custom";
  description: string;
  priceInCents: number;
  workbookIds: string[];
  isRecommendedCurriculum: boolean;
  recommendedGradeLevel: number | null;
  thumbnailObjectPath: string | null;
}) {
  try {
    const userId = await requireUserId();
    const result = await updateNativeWorkbookBundle({ ...input, userId });
    revalidatePath("/admin/workbooks");
    revalidatePath("/bookstore");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not update the workbook bundle."
    };
  }
}

export async function discardWorkbookUploadAction(input: { workbookId: string; versionId: string }) {
  try {
    const userId = await requireUserId();
    await discardNativeWorkbookUpload({ ...input, userId });
    revalidatePath("/admin/workbooks");
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export async function prepareWorkbookReplacementAction(input: {
  workbookId: string;
  pdfFilename: string;
  pdfMimeType: string;
}) {
  try {
    const userId = await requireUserId();
    return { ok: true as const, upload: await prepareNativeWorkbookReplacement({ ...input, userId }) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not prepare the replacement PDF upload."
    };
  }
}

export async function completeWorkbookReplacementAction(input: { workbookId: string; versionId: string }) {
  try {
    const userId = await requireUserId();
    await completeNativeWorkbookReplacement({ ...input, userId });
    revalidatePath("/admin/workbooks");
    revalidatePath("/bookstore");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not queue the replacement PDF for indexing."
    };
  }
}

export async function discardWorkbookReplacementAction(input: { workbookId: string; versionId: string }) {
  try {
    const userId = await requireUserId();
    await discardNativeWorkbookReplacement({ ...input, userId });
    revalidatePath("/admin/workbooks");
    revalidatePath("/bookstore");
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export async function prepareWorkbookEditionAction(input: {
  workbookId: string;
  editionLabel: string;
  changeNotes: string;
  pdfFilename: string;
  pdfMimeType: string;
}) {
  try {
    const userId = await requireUserId();
    return { ok: true as const, upload: await prepareNativeWorkbookEdition({ ...input, userId }) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not prepare the new edition."
    };
  }
}

export async function completeWorkbookEditionAction(input: { workbookId: string; versionId: string }) {
  try {
    const userId = await requireUserId();
    await completeNativeWorkbookEdition({ ...input, userId });
    revalidatePath("/admin/workbooks");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not queue the new edition for indexing."
    };
  }
}

export async function discardWorkbookEditionAction(input: { workbookId: string; versionId: string }) {
  try {
    const userId = await requireUserId();
    await discardNativeWorkbookEdition({ ...input, userId });
    revalidatePath("/admin/workbooks");
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export async function discardWorkbookEditionFormAction(workbookId: string, versionId: string) {
  const userId = await requireUserId();
  await discardNativeWorkbookEdition({ userId, workbookId, versionId });
  revalidatePath("/admin/workbooks");
}

export async function deleteWorkbookAction(workbookId: string) {
  try {
    const userId = await requireUserId();
    await deleteNativeWorkbook({ workbookId, userId });
    revalidatePath("/admin/workbooks");
    revalidatePath("/bookstore");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not delete the workbook."
    };
  }
}

export async function updateWorkbookDetailsAction(input: {
  workbookId: string;
  title: string;
  subject: string;
  curriculumSubjectId: string | null;
  addSubjectToTaxonomy: boolean;
  curriculumAreaKey: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  description: string;
  coverageTags: string;
  type: "core" | "elective";
  priceInCents: number;
  prerequisiteWorkbookId: string | null;
  editionLabel: string;
}) {
  try {
    const userId = await requireUserId();
    const result = await updateNativeWorkbookDetails({ ...input, userId });
    revalidatePath("/admin/workbooks");
    revalidatePath("/bookstore");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not update the workbook details."
    };
  }
}

export async function retryWorkbookIndexingAction(workbookId: string) {
  const userId = await requireUserId();
  await retryNativeWorkbookIndexing({ userId, workbookId });
  revalidatePath("/admin/workbooks");
}

export async function publishWorkbookAction(workbookId: string) {
  const userId = await requireUserId();
  await publishNativeWorkbook({ userId, workbookId });
  revalidatePath("/admin/workbooks");
  revalidatePath("/bookstore");
}

export async function setWorkbookVisibilityAction(workbookId: string, active: boolean) {
  const userId = await requireUserId();
  await setNativeWorkbookPublished({ userId, workbookId, active });
  revalidatePath("/admin/workbooks");
  revalidatePath("/bookstore");
}

export async function setWorkbookBundleVisibilityAction(bundleId: string, active: boolean) {
  const userId = await requireUserId();
  await setNativeWorkbookBundlePublished({ userId, bundleId, active });
  revalidatePath("/admin/workbooks");
  revalidatePath("/bookstore");
}

export async function setWorkbookBundleRecommendationAction(bundleId: string, isRecommendedCurriculum: boolean, formData: FormData) {
  const userId = await requireUserId();
  const rawGrade = String(formData.get("recommendedGradeLevel") ?? "").trim();
  await setNativeWorkbookBundleRecommended({
    userId,
    bundleId,
    isRecommendedCurriculum,
    recommendedGradeLevel: isRecommendedCurriculum && rawGrade ? Number(rawGrade) : null
  });
  revalidatePath("/admin/workbooks");
  revalidatePath("/bookstore");
}
