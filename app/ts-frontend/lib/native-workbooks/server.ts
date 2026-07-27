import { backendFetch } from "../backend/server";
import type { CurriculumCompletenessResult } from "../curriculum-completeness/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

async function requireOk(response: Response, fallback: string) {
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? fallback);
  }
  return response;
}

export type NativeWorkbookAccessState = "owned" | "included" | "purchase_required";

export type CurriculumSubjectOption = {
  id: string;
  key: string;
  label: string;
  curriculumAreaKey: string;
  aliases: string[];
};

export type NativeWorkbookCatalogItem = {
  catalogKind: "workbook" | "bundle";
  id: string;
  slug: string;
  title: string;
  subjectKey: string;
  subjectLabel: string;
  curriculumAreaKey: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  description: string;
  coverageTags: string[];
  type: "core" | "elective";
  priceInCents: number;
  currencyCode: string;
  activeVersionId: string | null;
  thumbnailUrl: string | null;
  pageCount?: number | null;
  previewImages?: Array<{
    pdfPageNumber: number;
    label: string;
    url: string;
  }>;
  accessState: NativeWorkbookAccessState;
  memberCount: number;
  memberWorkbookIds: string[];
  isRecommendedCurriculum: boolean;
  recommendedGradeLevel: number | null;
  curriculumCoverage: Array<{
    gradeLevel: number;
    role: "core" | "supplemental" | "remedial" | "enrichment";
    scores: {
      mathematics: number;
      languageArts: number;
      science: number;
      socialStudies: number;
    };
    competencies: Array<{
      competencyId: string;
      label: string;
      depth: "introduced" | "practiced" | "assessed" | "comprehensive";
      strength: number;
      confidence: "low" | "medium" | "high";
    }>;
  }>;
  progressSummary?: {
    total: number;
    completed: number;
    mastered: number;
    deferred: number;
    notStarted: number;
  } | null;
  members?: Array<{
    id: string;
    slug: string;
    title: string;
    subjectLabel: string;
    curriculumAreaKey: string;
    gradeMin: number;
    gradeMax: number;
    pageCount: number | null;
  }>;
};

export type NativeWorkbookPlanningPreview = {
  documentId: string;
  title: string;
  subjectLabel: string | null;
  pageCount: number;
  lessonCount: number;
  sectionCount: number;
  lessons: Array<{
    id: string;
    kind: "lesson" | "section";
    title: string;
    summary: string;
    estimatedMinutes: number;
    conceptLabels: string[];
    pageRanges: Array<{
      pdfPageStart: number;
      pdfPageEnd: number;
    }>;
    pageCount: number;
  }>;
};

export type AdminNativeWorkbook = {
  id: string;
  slug: string;
  title: string;
  curriculumSubjectId: string | null;
  subjectLabel: string;
  subjectKey: string;
  curriculumAreaKey: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  description: string;
  coverageTags: string[];
  type: "core" | "elective";
  priceInCents: number;
  currencyCode: string;
  prerequisiteWorkbookId: string | null;
  prerequisiteWorkbookTitle: string | null;
  status: string;
  active: boolean;
  activeVersionId: string | null;
  versionId: string | null;
  versionNumber: number | null;
  editionId: string | null;
  revisionNumber: number | null;
  editionLabel: string | null;
  releaseStatus: string | null;
  originalFilename: string | null;
  pageCount: number | null;
  analysisStatus: string | null;
  curriculumCoverageFrameworkVersion: string | null;
  curriculumCoverageProfiledAt: string | null;
  curriculumCoverageScores: Array<{
    gradeLevel: number;
    role: "core" | "supplemental" | "remedial" | "enrichment";
    scores: {
      mathematics: number;
      languageArts: number;
      science: number;
      socialStudies: number;
    };
  }>;
  lastError: string | null;
  lastErrorCode: string | null;
  indexedAt: string | null;
  thumbnailUrl: string | null;
  purchaseCount: number;
  planAttachmentCount: number;
  canReplacePdf: boolean;
  isActiveVersion: boolean;
  canPublishVersion: boolean;
  releases: Array<{
    versionId: string;
    editionId: string;
    versionNumber: number;
    editionLabel: string;
    revisionNumber: number;
    releaseStatus: string;
    analysisStatus: string;
    pageCount: number;
    createdAt: string;
    publishedAt: string | null;
    changeNotes: string | null;
  }>;
};

