import { backendFetch } from "../backend/server";
import type { CurriculumCompletenessResult } from "../curriculum-completeness/server";
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

export type PlanPackDraft = {
  studentName?: string | null;
  studentGradeLevel?: number | null;
  learningYearTitle?: string | null;
  holidayWeeks?: number | null;
  teachingDaysPerWeek: number;
  startDate?: string | null;
  endDate?: string | null;
  preferredPrintPageSize: PrintPageSize;
  totalWeeks: number;
  nativeCatalogItemIds: string[];
  subjects: Array<{
    materialSetId: string;
    prerequisiteMaterialSetId?: string | null;
    subjectLabel: string;
    documentRole: string;
    parentNotes?: string | null;
    daysPerWeek?: number | null;
  }>;
};

export async function getPlanPackPricing() {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/pricing`, { cache: "no-store" }),
    "Failed to load lesson-plan pricing."
  );
  return response.json() as Promise<{
    currencyCode: string;
    planPackPriceInCents: number;
    subscriptionIntroPriceInCents: number;
    subscriptionMonthlyPriceInCents: number;
    subscriptionYearlyPriceInCents: number;
    subscriptionPlanTier: "single";
    includedStudentCount: number;
    additionalStudentIntroPriceInCents: number;
    additionalStudentMonthlyPriceInCents: number;
    introductoryPlanGenerationLimit: number;
  }>;
}

export type PlanPackStatus = {
  intakeId: string;
  email: string;
  status: string;
  lastError: string | null;
  draft: PlanPackDraft;
  studentProfileId: string | null;
  learningYearId: string | null;
  activeDocumentCount: number;
  canAdjustPlan: boolean;
  documents: Array<{
    id: string;
    label: string;
    subjectLabel: string | null;
    analysisStatus: string;
    sourceKind: string;
    pageCount: number;
  }>;
  planning: {
    total: number;
    queued: number;
    running: number;
    qualityChecking: number;
    completed: number;
    failed: number;
    active: number;
  };
  weeks: Array<{
    id: string;
    weekNumber: number;
    title: string;
    summary: string | null;
    status: string;
    itemCount: number;
    dayCount: number;
    pageCount: number;
    shrunkenPageCount: number;
    restoredPageCount: number;
    reducibleRangeCount: number;
    excludedRangeCount: number;
    canShrink: boolean;
    isShrunk: boolean;
  }>;
};

export async function createPlanPackIntake(input: {
  email: string;
  draft: PlanPackDraft;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to create printable pack setup."
  );

  return (await response.json()) as {
    intakeId: string;
    email: string;
    provisionalUserId: string;
    accountId: string;
    draft: PlanPackDraft;
  };
}

export async function createPlanPackCheckout(input: {
  intakeId: string;
  successUrl: string;
  cancelUrl: string;
  checkoutKind?: "one_time" | "subscription";
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to create Stripe checkout session."
  );

  return (await response.json()) as {
    id: string;
    url: string | null;
  };
}

export async function getPlanPackStatus(input: {
  intakeId: string;
  checkoutSessionId: string;
}) {
  const params = new URLSearchParams({
    intakeId: input.intakeId,
    checkoutSessionId: input.checkoutSessionId
  });
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/status?${params.toString()}`, {
      cache: "no-store"
    }),
    "Failed to load printable pack status."
  );

  return (await response.json()) as PlanPackStatus;
}

export async function evaluatePlanPackCurriculum(input: {
  intakeId: string;
  checkoutSessionId: string;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/curriculum-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, action: "evaluate" }),
      cache: "no-store"
    }),
    "Could not review the curriculum."
  );
  return (await response.json()) as CurriculumCompletenessResult;
}

export async function approvePlanPackCurriculum(input: {
  intakeId: string;
  checkoutSessionId: string;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/curriculum-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, action: "approve" }),
      cache: "no-store"
    }),
    "Could not start plan generation."
  );
  return response.json();
}

export async function attachPlanPackNativeWorkbook(input: {
  intakeId: string;
  checkoutSessionId: string;
  workbookId: string;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/native-workbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Could not add the workbook to this plan."
  );
  return response.json();
}

export async function setPlanPackWeekCompression(input: {
  intakeId: string;
  checkoutSessionId: string;
  weeklyPlanId: string;
  compressed: boolean;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/week/practice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Failed to adjust weekly practice pages."
  );
  return response.json();
}

export async function completePlanPackUpload(input: {
  intakeId: string;
  checkoutSessionId: string;
  draft: PlanPackDraft;
  files: Array<{
    subjectIndex: number;
    file: File;
  }>;
}) {
  const formData = new FormData();
  formData.set("intakeId", input.intakeId);
  formData.set("checkoutSessionId", input.checkoutSessionId);
  formData.set("draft", JSON.stringify(input.draft));
  formData.set(
    "fileDescriptors",
    JSON.stringify(input.files.map((file) => ({ subjectIndex: file.subjectIndex })))
  );
  for (const file of input.files) {
    formData.append("files", file.file);
  }

  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/complete`, {
      method: "POST",
      body: formData,
      cache: "no-store"
    }),
    "Failed to upload curriculum PDFs."
  );

  return response.json();
}

export async function preparePlanPackUploads(input: {
  intakeId: string;
  checkoutSessionId: string;
  files: Array<{ subjectIndex: number; fileIndex: number; filename: string; mimeType: string; size: number }>;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/uploads/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Could not prepare curriculum uploads."
  );
  return response.json() as Promise<Array<{
    subjectIndex: number;
    fileIndex: number;
    filename: string;
    contentType: string;
    size: number;
    objectPath: string;
    uploadUrl: string;
  }>>;
}

export async function completePlanPackStagedUpload(input: {
  intakeId: string;
  checkoutSessionId: string;
  draft: PlanPackDraft;
  files: Array<{ subjectIndex: number; fileIndex: number; filename: string; mimeType: string; objectPath: string }>;
}) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/uploads/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store"
    }),
    "Could not complete curriculum uploads."
  );
  return response.json();
}

export async function downloadPlanPackPacket(input: {
  intakeId: string;
  checkoutSessionId: string;
  weeklyPlanId: string;
  format?: "week" | "days";
  layout?: "standard" | "two-up";
  omitFullSizePages?: boolean;
}) {
  const params = new URLSearchParams({
    intakeId: input.intakeId,
    checkoutSessionId: input.checkoutSessionId,
    weeklyPlanId: input.weeklyPlanId,
    ...(input.format ? { format: input.format } : {}),
    ...(input.layout === "two-up" ? { layout: input.layout } : {}),
    ...(input.layout === "two-up" && input.omitFullSizePages ? { omitFullSizePages: "1" } : {}),
  });
  return requireOk(
    await backendFetch(`${getBackendUrl()}/internal/plan-pack/packet?${params.toString()}`, {
      cache: "no-store"
    }),
    "Failed to build weekly PDF."
  );
}
