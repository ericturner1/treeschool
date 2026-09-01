import { backendFetch } from "../backend/server";
import type { PrintPageSize } from "../print-page-sizes";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

async function requireOk(response: Response, fallback: string) {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? fallback);
  }
  return response;
}

export type PaperPlanDocument = {
  id: string;
  materialSetId: string;
  prerequisiteMaterialSetId: string | null;
  label: string;
  subjectId: string | null;
  subjectLabel: string | null;
  documentRole: "student" | "teacher" | "answer_key" | "mixed";
  originalFilename: string;
  mimeType: string;
  sourceKind: "pdf" | "text" | "image" | "native_workbook";
  nativeWorkbookVersionId?: string | null;
  editionUpdate: {
    workbookId: string;
    currentVersionId: string;
    currentEditionLabel: string;
    latestVersionId: string;
    latestEditionLabel: string;
    latestRevisionNumber: number;
    latestPageCount: number;
  } | null;
  sizeBytes: number;
  pageCount: number;
  parentNotes: string | null;
  subjectDaysPerWeek: number | null;
  analysisStatus: "pending" | "queued" | "analyzing" | "ready" | "failed";
  analysisJson: {
    summary?: string;
    error?: string;
    analysisMethod?: "pdf_outline" | "table_of_contents" | "full_document" | "uploaded_file";
    isSupplemental?: boolean;
    sections?: Array<{
      title: string;
      startPage: number;
      endPage: number;
      estimatedMinutes: number;
      notes: string;
    }>;
  };
};

export type PaperPlanWeek = {
  id: string;
  weekNumber: number;
  title: string;
  summary: string | null;
  status: "planned" | "in_progress" | "completed" | "skipped";
  downloaded: boolean;
  preservedForReplan: boolean;
  pdfQualityStatus: "unverified" | "passed";
  pdfPageCount: number | null;
  grade: number | null;
  parentNotes: string | null;
  items: Array<{
    id: string;
    documentId: string;
    documentLabel: string;
    subjectId: string | null;
    subjectLabel: string | null;
    firstPageIndex: number;
    lastPageIndex: number;
    label: string;
    dayLabel: string | null;
    dayNumber: number | null;
    pageRangeCategory: string;
    conceptLabels: string[];
    conceptRedundant: boolean;
    redundancyReason: string | null;
    sourceUnitId: string | null;
    sourceUnitPartIndex: number | null;
    baseIncludedInPacket: boolean;
    includedInPacket: boolean;
    lessonDisposition: "include" | "already_mastered" | "save_for_later" | "remove";
    sortOrder: number;
  }>;
  days: Array<{
    dayNumber: number;
    status: "not_started" | "in_progress" | "completed";
    attendanceProgress: number;
    attendanceLogged: boolean;
    attendanceLoggedToday: boolean;
    attendedSubjectKeys: string[];
    attendanceDates: string[];
    subjects: Array<{
      subjectKey: string;
      subjectId: string | null;
      subjectLabel: string;
      title: string;
      assessmentRecommended: boolean;
      grade: number | null;
      items: PaperPlanWeek["items"];
    }>;
  }>;
  scheduledDayCount: number;
  attendedDayCount: number;
  attendanceProgress: number;
  subjectGrades: Array<{
    subjectKey: string;
    subjectId: string | null;
    subjectLabel: string;
    planTitle: string | null;
    grade: number | null;
  }>;
};