export type AdminNativeWorkbookBundle = NativeWorkbookCatalogItem & {
  active: boolean;
  createdAt: string;
};

export type PurchasedNativeWorkbook = {
  purchaseId: string;
  purchasedAt: string;
  workbookId: string;
  slug: string;
  title: string;
  subjectLabel: string;
  gradeMin: number;
  gradeMax: number;
  description: string;
  versionId: string;
  pageCount: number;
  thumbnailUrl: string | null;
};

export async function getNativeWorkbookNavigation(userId: string) {
  const params = new URLSearchParams({ userId });
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/native-workbooks/navigation?${params}`, { cache: "no-store" }),
    "Could not load account navigation."
  );
  return response.json() as Promise<{ isAdmin: boolean; purchasedWorkbookCount: number }>;
}

export async function listNativeWorkbookCatalog(input: {
  userId?: string | null;
  profileId?: string | null;
  grade?: number | null;
  subject?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.userId) params.set("userId", input.userId);
  if (input.profileId) params.set("profileId", input.profileId);
  if (input.grade != null) params.set("grade", String(input.grade));
  if (input.subject) params.set("subject", input.subject);
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/native-workbooks/catalog?${params}`, { cache: "no-store" }),
    "Could not load the bookstore."
  );
  return response.json() as Promise<{ workbooks: NativeWorkbookCatalogItem[] }>;
}

export async function getNativeWorkbookProduct(input: { slug: string; userId?: string | null }) {
  const params = new URLSearchParams({ slug: input.slug });
  if (input.userId) params.set("userId", input.userId);
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/native-workbooks/product?${params}`, { cache: "no-store" }),
    "Could not load the workbook."
  );
  return response.json() as Promise<NativeWorkbookCatalogItem>;
}

export async function getNativeWorkbookPlanningPreview(input: {
  userId: string;
  learningYearId: string;
  documentId: string;
}) {
  const params = new URLSearchParams(input);
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/native-workbooks/planning-preview?${params}`, { cache: "no-store" }),
    "Could not load the indexed workbook lessons."
  );
  return response.json() as Promise<NativeWorkbookPlanningPreview>;
}

export async function downloadNativeWorkbookLessonPreview(input: {
  userId: string;
  learningYearId: string;
  documentId: string;
  learningUnitId: string;
}) {
  const params = new URLSearchParams(input);
  return requireOk(
    await backendFetch(`${getBackendUrl()}/internal/native-workbooks/lesson-preview?${params}`, { cache: "no-store" }),
    "Could not build the indexed lesson preview."
  );
}

export async function listAdminNativeWorkbooks(userId: string) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/native-workbooks/admin?userId=${encodeURIComponent(userId)}`, { cache: "no-store" }),
    "Could not load workbook administration."
  );
  return response.json() as Promise<{
    workbooks: AdminNativeWorkbook[];
    bundles: AdminNativeWorkbookBundle[];
    subjects: CurriculumSubjectOption[];
  }>;
}

export function prepareNativeWorkbookBundle(input: Record<string, unknown>) {
  return postJson<{ bundleId: string; thumbnailUploadUrl: string }>(
    "/internal/native-workbooks/admin/bundles/prepare",
    input,
    "Could not prepare the workbook bundle."
  );
}

export function completeNativeWorkbookBundle(input: Record<string, unknown>) {
  return postJson<{ created: boolean; bundleId: string }>(
    "/internal/native-workbooks/admin/bundles/complete",
    input,
    "Could not complete the workbook bundle."
  );
}

export function prepareNativeWorkbookBundleThumbnail(input: Record<string, unknown>) {
  return postJson<{ bundleId: string; thumbnailObjectPath: string; thumbnailUploadUrl: string }>(
    "/internal/native-workbooks/admin/bundles/thumbnail/prepare",
    input,
    "Could not prepare the replacement bundle thumbnail."
  );
}

export function discardNativeWorkbookBundleThumbnail(input: Record<string, unknown>) {
  return postJson<{ discarded: boolean }>(
    "/internal/native-workbooks/admin/bundles/thumbnail/discard",
    input,
    "Could not discard the replacement bundle thumbnail."
  );
}

export function updateNativeWorkbookBundle(input: Record<string, unknown>) {
  return postJson<{
    bundleId: string;
    title: string;
    priceInCents: number;
    currencyCode: string;
    memberCount: number;
    stripeUpdated: boolean;
  }>(
    "/internal/native-workbooks/admin/bundles/update",
    input,
    "Could not update the workbook bundle."
  );
}

export function discardNativeWorkbookBundle(input: Record<string, unknown>) {
  return postJson<{ discarded: boolean }>(
    "/internal/native-workbooks/admin/bundles/discard",
    input,
    "Could not discard the workbook bundle."
  );
}

export function setNativeWorkbookBundlePublished(input: Record<string, unknown>) {
  return postJson<{ active: boolean }>(
    "/internal/native-workbooks/admin/bundles/visibility",
    input,
    "Could not update workbook bundle visibility."
  );
}

export function setNativeWorkbookBundleRecommended(input: Record<string, unknown>) {
  return postJson<{ isRecommendedCurriculum: boolean; recommendedGradeLevel: number | null }>(
    "/internal/native-workbooks/admin/bundles/recommendation",
    input,
    "Could not update the recommended curriculum."
  );
}

export async function prepareNativeWorkbookUpload(input: Record<string, unknown>) {
  const response = await requireOk(await backendFetch(`${getBackendUrl()}/internal/native-workbooks/admin/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  }), "Could not prepare the workbook upload.");
  return response.json() as Promise<{
    workbookId: string;
    versionId: string;
    pdfUploadUrl: string;
  }>;
}