export async function setLessonDisposition(input: {
  parentUserId: string;
  weeklyPlanItemId: string;
  disposition: "include" | "already_mastered" | "save_for_later" | "remove";
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/paper-plan/lesson-disposition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  await requireOk(response, "Failed to update the lesson.");
  return response.json();
}

export type PaperPlan = {
  permissions: {
    accountRole: "OWNER" | "ADMIN" | "TEACHER";
    canManagePlan: boolean;
    canRecordLearning: boolean;
  };
  materialsChanged: boolean;
  recovery: {
    available: boolean;
    restoreUntil: string | null;
  };
  regenerationAllowance: {
    source: "subscription" | "plan_pack";
    periodKey: string | null;
    limit: number;
    used: number;
    remaining: number;
    resetsAt: string | null;
    introductoryMonth: boolean;
  };
  year: {
    id: string;
    profileId: string;
    title: string;
    totalWeeks: number;
    teachingDaysPerWeek: number | null;
    printPageSize: PrintPageSize;
    startDate: string | null;
    endDate: string | null;
    status: "draft" | "planning" | "quality_check" | "planned" | "planning_failed";
    materialsUpdatedAt: string;
    lastPlannedAt: string | null;
  } | null;
  subjectOptions: Array<{
    kind: "system" | "custom";
    id: string;
    label: string;
  }>;
  documents: PaperPlanDocument[];
  planning: {
    total: number;
    queued: number;
    running: number;
    qualityChecking: number;
    completed: number;
    failed: number;
    qualityControlFailed: boolean;
    runningWeekNumbers?: number[];
    qualityCheckingWeekNumbers?: number[];
    nextQueuedWeekNumber?: number | null;
    lastCompletedWeekNumber?: number | null;
    active: number;
  };
  weeks: PaperPlanWeek[];
};

export async function getPaperPlan(input: {
  parentUserId: string;
  profileId: string;
}) {
  const params = new URLSearchParams(input);
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan?${params.toString()}`, {
      cache: "no-store"
    }),
    "Failed to load learning plan."
  );
  return (await response.json()) as PaperPlan;
}

export async function createPaperLearningYear(input: {
  parentUserId: string;
  profileId: string;
  title: string;
  totalWeeks: number;
  startDate?: string;
  endDate?: string;
  teachingDaysPerWeek?: number | null;
  printPageSize?: PrintPageSize | string | null;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/year`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to create learning year."
  );
  return response.json();
}

export async function updatePaperLearningYear(input: {
  parentUserId: string;
  learningYearId: string;
  totalWeeks: number;
  startDate?: string | null;
  endDate?: string | null;
  teachingDaysPerWeek?: number | null;
  printPageSize?: PrintPageSize | string | null;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/year`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to update plan details."
  );
  return response.json();
}

export async function uploadPaperPlanDocument(input: {
  parentUserId: string;
  learningYearId: string;
  label: string;
  subjectId?: string | null;
  subjectLabel?: string | null;
  documentRole: string;
  parentNotes?: string | null;
  subjectDaysPerWeek?: number | null;
  clientUploadId?: string | null;
  materialSetId?: string | null;
  prerequisiteMaterialSetId?: string | null;
  files: File[];
}) {
  const formData = new FormData();
  formData.set("parentUserId", input.parentUserId);
  formData.set("learningYearId", input.learningYearId);
  formData.set("label", input.label);
  if (input.subjectId) {
    formData.set("subjectId", input.subjectId);
  }
  if (input.subjectLabel) {
    formData.set("subjectLabel", input.subjectLabel);
  }
  formData.set("documentRole", input.documentRole);
  if (input.parentNotes) {
    formData.set("parentNotes", input.parentNotes);
  }
  if (input.subjectDaysPerWeek) {
    formData.set("subjectDaysPerWeek", String(input.subjectDaysPerWeek));
  }
  if (input.clientUploadId) {
    formData.set("clientUploadId", input.clientUploadId);
  }
  if (input.materialSetId) {
    formData.set("materialSetId", input.materialSetId);
  }
  if (input.prerequisiteMaterialSetId) {
    formData.set("prerequisiteMaterialSetId", input.prerequisiteMaterialSetId);
  }
  for (const file of input.files) {
    formData.append("files", file);
  }
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/documents`, {
      method: "POST",
      body: formData,
      cache: "no-store"
    }),
    "Failed to upload curriculum files."
  );
  return response.json();
}