async function postJson<T>(path: string, input: Record<string, unknown>, fallback: string) {
  const response = await requireOk(await backendFetch(`${getBackendUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  }), fallback);
  return response.json() as Promise<T>;
}

export function completeNativeWorkbookUpload(input: Record<string, unknown>) {
  return postJson<{ queued: boolean }>("/internal/native-workbooks/admin/complete", input, "Could not complete the workbook upload.");
}

export function discardNativeWorkbookUpload(input: Record<string, unknown>) {
  return postJson<{ discarded: boolean }>("/internal/native-workbooks/admin/discard", input, "Could not discard the incomplete workbook upload.");
}

export function prepareNativeWorkbookReplacement(input: Record<string, unknown>) {
  return postJson<{ workbookId: string; versionId: string; pdfUploadUrl: string }>(
    "/internal/native-workbooks/admin/replacement/prepare",
    input,
    "Could not prepare the replacement PDF upload."
  );
}

export function completeNativeWorkbookReplacement(input: Record<string, unknown>) {
  return postJson<{ queued: boolean }>(
    "/internal/native-workbooks/admin/replacement/complete",
    input,
    "Could not complete the replacement PDF upload."
  );
}

export function discardNativeWorkbookReplacement(input: Record<string, unknown>) {
  return postJson<{ discarded: boolean }>(
    "/internal/native-workbooks/admin/replacement/discard",
    input,
    "Could not discard the replacement PDF upload."
  );
}

export function prepareNativeWorkbookEdition(input: Record<string, unknown>) {
  return postJson<{ workbookId: string; editionId: string; versionId: string; pdfUploadUrl: string }>(
    "/internal/native-workbooks/admin/editions/prepare",
    input,
    "Could not prepare the new workbook edition."
  );
}

export function completeNativeWorkbookEdition(input: Record<string, unknown>) {
  return postJson<{ queued: boolean; workbookId: string; versionId: string }>(
    "/internal/native-workbooks/admin/editions/complete",
    input,
    "Could not complete the new-edition upload."
  );
}

export function discardNativeWorkbookEdition(input: Record<string, unknown>) {
  return postJson<{ discarded: boolean }>(
    "/internal/native-workbooks/admin/editions/discard",
    input,
    "Could not discard the new-edition upload."
  );
}

export function deleteNativeWorkbook(input: Record<string, unknown>) {
  return postJson<{ deleted: boolean }>("/internal/native-workbooks/admin/delete", input, "Could not delete the workbook.");
}

export function updateNativeWorkbookDetails(input: Record<string, unknown>) {
  return postJson<{ workbookId: string; title: string; priceInCents: number; currencyCode: string; stripeUpdated: boolean }>(
    "/internal/native-workbooks/admin/details",
    input,
    "Could not update the workbook details."
  );
}

export function retryNativeWorkbookIndexing(input: Record<string, unknown>) {
  return postJson<{ queued: boolean }>("/internal/native-workbooks/admin/retry", input, "Could not retry workbook indexing.");
}

export function publishNativeWorkbook(input: Record<string, unknown>) {
  return postJson<{ published: boolean }>("/internal/native-workbooks/admin/publish", input, "Could not publish the workbook.");
}

export function setNativeWorkbookPublished(input: Record<string, unknown>) {
  return postJson<{ active: boolean }>("/internal/native-workbooks/admin/visibility", input, "Could not update workbook visibility.");
}

export function attachNativeWorkbook(input: { userId: string; workbookId: string; learningYearId: string }) {
  return postJson<{ attached: boolean; alreadyAttached: boolean; documentId: string; attachedCount?: number; curriculumCompletenessResult?: CurriculumCompletenessResult | null }>(
    "/internal/native-workbooks/attach",
    input,
    "Could not add the workbook to this learning year."
  );
}

export function upgradeNativeWorkbookEdition(input: {
  userId: string;
  learningYearId: string;
  documentId: string;
}) {
  return postJson<{
    upgraded: boolean;
    documentId: string;
    versionId: string;
    editionLabel: string;
    planningStarted: boolean;
    planningMessage: string | null;
  }>(
    "/internal/native-workbooks/edition-upgrade",
    input,
    "Could not update the workbook edition."
  );
}

export function createNativeWorkbookCheckout(input: {
  userId?: string | null;
  email?: string | null;
  workbookId: string;
  successUrl: string;
  cancelUrl: string;
  addToLearningYearId?: string | null;
  funnelKey?: string | null;
}) {
  return postJson<{ id: string; url: string | null }>(
    "/internal/native-workbooks/checkout",
    input,
    "Could not start workbook checkout."
  );
}

export function createNativeWorkbookCartCheckout(input: {
  userId?: string | null;
  email?: string | null;
  workbookIds: string[];
  successUrl: string;
  cancelUrl: string;
}) {
  return postJson<{ id: string; url: string | null }>(
    "/internal/native-workbooks/cart-checkout",
    input,
    "Could not start cart checkout."
  );
}

export async function listPurchasedNativeWorkbooks(userId: string) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/native-workbooks/purchased?userId=${encodeURIComponent(userId)}`, { cache: "no-store" }),
    "Could not load purchased workbooks."
  );
  return response.json() as Promise<{ workbooks: PurchasedNativeWorkbook[] }>;
}

export async function proxyNativeWorkbookDownload(input: {
  token?: string | null;
  userId?: string | null;
  purchaseId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.token) params.set("token", input.token);
  if (input.userId) params.set("userId", input.userId);
  if (input.purchaseId) params.set("purchaseId", input.purchaseId);
  return requireOk(
    await backendFetch(`${getBackendUrl()}/internal/native-workbooks/download?${params}`, { cache: "no-store" }),
    "Could not download the workbook."
  );
}