export async function startPaperPlanPlanning(input: {
  parentUserId: string;
  learningYearId: string;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to start planning the year."
  );
  return response.json();
}

export async function retryFailedPaperPlanPlanning(input: {
  parentUserId: string;
  learningYearId: string;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to retry the unfinished week."
  );
  return response.json();
}

export async function deletePaperPlanDocument(input: {
  parentUserId: string;
  documentId: string;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/documents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to remove curriculum file."
  );
  return response.json();
}

export async function updatePaperPlanDocument(input: {
  parentUserId: string;
  documentId: string;
  label: string;
  subjectLabel?: string | null;
  parentNotes?: string | null;
  subjectDaysPerWeek?: number | null;
  prerequisiteMaterialSetId?: string | null;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/documents`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to update curriculum material."
  );
  return response.json();
}

export async function restorePreviousPaperPlan(input: {
  parentUserId: string;
  learningYearId: string;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to restore the previous plan."
  );
  return response.json();
}

export async function savePaperPlanDaySubjectGrade(input: {
  parentUserId: string;
  weeklyPlanId: string;
  dayNumber: number;
  subjectKey: string;
  score: number | null;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/day-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to save grade."
  );
  return response.json();
}

export async function setPaperPlanWeekCompression(input: {
  parentUserId: string;
  weeklyPlanId: string;
  compressed: boolean;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/week/practice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to adjust weekly practice pages."
  );
  return response.json();
}

export async function downloadPaperPlanPacket(input: {
  parentUserId: string;
  weeklyPlanId: string;
  format?: "week" | "days";
  layout?: "standard" | "two-up";
  omitFullSizePages?: boolean;
}) {
  const params = new URLSearchParams({
    parentUserId: input.parentUserId,
    weeklyPlanId: input.weeklyPlanId,
    ...(input.format ? { format: input.format } : {}),
    ...(input.layout === "two-up" ? { layout: input.layout } : {}),
    ...(input.layout === "two-up" && input.omitFullSizePages ? { omitFullSizePages: "1" } : {}),
  });
  return requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/packet?${params.toString()}`, {
      cache: "no-store"
    }),
    "Failed to build weekly PDF."
  );
}

export async function downloadPaperPlanLessonPreview(input: {
  parentUserId: string;
  weeklyPlanItemId: string;
  documentId?: string | null;
  sourceUnitId?: string | null;
  lessonLabel?: string | null;
  firstPageIndex?: string | null;
  lastPageIndex?: string | null;
}) {
  const params = new URLSearchParams({
    parentUserId: input.parentUserId,
    weeklyPlanItemId: input.weeklyPlanItemId
  });
  if (input.documentId) params.set("documentId", input.documentId);
  if (input.sourceUnitId) params.set("sourceUnitId", input.sourceUnitId);
  if (input.lessonLabel) params.set("lessonLabel", input.lessonLabel);
  if (input.firstPageIndex) params.set("firstPageIndex", input.firstPageIndex);
  if (input.lastPageIndex) params.set("lastPageIndex", input.lastPageIndex);
  return requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/lesson-preview?${params.toString()}`, {
      cache: "no-store"
    }),
    "Failed to build the lesson preview."
  );
}

export async function downloadWeeklyPlanManifest(input: {
  parentUserId: string;
  weeklyPlanId: string;
}) {
  const params = new URLSearchParams(input);
  return requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/manifest?${params.toString()}`, {
      cache: "no-store"
    }),
    "Failed to build the weekly plan manifest."
  );
}

export async function getPaperPlanQrDestination(input: {
  parentUserId: string;
  weeklyPlanId: string;
}) {
  const params = new URLSearchParams(input);
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/paper-plan/qr-destination?${params.toString()}`, {
      cache: "no-store"
    }),
    "This lesson-plan day could not be opened."
  );
  return response.json() as Promise<{
    profileId: string;
    profileSlug?: string | null;
    weeklyPlanId: string;
    weekNumber: number;
  }>;
}
