import {
  attendanceEntrySubjects,
  attendanceEntries,
  contentDocuments,
  curriculumNodes,
  learningYearMaterialSets,
  learningYearSubjectPreferences,
  learningYears,
  modelUsageEvents,
  nativeWorkbookVersions,
  nativeWorkbooks,
  paperDocumentJobs,
  planGenerationDiagnostics,
  planGenerationEvents,
  planPackIntakes,
  planVersions,
  planVersionWeeks,
  profiles,
  studentLessonDispositions,
  studentWorkbookUnitProgress,
  weeklyPlanJobs,
  weeklyPlanDayPdfAssets,
  weeklyPlanDaySubjectGrades,
  weeklyPlanItems,
  weeklyPlanPdfAssets,
  weeklyPlanSubjectGrades,
  weeklyPlans
} from "ts-db";
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/pdf";
import QRCode from "qrcode";
import { db, env } from "../db";
import { deletePrivateFile, downloadPrivateFile, uploadPrivateFile } from "./media";
import { notifyOperationsFailure } from "./operations";
import {
  applyCurriculumCoverageProfiles,
  evaluateCurriculumCompleteness,
  parsePersistedCurriculumCompletenessResult
} from "./curriculum-completeness";
import type { CurriculumCoverageProfile } from "./curriculum-coverage";
import { normalizeGeminiUsage } from "./model-providers/gemini-usage";
import {
  recordModelUsage,
  summarizeModelUsage,
  type ModelUsageContext
} from "./model-usage";
import { recordTeacherGradeActivity } from "./teacher-activity";
import {
  buildPageNumberMappingFromPdfLabels,
  buildPageNumberMappingFromObservedPoints,
  contentPageNumberToPdfPageNumber,
  createPageSelectionAudit,
  normalizePageNumberMapping,
  pdfPageNumberToContentPageNumber,
  type PageNumberMapping,
  type PageSelectionAudit
} from "./pdf-page-numbers";
import {
  finishPlanGenerationEvent,
  getPlanRegenerationAllowance,
  getPremiumFeatureAccess,
  reservePlanGeneration
} from "./entitlements";
import {
  getAccountPreferences,
  normalizePrintPageSize,
  setAccountPrintPageSize,
  type PrintPageSize
} from "./preferences";
import {
  buildDeterministicPlanSchedule,
  DETERMINISTIC_SCHEDULING_ALGORITHM_VERSION
} from "./deterministic-plan-scheduler";
import {
  clearWorkbookUnitProgress,
  loadWorkbookProgressByDocument,
  upsertWorkbookUnitProgress
} from "./student-workbook-progress";
import { requireAccountRole } from "./accounts";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_INPUT_PDF_PAGES = 2000;
const INPUT_PDF_CAPACITY_ERROR = "This lesson plan contains too much material to process at once. Remove one or more workbooks, or split the curriculum into separate plans.";
const MAX_GEMINI_PDF_BYTES = 50 * 1024 * 1024;
const MAX_GEMINI_PDF_PAGES = 1000;
const TOC_SCAN_PAGE_LIMIT = 20;
const MAX_DOCUMENT_JOB_ATTEMPTS = 3;
const MAX_WEEKLY_PLAN_JOB_ATTEMPTS = 3;
const METADATA_QUALITY_ALGORITHM_VERSION = 2;
const PDF_QUALITY_REPORT_VERSION = 1;
const WEEKLY_PACKET_TEMPLATE_VERSION = 5;
const DAY_PACKET_TEMPLATE_VERSION = 4;
const MIN_RENDERED_PAGE_DARK_PIXEL_RATIO = 0.00075;
const OVERSIZED_WEEK_SOURCE_PAGE_THRESHOLD = 20;
const ALLOWED_ROLES = new Set(["student", "teacher", "answer_key", "mixed"]);
const PAGE_RANGE_CATEGORIES = new Set([
  "instruction",
  "guided_practice",
  "independent_practice",
  "review",
  "assessment",
  "reference",
  "teacher_support",
  "answer_key",
  "mixed",
  "other"
]);
const CONTENT_CATEGORIES = new Set([
  "concept_introduction",
  "concept_practice",
  "worked_example",
  "quiz",
  "assessment",
  "review",
  "answer_key",
  "supporting_content",
  "teacher_guidance",
  "mixed_teaching",
  "table_of_contents",
  "workbook_cover",
  "publishing_page",
  "empty_page",
  "academic_citation",
  "unclear"
]);

function safeDownloadFilenameStem(value: string, fallback = "student") {
  const stem = value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return stem || fallback;
}

const DESIRABLE_CONTENT_CATEGORIES = new Set([
  "concept_introduction",
  "concept_practice",
  "worked_example",
  "quiz",
  "assessment",
  "review",
  "answer_key",
  "supporting_content",
  "teacher_guidance",
  "mixed_teaching"
]);
const PRINT_PAGE_DIMENSIONS: Record<PrintPageSize, readonly [number, number]> = {
  letter: [612, 792],
  a4: [595.28, 841.89],
  legal: [612, 1008]
};

type SourceKind = "pdf" | "text" | "image";

type UploadedFileKind = {
  sourceKind: SourceKind;
  contentType: string;
};

type PaperDocumentJobRow = {
  id: string;
  documentId: string;
  status: "queued" | "running" | "retry_wait" | "failed" | "completed";
  attemptCount: number;
  availableAt: Date;
  claimedAt: Date | null;
  heartbeatAt: Date | null;
  workerId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type WeeklyPlanJobRow = {
  id: string;
  learningYearId: string;
  planVersionId: string | null;
  weekNumber: number;
  status: "queued" | "running" | "retry_wait" | "failed" | "completed";
  attemptCount: number;
  availableAt: Date;
  claimedAt: Date | null;
  heartbeatAt: Date | null;
  workerId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentAnalysis = {
  structureVersion?: number;
  suggestedTitle: string;
  summary: string;
  audience: "student" | "teacher" | "answer_key" | "mixed";
  analysisMethod?: "pdf_outline" | "table_of_contents" | "full_document" | "uploaded_file";
  academicLevel?: AcademicLevelEvidence | null;
  pageNumberMapping?: PageNumberMapping | null;
  pageNumberDetectionAudit?: NonNullable<PageNumberMapping["detectionAudit"]>;
  classificationVersion?: number;
  classificationSummary?: {
    keptRangeCount: number;
    filteredRangeCount: number;
    keptPdfPageCount: number;
    filteredPdfPageCount: number;
  };
  pageLedger?: DocumentPageLedgerEntry[];
  learningUnits?: DocumentLearningUnit[];
  documentQuality?: {
    status: "passed" | "rejected";
    checks: Record<string, boolean>;
    reasons: string[];
  };
  sections: Array<{
    title: string;
    startPage: number;
    endPage: number;
    estimatedMinutes: number;
    notes: string;
    category: ContentCategory;
    includeInPlan: boolean;
    classificationConfidence: "low" | "medium" | "high";
    exclusionReason: string | null;
    supportScope?: SupportScope;
    boundaryConfidence?: "low" | "medium" | "high";
    boundaryEvidence?: BoundaryEvidence[];
    pageSelectionAudit: PageSelectionAudit;
  }>;
};

type ContentCategory =
  | "concept_introduction"
  | "concept_practice"
  | "worked_example"
  | "quiz"
  | "assessment"
  | "review"
  | "answer_key"
  | "supporting_content"
  | "teacher_guidance"
  | "mixed_teaching"
  | "table_of_contents"
  | "workbook_cover"
  | "publishing_page"
  | "empty_page"
  | "academic_citation"
  | "unclear";

type AcademicLevelEvidence = {
  label: string;
  gradeMin: number | null;
  gradeMax: number | null;
  evidence: string[];
  confidence: "low" | "medium" | "high";
};

type SupportScope = "unit" | "global" | "parent_guidance" | null;
type LearningUnitPageRole =
  | "instruction"
  | "passage"
  | "worked_example"
  | "practice"
  | "assessment"
  | "answer_key"
  | "teacher_support"
  | "reference";

type BoundaryEvidence = {
  source: "pdf_outline" | "table_of_contents" | "printed_page_mapping" | "title_match" | "page_semantics" | "full_document_analysis";
  pdfPageNumber: number;
  detail: string;
  confidence: "low" | "medium" | "high";
};

type DocumentPageLedgerEntry = {
  pdfPageNumber: number;
  contentPageLabel: string | null;
  contentPageNumber: number | null;
  titleEvidence: string[];
  category: ContentCategory;
  supportScope: SupportScope;
  includeInPlan: boolean;
  learningUnitId: string | null;
  roleWithinUnit: LearningUnitPageRole | null;
  classificationConfidence: "low" | "medium" | "high";
  boundaryEvidence: BoundaryEvidence[];
  pageNumberConversionAudit: PageSelectionAudit;
};

type DocumentLearningUnit = {
  id: string;
  title: string;
  sequenceOrder: number;
  components: Array<{
    pdfPageStart: number;
    pdfPageEnd: number;
    category: ContentCategory;
    role: LearningUnitPageRole;
    includeInPacket: boolean;
    pageNumberConversionAudit: PageSelectionAudit;
  }>;
  splittable: boolean;
  approvedSplitPoints: Array<{ afterComponentIndex: number; reason: string }>;
  estimatedMinutes: number;
  conceptLabels: string[];
  boundaryConfidence: "low" | "medium" | "high";
  boundaryEvidence: BoundaryEvidence[];
};

export function classifyPaperPlanUpload(filename: string, contentType = ""): UploadedFileKind | null {
  const normalizedName = filename.toLowerCase();
  const normalizedType = contentType.toLowerCase();

  if (normalizedType.includes("pdf") || normalizedName.endsWith(".pdf")) {
    return { sourceKind: "pdf", contentType: "application/pdf" };
  }

  if (
    normalizedType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(normalizedName)
  ) {
    const inferredType =
      normalizedType.startsWith("image/")
        ? normalizedType
        : normalizedName.endsWith(".png")
          ? "image/png"
          : normalizedName.endsWith(".webp")
            ? "image/webp"
            : normalizedName.endsWith(".gif")
              ? "image/gif"
              : "image/jpeg";
    return { sourceKind: "image", contentType: inferredType };
  }

  if (
    normalizedType.startsWith("text/") ||
    /\.(txt|md|markdown|csv|tsv)$/i.test(normalizedName)
  ) {
    const inferredType = normalizedType.startsWith("text/") ? normalizedType : "text/plain";
    return { sourceKind: "text", contentType: inferredType };
  }

  return null;
}

function isPrintablePdfDocument(document: { mimeType: string; sourceKind?: string | null }) {
  return document.sourceKind === "pdf" || document.mimeType.toLowerCase().includes("pdf");
}

async function assertLearningYearPdfPageCapacity(input: {
  learningYearId: string;
  additionalPageCount: number;
  excludeDocumentId?: string | null;
}) {
  const documents = await db.select({
    id: contentDocuments.id,
    sourceKind: contentDocuments.sourceKind,
    mimeType: contentDocuments.mimeType,
    pageCount: contentDocuments.pageCount
  }).from(contentDocuments).where(and(
    eq(contentDocuments.learningYearId, input.learningYearId),
    isNull(contentDocuments.removedAt)
  ));
  const currentPageCount = documents.reduce((total, document) =>
    document.id !== input.excludeDocumentId && isPrintablePdfDocument(document)
      ? total + Math.max(0, document.pageCount)
      : total, 0);
  const requestedPageCount = currentPageCount + Math.max(0, input.additionalPageCount);
  if (requestedPageCount > MAX_INPUT_PDF_PAGES) {
    throw new Error(INPUT_PDF_CAPACITY_ERROR);
  }
}

async function ensureMaterialSet(input: {
  learningYearId: string;
  materialSetId?: string | null;
  label: string;
  prerequisiteMaterialSetId?: string | null;
}) {
  const materialSetId = input.materialSetId?.trim() || crypto.randomUUID();
  if (input.prerequisiteMaterialSetId === materialSetId) {
    throw new Error("A material cannot be its own prerequisite.");
  }

  if (input.prerequisiteMaterialSetId) {
    const materialSets = await db.select({
      id: learningYearMaterialSets.id,
      prerequisiteMaterialSetId: learningYearMaterialSets.prerequisiteMaterialSetId
    })
      .from(learningYearMaterialSets)
      .where(eq(learningYearMaterialSets.learningYearId, input.learningYearId));
    const prerequisite = materialSets.find((materialSet) => materialSet.id === input.prerequisiteMaterialSetId);
    if (!prerequisite) {
      throw new Error("Choose a prerequisite material that was added earlier in this learning year.");
    }
    const prerequisiteById = new Map(
      materialSets.map((materialSet) => [materialSet.id, materialSet.prerequisiteMaterialSetId])
    );
    let cursor: string | null = input.prerequisiteMaterialSetId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === materialSetId) {
        throw new Error("This prerequisite would create a circular material sequence.");
      }
      if (visited.has(cursor)) {
        throw new Error("The existing material prerequisites contain a circular sequence.");
      }
      visited.add(cursor);
      cursor = prerequisiteById.get(cursor) ?? null;
    }
  }

  const [existing] = await db.select().from(learningYearMaterialSets)
    .where(eq(learningYearMaterialSets.id, materialSetId)).limit(1);
  if (existing && existing.learningYearId !== input.learningYearId) {
    throw new Error("This material identifier belongs to another learning year.");
  }
  if (existing) {
    const [updated] = await db.update(learningYearMaterialSets).set({
      label: input.label.trim() || existing.label,
      prerequisiteMaterialSetId: input.prerequisiteMaterialSetId || null,
      updatedAt: new Date()
    }).where(eq(learningYearMaterialSets.id, materialSetId)).returning();
    return updated;
  }

  const [created] = await db.insert(learningYearMaterialSets).values({
    id: materialSetId,
    learningYearId: input.learningYearId,
    label: input.label.trim() || "Teaching material",
    prerequisiteMaterialSetId: input.prerequisiteMaterialSetId || null
  }).returning();
  return created;
}

type PdfPageText = {
  pageIndex: number;
  label: string | null;
  text: string;
};

type PdfStructure = {
  method: "pdf_outline" | "table_of_contents";
  summary: string;
  sections: Array<{
    title: string;
    startPage: number;
    endPage: number;
    estimatedMinutes: number;
    notes: string;
    category?: ContentCategory;
    includeInPlan?: boolean;
    classificationConfidence?: "low" | "medium" | "high";
    exclusionReason?: string | null;
    supportScope?: SupportScope;
    boundaryConfidence?: "low" | "medium" | "high";
    boundaryEvidence?: BoundaryEvidence[];
  }>;
};

type GeneratedPlan = {
  weeks: Array<{
    weekNumber: number;
    summary: string;
    items: Array<{
      documentId: string;
      learningUnitId?: string;
      splitAfterComponentIndex?: number | null;
      startPage?: number;
      endPage?: number;
      label: string;
      subjectTitle: string;
      dayLabel?: string;
      dayNumber?: number | null;
      pageRangeCategory?: string;
      conceptLabels?: string[];
      conceptRedundant?: boolean;
      redundancyReason?: string | null;
    }>;
  }>;
};

function parseJsonResponse<T>(payload: unknown): T {
  const text = (
    payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }
  ).candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

  if (!text) {
    throw new Error("AI analysis returned an empty response.");
  }

  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as T;
}

async function requestGeminiJson<T>(
  parts: Array<Record<string, unknown>>,
  usageInput: { operation: string; context?: ModelUsageContext }
) {
  if (!env.GOOGLE_AI_API_KEY) {
    throw new Error("GOOGLE_AI_API_KEY is required to analyze curriculum PDFs.");
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${env.GOOGLE_AI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });
  } catch (error) {
    await recordModelUsage({
      context: usageInput.context,
      operation: usageInput.operation,
      provider: "google",
      model: GEMINI_MODEL,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof Error ? error.name : "network_error"
    });
    throw error;
  }

  const providerRequestId = response.headers.get("x-goog-request-id")
    ?? response.headers.get("x-request-id");

  if (!response.ok) {
    const body = await response.text();
    await recordModelUsage({
      context: usageInput.context,
      operation: usageInput.operation,
      provider: "google",
      model: GEMINI_MODEL,
      status: "failed",
      providerRequestId,
      durationMs: Date.now() - startedAt,
      errorCode: `http_${response.status}`
    });
    throw new Error(`AI analysis failed (${response.status}): ${body}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    await recordModelUsage({
      context: usageInput.context,
      operation: usageInput.operation,
      provider: "google",
      model: GEMINI_MODEL,
      status: "invalid_response",
      providerRequestId,
      durationMs: Date.now() - startedAt,
      errorCode: "invalid_json_response"
    });
    throw error;
  }

  const normalizedUsage = normalizeGeminiUsage(payload);
  try {
    const parsed = parseJsonResponse<T>(payload);
    await recordModelUsage({
      context: usageInput.context,
      operation: usageInput.operation,
      provider: "google",
      model: GEMINI_MODEL,
      status: "succeeded",
      providerRequestId,
      durationMs: Date.now() - startedAt,
      usage: normalizedUsage
    });
    return parsed;
  } catch (error) {
    await recordModelUsage({
      context: usageInput.context,
      operation: usageInput.operation,
      provider: "google",
      model: GEMINI_MODEL,
      status: "invalid_response",
      providerRequestId,
      durationMs: Date.now() - startedAt,
      errorCode: "invalid_structured_output",
      usage: normalizedUsage
    });
    throw error;
  }
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function requireOwnedProfile(parentUserId: string, profileId: string) {
  const [parent] = await db
    .select({ accountId: profiles.accountId, accountRole: profiles.accountRole })
    .from(profiles)
    .where(and(eq(profiles.userId, parentUserId), eq(profiles.role, "PARENT")))
    .limit(1);

  if (!parent) {
    throw new Error("Parent profile not found.");
  }

  const [row] = await db
    .select({
      profileId: profiles.id,
      accountId: profiles.accountId
    })
    .from(profiles)
    .where(
      and(
        eq(profiles.id, profileId),
        eq(profiles.accountId, parent.accountId),
        eq(profiles.role, "STUDENT")
      )
    )
    .limit(1);

  if (!row) {
    throw new Error("Student profile does not belong to this parent.");
  }

  return { ...row, accountRole: parent.accountRole };
}

async function requireAdminParent(parentUserId: string) {
  const [parent] = await db
    .select({ id: profiles.id, isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(and(eq(profiles.userId, parentUserId), eq(profiles.role, "PARENT")))
    .limit(1);

  if (!parent?.isAdmin) {
    throw new Error("Administrator access is required.");
  }

  return parent;
}

async function requireOwnedYear(parentUserId: string, learningYearId: string) {
  const [year] = await db
    .select({
      id: learningYears.id,
      profileId: learningYears.profileId,
      studentName: profiles.firstName,
      title: learningYears.title,
      totalWeeks: learningYears.totalWeeks,
      teachingDaysPerWeek: learningYears.teachingDaysPerWeek,
      printPageSize: learningYears.printPageSize,
      startDate: learningYears.startDate,
      endDate: learningYears.endDate,
      status: learningYears.status,
      curriculumCompletenessResult: learningYears.curriculumCompletenessResult,
      curriculumCompletenessInputFingerprint: learningYears.curriculumCompletenessInputFingerprint
    })
    .from(learningYears)
    .innerJoin(profiles, eq(profiles.id, learningYears.profileId))
    .where(eq(learningYears.id, learningYearId))
    .limit(1);

  if (!year) {
    throw new Error("Learning year not found.");
  }

  await requireOwnedProfile(parentUserId, year.profileId);
  return year;
}

function normalizeSubjectKey(label: string) {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function subjectKeyFor(input: { subjectId?: string | null; subjectLabel?: string | null }) {
  if (input.subjectId) return `system:${input.subjectId}`;
  return `custom:${normalizeSubjectKey(input.subjectLabel || "Uncategorized") || "uncategorized"}`;
}

function normalizeTeachingDays(value: unknown, fallback: number | null = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(7, Math.round(parsed)));
}

function isoDateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function parseSchoolYearDate(value: string, label: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} must be a valid date.`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label} must be a valid date.`);
  }
  return parsed;
}

function normalizeSchoolYearPeriod(
  startDate: string | null | undefined,
  endDate: string | null | undefined
) {
  const normalizedStart = startDate?.trim() || null;
  const normalizedEnd = endDate?.trim() || null;
  if (!normalizedStart && !normalizedEnd) {
    return { startDate: null, endDate: null };
  }
  if (!normalizedStart || !normalizedEnd) {
    throw new Error("Choose both the school-year start and end dates.");
  }
  const parsedStart = parseSchoolYearDate(normalizedStart, "School-year start");
  const parsedEnd = parseSchoolYearDate(normalizedEnd, "School-year end");
  if (parsedEnd <= parsedStart) {
    throw new Error("School-year end must be after the start date.");
  }
  return { startDate: parsedStart, endDate: parsedEnd };
}

function validateSubjectSchedule(input: {
  subjectLabel?: string | null;
  daysPerWeek?: number | null;
  teachingDaysPerWeek?: number | null;
}) {
  const daysPerWeek = normalizeTeachingDays(input.daysPerWeek);
  if (daysPerWeek && input.teachingDaysPerWeek && daysPerWeek > input.teachingDaysPerWeek) {
    throw new Error(
      `${input.subjectLabel?.trim() || "This subject"} is set for ${daysPerWeek} days, but this learning year has only ${input.teachingDaysPerWeek} teaching days per week.`
    );
  }
}

async function upsertSubjectPreference(input: {
  learningYearId: string;
  subjectId?: string | null;
  subjectLabel?: string | null;
  daysPerWeek?: number | null;
}) {
  const subjectLabel = input.subjectLabel?.trim() || "Uncategorized";
  const subjectKey = subjectKeyFor({ subjectId: input.subjectId, subjectLabel });
  const daysPerWeek = normalizeTeachingDays(input.daysPerWeek);
  const [year] = await db
    .select({ teachingDaysPerWeek: learningYears.teachingDaysPerWeek })
    .from(learningYears)
    .where(eq(learningYears.id, input.learningYearId))
    .limit(1);

  if (daysPerWeek && year?.teachingDaysPerWeek && daysPerWeek > year.teachingDaysPerWeek) {
    throw new Error(
      `${subjectLabel} is set for ${daysPerWeek} days, but this learning year has only ${year.teachingDaysPerWeek} teaching days per week.`
    );
  }

  await db
    .insert(learningYearSubjectPreferences)
    .values({
      learningYearId: input.learningYearId,
      subjectId: input.subjectId || null,
      subjectKey,
      subjectLabel,
      daysPerWeek
    })
    .onConflictDoUpdate({
      target: [
        learningYearSubjectPreferences.learningYearId,
        learningYearSubjectPreferences.subjectKey
      ],
      set: {
        subjectId: input.subjectId || null,
        subjectLabel,
        daysPerWeek,
        updatedAt: new Date()
      }
    });
}

function clampGrade(value: unknown) {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const grade = Number(value);
  if (!Number.isFinite(grade)) return null;
  return Math.max(0, Math.min(100, Math.round(grade)));
}

async function resolveUploadSubject(input: {
  subjectId?: string | null;
  subjectLabel?: string | null;
}) {
  const subjectId = input.subjectId?.trim() || null;
  if (!subjectId) {
    return {
      subjectId: null,
      subjectLabel: input.subjectLabel?.trim() || null
    };
  }

  const [subject] = await db
    .select({ id: curriculumNodes.id, title: curriculumNodes.title })
    .from(curriculumNodes)
    .where(and(eq(curriculumNodes.id, subjectId), eq(curriculumNodes.type, "subject")))
    .limit(1);

  if (!subject) {
    throw new Error("Choose a valid subject for the uploaded files.");
  }

  return {
    subjectId: subject.id,
    subjectLabel: subject.title
  };
}

export function normalizeAnalysis(
  analysis: Partial<DocumentAnalysis>,
  label: string,
  role: string,
  pageCount: number
): DocumentAnalysis {
  const pageNumberMapping = normalizePageNumberMapping(analysis.pageNumberMapping, pageCount);
  const sections = Array.isArray(analysis.sections)
    ? analysis.sections
        .map((section) => {
          const title = String(section.title || label).trim();
          const startPage = Math.max(1, Math.min(pageCount, Math.round(Number(section.startPage) || 1)));
          const endPage = Math.max(
            startPage,
            Math.min(pageCount, Math.round(Number(section.endPage) || pageCount))
          );
          const category = normalizeContentCategory(section.category, title, role);
          const supportScope = normalizeSupportScope(section.supportScope, title, category, role);
          const includeInPlan = shouldIncludeClassifiedContent(category, supportScope);
          return {
            title,
            startPage,
            endPage,
            estimatedMinutes: Math.max(1, Number(section.estimatedMinutes) || 15),
            notes: String(section.notes || "").trim(),
            category,
            includeInPlan,
            supportScope,
            classificationConfidence: ["low", "medium", "high"].includes(String(section.classificationConfidence))
              ? section.classificationConfidence as "low" | "medium" | "high"
              : "low",
            exclusionReason: includeInPlan
              ? null
              : String(section.exclusionReason || `Filtered because it was classified as ${category.replaceAll("_", " ")}.`).trim(),
            boundaryConfidence: ["low", "medium", "high"].includes(String(section.boundaryConfidence))
              ? section.boundaryConfidence as "low" | "medium" | "high"
              : "low",
            boundaryEvidence: Array.isArray(section.boundaryEvidence)
              ? section.boundaryEvidence as BoundaryEvidence[]
              : [],
            pageSelectionAudit: createPageSelectionAudit(pageNumberMapping, startPage, endPage)
          };
        })
        .filter((section) => section.endPage >= section.startPage)
    : [];
  const normalizedSections = sections.length > 0
    ? sections
    : [{
        title: label,
        startPage: 1,
        endPage: pageCount,
        estimatedMinutes: Math.max(15, pageCount * 10),
        notes: "",
        category: "unclear" as const,
        includeInPlan: false,
        classificationConfidence: "low" as const,
        exclusionReason: "The document could not be classified into safe teaching-related ranges.",
        supportScope: null,
        boundaryConfidence: "low" as const,
        boundaryEvidence: [],
        pageSelectionAudit: createPageSelectionAudit(pageNumberMapping, 1, pageCount)
      }];
  const keptSections = normalizedSections.filter((section) => section.includeInPlan);
  const filteredSections = normalizedSections.filter((section) => !section.includeInPlan);

  return {
    suggestedTitle: String(analysis.suggestedTitle || label).trim(),
    summary: String(analysis.summary || "").trim(),
    audience: ALLOWED_ROLES.has(String(analysis.audience))
      ? (analysis.audience as DocumentAnalysis["audience"])
      : (role as DocumentAnalysis["audience"]),
    analysisMethod: analysis.analysisMethod ?? "full_document",
    academicLevel: normalizeAcademicLevel(analysis.academicLevel),
    pageNumberMapping,
    pageNumberDetectionAudit: analysis.pageNumberDetectionAudit ?? pageNumberMapping?.detectionAudit ?? [],
    structureVersion: Number(analysis.structureVersion) >= 3 ? 3 : 2,
    classificationVersion: Number(analysis.classificationVersion) >= 3 ? 3 : 2,
    classificationSummary: {
      keptRangeCount: keptSections.length,
      filteredRangeCount: filteredSections.length,
      keptPdfPageCount: keptSections.reduce((total, section) => total + section.endPage - section.startPage + 1, 0),
      filteredPdfPageCount: filteredSections.reduce((total, section) => total + section.endPage - section.startPage + 1, 0)
    },
    pageLedger: Array.isArray(analysis.pageLedger) ? analysis.pageLedger : undefined,
    learningUnits: Array.isArray(analysis.learningUnits) ? analysis.learningUnits : undefined,
    documentQuality: analysis.documentQuality,
    sections: normalizedSections
  };
}

export function normalizeSupportScope(
  value: unknown,
  title: string,
  category: ContentCategory,
  role: string
): SupportScope {
  const haystack = title.toLowerCase();
  // These workbook-wide sections have deterministic scope. Do not let a model
  // classification turn them into schedulable lesson material.
  if (
    /introduction\s*&?\s*tips|introduction to (?:cursive writing|handwriting)|teaching tips|tips (?:on|for) (?:using|use)|how to use|about (this|the) (book|workbook|series)/.test(haystack)
  ) return "parent_guidance";
  if (
    /list of vocabulary words|vocabulary summary|global vocabulary|glossary|index|legend|more from|other books/.test(haystack)
  ) return "global";
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["unit", "global", "parent_guidance"].includes(normalized)) {
    return normalized as Exclude<SupportScope, null>;
  }
  if (["supporting_content", "teacher_guidance"].includes(category)) return "unit";
  return null;
}

function shouldIncludeClassifiedContent(category: ContentCategory, supportScope: SupportScope) {
  return DESIRABLE_CONTENT_CATEGORIES.has(category) &&
    supportScope !== "global" &&
    supportScope !== "parent_guidance";
}

function normalizeContentCategory(value: unknown, title: string, role: string): ContentCategory {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const haystack = title.toLowerCase();
  if (/table of contents|^contents$|scope and sequence|section (?:overview|contents)|chapter contents/.test(haystack)) {
    return "table_of_contents";
  }
  // These are deterministic document-level ranges. Keep them out of lesson
  // metadata even when a model returns a more permissive category.
  if (/^front matter$|copyright|publisher|publication|isbn|credits/.test(haystack)) {
    return "publishing_page";
  }
  if (/list of vocabulary words|vocabulary summary|global vocabulary|glossary|index|legend/.test(haystack)) {
    return "supporting_content";
  }
  if (CONTENT_CATEGORIES.has(normalized)) return normalized as ContentCategory;
  if (/answer key|solutions?\b/.test(haystack) || role === "answer_key") return "answer_key";
  if (/quiz|test\b/.test(haystack)) return "quiz";
  if (/assessment|exam\b/.test(haystack)) return "assessment";
  if (/copyright|publisher|publication|isbn|credits/.test(haystack)) return "publishing_page";
  if (/cover|title page/.test(haystack)) return "workbook_cover";
  if (/bibliography|references|citations/.test(haystack)) return "academic_citation";
  if (/teacher guide|teacher notes|teaching guide/.test(haystack) || role === "teacher") return "teacher_guidance";
  if (/review|recap/.test(haystack)) return "review";
  if (/practice|exercise|worksheet/.test(haystack)) return "concept_practice";
  if (/lesson|chapter|unit|concept/.test(haystack)) return "mixed_teaching";
  return "unclear";
}

export function resolveStructuredSectionClassification(input: {
  category: unknown;
  supportScope: unknown;
  title: string;
  role: string;
  openingText?: string;
  closingText?: string;
}) {
  let category = normalizeContentCategory(input.category, input.title, input.role);
  let supportScope = normalizeSupportScope(
    input.supportScope,
    input.title,
    category,
    input.role
  );
  const title = input.title.toLowerCase();
  const pageEvidence = `${input.openingText ?? ""}\n${input.closingText ?? ""}`.toLowerCase();
  const isDeterministicallyExcluded =
    /table of contents|^contents$|^front matter$|copyright|publisher|publication|isbn|credits|workbook cover|title page|vocabulary summary|list of vocabulary words|global vocabulary|glossary|index|legend/.test(title);
  const hasExplicitTeachingEvidence =
    /\b(student exercises?|word bank|reading comprehension|comprehension questions?|guided practice|independent practice|practice problems?|worksheet|lesson objectives?|circle the answer|true or false)\b/.test(pageEvidence);

  // A model may understandably call a story title such as "In the Garden"
  // unclear when it sees only the title. Explicit exercise/instruction text on
  // the physical pages is stronger evidence and must keep the lesson range.
  if (
    !isDeterministicallyExcluded &&
    hasExplicitTeachingEvidence &&
    !shouldIncludeClassifiedContent(category, supportScope)
  ) {
    category = "mixed_teaching";
    supportScope = null;
  }

  return {
    category,
    supportScope,
    includeInPlan: shouldIncludeClassifiedContent(category, supportScope)
  };
}

function normalizeAcademicLevel(value: unknown): AcademicLevelEvidence | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AcademicLevelEvidence>;
  const grade = (candidate: unknown) => {
    if (candidate == null || candidate === "") return null;
    const number = Number(candidate);
    return Number.isFinite(number) ? Math.max(0, Math.min(12, Math.round(number))) : null;
  };
  const label = String(raw.label ?? "").trim().slice(0, 120);
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map((item) => String(item).trim().slice(0, 240)).filter(Boolean).slice(0, 8)
    : [];
  if (!label && evidence.length === 0) return null;
  return {
    label: label || "Level not explicitly stated",
    gradeMin: grade(raw.gradeMin),
    gradeMax: grade(raw.gradeMax),
    evidence,
    confidence: ["low", "medium", "high"].includes(String(raw.confidence))
      ? raw.confidence as AcademicLevelEvidence["confidence"]
      : "low"
  };
}

function normalizeForMatching(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleMatchVariants(value: string) {
  const normalized = normalizeForMatching(value);
  const variants = new Set<string>([normalized]);
  const colonLeaf = value.split(/[:–—]/).at(-1);
  if (colonLeaf) variants.add(normalizeForMatching(colonLeaf));
  variants.add(normalized.replace(
    /^(stories? (and|&) exercises?|lesson|chapter|unit|section)\s+/,
    ""
  ));
  return Array.from(variants).filter(Boolean);
}

export function pageTitleMatchScore(pageText: string, title: string) {
  const normalizedPage = normalizeForMatching(pageText);
  let bestScore = 0;
  for (const variant of titleMatchVariants(title)) {
    if (normalizedPage.includes(variant)) return 1;
    const tokens = variant.split(" ").filter((token) => token.length >= 3);
    if (tokens.length === 0) continue;
    const tokenCoverage =
      tokens.filter((token) => normalizedPage.includes(token)).length / tokens.length;
    bestScore = Math.max(
      bestScore,
      // Token presence is useful for OCR and punctuation differences, but it is
      // weaker than an exact normalized phrase and must never tie one.
      Math.min(0.95, tokenCoverage)
    );
  }
  return bestScore;
}

export function looksLikeTableOfContents(text: string) {
  const normalized = text.toLowerCase();
  if (/\b(table of contents|contents|scope and sequence)\b/.test(normalized)) {
    return true;
  }
  const numberedLines = text
    .split(/\n+/)
    .filter((line) =>
      /(?:\.{2,}|\s{2,})\s*\d{1,4}\s*$/.test(line) ||
      /^(?:\d{1,3}[.)]\s+)?lesson\s+\d+(?:\.\d+)*\b.+\s+\d{1,4}\s*$/i.test(line.trim())
    ).length;
  return numberedLines >= 5;
}

async function extractPageText(document: PDFDocumentProxy, pageLimit = document.numPages) {
  const labels = await document.getPageLabels();
  const pages: PdfPageText[] = [];

  for (
    let pageNumber = 1;
    pageNumber <= Math.min(document.numPages, pageLimit);
    pageNumber += 1
  ) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = "";
    let previousBaseline: number | null = null;
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const baseline = "transform" in item && Array.isArray(item.transform)
        ? Number(item.transform[5])
        : Number.NaN;
      if (
        text &&
        previousBaseline != null &&
        Number.isFinite(baseline) &&
        Math.abs(baseline - previousBaseline) > 1.5 &&
        !text.endsWith("\n")
      ) {
        text += "\n";
      }
      text += item.str;
      text += item.hasEOL ? "\n" : " ";
      previousBaseline = item.hasEOL || !Number.isFinite(baseline) ? null : baseline;
    }
    pages.push({
      pageIndex: pageNumber - 1,
      label: labels?.[pageNumber - 1] ?? null,
      text: text.replace(/[ \t]+/g, " ").trim()
    });
  }

  return pages;
}

async function detectEmbeddedCornerPageNumberMapping(document: PDFDocumentProxy) {
  type Location = NonNullable<PageNumberMapping["globalFormat"]>["location"];
  const observations: Array<{
    pdfPageNumber: number;
    contentPageNumber: number;
    location: Location;
  }> = [];
  const sampledPdfPages: number[] = [];
  for (let pdfPageNumber = 1; pdfPageNumber <= document.numPages; pdfPageNumber += 1) {
    const page = await document.getPage(pdfPageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    sampledPdfPages.push(pdfPageNumber);
    for (const item of content.items) {
      if (!("str" in item) || !/^\s*\d{1,4}\s*$/.test(item.str)) continue;
      const transform = "transform" in item && Array.isArray(item.transform) ? item.transform : null;
      if (!transform) continue;
      const x = Number(transform[4]);
      const y = Number(transform[5]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const vertical = y <= viewport.height * 0.14
        ? "bottom"
        : y >= viewport.height * 0.86 ? "top" : null;
      if (!vertical) continue;
      const horizontal = x <= viewport.width * 0.33
        ? "left"
        : x >= viewport.width * 0.67 ? "right" : "center";
      observations.push({
        pdfPageNumber,
        contentPageNumber: Number(item.str.trim()),
        location: `${vertical}_${horizontal}` as Location
      });
    }
    page.cleanup();
  }

  const groups = new Map<string, typeof observations>();
  for (const observation of observations) {
    const offset = observation.pdfPageNumber - observation.contentPageNumber;
    const key = `${observation.location}:${offset}`;
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  const strongest = Array.from(groups.values())
    .sort((left, right) => right.length - left.length)[0] ?? [];
  const minimumEvidence = document.numPages <= 4 ? 2 : 3;
  if (strongest.length < minimumEvidence) {
    return {
      mapping: null,
      audit: {
        method: "embedded_text_corners" as const,
        attempted: true,
        succeeded: false,
        sampledPdfPages,
        note: "No stable numeric page sequence was found in embedded text near the page corners."
      }
    };
  }
  const location = strongest[0]?.location ?? "unknown";
  const mapping = buildPageNumberMappingFromObservedPoints({
    points: strongest.map(({ pdfPageNumber, contentPageNumber }) => ({ pdfPageNumber, contentPageNumber })),
    pdfPageCount: document.numPages,
    source: "embedded_text_corners",
    confidence: strongest.length >= Math.min(10, Math.ceil(document.numPages * 0.5)) ? "high" : "medium",
    location,
    sampledPdfPages,
    note: "Numeric page numbers were found in a consistent corner location and offset using embedded PDF text."
  });
  return {
    mapping,
    audit: mapping?.detectionAudit?.[0] ?? {
      method: "embedded_text_corners" as const,
      attempted: true,
      succeeded: false,
      sampledPdfPages,
      note: "Corner page-number observations could not be normalized into a reliable mapping."
    }
  };
}

async function resolveOutlinePageIndex(
  document: PDFDocumentProxy,
  destination: string | unknown[] | null
) {
  const resolved =
    typeof destination === "string" ? await document.getDestination(destination) : destination;
  const target = resolved?.[0];
  if (typeof target === "number") return target;
  if (target && typeof target === "object") {
    return document.getPageIndex(target);
  }
  return null;
}

async function structureFromOutline(
  document: PDFDocumentProxy
): Promise<PdfStructure | null> {
  const outline = await document.getOutline();
  if (!outline?.length) return null;

  const flat: Array<{ title: string; pageIndex: number }> = [];
  const visit = async (
    nodes: Array<{ title: string; dest: string | unknown[] | null; items?: unknown[] }>
  ) => {
    for (const node of nodes) {
      const pageIndex = await resolveOutlinePageIndex(document, node.dest);
      if (pageIndex != null && node.title.trim()) {
        flat.push({ title: node.title.trim(), pageIndex });
      }
      if (Array.isArray(node.items) && node.items.length > 0) {
        await visit(
          node.items as Array<{
            title: string;
            dest: string | unknown[] | null;
            items?: unknown[];
          }>
        );
      }
    }
  };
  await visit(outline);

  const ordered = flat
    .filter((entry) => entry.pageIndex >= 0 && entry.pageIndex < document.numPages)
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .filter(
      (entry, index, entries) =>
        index === 0 ||
        entry.pageIndex !== entries[index - 1].pageIndex ||
        entry.title !== entries[index - 1].title
    );
  if (ordered.length < 2) return null;

  return {
    method: "pdf_outline",
    summary: `Indexed ${ordered.length} bookmarked sections without sending the full PDF to AI.`,
    sections: ordered.map((entry, index) => ({
      title: entry.title,
      startPage: entry.pageIndex + 1,
      endPage:
        index + 1 < ordered.length
          ? Math.max(entry.pageIndex + 1, ordered[index + 1].pageIndex)
          : document.numPages,
      estimatedMinutes: 30,
      notes: "Physical page range derived from the PDF outline.",
      boundaryConfidence: "high" as const,
      boundaryEvidence: [{
        source: "pdf_outline" as const,
        pdfPageNumber: entry.pageIndex + 1,
        detail: `The PDF outline points “${entry.title}” to this physical page.`,
        confidence: "high" as const
      }]
    }))
  };
}

export async function structureFromTableOfContents(
  pages: PdfPageText[],
  label: string,
  pageCount: number,
  pageNumberMapping: PageNumberMapping | null,
  usageContext: ModelUsageContext = {}
): Promise<PdfStructure | null> {
  const tocPages = pages
    .slice(0, Math.min(TOC_SCAN_PAGE_LIMIT, pages.length))
    .filter((page) => looksLikeTableOfContents(page.text));
  if (tocPages.length === 0) return null;

  const tocText = tocPages
    .map((page) => `PDF PAGE ${page.pageIndex + 1}\n${page.text}`)
    .join("\n\n")
    .slice(0, 60_000);
  const deterministicSections = parseTableOfContentsEntries(tocText);
  let parsed: {
    sections?: Array<{ title?: string; printedStartPage?: string | number }>;
  } = deterministicSections.length >= 2
    ? { sections: deterministicSections }
    : await requestGeminiJson<{
        sections?: Array<{ title?: string; printedStartPage?: string | number }>;
      }>([
        {
          text: `Parse this extracted table of contents for "${label}". Do not create lessons or educational content.
Return JSON only:
{"sections":[{"title":"exact section title","printedStartPage":"page number or label shown in the TOC"}]}
Keep the original order and include every referenced range that may matter for classification, including contents, lessons, quizzes, tests, answer keys, references, and teacher material.

${tocText}`
        }
      ], {
        operation: "document.table_of_contents_parse",
        context: usageContext
      });

  const apparentEntryCount = Math.max(
    deterministicSections.length,
    tocText.match(/\.{3,}\s*\d{1,4}\b/g)?.length ?? 0
  );
  if (
    apparentEntryCount >= 2 &&
    (parsed.sections?.length ?? 0) < Math.ceil(apparentEntryCount * 0.9)
  ) {
    parsed = await requestGeminiJson<{
      sections?: Array<{ title?: string; printedStartPage?: string | number }>;
    }>([{
      text: `The extracted table of contents below appears to contain approximately ${apparentEntryCount} numbered entries. Parse every entry, including entries prefixed by group labels such as "Stories & Exercises:". Do not summarize or combine entries. Return JSON only:
{"sections":[{"title":"complete exact title","printedStartPage":"printed page number"}]}

${tocText}`
    }], {
      operation: "document.table_of_contents_parse_retry",
      context: usageContext
    });
  }

  const candidates = (parsed.sections ?? [])
    .map((section) => ({
      title: String(section.title ?? "").trim(),
      printedStartPage: String(section.printedStartPage ?? "").trim()
    }))
    .filter((section) => section.title);
  if (candidates.length < 2) return null;
  if (apparentEntryCount >= 2 && candidates.length < Math.ceil(apparentEntryCount * 0.9)) {
    return null;
  }

  const starts: Array<{
    title: string;
    pageIndex: number;
    boundaryConfidence: "medium" | "high";
    boundaryEvidence: BoundaryEvidence[];
  }> = [];
  const usedIndexes = new Set<number>();

  for (const candidate of candidates) {
    const printedPageNumber = /^\d+$/.test(candidate.printedStartPage)
      ? Number(candidate.printedStartPage)
      : null;
    const mappedPdfPageNumber = printedPageNumber == null
      ? null
      : contentPageNumberToPdfPageNumber(pageNumberMapping, printedPageNumber);
    const exactLabelIndex = pages.findIndex(
      (page) => page.label && page.label === candidate.printedStartPage
    );
    const expectedPageIndex = mappedPdfPageNumber != null
      ? mappedPdfPageNumber - 1
      : exactLabelIndex;
    let bestIndex = -1;
    let bestScore = 0;
    const searchIndexes = expectedPageIndex >= 0
      ? Array.from({ length: 5 }, (_, offset) => expectedPageIndex + offset - 2)
          .filter((pageIndex) => pageIndex > tocPages[tocPages.length - 1].pageIndex && pageIndex < pages.length)
      : Array.from(
          { length: pages.length - tocPages[tocPages.length - 1].pageIndex - 1 },
          (_, offset) => tocPages[tocPages.length - 1].pageIndex + offset + 1
        );
    for (const pageIndex of searchIndexes) {
      const score = pageTitleMatchScore(pages[pageIndex]?.text ?? "", candidate.title);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = pageIndex;
      }
    }

    const hasHighConfidencePrintedPageBoundary =
      mappedPdfPageNumber != null &&
      pageNumberMapping?.confidence === "high" &&
      mappedPdfPageNumber > tocPages[tocPages.length - 1].pageIndex + 1 &&
      mappedPdfPageNumber <= pages.length;
    if (bestScore < 0.6 && hasHighConfidencePrintedPageBoundary) {
      bestIndex = mappedPdfPageNumber - 1;
    }

    if (
      bestIndex >= 0 &&
      (bestScore >= 0.6 || hasHighConfidencePrintedPageBoundary) &&
      !usedIndexes.has(bestIndex)
    ) {
      const boundaryEvidence: BoundaryEvidence[] = [{
        source: "table_of_contents",
        pdfPageNumber: bestIndex + 1,
        detail: `The table of contents identified “${candidate.title}” at printed page ${candidate.printedStartPage || "unknown"}.`,
        confidence: "high"
      }];
      if (bestScore >= 0.6) {
        boundaryEvidence.push({
          source: "title_match",
          pdfPageNumber: bestIndex + 1,
          detail: `The physical page matched a normalized lesson-title variant with score ${bestScore.toFixed(2)}.`,
          confidence: bestScore >= 0.9 ? "high" : "medium"
        });
      }
      if (mappedPdfPageNumber != null) {
        boundaryEvidence.push({
          source: "printed_page_mapping",
          pdfPageNumber: mappedPdfPageNumber,
          detail: `Printed page ${printedPageNumber} converted to physical PDF page ${mappedPdfPageNumber}.`,
          confidence: pageNumberMapping?.confidence === "high" ? "high" : "medium"
        });
      }
      starts.push({
        title: candidate.title,
        pageIndex: bestIndex,
        boundaryConfidence:
          mappedPdfPageNumber === bestIndex + 1 && pageNumberMapping?.confidence === "high"
            ? "high"
            : "medium",
        boundaryEvidence
      });
      usedIndexes.add(bestIndex);
    }
  }

  const ordered = starts.sort((a, b) => a.pageIndex - b.pageIndex);
  if (ordered.length < 2 || ordered.length !== candidates.length) {
    return null;
  }

  return {
    method: "table_of_contents",
    summary: `Indexed ${ordered.length} sections from the table of contents; the full PDF was not sent to AI.`,
    sections: [
      {
        title: "Table of contents",
        startPage: tocPages[0]!.pageIndex + 1,
        endPage: tocPages[tocPages.length - 1]!.pageIndex + 1,
        estimatedMinutes: 1,
        notes: "Detected table-of-contents pages.",
        category: "table_of_contents",
        includeInPlan: false,
        classificationConfidence: "high",
        exclusionReason: "Navigation pages are not teaching content.",
        supportScope: null,
        boundaryConfidence: "high",
        boundaryEvidence: [{
          source: "table_of_contents",
          pdfPageNumber: tocPages[0]!.pageIndex + 1,
          detail: "Detected the table-of-contents page from its heading and numbered entries.",
          confidence: "high"
        }]
      },
      ...ordered.map((entry, index) => ({
        title: entry.title,
        startPage: entry.pageIndex + 1,
        endPage:
          index + 1 < ordered.length
            ? Math.max(entry.pageIndex + 1, ordered[index + 1].pageIndex)
            : pageCount,
        estimatedMinutes: 30,
        notes: "Physical page range matched from the extracted table of contents.",
        boundaryConfidence: entry.boundaryConfidence,
        boundaryEvidence: entry.boundaryEvidence
      }))
    ]
  };
}

export function parseTableOfContentsEntries(text: string) {
  const lines = text
    .replace(/[\u2018\u2019]/g, "'")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const sections: Array<{ title: string; printedStartPage: string }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const dottedMatch = line.match(/^(.*?)\s*\.{3,}\s*(\d{1,4})\s*$/);
    const plainMatch = line.match(/^(.+?\S)\s+(\d{1,4})\s*$/);
    const plainTitle = plainMatch?.[1]?.trim() ?? "";
    const hasNumberedEntryPrefix = /^\d{1,3}[.)]\s+\S/.test(plainTitle);
    const looksLikePlainTocEntry = Boolean(
      plainMatch &&
      /[a-z]/i.test(plainTitle) &&
      !/^(?:pdf page|table of contents|page)\b/i.test(plainTitle) &&
      (
        hasNumberedEntryPrefix ||
        /^(?:\d{1,3}[.)]\s+)?(?:lesson|introduction|answer key|quiz|test|assessment|practice|review|glossary|references|appendix)\b/i.test(plainTitle) ||
        /^\d{1,3}\.\d{1,3}\s+\S/.test(plainTitle)
      )
    );
    const match = dottedMatch ?? (looksLikePlainTocEntry ? plainMatch : null);
    if (!match) continue;
    let title = (match[1]?.trim() ?? "")
      .replace(/^\d{1,3}[.)]\s+/, "");

    // Some PDFs emit a title and its dot leader as separate text rows. A few
    // also split curly apostrophes into individual text items (Jack ' s...).
    // Rejoin only the local fragments immediately preceding the dot leader.
    let cursor = index - 1;
    let blankBudget = 1;
    const fragments: string[] = [];
    while (cursor >= 0 && fragments.length < 3) {
      const previous = lines[cursor] ?? "";
      if (!previous) {
        if (blankBudget <= 0) break;
        blankBudget -= 1;
        cursor -= 1;
        continue;
      }
      if (/\.{3,}\s*\d{1,4}\s*$/.test(previous) || /\S\s+\d{1,4}\s*$/.test(previous)) break;
      if (/^(?:pdf page \d+|table of contents|level\s+[a-z0-9]+ reader|www\.|©)/i.test(previous)) break;
      const needsPrefix = !title || /^[a-z'’]/.test(title) || previous.length <= 2;
      if (!needsPrefix) break;
      fragments.unshift(previous);
      cursor -= 1;
    }
    title = [...fragments, title]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+'\s*/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (!title) continue;
    const printedStartPage = match[2]!;
    const duplicate = sections.some((section) =>
      normalizeForMatching(section.title) === normalizeForMatching(title) &&
      section.printedStartPage === printedStartPage
    );
    if (!duplicate) sections.push({ title, printedStartPage });
  }

  return sections;
}

function completeStructureCoverage(sections: PdfStructure["sections"], pageCount: number) {
  const ordered = sections
    .map((section) => ({
      ...section,
      startPage: Math.max(1, Math.min(pageCount, Math.round(section.startPage))),
      endPage: Math.max(1, Math.min(pageCount, Math.round(section.endPage)))
    }))
    .filter((section) => section.endPage >= section.startPage)
    .sort((left, right) => left.startPage - right.startPage || left.endPage - right.endPage);
  const completed: PdfStructure["sections"] = [];
  let nextPage = 1;
  for (const section of ordered) {
    if (section.startPage > nextPage) {
      completed.push({
        title: nextPage === 1 ? "Front matter" : "Unindexed material",
        startPage: nextPage,
        endPage: section.startPage - 1,
        estimatedMinutes: 1,
        notes: "This range was not represented by the PDF outline or table of contents."
      });
    }
    const startPage = Math.max(nextPage, section.startPage);
    if (section.endPage >= startPage) completed.push({ ...section, startPage });
    nextPage = Math.max(nextPage, section.endPage + 1);
  }
  if (nextPage <= pageCount) {
    completed.push({
      title: "Back matter",
      startPage: nextPage,
      endPage: pageCount,
      estimatedMinutes: 1,
      notes: "This range follows the last indexed section."
    });
  }
  return completed;
}

async function classifyStructuredSections(input: {
  label: string;
  role: string;
  sections: PdfStructure["sections"];
  pages?: PdfPageText[];
  usageContext?: ModelUsageContext;
}) {
  const parsed = await requestGeminiJson<{
    ranges?: Array<{
      index?: number;
      category?: string;
      supportScope?: string | null;
      confidence?: string;
      reason?: string;
    }>;
  }>([{
    text: `Classify these exact page ranges from curriculum material "${input.label}" with role "${input.role}". The ranges came from a PDF outline or table of contents, so do not request or invent new page boundaries.
Categories: concept_introduction, concept_practice, worked_example, quiz, assessment, review, answer_key, supporting_content, teacher_guidance, mixed_teaching, table_of_contents, workbook_cover, publishing_page, empty_page, academic_citation, unclear.
For supporting_content and teacher_guidance, also set supportScope to unit, global, or parent_guidance. Use unit only when the pages are explicitly tied to a particular lesson. Workbook-wide vocabulary lists, indexes, legends, and promotional references are global. Introductions, teaching tips, and how-to-use pages aimed at the parent are parent_guidance.
Keep teaching-related ranges, including lessons, practice, quizzes, assessments, answer keys, and support explicitly connected to a lesson. Filter contents, covers, publisher/legal pages, blank pages, unrelated academic citations, global reference pages, parent guidance, and unclear material. If citations are themselves being taught, use concept_introduction or supporting_content instead of academic_citation.
Return one classification for every input index. JSON only:
{"ranges":[{"index":0,"category":"mixed_teaching","supportScope":null,"confidence":"low|medium|high","reason":"brief evidence"}]}

RANGES:
${JSON.stringify(input.sections.map((section, index) => ({
  index,
  ...section,
  openingText: input.pages?.[section.startPage - 1]?.text.slice(0, 900) ?? "",
  closingText: input.pages?.[section.endPage - 1]?.text.slice(0, 500) ?? ""
})))}`
  }], {
    operation: "document.range_classification",
    context: input.usageContext
  });
  const classificationByIndex = new Map(
    (parsed.ranges ?? []).map((range) => [Number(range.index), range])
  );
  return input.sections.map((section, index) => {
    const classification = classificationByIndex.get(index);
    const resolved = resolveStructuredSectionClassification({
      category: classification?.category ?? section.category,
      supportScope: classification?.supportScope ?? section.supportScope,
      title: section.title,
      role: input.role,
      openingText: input.pages?.[section.startPage - 1]?.text,
      closingText: input.pages?.[section.endPage - 1]?.text
    });
    return {
      ...section,
      category: resolved.category,
      supportScope: resolved.supportScope,
      includeInPlan: resolved.includeInPlan,
      classificationConfidence: ["low", "medium", "high"].includes(String(classification?.confidence))
        ? classification?.confidence as "low" | "medium" | "high"
        : section.classificationConfidence ?? "low",
      exclusionReason: resolved.includeInPlan
        ? null
        : String(classification?.reason || section.exclusionReason || `Filtered ${resolved.category.replaceAll("_", " ")}.`).trim()
    };
  });
}

export async function discoverPdfStructure(
  bytes: Uint8Array,
  label: string,
  usageContext: ModelUsageContext = {}
) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    // PDF.js transfers/detaches its input buffer. Keep the original intact in case
    // we need to fall back to Gemini's full-document analysis.
    data: bytes.slice()
  }).promise;

  try {
    const labels = await document.getPageLabels();
    const labelMapping = buildPageNumberMappingFromPdfLabels(labels, document.numPages);
    const embeddedDetection = labelMapping
      ? null
      : await detectEmbeddedCornerPageNumberMapping(document);
    const pageNumberMapping = labelMapping ?? embeddedDetection?.mapping ?? null;
    const pageNumberDetectionAudit: NonNullable<PageNumberMapping["detectionAudit"]> = [
      labelMapping?.detectionAudit?.[0] ?? {
        method: "pdf_page_labels",
        attempted: true,
        succeeded: false,
        sampledPdfPages: [],
        note: labels?.length
          ? "The PDF page labels were present but did not contain a reliable numeric sequence."
          : "The PDF did not provide page labels."
      },
      ...(embeddedDetection ? [embeddedDetection.audit] : [{
        method: "embedded_text_corners" as const,
        attempted: false,
        succeeded: false,
        sampledPdfPages: [],
        note: "Skipped because reliable PDF page labels were available."
      }])
    ];
    const pages = await extractPageText(document);
    const outline = await structureFromOutline(document);
    if (outline) return { structure: outline, pageNumberMapping, pageNumberDetectionAudit, pages };
    const frontPages = pages.slice(0, TOC_SCAN_PAGE_LIMIT);
    if (!frontPages.some((page) => looksLikeTableOfContents(page.text))) {
      return { structure: null, pageNumberMapping, pageNumberDetectionAudit, pages };
    }
    return {
      structure: await structureFromTableOfContents(
        pages,
        label,
        document.numPages,
        pageNumberMapping,
        usageContext
      ),
      pageNumberMapping,
      pageNumberDetectionAudit,
      pages
    };
  } finally {
    await document.destroy();
  }
}

async function detectPageNumberMappingWithVisualOcr(
  bytes: Uint8Array,
  pageCount: number,
  usageContext: ModelUsageContext
) {
  const [{ createCanvas }, pdfjs] = await Promise.all([
    import("@napi-rs/canvas"),
    import("pdfjs-dist/legacy/build/pdf.mjs")
  ]);
  const document = await pdfjs.getDocument({ data: bytes.slice(), stopAtErrors: false }).promise;
  const sampledPdfPages = Array.from(new Set([
    ...Array.from({ length: Math.min(8, pageCount) }, (_, index) => index + 1),
    Math.max(1, Math.round(pageCount * 0.25)),
    Math.max(1, Math.round(pageCount * 0.5)),
    Math.max(1, Math.round(pageCount * 0.75)),
    pageCount
  ])).sort((left, right) => left - right).slice(0, 16);
  try {
    const parts: Array<Record<string, unknown>> = [];
    for (const pdfPageNumber of sampledPdfPages) {
      const page = await document.getPage(pdfPageNumber);
      const viewport = page.getViewport({ scale: 0.8 });
      const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
      const context = canvas.getContext("2d");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const cropHeight = Math.max(40, Math.ceil(canvas.height * 0.18));
      const strip = createCanvas(canvas.width, cropHeight * 2);
      const stripContext = strip.getContext("2d");
      stripContext.fillStyle = "white";
      stripContext.fillRect(0, 0, strip.width, strip.height);
      stripContext.drawImage(canvas, 0, 0, canvas.width, cropHeight, 0, 0, strip.width, cropHeight);
      stripContext.drawImage(
        canvas,
        0,
        canvas.height - cropHeight,
        canvas.width,
        cropHeight,
        0,
        cropHeight,
        strip.width,
        cropHeight
      );
      parts.push({ text: `Physical PDF page ${pdfPageNumber}; top strip followed by bottom strip:` });
      parts.push({ inlineData: { mimeType: "image/png", data: strip.toBuffer("image/png").toString("base64") } });
      page.cleanup();
    }
    parts.push({
      text: `Read only page numbers that are visibly printed in these top/bottom page-edge samples. Ignore lesson numbers, dates, exercise numbers, and decorative digits. Determine the consistent page-number location and return JSON only:
{"location":"top_left|top_center|top_right|bottom_left|bottom_center|bottom_right|varies|unknown","observations":[{"pdfPageNumber":5,"contentPageNumber":1}],"note":"brief evidence"}
Omit uncertain observations. Physical PDF page numbers are supplied before each image.`
    });
    const parsed = await requestGeminiJson<{
      location?: unknown;
      observations?: Array<{ pdfPageNumber?: unknown; contentPageNumber?: unknown }>;
      note?: unknown;
    }>(parts, {
      operation: "document.page_number_visual_ocr",
      context: usageContext
    });
    const allowedLocations = new Set(["top_left", "top_center", "top_right", "bottom_left", "bottom_center", "bottom_right", "varies", "unknown"]);
    const location = allowedLocations.has(String(parsed.location))
      ? String(parsed.location) as NonNullable<PageNumberMapping["globalFormat"]>["location"]
      : "unknown";
    const points = (parsed.observations ?? []).flatMap((observation) => {
      const pdfPageNumber = Number(observation.pdfPageNumber);
      const contentPageNumber = Number(observation.contentPageNumber);
      return Number.isInteger(pdfPageNumber) && Number.isInteger(contentPageNumber)
        ? [{ pdfPageNumber, contentPageNumber }]
        : [];
    });
    const mapping = buildPageNumberMappingFromObservedPoints({
      points,
      pdfPageCount: pageCount,
      source: "ai_visual_ocr",
      confidence: points.length >= 4 ? "medium" : "low",
      location,
      sampledPdfPages,
      note: String(parsed.note ?? "Targeted visual OCR examined the page-edge samples.").trim()
    });
    return {
      mapping,
      audit: mapping?.detectionAudit?.[0] ?? {
        method: "ai_visual_ocr" as const,
        attempted: true,
        succeeded: false,
        sampledPdfPages,
        note: "Targeted visual OCR did not establish a reliable numeric mapping."
      }
    };
  } finally {
    await document.destroy();
  }
}

async function detectVisuallyBlankPdfPages(bytes: Uint8Array) {
  const [{ createCanvas }, pdfjs] = await Promise.all([
    import("@napi-rs/canvas"),
    import("pdfjs-dist/legacy/build/pdf.mjs")
  ]);
  const document = await pdfjs.getDocument({ data: bytes.slice(), stopAtErrors: false }).promise;
  const blankPages = new Set<number>();
  try {
    for (let pdfPageNumber = 1; pdfPageNumber <= document.numPages; pdfPageNumber += 1) {
      const page = await document.getPage(pdfPageNumber);
      const viewport = page.getViewport({ scale: 0.18 });
      const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
      const context = canvas.getContext("2d");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let darkPixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 16) {
        const red = pixels[offset] ?? 255;
        const green = pixels[offset + 1] ?? 255;
        const blue = pixels[offset + 2] ?? 255;
        if (0.2126 * red + 0.7152 * green + 0.0722 * blue < 230) darkPixels += 1;
      }
      const sampledPixels = Math.max(1, Math.floor(pixels.length / 16));
      if (darkPixels / sampledPixels < MIN_RENDERED_PAGE_DARK_PIXEL_RATIO) blankPages.add(pdfPageNumber);
      page.cleanup();
    }
    return blankPages;
  } finally {
    await document.destroy();
  }
}

function splitSectionsAroundBlankPages(
  sections: PdfStructure["sections"],
  blankPages: Set<number>
) {
  const result: PdfStructure["sections"] = [];
  for (const section of sections) {
    let rangeStart = section.startPage;
    let currentBlank = blankPages.has(rangeStart);
    for (let page = section.startPage + 1; page <= section.endPage + 1; page += 1) {
      const blank = page <= section.endPage && blankPages.has(page);
      if (page <= section.endPage && blank === currentBlank) continue;
      result.push(currentBlank ? {
        ...section,
        title: "Blank page",
        startPage: rangeStart,
        endPage: page - 1,
        estimatedMinutes: 1,
        category: "empty_page",
        includeInPlan: false,
        classificationConfidence: "high",
        exclusionReason: "The rendered page contained no meaningful visible content."
      } : {
        ...section,
        startPage: rangeStart,
        endPage: page - 1
      });
      rangeStart = page;
      currentBlank = blank;
    }
  }
  return result;
}

function learningUnitPageRole(
  category: ContentCategory,
  pageText: string
): LearningUnitPageRole {
  const normalized = normalizeForMatching(pageText);
  const openingText = normalized.slice(0, 500);
  if (category === "answer_key" || /\banswer key\b|\banswers\b/.test(openingText)) {
    return "answer_key";
  }
  if (category === "quiz" || category === "assessment") return "assessment";
  if (category === "worked_example") return "worked_example";
  if (category === "concept_practice" || /\bquestions?\b|\bexercises?\b|\bworksheet\b/.test(normalized)) {
    return "practice";
  }
  if (category === "teacher_guidance") return "teacher_support";
  if (category === "supporting_content") return "reference";
  if (/\bpassage\b|\bstory\b|\bread(?:ing)?\b/.test(normalized)) return "passage";
  return "instruction";
}

function pageCategoryWithinSection(
  sectionCategory: ContentCategory,
  pageText: string
): ContentCategory {
  const normalized = normalizeForMatching(pageText);
  const openingText = normalized.slice(0, 500);
  if (/\banswer key\b|\banswers\b/.test(openingText)) return "answer_key";
  if (/\bquiz\b|\btest\b|\bassessment\b/.test(normalized)) return "assessment";
  if (/\bquestions?\b|\bexercises?\b|\bworksheet\b/.test(normalized)) {
    return sectionCategory === "mixed_teaching" ? "concept_practice" : sectionCategory;
  }
  return sectionCategory;
}

export function learningUnitBaseTitle(value: string) {
  const original = value.trim();
  const withoutWorkbookGroupPrefix = original.replace(
    /^\s*(?:stories?\s*(?:&|and)\s*exercises?|lessons?\s*(?:&|and)\s*exercises?)\s*:\s*/i,
    ""
  );
  const roleSuffix = "(?:reading\\s+passage|answer\\s+key|story|passage|reading|exercises?|questions?|answers?|practice|worksheet)";
  const withoutParenthesizedRole = withoutWorkbookGroupPrefix.replace(
    new RegExp(`\\s*[\\(\\[]\\s*${roleSuffix}\\s*[\\)\\]]\\s*$`, "i"),
    ""
  );
  const withoutTrailingRole = withoutParenthesizedRole.replace(
    new RegExp(`\\s*(?:[-–—:]\\s*)?${roleSuffix}\\s*$`, "i"),
    ""
  ).replace(/\s*[-–—:]\s*$/, "");
  return withoutTrailingRole.trim() || withoutWorkbookGroupPrefix.trim() || original;
}

function splitIndependentPracticeCollection(
  section: DocumentAnalysis["sections"][number],
  pageNumberMapping: PageNumberMapping | null
) {
  const pageCount = section.endPage - section.startPage + 1;
  if (section.category !== "concept_practice" || pageCount <= 1) return [section];

  const alphaRange = section.title.match(/\b([a-z])\s*[-–—]\s*([a-z])\b/i);
  const numericRange = section.title.match(/\b(\d+)\s*[-–—]\s*(\d+)\b/);
  const labels = (() => {
    if (alphaRange) {
      const first = alphaRange[1]!.toUpperCase().charCodeAt(0);
      const last = alphaRange[2]!.toUpperCase().charCodeAt(0);
      if (last >= first && last - first + 1 === pageCount) {
        return Array.from({ length: pageCount }, (_, index) => String.fromCharCode(first + index));
      }
    }
    if (numericRange) {
      const first = Number(numericRange[1]);
      const last = Number(numericRange[2]);
      if (last >= first && last - first + 1 === pageCount) {
        return Array.from({ length: pageCount }, (_, index) => String(first + index));
      }
    }
    return null;
  })();
  const matchedRange = alphaRange ?? numericRange;
  if (!labels || !matchedRange || matchedRange.index == null) return [section];

  const titlePrefix = section.title
    .slice(0, matchedRange.index)
    .replace(/\bpractice\b/gi, "")
    .replace(/\s*[-–—:]\s*$/, "")
    .trim();
  const titleSuffix = section.title
    .slice(matchedRange.index + matchedRange[0].length)
    .replace(/\bpractice\b/gi, "")
    .replace(/^\s*[-–—:]\s*/, "")
    .trim();

  return labels.map((label, index) => {
    const pdfPageNumber = section.startPage + index;
    return {
      ...section,
      title: [titlePrefix, label, titleSuffix, "Practice"].filter(Boolean).join(" "),
      startPage: pdfPageNumber,
      endPage: pdfPageNumber,
      estimatedMinutes: Math.max(1, Math.round(section.estimatedMinutes / pageCount)),
      pageSelectionAudit: createPageSelectionAudit(
        pageNumberMapping,
        pdfPageNumber,
        pdfPageNumber
      )
    };
  });
}

export function buildLearningUnitMetadata(input: {
  label: string;
  role: string;
  pageCount: number;
  pages: PdfPageText[];
  pageNumberMapping: PageNumberMapping | null;
  sections: DocumentAnalysis["sections"];
}) {
  const sectionByPage = new Map<number, DocumentAnalysis["sections"][number]>();
  for (const section of input.sections) {
    for (let pdfPageNumber = section.startPage; pdfPageNumber <= section.endPage; pdfPageNumber += 1) {
      if (!sectionByPage.has(pdfPageNumber)) sectionByPage.set(pdfPageNumber, section);
    }
  }

  const learningUnits: DocumentLearningUnit[] = [];
  const unitIdByPage = new Map<number, string>();
  const sectionGroups: Array<DocumentAnalysis["sections"]> = [];
  const schedulableSections = input.sections
    .filter((candidate) => candidate.includeInPlan)
    .flatMap((section) => splitIndependentPracticeCollection(section, input.pageNumberMapping));
  for (const section of schedulableSections) {
    const baseTitle = learningUnitBaseTitle(section.title);
    const previousGroup = sectionGroups.at(-1);
    const previousSection = previousGroup?.at(-1);
    const previousBaseTitle = previousGroup?.[0]
      ? learningUnitBaseTitle(previousGroup[0].title)
      : null;
    if (
      previousGroup &&
      previousSection &&
      previousSection.endPage + 1 === section.startPage &&
      normalizeForMatching(previousBaseTitle ?? "") === normalizeForMatching(baseTitle)
    ) {
      previousGroup.push(section);
    } else {
      sectionGroups.push([section]);
    }
  }

  for (const sectionGroup of sectionGroups) {
    const firstSection = sectionGroup[0]!;
    const leafTitle = learningUnitBaseTitle(firstSection.title);
    const idStem = normalizeSubjectKey(leafTitle) || "teaching-unit";
    const id = `unit-${String(learningUnits.length + 1).padStart(4, "0")}-${idStem}`;
    const openingText = input.pages[firstSection.startPage - 1]?.text ?? "";
    const titleScore = pageTitleMatchScore(openingText, firstSection.title);
    const inferredBoundaryEvidence: BoundaryEvidence[] = titleScore >= 0.6 ? [{
      source: "page_semantics",
      pdfPageNumber: firstSection.startPage,
      detail: `The opening page matched the unit title with score ${titleScore.toFixed(2)}.`,
      confidence: titleScore >= 0.9 ? "high" : "medium"
    }] : [];
    const boundaryEvidence = [
      ...sectionGroup.flatMap((section) => section.boundaryEvidence ?? []),
      ...inferredBoundaryEvidence
    ];
    const sectionConfidences = sectionGroup.map((section) => section.boundaryConfidence ?? "low");
    const boundaryConfidence = sectionConfidences.includes("low")
      ? titleScore >= 0.9 ? "high" as const : titleScore >= 0.6 ? "medium" as const : "low" as const
      : sectionConfidences.includes("medium")
        ? "medium" as const
        : "high" as const;
    const componentDrafts: Array<{
      pdfPageStart: number;
      pdfPageEnd: number;
      category: ContentCategory;
      role: LearningUnitPageRole;
    }> = [];
    for (const section of sectionGroup) {
      for (let pdfPageNumber = section.startPage; pdfPageNumber <= section.endPage; pdfPageNumber += 1) {
        const pageText = input.pages[pdfPageNumber - 1]?.text ?? "";
        const category = pageCategoryWithinSection(section.category, pageText);
        const role = learningUnitPageRole(category, pageText);
        const previous = componentDrafts.at(-1);
        if (previous && previous.category === category && previous.role === role) {
          previous.pdfPageEnd = pdfPageNumber;
        } else {
          componentDrafts.push({
            pdfPageStart: pdfPageNumber,
            pdfPageEnd: pdfPageNumber,
            category,
            role
          });
        }
      }
    }
    learningUnits.push({
      id,
      title: leafTitle,
      sequenceOrder: learningUnits.length,
      components: componentDrafts.map((component) => ({
        ...component,
        includeInPacket: true,
        pageNumberConversionAudit: createPageSelectionAudit(
          input.pageNumberMapping,
          component.pdfPageStart,
          component.pdfPageEnd
        )
      })),
      splittable: false,
      approvedSplitPoints: [],
      estimatedMinutes: Math.max(
        1,
        sectionGroup.reduce((total, section) => total + section.estimatedMinutes, 0)
      ),
      conceptLabels: [leafTitle],
      boundaryConfidence,
      boundaryEvidence
    });
    for (const section of sectionGroup) {
      for (let pdfPageNumber = section.startPage; pdfPageNumber <= section.endPage; pdfPageNumber += 1) {
        unitIdByPage.set(pdfPageNumber, id);
      }
    }
  }

  const pageLedger: DocumentPageLedgerEntry[] = Array.from(
    { length: input.pageCount },
    (_, pageIndex) => {
      const pdfPageNumber = pageIndex + 1;
      const section = sectionByPage.get(pdfPageNumber);
      const pageText = input.pages[pageIndex]?.text ?? "";
      const category = section
        ? pageCategoryWithinSection(section.category, pageText)
        : "unclear";
      const learningUnitId = unitIdByPage.get(pdfPageNumber) ?? null;
      const contentPageNumber = pdfPageNumberToContentPageNumber(
        input.pageNumberMapping,
        pdfPageNumber
      );
      const isOpeningPage = section?.startPage === pdfPageNumber;
      return {
        pdfPageNumber,
        contentPageLabel: input.pages[pageIndex]?.label ?? (
          contentPageNumber == null ? null : String(contentPageNumber)
        ),
        contentPageNumber,
        titleEvidence: isOpeningPage && section
          ? titleMatchVariants(section.title)
          : [],
        category,
        supportScope: section?.supportScope ?? null,
        includeInPlan: Boolean(section?.includeInPlan && learningUnitId),
        learningUnitId,
        roleWithinUnit: learningUnitId ? learningUnitPageRole(category, pageText) : null,
        classificationConfidence: section?.classificationConfidence ?? "low",
        boundaryEvidence: isOpeningPage ? section?.boundaryEvidence ?? [] : [],
        pageNumberConversionAudit: createPageSelectionAudit(
          input.pageNumberMapping,
          pdfPageNumber,
          pdfPageNumber
        )
      };
    }
  );

  const reasons: string[] = [];
  if (pageLedger.length !== input.pageCount) reasons.push("The physical page ledger is incomplete.");
  if (learningUnits.length === 0) reasons.push("No schedulable learning units were identified.");
  if (learningUnits.some((unit) => unit.boundaryConfidence === "low")) {
    reasons.push("One or more included learning units has an unresolved or low-confidence boundary.");
  }
  if (pageLedger.some((page) =>
    !pageSelectionAuditMatches(
      page.pageNumberConversionAudit,
      page.pdfPageNumber,
      page.pdfPageNumber
    )
  )) {
    reasons.push("One or more physical pages is missing its page-number conversion audit.");
  }
  if (pageLedger.some((page) => page.includeInPlan && !page.learningUnitId)) {
    reasons.push("An included physical page is not attached to a validated learning unit.");
  }

  return {
    pageLedger,
    learningUnits,
    documentQuality: {
      status: reasons.length === 0 ? "passed" as const : "rejected" as const,
      checks: {
        everyPhysicalPageLedgered: pageLedger.length === input.pageCount,
        hasSchedulableLearningUnits: learningUnits.length > 0,
        everyPageNumberSelectionAudited: !reasons.some((reason) => reason.includes("conversion audit")),
        everyIncludedPageHasUnit: !reasons.some((reason) => reason.includes("not attached")),
        allIncludedBoundariesValidated: !reasons.some((reason) => reason.includes("low-confidence"))
      },
      reasons
    }
  };
}

export async function getPdfPageCount(bytes: Uint8Array) {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdfjs.getDocument({
      // PDF.js is more tolerant of owner-encrypted or oddly-structured PDFs
      // than pdf-lib, and it does not detach the caller's original buffer when
      // given a sliced copy.
      data: bytes.slice(),
      stopAtErrors: false
    }).promise;
    try {
      return document.numPages;
    } finally {
      await document.destroy();
    }
  } catch {
    return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
  }
}

async function inferAcademicLevelFromPdf(
  bytes: Uint8Array,
  label: string,
  sectionTitles: string[] = [],
  usageContext: ModelUsageContext = {}
): Promise<AcademicLevelEvidence | null> {
  try {
    const evidencePart = bytes.byteLength <= MAX_GEMINI_PDF_BYTES
      ? {
          inlineData: {
            mimeType: "application/pdf",
            data: Buffer.from(bytes).toString("base64")
          }
        }
      : {
          text: await (async () => {
            const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
            const document = await pdfjs.getDocument({ data: bytes.slice(), stopAtErrors: false }).promise;
            try {
              const pages = await extractPageText(document, 12);
              return pages.map((page) => `PDF PAGE ${page.pageIndex + 1}\n${page.text}`).join("\n\n").slice(0, 60_000);
            } finally {
              await document.destroy();
            }
          })()
        };
    const parsed = await requestGeminiJson<{ academicLevel?: unknown }>([
      evidencePart,
      {
        text: `Focus on the first 12 pages of this curriculum material and identify its academic level from its cover, title page, copyright/introduction pages, and table of contents. The upload was labeled "${label}".
Publisher level names and explicit grade/age statements are primary evidence. Scope and sequence can be supporting evidence. Do not force publisher levels such as A-G into US grades unless the document itself supplies that mapping. If no reliable level is present, say so with low confidence and null grades.
Additional indexed section titles: ${JSON.stringify(sectionTitles.slice(0, 40))}
Return JSON only:
{"academicLevel":{"label":"publisher level or best plain description","gradeMin":1,"gradeMax":2,"evidence":["short exact or closely paraphrased evidence"],"confidence":"low|medium|high"}}
Use 0 for Kindergarten and null for gradeMin/gradeMax when no reliable grade mapping is stated.`
      }
    ], {
      operation: "document.academic_level_detection",
      context: usageContext
    });
    return normalizeAcademicLevel(parsed.academicLevel);
  } catch (error) {
    console.error(`Could not infer academic level from the opening pages of ${label}:`, error);
    return null;
  }
}

export async function analyzePdf(input: {
  bytes: Uint8Array;
  label: string;
  role: string;
  pageCount: number;
  usageContext: ModelUsageContext;
}) {
  const discovery = await discoverPdfStructure(input.bytes, input.label, input.usageContext);
  const structure = discovery.structure;
  if (structure) {
    let blankPages = new Set<number>();
    try {
      blankPages = await detectVisuallyBlankPdfPages(input.bytes);
    } catch (error) {
      console.error(`Could not complete the visual blank-page scan for ${input.label}:`, error);
    }
    let pageNumberMapping = discovery.pageNumberMapping;
    const pageNumberDetectionAudit = [...discovery.pageNumberDetectionAudit];
    if (!pageNumberMapping) {
      try {
        const visualDetection = await detectPageNumberMappingWithVisualOcr(
          input.bytes,
          input.pageCount,
          input.usageContext
        );
        pageNumberMapping = visualDetection.mapping;
        pageNumberDetectionAudit.push(visualDetection.audit);
      } catch (error) {
        pageNumberDetectionAudit.push({
          method: "ai_visual_ocr",
          attempted: true,
          succeeded: false,
          sampledPdfPages: [],
          note: error instanceof Error ? error.message.slice(0, 300) : "Targeted visual OCR failed."
        });
      }
    }
    const completedSections = completeStructureCoverage(structure.sections, input.pageCount);
    let classifiedSections = completedSections;
    try {
      classifiedSections = await classifyStructuredSections({
        label: input.label,
        role: input.role,
        sections: completedSections,
        pages: discovery.pages,
        usageContext: input.usageContext
      });
    } catch (error) {
      console.error(`Could not classify indexed ranges for ${input.label}; using conservative title-based classification.`, error);
    }
    classifiedSections = splitSectionsAroundBlankPages(classifiedSections, blankPages);
    const academicLevel = await inferAcademicLevelFromPdf(
      input.bytes,
      input.label,
      classifiedSections.map((section) => section.title),
      input.usageContext
    );
    const normalized = normalizeAnalysis(
      {
        suggestedTitle: input.label,
        summary: structure.summary,
        audience: input.role as DocumentAnalysis["audience"],
        analysisMethod: structure.method,
        academicLevel,
        pageNumberMapping,
        pageNumberDetectionAudit,
        sections: classifiedSections as DocumentAnalysis["sections"]
      },
      input.label,
      input.role,
      input.pageCount
    );
    const unitMetadata = buildLearningUnitMetadata({
      label: input.label,
      role: input.role,
      pageCount: input.pageCount,
      pages: discovery.pages,
      pageNumberMapping,
      sections: normalized.sections
    });
    if (unitMetadata.documentQuality.status !== "passed") {
      throw new Error(
        `Treeschool could not safely identify learning-unit boundaries in ${input.label}: ` +
        unitMetadata.documentQuality.reasons.join(" ")
      );
    }
    return {
      ...normalized,
      structureVersion: 3,
      classificationVersion: 3,
      ...unitMetadata
    };
  }

  if (
    input.bytes.byteLength > MAX_GEMINI_PDF_BYTES ||
    input.pageCount > MAX_GEMINI_PDF_PAGES
  ) {
    throw new Error(
      "No reliable PDF outline or table of contents was found, and this document exceeds Gemini's 50 MB or 1,000-page full-document limit."
    );
  }

  let blankPages = new Set<number>();
  try {
    blankPages = await detectVisuallyBlankPdfPages(input.bytes);
  } catch (error) {
    console.error(`Could not complete the visual blank-page scan for ${input.label}:`, error);
  }

  const prompt = `Review this curriculum PDF page by page. It was labeled "${input.label}" and its role is "${input.role}".
Return JSON only with:
{
  "suggestedTitle": "short title",
  "summary": "what this content teaches and how it is organized",
  "audience": "student|teacher|answer_key|mixed",
  "academicLevel": {
    "label": "publisher level or best plain description",
    "gradeMin": 1,
    "gradeMax": 2,
    "evidence": ["short evidence from the title, introductory pages, or contents"],
    "confidence": "low|medium|high"
  },
  "pageNumberMapping": {
    "source": "ai_visual_ocr",
    "confidence": "low|medium|high",
    "globalFormat": {
      "style": "arabic_numeric|roman_numeral|mixed|unknown",
      "location": "top_left|top_center|top_right|bottom_left|bottom_center|bottom_right|varies|unknown",
      "pattern": "brief description",
      "detectionMethod": "ai_visual_ocr",
      "sampledPdfPages": [1, 2, 10]
    },
    "detectionAudit": [{
      "method": "ai_visual_ocr",
      "attempted": true,
      "succeeded": true,
      "sampledPdfPages": [1, 2, 10],
      "note": "what visible page-number evidence was used"
    }],
    "segments": [{
      "pdfPageStart": 5,
      "pdfPageEnd": 104,
      "contentPageStart": 1,
      "contentPageEnd": 100
    }]
  },
  "sections": [
    {
      "title": "lesson or unit title",
      "startPage": 1,
      "endPage": 4,
      "estimatedMinutes": 30,
      "notes": "brief prerequisites or pairing notes",
      "category": "concept_introduction|concept_practice|worked_example|quiz|assessment|review|answer_key|supporting_content|teacher_guidance|mixed_teaching|table_of_contents|workbook_cover|publishing_page|empty_page|academic_citation|unclear",
      "includeInPlan": true,
      "classificationConfidence": "low|medium|high",
      "exclusionReason": null
    }
  ]
}
For academicLevel, prioritize explicit publisher grade, age, or level statements on the cover/title/introduction and use the table of contents as supporting evidence. Do not invent a US-grade mapping for publisher levels such as A-G unless the document supplies one; use null grades when uncertain.
Section startPage/endPage values must be 1-based physical PDF page numbers, not printed page labels. This upload contains exactly ${input.pageCount} physical PDF pages. It may be an excerpt whose table of contents references material that is not physically present; ignore every out-of-bounds contents entry and never invent a section or lesson for missing pages. First look for a table of contents, then classify only the represented ranges that exist in this PDF. If no useful contents exists, inspect every page and create contiguous classified ranges covering the entire document. Keep concept introductions, practice, worked examples, quizzes, assessments, reviews, answer keys, teacher guidance, and supporting material explicitly connected to teaching. Filter table-of-contents pages, covers, publisher/legal pages, blank pages, unrelated academic citations, and unclear content. Citations being explicitly taught are teaching content rather than academic_citation.
For pageNumberMapping, use visual/OCR evidence from page-number areas, especially consistent corners. Record only page numbers visibly printed inside the content and map them to physical PDF pages. Each segment must be linear and equal length; omit the mapping when it cannot be established reliably. Record the global format/location and a detectionAudit. Keep sections contiguous, ordered, non-overlapping, and collectively describe the whole document.`;

  const analysis = await requestGeminiJson<Partial<DocumentAnalysis>>([
    {
      inlineData: {
        mimeType: "application/pdf",
        data: Buffer.from(input.bytes).toString("base64")
      }
    },
    { text: prompt }
  ], {
    operation: "document.full_pdf_analysis",
    context: input.usageContext
  });

  const normalized = normalizeAnalysis(
    {
      ...analysis,
      analysisMethod: "full_document",
      pageNumberMapping: discovery.pageNumberMapping ?? analysis.pageNumberMapping,
      pageNumberDetectionAudit: [
        ...discovery.pageNumberDetectionAudit,
        ...(!discovery.pageNumberMapping ? [{
          method: "ai_visual_ocr" as const,
          attempted: true,
          succeeded: Boolean(normalizePageNumberMapping(analysis.pageNumberMapping, input.pageCount)),
          sampledPdfPages: normalizePageNumberMapping(analysis.pageNumberMapping, input.pageCount)?.globalFormat?.sampledPdfPages ?? [],
          note: normalizePageNumberMapping(analysis.pageNumberMapping, input.pageCount)
            ? "The full-document visual analysis supplied a page-number mapping."
            : "The full-document visual analysis did not establish a reliable page-number mapping."
        }] : [])
      ],
      sections: splitSectionsAroundBlankPages(
        completeStructureCoverage(
          (analysis.sections ?? []) as PdfStructure["sections"],
          input.pageCount
        ).map((section) => ({
          ...section,
          boundaryConfidence: section.boundaryConfidence ?? "medium",
          boundaryEvidence: section.boundaryEvidence ?? [{
            source: "full_document_analysis" as const,
            pdfPageNumber: section.startPage,
            detail: "The full-document visual analysis identified this physical page as the start of the range.",
            confidence: "medium" as const
          }]
        })),
        blankPages
      ) as DocumentAnalysis["sections"]
    },
    input.label,
    input.role,
    input.pageCount
  );
  const unitMetadata = buildLearningUnitMetadata({
    label: input.label,
    role: input.role,
    pageCount: input.pageCount,
    pages: discovery.pages,
    pageNumberMapping: normalized.pageNumberMapping ?? null,
    sections: normalized.sections
  });
  if (unitMetadata.documentQuality.status !== "passed") {
    throw new Error(
      `Treeschool could not safely identify learning-unit boundaries in ${input.label}: ` +
      unitMetadata.documentQuality.reasons.join(" ")
    );
  }
  return {
    ...normalized,
    structureVersion: 3,
    classificationVersion: 3,
    ...unitMetadata
  };
}

export async function generateNativeWorkbookCatalogDescription(input: {
  title: string;
  subject: string;
  gradeLabel: string;
  languageCode: string;
  pageCount: number;
  analysis: DocumentAnalysis;
  usageContext: ModelUsageContext;
}) {
  const learningUnits = (input.analysis.learningUnits ?? []).slice(0, 30).map((unit) => ({
    title: unit.title,
    concepts: unit.conceptLabels.slice(0, 5)
  }));
  const parsed = await requestGeminiJson<{ description?: unknown }>([{
    text: `Write a concise bookstore description for this printable homeschool workbook.
Use one or two plain-English sentences totaling 35-65 words. Be factual and parent-friendly. Mention the most useful subject matter and organization, but do not invent standards alignment, accreditation, outcomes, or features absent from the metadata. Treat the catalog grade supplied below as authoritative: never state, imply, or substitute a different grade or age range from the indexed material. Do not use markdown, headings, quotation marks, hype, or a call to action.

WORKBOOK:
${JSON.stringify({
  title: input.title,
  subject: input.subject,
  grade: input.gradeLabel,
  workbookLanguage: input.languageCode,
  pageCount: input.pageCount,
  indexedSummary: input.analysis.summary,
  learningUnits
})}

Return JSON only: {"description":"..."}`
  }], {
    operation: "native_workbook.catalog_description",
    context: input.usageContext
  });
  const description = String(parsed.description ?? "").replace(/\s+/g, " ").trim();
  if (!description) throw new Error("AI analysis did not produce a workbook description.");
  return description.slice(0, 3_000);
}

export async function createLearningYear(input: {
  parentUserId: string;
  profileId: string;
  title: string;
  totalWeeks: number;
  startDate?: string | null;
  endDate?: string | null;
  teachingDaysPerWeek?: number | null;
  printPageSize?: string | null;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const ownedProfile = await requireOwnedProfile(input.parentUserId, input.profileId);
  const totalWeeks = Math.max(1, Math.min(52, Math.round(input.totalWeeks || 36)));
  const teachingDaysPerWeek = normalizeTeachingDays(input.teachingDaysPerWeek, 5);
  const preferences = await getAccountPreferences(input.parentUserId);
  const printPageSize =
    normalizePrintPageSize(input.printPageSize) ?? preferences.preferredPrintPageSize ?? "letter";
  const schoolYearPeriod = normalizeSchoolYearPeriod(input.startDate, input.endDate);
  await setAccountPrintPageSize(ownedProfile.accountId, printPageSize);

  const [year] = await db
    .insert(learningYears)
    .values({
      profileId: input.profileId,
      title: input.title.trim() || "My learning year",
      totalWeeks,
      teachingDaysPerWeek,
      printPageSize,
      startDate: schoolYearPeriod.startDate,
      endDate: schoolYearPeriod.endDate
    })
    .returning();

  return year;
}

export async function updateLearningYearDetails(input: {
  parentUserId: string;
  learningYearId: string;
  totalWeeks: number;
  startDate?: string | null;
  endDate?: string | null;
  teachingDaysPerWeek?: number | null;
  printPageSize?: string | null;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const year = await requireOwnedYear(input.parentUserId, input.learningYearId);
  const totalWeeks = Math.max(1, Math.min(52, Math.round(input.totalWeeks || year.totalWeeks)));
  const teachingDaysPerWeek = normalizeTeachingDays(
    input.teachingDaysPerWeek,
    year.teachingDaysPerWeek ?? 5
  );
  const printPageSize = normalizePrintPageSize(input.printPageSize) ?? normalizePrintPageSize(year.printPageSize) ?? "letter";
  const schoolYearPeriod = normalizeSchoolYearPeriod(
    input.startDate === undefined ? isoDateOnly(year.startDate) : input.startDate,
    input.endDate === undefined ? isoDateOnly(year.endDate) : input.endDate
  );

  const subjectSchedules = await db
    .select({
      subjectLabel: learningYearSubjectPreferences.subjectLabel,
      daysPerWeek: learningYearSubjectPreferences.daysPerWeek
    })
    .from(learningYearSubjectPreferences)
    .where(eq(learningYearSubjectPreferences.learningYearId, year.id));
  const incompatibleSubject = subjectSchedules.find(
    (subject) => subject.daysPerWeek && teachingDaysPerWeek && subject.daysPerWeek > teachingDaysPerWeek
  );
  if (incompatibleSubject) {
    throw new Error(
      `${incompatibleSubject.subjectLabel} is set for ${incompatibleSubject.daysPerWeek} days per week. Edit that subject before reducing the school week to ${teachingDaysPerWeek} days.`
    );
  }

  const structureChanged =
    totalWeeks !== year.totalWeeks ||
    teachingDaysPerWeek !== year.teachingDaysPerWeek ||
    printPageSize !== year.printPageSize;
  const calendarChanged =
    isoDateOnly(schoolYearPeriod.startDate) !== isoDateOnly(year.startDate) ||
    isoDateOnly(schoolYearPeriod.endDate) !== isoDateOnly(year.endDate);
  const changed = structureChanged || calendarChanged;
  if (!changed) return year;

  const ownedProfile = await requireOwnedProfile(input.parentUserId, year.profileId);
  await setAccountPrintPageSize(ownedProfile.accountId, printPageSize);
  const now = new Date();
  const [updated] = await db
    .update(learningYears)
    .set({
      totalWeeks,
      teachingDaysPerWeek,
      printPageSize,
      startDate: schoolYearPeriod.startDate,
      endDate: schoolYearPeriod.endDate,
      ...(structureChanged ? { materialsUpdatedAt: now } : {}),
      updatedAt: now
    })
    .where(eq(learningYears.id, year.id))
    .returning();

  return updated;
}

export async function uploadContentDocument(input: {
  parentUserId: string;
  learningYearId: string;
  label: string;
  subjectId?: string | null;
  subjectLabel?: string | null;
  documentRole: string;
  filename: string;
  mimeType?: string;
  sourceKind?: SourceKind;
  clientUploadId?: string | null;
  materialSetId?: string | null;
  prerequisiteMaterialSetId?: string | null;
  parentNotes?: string | null;
  subjectDaysPerWeek?: number | null;
  bytes: Uint8Array;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const year = await requireOwnedYear(input.parentUserId, input.learningYearId);
  const role = ALLOWED_ROLES.has(input.documentRole) ? input.documentRole : "student";
  const uploadSubject = await resolveUploadSubject({
    subjectId: input.subjectId,
    subjectLabel: input.subjectLabel
  });
  validateSubjectSchedule({
    subjectLabel: uploadSubject.subjectLabel,
    daysPerWeek: input.subjectDaysPerWeek,
    teachingDaysPerWeek: year.teachingDaysPerWeek
  });
  const classified = classifyPaperPlanUpload(input.filename, input.mimeType);
  const sourceKind = input.sourceKind ?? classified?.sourceKind ?? "pdf";
  const contentType = classified?.contentType ?? input.mimeType ?? "application/octet-stream";
  const materialSet = await ensureMaterialSet({
    learningYearId: year.id,
    materialSetId: input.materialSetId,
    label: input.label.trim() || input.filename,
    prerequisiteMaterialSetId: input.prerequisiteMaterialSetId
  });

  if (input.clientUploadId) {
    const [existingDocument] = await db
      .select()
      .from(contentDocuments)
      .where(and(
        eq(contentDocuments.learningYearId, year.id),
        eq(contentDocuments.clientUploadId, input.clientUploadId)
      ))
      .limit(1);
    if (existingDocument) return existingDocument;
  }

  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Files must be between 1 byte and 200 MB.");
  }

  const pageCount =
    sourceKind === "pdf"
      ? await getPdfPageCount(input.bytes)
      : 1;
  if (sourceKind === "pdf") {
    await assertLearningYearPdfPageCapacity({
      learningYearId: year.id,
      additionalPageCount: pageCount
    });
  }
  const id = crypto.randomUUID();
  const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
  const objectPath = `paper-plans/${year.profileId}/${year.id}/${id}-${safeFilename}`;

  await uploadPrivateFile({
    objectPath,
    contentType,
    data: input.bytes
  });

  const [sortRow] = await db
    .select({ id: contentDocuments.id })
    .from(contentDocuments)
    .where(eq(contentDocuments.learningYearId, year.id));

  let document: typeof contentDocuments.$inferSelect;
  try {
    [document] = await db
      .insert(contentDocuments)
      .values({
      id,
      learningYearId: year.id,
      materialSetId: materialSet.id,
      label: input.label.trim() || input.filename,
      subjectId: uploadSubject.subjectId,
      subjectLabel: uploadSubject.subjectLabel,
      documentRole: role,
      originalFilename: input.filename,
      objectPath,
      mimeType: contentType,
      sourceKind,
      clientUploadId: input.clientUploadId || null,
      sizeBytes: input.bytes.byteLength,
      pageCount,
      sortOrder: sortRow ? 1 : 0,
      parentNotes: input.parentNotes?.trim() || null,
      analysisStatus: sourceKind === "pdf" ? "queued" : "ready",
      analysisJson:
        sourceKind === "pdf"
          ? {
              queuedAt: new Date().toISOString()
            }
          : {
              suggestedTitle: input.label.trim() || input.filename,
              summary:
                sourceKind === "image"
                  ? "Uploaded supporting image. It is stored with this subject for planning context."
                  : "Uploaded supporting text file. It is stored with this subject for planning context.",
              audience: role,
              analysisMethod: "uploaded_file",
              isSupplemental: true,
              sections: []
            }
      })
      .returning();
  } catch (error) {
    if (input.clientUploadId) {
      const [existingDocument] = await db
        .select()
        .from(contentDocuments)
        .where(and(
          eq(contentDocuments.learningYearId, year.id),
          eq(contentDocuments.clientUploadId, input.clientUploadId)
        ))
        .limit(1);
      if (existingDocument) {
        await deletePrivateFile(objectPath).catch(() => undefined);
        return existingDocument;
      }
    }
    throw error;
  }

  await upsertSubjectPreference({
    learningYearId: year.id,
    subjectId: uploadSubject.subjectId,
    subjectLabel: uploadSubject.subjectLabel,
    daysPerWeek: input.subjectDaysPerWeek
  });

  await db
    .update(learningYears)
    .set({ materialsUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(learningYears.id, year.id));

  if (sourceKind === "pdf") {
    await queuePaperDocumentJob(document.id);
  }

  return document;
}

export async function registerUploadedContentDocument(input: {
  parentUserId: string;
  learningYearId: string;
  label: string;
  subjectId?: string | null;
  subjectLabel?: string | null;
  documentRole: string;
  filename: string;
  mimeType?: string;
  parentNotes?: string | null;
  subjectDaysPerWeek?: number | null;
  materialSetId?: string | null;
  prerequisiteMaterialSetId?: string | null;
  objectPath: string;
  sizeBytes: number;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const year = await requireOwnedYear(input.parentUserId, input.learningYearId);
  const expectedPrefix = `plan-pack-staging/`;
  if (!input.objectPath.startsWith(expectedPrefix)) throw new Error("Invalid staged upload path.");
  if (input.sizeBytes < 1 || input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error("Files must be between 1 byte and 200 MB.");
  }

  const role = ALLOWED_ROLES.has(input.documentRole) ? input.documentRole : "student";
  const uploadSubject = await resolveUploadSubject({
    subjectId: input.subjectId,
    subjectLabel: input.subjectLabel
  });
  validateSubjectSchedule({
    subjectLabel: uploadSubject.subjectLabel,
    daysPerWeek: input.subjectDaysPerWeek,
    teachingDaysPerWeek: year.teachingDaysPerWeek
  });
  const classified = classifyPaperPlanUpload(input.filename, input.mimeType);
  if (!classified) throw new Error("Choose only PDF, text, or image files.");
  const sourceKind = classified.sourceKind;
  const materialSet = await ensureMaterialSet({
    learningYearId: year.id,
    materialSetId: input.materialSetId,
    label: input.label.trim() || input.filename,
    prerequisiteMaterialSetId: input.prerequisiteMaterialSetId
  });
  const [sortRow] = await db
    .select({ id: contentDocuments.id })
    .from(contentDocuments)
    .where(eq(contentDocuments.learningYearId, year.id));

  const [document] = await db
    .insert(contentDocuments)
    .values({
      id: crypto.randomUUID(),
      learningYearId: year.id,
      materialSetId: materialSet.id,
      label: input.label.trim() || input.filename,
      subjectId: uploadSubject.subjectId,
      subjectLabel: uploadSubject.subjectLabel,
      documentRole: role,
      originalFilename: input.filename,
      objectPath: input.objectPath,
      mimeType: classified.contentType,
      sourceKind,
      sizeBytes: input.sizeBytes,
      pageCount: 1,
      sortOrder: sortRow ? 1 : 0,
      parentNotes: input.parentNotes?.trim() || null,
      analysisStatus: sourceKind === "pdf" ? "queued" : "ready",
      analysisJson: sourceKind === "pdf"
        ? { queuedAt: new Date().toISOString() }
        : {
            suggestedTitle: input.label.trim() || input.filename,
            summary: "Uploaded supporting material stored for planning context.",
            audience: role,
            analysisMethod: "uploaded_file",
            isSupplemental: true,
            sections: []
          }
    })
    .returning();

  await upsertSubjectPreference({
    learningYearId: year.id,
    subjectId: uploadSubject.subjectId,
    subjectLabel: uploadSubject.subjectLabel,
    daysPerWeek: input.subjectDaysPerWeek
  });

  await db
    .update(learningYears)
    .set({ materialsUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(learningYears.id, year.id));

  if (sourceKind === "pdf") await queuePaperDocumentJob(document.id);
  return document;
}

async function queuePaperDocumentJob(documentId: string) {
  await db
    .insert(paperDocumentJobs)
    .values({
      documentId,
      status: "queued",
      attemptCount: 0,
      availableAt: new Date(),
      claimedAt: null,
      heartbeatAt: null,
      workerId: null,
      lastError: null
    })
    .onConflictDoUpdate({
      target: paperDocumentJobs.documentId,
      set: {
        status: "queued",
        availableAt: new Date(),
        claimedAt: null,
        heartbeatAt: null,
        workerId: null,
        lastError: null,
        updatedAt: new Date()
      }
    });
}

function calculateDocumentJobRetryDelayMs(attemptCount: number) {
  return Math.min(10 * 60 * 1000, 30_000 * 2 ** Math.max(0, attemptCount - 1));
}

async function claimNextPaperDocumentJob(workerId: string) {
  const [claimedJob] = await db.execute<PaperDocumentJobRow>(sql`
    WITH next_job AS (
      SELECT id
      FROM paper_document_jobs
      WHERE status IN ('queued', 'retry_wait')
        AND available_at <= NOW()
      ORDER BY available_at ASC, updated_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE paper_document_jobs pdj
    SET
      status = 'running',
      claimed_at = NOW(),
      heartbeat_at = NOW(),
      worker_id = ${workerId},
      updated_at = NOW()
    FROM next_job
    WHERE pdj.id = next_job.id
    RETURNING
      pdj.id,
      pdj.document_id AS "documentId",
      pdj.status,
      pdj.attempt_count AS "attemptCount",
      pdj.available_at AS "availableAt",
      pdj.claimed_at AS "claimedAt",
      pdj.heartbeat_at AS "heartbeatAt",
      pdj.worker_id AS "workerId",
      pdj.last_error AS "lastError",
      pdj.created_at AS "createdAt",
      pdj.updated_at AS "updatedAt"
  `);

  return claimedJob ?? null;
}

async function markPaperDocumentJobCompleted(job: PaperDocumentJobRow, workerId: string) {
  await db
    .update(paperDocumentJobs)
    .set({
      status: "completed",
      availableAt: new Date(),
      claimedAt: new Date(),
      heartbeatAt: new Date(),
      workerId,
      lastError: null,
      updatedAt: new Date()
    })
    .where(eq(paperDocumentJobs.id, job.id));
}

async function markPaperDocumentJobFailed(
  job: PaperDocumentJobRow,
  workerId: string,
  errorMessage: string,
  retryable = true
) {
  const nextAttemptCount = job.attemptCount + 1;
  const shouldRetry = retryable && nextAttemptCount < MAX_DOCUMENT_JOB_ATTEMPTS;

  await db
    .update(paperDocumentJobs)
    .set({
      status: shouldRetry ? "retry_wait" : "failed",
      attemptCount: nextAttemptCount,
      availableAt: new Date(Date.now() + calculateDocumentJobRetryDelayMs(nextAttemptCount)),
      claimedAt: null,
      heartbeatAt: null,
      workerId: shouldRetry ? null : workerId,
      lastError: errorMessage,
      updatedAt: new Date()
    })
    .where(eq(paperDocumentJobs.id, job.id));

  await db
    .update(contentDocuments)
    .set({
      analysisStatus: shouldRetry ? "queued" : "failed",
      analysisJson: {
        error: errorMessage,
        retrying: shouldRetry,
        nextAttemptAt: shouldRetry
          ? new Date(Date.now() + calculateDocumentJobRetryDelayMs(nextAttemptCount)).toISOString()
          : null
      }
    })
    .where(eq(contentDocuments.id, job.documentId));

  if (!shouldRetry) {
    await notifyOperationsFailure({
      kind: "paper_document_job_failed",
      message: errorMessage,
      identifiers: { jobId: job.id, documentId: job.documentId, attempts: nextAttemptCount }
    });
  }
}

export async function runNextPaperDocumentJob(workerId: string) {
  const job = await claimNextPaperDocumentJob(workerId);

  if (!job) {
    return null;
  }

  try {
    const [document] = await db
      .select()
      .from(contentDocuments)
      .where(eq(contentDocuments.id, job.documentId))
      .limit(1);

    if (!document) {
      await markPaperDocumentJobFailed(job, workerId, "Content document row not found.");
      return {
        jobId: job.id,
        documentId: job.documentId,
        outcome: "missing"
      };
    }

    if (!isPrintablePdfDocument(document)) {
      await db
        .update(contentDocuments)
        .set({
          analysisStatus: "ready",
          analysisJson: {
            ...(typeof document.analysisJson === "object" && document.analysisJson
              ? document.analysisJson
              : {}),
            completedAt: new Date().toISOString()
          }
        })
        .where(eq(contentDocuments.id, document.id));
      await markPaperDocumentJobCompleted(job, workerId);
      await maybeStartPlanPackPlanning(document.learningYearId);
      return {
        jobId: job.id,
        documentId: document.id,
        outcome: "skipped_non_pdf"
      };
    }

    await db
      .update(contentDocuments)
      .set({
        analysisStatus: "analyzing",
        analysisJson: {
          ...(typeof document.analysisJson === "object" && document.analysisJson
            ? document.analysisJson
            : {}),
          startedAt: new Date().toISOString()
        }
      })
      .where(eq(contentDocuments.id, document.id));

    const bytes = await downloadPrivateFile(document.objectPath);
    const pageCount = await getPdfPageCount(bytes);
    await assertLearningYearPdfPageCapacity({
      learningYearId: document.learningYearId,
      additionalPageCount: pageCount,
      excludeDocumentId: document.id
    });
    const contentFingerprint = await sha256Hex(bytes);
    await db.update(contentDocuments).set({ pageCount }).where(eq(contentDocuments.id, document.id));
    const analysis = await analyzePdf({
      bytes,
      label: document.label,
      role: document.documentRole,
      pageCount,
      usageContext: {
        learningYearId: document.learningYearId,
        contentDocumentId: document.id,
        paperDocumentJobId: job.id
      }
    });

    await db
      .update(contentDocuments)
      .set({
        label: analysis.suggestedTitle || document.label,
        analysisStatus: "ready",
        analysisJson: {
          ...analysis,
          contentFingerprint,
          completedAt: new Date().toISOString()
        }
      })
      .where(eq(contentDocuments.id, document.id));

    await markPaperDocumentJobCompleted(job, workerId);
    await maybeStartPlanPackPlanning(document.learningYearId);

    return {
      jobId: job.id,
      documentId: document.id,
      outcome: "completed"
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown PDF analysis failure.";
    console.error(`Failed to index paper document ${job.documentId}:`, error);
    await markPaperDocumentJobFailed(
      job,
      workerId,
      errorMessage,
      errorMessage !== INPUT_PDF_CAPACITY_ERROR
    );

    return {
      jobId: job.id,
      documentId: job.documentId,
      outcome: "failed",
      error: errorMessage
    };
  }
}

async function maybeStartPlanPackPlanning(learningYearId: string) {
  const [intake] = await db
    .select()
    .from(planPackIntakes)
    .where(
      and(
        eq(planPackIntakes.learningYearId, learningYearId),
        inArray(planPackIntakes.status, ["processing", "planning_pending", "failed"])
      )
    )
    .limit(1);

  if (!intake) return;

  const documents = await db
    .select()
    .from(contentDocuments)
    .where(and(eq(contentDocuments.learningYearId, learningYearId), isNull(contentDocuments.removedAt)));
  const activeDocuments = documents.filter((document) =>
    ["queued", "pending", "analyzing"].includes(document.analysisStatus)
  );

  if (activeDocuments.length > 0) return;

  const failedDocuments = documents.filter((document) => document.analysisStatus === "failed");
  if (failedDocuments.length > 0) {
    await db
      .update(planPackIntakes)
      .set({
        status: "failed",
        lastError: "One or more uploaded PDFs could not be indexed.",
        updatedAt: new Date()
      })
      .where(eq(planPackIntakes.id, intake.id));
    return;
  }

  const printableDocuments = documents.filter(isPrintablePdfDocument);
  if (printableDocuments.length === 0) {
    await db
      .update(planPackIntakes)
      .set({
        status: "failed",
        lastError: "No printable PDFs were uploaded.",
        updatedAt: new Date()
      })
      .where(eq(planPackIntakes.id, intake.id));
    return;
  }

  const existingJobs = await db
    .select({ id: weeklyPlanJobs.id })
    .from(weeklyPlanJobs)
    .where(eq(weeklyPlanJobs.learningYearId, learningYearId))
    .limit(1);

  if (existingJobs.length > 0) {
    return;
  }

  await db
    .update(planPackIntakes)
    .set({
      status: "curriculum_review",
      lastError: null,
      updatedAt: new Date()
    })
    .where(eq(planPackIntakes.id, intake.id));
}

function normalizeDayNumber(value: unknown, teachingDaysPerWeek: number | null) {
  if (!teachingDaysPerWeek) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded >= 1 && rounded <= teachingDaysPerWeek ? rounded : null;
}

function normalizePageRangeCategory(value: unknown, documentRole: string) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (PAGE_RANGE_CATEGORIES.has(normalized)) return normalized;
  if (documentRole === "answer_key") return "answer_key";
  if (documentRole === "teacher") return "teacher_support";
  return "other";
}

function pageNumberMappingFromAnalysis(analysis: unknown, pdfPageCount: number) {
  if (!analysis || typeof analysis !== "object") return null;
  return normalizePageNumberMapping(
    (analysis as { pageNumberMapping?: unknown }).pageNumberMapping,
    pdfPageCount
  );
}

function learningUnitsFromAnalysis(
  analysis: unknown,
  pageCount: number
): DocumentLearningUnit[] | null {
  if (!analysis || typeof analysis !== "object") return null;
  const record = analysis as {
    structureVersion?: unknown;
    documentQuality?: unknown;
    learningUnits?: unknown;
  };
  if (
    Number(record.structureVersion) < 3 ||
    !Array.isArray(record.learningUnits) ||
    (record.documentQuality as { status?: unknown } | undefined)?.status !== "passed"
  ) return null;
  const allowedRoles = new Set<LearningUnitPageRole>([
    "instruction",
    "passage",
    "worked_example",
    "practice",
    "assessment",
    "answer_key",
    "teacher_support",
    "reference"
  ]);
  const units = record.learningUnits.flatMap((candidate, unitIndex) => {
    if (!candidate || typeof candidate !== "object") return [];
    const unit = candidate as Record<string, unknown>;
    const id = String(unit.id ?? "").trim();
    if (!id || !Array.isArray(unit.components)) return [];
    const components = unit.components.flatMap((componentCandidate) => {
      if (!componentCandidate || typeof componentCandidate !== "object") return [];
      const component = componentCandidate as Record<string, unknown>;
      const pdfPageStart = Math.round(Number(component.pdfPageStart));
      const pdfPageEnd = Math.round(Number(component.pdfPageEnd));
      const category = normalizeContentCategory(component.category, "", "student");
      const role = String(component.role) as LearningUnitPageRole;
      if (
        !Number.isInteger(pdfPageStart) ||
        !Number.isInteger(pdfPageEnd) ||
        pdfPageStart < 1 ||
        pdfPageEnd < pdfPageStart ||
        pdfPageEnd > pageCount ||
        !allowedRoles.has(role) ||
        component.includeInPacket !== true ||
        !pageSelectionAuditMatches(
          component.pageNumberConversionAudit,
          pdfPageStart,
          pdfPageEnd
        )
      ) return [];
      return [{
        pdfPageStart,
        pdfPageEnd,
        category,
        role,
        includeInPacket: true,
        pageNumberConversionAudit:
          component.pageNumberConversionAudit as unknown as PageSelectionAudit
      }];
    });
    if (components.length !== unit.components.length || components.length === 0) return [];
    return [{
      id,
      title: String(unit.title ?? "Teaching unit").trim() || "Teaching unit",
      sequenceOrder: Number.isInteger(Number(unit.sequenceOrder))
        ? Math.max(0, Math.round(Number(unit.sequenceOrder)))
        : unitIndex,
      components,
      splittable: unit.splittable === true,
      approvedSplitPoints: Array.isArray(unit.approvedSplitPoints)
        ? unit.approvedSplitPoints.flatMap((pointCandidate) => {
            if (!pointCandidate || typeof pointCandidate !== "object") return [];
            const point = pointCandidate as Record<string, unknown>;
            const afterComponentIndex = Math.round(Number(point.afterComponentIndex));
            return Number.isInteger(afterComponentIndex) &&
              afterComponentIndex >= 0 &&
              afterComponentIndex < components.length - 1
              ? [{
                  afterComponentIndex,
                  reason: String(point.reason ?? "Validated unit subdivision.").trim()
                }]
              : [];
          })
        : [],
      estimatedMinutes: Math.max(1, Math.round(Number(unit.estimatedMinutes) || 30)),
      conceptLabels: Array.isArray(unit.conceptLabels)
        ? unit.conceptLabels.map((label) => String(label).trim()).filter(Boolean).slice(0, 8)
        : [],
      boundaryConfidence: ["medium", "high"].includes(String(unit.boundaryConfidence))
        ? unit.boundaryConfidence as "medium" | "high"
        : "low" as const,
      boundaryEvidence: Array.isArray(unit.boundaryEvidence)
        ? unit.boundaryEvidence as BoundaryEvidence[]
        : []
    }];
  }).sort((left, right) => left.sequenceOrder - right.sequenceOrder);
  return units.length === record.learningUnits.length ? units : null;
}

function pageLedgerFromAnalysis(analysis: unknown): DocumentPageLedgerEntry[] | null {
  if (!analysis || typeof analysis !== "object") return null;
  const record = analysis as { structureVersion?: unknown; pageLedger?: unknown };
  return Number(record.structureVersion) >= 3 && Array.isArray(record.pageLedger)
    ? record.pageLedger as DocumentPageLedgerEntry[]
    : null;
}

function classifiedPlanningRangesFromAnalysis(
  analysis: unknown,
  pageCount: number,
  documentRole: string
) {
  if (!analysis || typeof analysis !== "object") return null;
  const record = analysis as { classificationVersion?: unknown; sections?: unknown };
  if (Number(record.classificationVersion) < 2 || !Array.isArray(record.sections)) return null;
  return record.sections.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const section = candidate as Record<string, unknown>;
    const startPage = Math.max(1, Math.min(pageCount, Math.round(Number(section.startPage) || 1)));
    const endPage = Math.max(startPage, Math.min(pageCount, Math.round(Number(section.endPage) || startPage)));
    const category = normalizeContentCategory(section.category, String(section.title ?? ""), documentRole);
    return [{
      title: String(section.title ?? "Teaching content").trim() || "Teaching content",
      startPage,
      endPage,
      category,
      includeInPlan: section.includeInPlan === true && DESIRABLE_CONTENT_CATEGORIES.has(category),
      pageSelectionAudit: section.pageSelectionAudit as Record<string, unknown> | undefined
    }];
  });
}

function pageSelectionAuditMatches(
  value: unknown,
  pdfPageStart: number,
  pdfPageEnd: number
) {
  if (!value || typeof value !== "object") return false;
  const audit = value as Partial<PageSelectionAudit>;
  const startResolved = audit.startConversionStatus === "resolved";
  const endResolved = audit.endConversionStatus === "resolved";
  return (
    audit.utility === "treeschool.page-number-converter" &&
    audit.utilityVersion === 2 &&
    audit.used === true &&
    audit.direction === "pdf_to_content" &&
    typeof audit.mappingAvailable === "boolean" &&
    audit.pdfPageStart === pdfPageStart &&
    audit.pdfPageEnd === pdfPageEnd &&
    ["resolved", "unmapped"].includes(String(audit.startConversionStatus)) &&
    ["resolved", "unmapped"].includes(String(audit.endConversionStatus)) &&
    startResolved === (audit.contentPageStart != null) &&
    endResolved === (audit.contentPageEnd != null) &&
    (audit.mappingAvailable || (!startResolved && !endResolved)) &&
    (
      audit.contentPageStart == null ||
      audit.contentPageEnd == null ||
      audit.contentPageEnd >= audit.contentPageStart
    )
  );
}

async function repairDocumentClassificationAudits(documents: Array<{
  id: string;
  label: string;
  pageCount: number;
  documentRole: string;
  analysisJson: unknown;
}>) {
  const analysisByDocumentId = new Map<string, unknown>();
  const repairs: string[] = [];

  for (const document of documents) {
    const analysis = document.analysisJson && typeof document.analysisJson === "object"
      ? document.analysisJson as Record<string, unknown>
      : {};
    analysisByDocumentId.set(document.id, analysis);
    if (Number(analysis.classificationVersion) < 2 || !Array.isArray(analysis.sections)) continue;

    const needsRepair = analysis.sections.length === 0 || analysis.sections.some((candidate) => {
      if (!candidate || typeof candidate !== "object") return true;
      const section = candidate as Record<string, unknown>;
      const startPage = Math.max(
        1,
        Math.min(document.pageCount, Math.round(Number(section.startPage) || 1))
      );
      const endPage = Math.max(
        startPage,
        Math.min(document.pageCount, Math.round(Number(section.endPage) || startPage))
      );
      return !pageSelectionAuditMatches(section.pageSelectionAudit, startPage, endPage);
    });
    if (!needsRepair) continue;

    const normalized = normalizeAnalysis(
      analysis as Partial<DocumentAnalysis>,
      document.label,
      document.documentRole,
      document.pageCount
    );
    const repairedAnalysis = { ...analysis, ...normalized };
    await db.update(contentDocuments).set({ analysisJson: repairedAnalysis })
      .where(eq(contentDocuments.id, document.id));
    analysisByDocumentId.set(document.id, repairedAnalysis);
    repairs.push(
      `Rebuilt page-number conversion utility logs for every classified range in ${document.label}.`
    );
  }

  return { analysisByDocumentId, repairs };
}

function pageRangeCategoryForContentCategory(category: ContentCategory, documentRole: string) {
  switch (category) {
    case "concept_introduction": return "instruction";
    case "concept_practice": return "independent_practice";
    case "worked_example": return "guided_practice";
    case "quiz":
    case "assessment": return "assessment";
    case "review": return "review";
    case "answer_key": return "answer_key";
    case "supporting_content": return "reference";
    case "teacher_guidance": return "teacher_support";
    case "mixed_teaching": return "mixed";
    default: return normalizePageRangeCategory(category, documentRole);
  }
}

function contentFingerprintFromAnalysis(analysis: unknown) {
  if (!analysis || typeof analysis !== "object") return null;
  const value = String((analysis as { contentFingerprint?: unknown }).contentFingerprint ?? "").trim();
  return /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

function assertTeachingDayCoverage(
  items: Array<{
    firstPageIndex: number;
    lastPageIndex: number;
    dayNumber: number | null;
    documentId?: string;
    sourceUnitId?: string | null;
  }>,
  teachingDaysPerWeek: number | null,
  weekNumber: number
) {
  if (!teachingDaysPerWeek || items.length === 0) return;
  const sourcePageCount = items.reduce(
    (total, item) => total + Math.max(0, item.lastPageIndex - item.firstPageIndex + 1),
    0
  );
  const usesAtomicUnits = items.every((item) => Boolean(item.sourceUnitId));
  const schedulableCount = usesAtomicUnits
    ? new Set(items.map((item) => `${item.documentId ?? "document"}:${item.sourceUnitId}`)).size
    : sourcePageCount;
  const expectedDayCount = Math.min(teachingDaysPerWeek, schedulableCount);
  const usedDays = new Set(items.map((item) => item.dayNumber).filter((day): day is number => day != null));
  const missingDays = Array.from({ length: expectedDayCount }, (_, index) => index + 1)
    .filter((day) => !usedDays.has(day));
  if (missingDays.length > 0) {
    throw new Error(
      `Week ${weekNumber} uses ${usedDays.size} of ${expectedDayCount} required teaching days. Missing Day ${missingDays.join(", Day ")}.`
    );
  }
}

export function normalizeGeneratedWeek(
  candidate: GeneratedPlan["weeks"][number] | undefined,
  printableDocuments: Array<{
    id: string;
    label: string;
    pageCount: number;
    subjectId: string | null;
    subjectLabel: string | null;
    documentRole: string;
    analysisJson: unknown;
  }>,
  weekNumber: number,
  teachingDaysPerWeek: number | null = null
) {
  const documentById = new Map(printableDocuments.map((document) => [document.id, document]));
  const normalizationRepairs: string[] = [];
  const subjectTitles = new Map<string, {
    subjectKey: string;
    subjectId: string | null;
    subjectLabel: string;
    planTitle: string;
  }>();
  type NormalizedWeekItem = {
    documentId: string;
    firstPageIndex: number;
    lastPageIndex: number;
    label: string;
    dayLabel: null;
    dayNumber: number | null;
    pageRangeCategory: string;
    contentPageStart: number | null;
    contentPageEnd: number | null;
    pageSelectionAudit: PageSelectionAudit;
    sourceUnitId: string | null;
    sourceUnitPartIndex: number | null;
    conceptLabels: string[];
    conceptRedundant: boolean;
    redundancyReason: string | null;
    includedInPacket: boolean;
    sortOrder: number;
  };
  const items = (candidate?.items ?? [])
    .flatMap<NormalizedWeekItem>((item, itemIndex) => {
      const document = documentById.get(String(item.documentId));
      if (!document) return [];
      const startPage = Math.max(1, Math.min(document.pageCount, Number(item.startPage) || 1));
      const endPage = Math.max(startPage, Math.min(document.pageCount, Number(item.endPage) || startPage));
      const pageNumberMapping = pageNumberMappingFromAnalysis(document.analysisJson, document.pageCount);
      const subjectLabel = document.subjectLabel || "Uncategorized";
      const subjectKey = subjectKeyFor({ subjectId: document.subjectId, subjectLabel });
      const conceptLabels = Array.isArray(item.conceptLabels)
        ? Array.from(new Set(item.conceptLabels
            .map((concept) => String(concept).trim())
            .filter(Boolean)))
            .slice(0, 8)
        : [];
      const redundancyReason = String(item.redundancyReason ?? "").trim() || null;
      const conceptRedundant = item.conceptRedundant === true && conceptLabels.length > 0 && Boolean(redundancyReason);
      if (!subjectTitles.has(subjectKey)) {
        subjectTitles.set(subjectKey, {
          subjectKey,
          subjectId: document.subjectId,
          subjectLabel,
          planTitle: String(item.subjectTitle || item.label || document.label).trim()
        });
      }
      const learningUnits = learningUnitsFromAnalysis(document.analysisJson, document.pageCount);
      if (learningUnits) {
        const learningUnit = learningUnits.find((unit) => unit.id === String(item.learningUnitId ?? ""));
        if (!learningUnit) {
          normalizationRepairs.push(
            `Rejected an unknown learning-unit assignment from ${document.label}.`
          );
          return [];
        }
        const dayNumber = normalizeDayNumber(item.dayNumber, teachingDaysPerWeek) ??
          (teachingDaysPerWeek ? (itemIndex % teachingDaysPerWeek) + 1 : null);
        return learningUnit.components.map((component, componentIndex) => {
          const audit = component.pageNumberConversionAudit;
          return {
            documentId: document.id,
            firstPageIndex: component.pdfPageStart - 1,
            lastPageIndex: component.pdfPageEnd - 1,
            label: learningUnit.title,
            dayLabel: null,
            dayNumber,
            pageRangeCategory: pageRangeCategoryForContentCategory(
              component.category,
              document.documentRole
            ),
            contentPageStart: audit.contentPageStart != null && audit.contentPageEnd != null
              ? audit.contentPageStart
              : null,
            contentPageEnd: audit.contentPageStart != null && audit.contentPageEnd != null
              ? audit.contentPageEnd
              : null,
            pageSelectionAudit: audit,
            sourceUnitId: learningUnit.id,
            sourceUnitPartIndex: componentIndex,
            conceptLabels: learningUnit.conceptLabels,
            conceptRedundant: false,
            redundancyReason: null,
            includedInPacket: component.includeInPacket,
            sortOrder: itemIndex * 1000 + componentIndex
          };
        });
      }
      const classifiedRanges = classifiedPlanningRangesFromAnalysis(
        document.analysisJson,
        document.pageCount,
        document.documentRole
      );
      const selectedRanges = classifiedRanges
        ? classifiedRanges
            .filter((range) => range.includeInPlan && range.endPage >= startPage && range.startPage <= endPage)
            .map((range) => ({
              startPage: Math.max(startPage, range.startPage),
              endPage: Math.min(endPage, range.endPage),
              category: pageRangeCategoryForContentCategory(range.category, document.documentRole),
              title: range.title
            }))
        : [{
            startPage,
            endPage,
            category: normalizePageRangeCategory(item.pageRangeCategory, document.documentRole),
            title: String(item.label || document.label).trim()
          }];
      if (classifiedRanges && (
        selectedRanges.length !== 1 ||
        selectedRanges[0]?.startPage !== startPage ||
        selectedRanges[0]?.endPage !== endPage
      )) {
        normalizationRepairs.push(
          selectedRanges.length === 0
            ? `Removed filtered source pages from ${document.label}.`
            : `Trimmed ${document.label} to approved teaching-related ranges.`
        );
      }
      return selectedRanges.map((selectedRange, rangeIndex) => {
        const pageSelectionAudit = createPageSelectionAudit(
          pageNumberMapping,
          selectedRange.startPage,
          selectedRange.endPage
        );
        return {
          documentId: document.id,
          firstPageIndex: selectedRange.startPage - 1,
          lastPageIndex: selectedRange.endPage - 1,
          label: String(item.label || selectedRange.title || document.label).trim(),
          dayLabel: null,
          dayNumber:
            normalizeDayNumber(item.dayNumber, teachingDaysPerWeek) ??
            (teachingDaysPerWeek ? (itemIndex % teachingDaysPerWeek) + 1 : null),
          pageRangeCategory: selectedRange.category,
          contentPageStart: pageSelectionAudit.contentPageStart != null && pageSelectionAudit.contentPageEnd != null
            ? pageSelectionAudit.contentPageStart
            : null,
          contentPageEnd: pageSelectionAudit.contentPageStart != null && pageSelectionAudit.contentPageEnd != null
            ? pageSelectionAudit.contentPageEnd
            : null,
          pageSelectionAudit,
          sourceUnitId: null,
          sourceUnitPartIndex: null,
          conceptLabels,
          conceptRedundant,
          redundancyReason: conceptRedundant ? redundancyReason : null,
          includedInPacket: true,
          sortOrder: itemIndex * 1000 + rangeIndex
        };
      });
    })
    .sort((left, right) =>
      (left.dayNumber ?? Number.MAX_SAFE_INTEGER) - (right.dayNumber ?? Number.MAX_SAFE_INTEGER) ||
      left.sortOrder - right.sortOrder
    )
    .map((item, sequenceIndex) => ({ ...item, sortOrder: sequenceIndex }));

  let scheduledItems = items;
  if (teachingDaysPerWeek && items.length > 0) {
    const usesAtomicUnits = items.every((item) => Boolean(item.sourceUnitId));
    const totalSourcePages = items.reduce(
      (total, item) => total + item.lastPageIndex - item.firstPageIndex + 1,
      0
    );
    const unitKeys = Array.from(new Set(items.map((item) =>
      `${item.documentId}:${item.sourceUnitId ?? item.sortOrder}`
    )));
    const expectedDayCount = Math.min(
      teachingDaysPerWeek,
      usesAtomicUnits ? unitKeys.length : totalSourcePages
    );
    const usedDays = new Set(items.map((item) => item.dayNumber).filter((day): day is number => day != null));
    const missingRequiredDay = Array.from({ length: expectedDayCount }, (_, index) => index + 1)
      .some((day) => !usedDays.has(day));
    if (missingRequiredDay) {
      if (usesAtomicUnits) {
        const dayByUnitKey = new Map(
          unitKeys.map((unitKey, unitIndex) => [unitKey, (unitIndex % expectedDayCount) + 1])
        );
        scheduledItems = items.map((item) => ({
          ...item,
          dayNumber: dayByUnitKey.get(`${item.documentId}:${item.sourceUnitId}`) ?? item.dayNumber
        }));
        normalizationRepairs.push(
          `Redistributed whole learning units across all ${expectedDayCount} available teaching days without splitting source material.`
        );
      } else {
      let globalPageOffset = 0;
      const repairedItems: typeof items = [];
      for (const item of items) {
        const document = documentById.get(item.documentId);
        if (!document) continue;
        const mapping = pageNumberMappingFromAnalysis(document.analysisJson, document.pageCount);
        let segmentStart = item.firstPageIndex;
        let segmentDay = Math.min(
          expectedDayCount,
          Math.floor(globalPageOffset * expectedDayCount / totalSourcePages) + 1
        );
        for (let pageIndex = item.firstPageIndex; pageIndex <= item.lastPageIndex; pageIndex += 1) {
          const dayNumber = Math.min(
            expectedDayCount,
            Math.floor(globalPageOffset * expectedDayCount / totalSourcePages) + 1
          );
          if (dayNumber !== segmentDay) {
            const audit = createPageSelectionAudit(mapping, segmentStart + 1, pageIndex);
            repairedItems.push({
              ...item,
              firstPageIndex: segmentStart,
              lastPageIndex: pageIndex - 1,
              dayNumber: segmentDay,
              contentPageStart: audit.contentPageStart != null && audit.contentPageEnd != null ? audit.contentPageStart : null,
              contentPageEnd: audit.contentPageStart != null && audit.contentPageEnd != null ? audit.contentPageEnd : null,
              pageSelectionAudit: audit
            });
            segmentStart = pageIndex;
            segmentDay = dayNumber;
          }
          globalPageOffset += 1;
        }
        const audit = createPageSelectionAudit(mapping, segmentStart + 1, item.lastPageIndex + 1);
        repairedItems.push({
          ...item,
          firstPageIndex: segmentStart,
          dayNumber: segmentDay,
          contentPageStart: audit.contentPageStart != null && audit.contentPageEnd != null ? audit.contentPageStart : null,
          contentPageEnd: audit.contentPageStart != null && audit.contentPageEnd != null ? audit.contentPageEnd : null,
          pageSelectionAudit: audit
        });
      }
      scheduledItems = repairedItems.map((item, sortOrder) => ({ ...item, sortOrder }));
      normalizationRepairs.push(`Redistributed source ranges across all ${expectedDayCount} required teaching days.`);
      }
    }
  }

  return {
    weekNumber,
    title: `Week ${weekNumber}`,
    summary: String(candidate?.summary || "").trim() || null,
    subjectTitles: Array.from(subjectTitles.values()),
    items: scheduledItems,
    normalizationRepairs: Array.from(new Set(normalizationRepairs))
  };
}

type NormalizedGeneratedWeek = ReturnType<typeof normalizeGeneratedWeek>;

type MetadataQualityWeek = {
  weekNumber: number;
  items: Array<{
    documentId: string;
    firstPageIndex: number;
    lastPageIndex: number;
    dayNumber: number | null;
    pageRangeCategory: string;
    contentPageStart?: number | null;
    contentPageEnd?: number | null;
    pageSelectionAudit?: Record<string, unknown>;
    sourceUnitId?: string | null;
    sourceUnitPartIndex?: number | null;
    sortOrder: number;
  }>;
};

function validatePlanMetadata(input: {
  totalWeeks: number;
  teachingDaysPerWeek: number | null;
  weeks: MetadataQualityWeek[];
  documents: Array<{
    id: string;
    label: string;
    pageCount: number;
    documentRole: string;
    contentFingerprint?: string | null;
    materialSetId?: string | null;
    prerequisiteMaterialSetId?: string | null;
    classifiedRanges?: Array<{
      startPage: number;
      endPage: number;
      category: ContentCategory;
      includeInPlan: boolean;
      pageSelectionAudit?: Record<string, unknown>;
    }> | null;
    learningUnits?: DocumentLearningUnit[] | null;
    pageLedger?: DocumentPageLedgerEntry[] | null;
    excludedSourceUnitIds?: string[];
  }>;
  preservedItems?: Array<{
    weekNumber: number;
    documentId: string;
    firstPageIndex: number;
    lastPageIndex: number;
    pageRangeCategory: string;
    contentPageStart?: number | null;
    contentPageEnd?: number | null;
    pageSelectionAudit?: Record<string, unknown>;
    sourceUnitId?: string | null;
    sourceUnitPartIndex?: number | null;
    sortOrder: number;
  }>;
}) {
  const documentById = new Map(input.documents.map((document) => [document.id, document]));
  const sourceIdentity = (documentId: string) => {
    const document = documentById.get(documentId);
    return document?.contentFingerprint ? `sha256:${document.contentFingerprint}` : `document:${documentId}`;
  };
  const excludedUnitIds = (document: typeof input.documents[number]) =>
    new Set(document.excludedSourceUnitIds ?? []);
  const excludedUnitRanges = (document: typeof input.documents[number]) => {
    const excluded = excludedUnitIds(document);
    return (document.learningUnits ?? [])
      .filter((unit) => excluded.has(unit.id))
      .flatMap((unit) => unit.components.map((component) => ({
        startPage: component.pdfPageStart,
        endPage: component.pdfPageEnd
      })));
  };
  const weekNumbers = new Set<number>();
  const orderedItems: Array<{
    weekNumber: number;
    documentId: string;
    firstPageIndex: number;
    lastPageIndex: number;
    dayNumber?: number | null;
    pageRangeCategory: string;
    sourceUnitId?: string | null;
    sourceUnitPartIndex?: number | null;
    sortOrder: number;
  }> = [...(input.preservedItems ?? [])];

  for (const document of input.documents) {
    if (document.learningUnits) {
      if (
        !document.pageLedger ||
        document.pageLedger.length !== document.pageCount ||
        document.pageLedger.some((page, pageIndex) =>
          page.pdfPageNumber !== pageIndex + 1 ||
          !pageSelectionAuditMatches(
            page.pageNumberConversionAudit,
            page.pdfPageNumber,
            page.pdfPageNumber
          )
        )
      ) {
        throw new Error(
          `Metadata quality check found an incomplete or unaudited physical-page ledger in ${document.label}.`
        );
      }
      if (document.learningUnits.some((unit) =>
        unit.boundaryConfidence === "low" || unit.components.length === 0
      )) {
        throw new Error(
          `Metadata quality check found an unresolved learning-unit boundary in ${document.label}.`
        );
      }
    }
    if (!document.classifiedRanges || document.classifiedRanges.length === 0) {
      throw new Error(
        `Metadata quality check found that ${document.label} is missing current classified page-range metadata and its page-number conversion logs.`
      );
    }
    for (const range of document.classifiedRanges) {
      if (
        !Number.isInteger(range.startPage) ||
        !Number.isInteger(range.endPage) ||
        range.startPage < 1 ||
        range.endPage < range.startPage ||
        range.endPage > document.pageCount
      ) {
        throw new Error(`Metadata quality check found an invalid classified range in ${document.label}.`);
      }
      if (!pageSelectionAuditMatches(range.pageSelectionAudit, range.startPage, range.endPage)) {
        throw new Error(
          `Metadata quality check found a missing or invalid page-number conversion utility log ` +
          `for classified physical PDF pages ${range.startPage}-${range.endPage} in ${document.label}.`
        );
      }
    }
  }

  const assertItemPageNumberAudit = (item: {
    firstPageIndex: number;
    lastPageIndex: number;
    contentPageStart?: number | null;
    contentPageEnd?: number | null;
    pageSelectionAudit?: Record<string, unknown>;
  }, context: string) => {
    if (!pageSelectionAuditMatches(
      item.pageSelectionAudit,
      item.firstPageIndex + 1,
      item.lastPageIndex + 1
    )) {
      throw new Error(
        `Metadata quality check found a missing or invalid page-number conversion utility log ${context}.`
      );
    }
    const selectionAudit = item.pageSelectionAudit as unknown as PageSelectionAudit;
    const fullyMapped = selectionAudit.contentPageStart != null && selectionAudit.contentPageEnd != null;
    if (
      (fullyMapped && (
        item.contentPageStart !== selectionAudit.contentPageStart ||
        item.contentPageEnd !== selectionAudit.contentPageEnd
      )) ||
      (!fullyMapped && (item.contentPageStart != null || item.contentPageEnd != null))
    ) {
      throw new Error(`Metadata quality check found inconsistent converted page numbers ${context}.`);
    }
  };

  for (const item of input.preservedItems ?? []) {
    const document = documentById.get(item.documentId);
    if (!document) {
      throw new Error(`Metadata quality check could not find preserved source document ${item.documentId}.`);
    }
    if (
      item.firstPageIndex < 0 ||
      item.lastPageIndex < item.firstPageIndex ||
      item.lastPageIndex >= document.pageCount
    ) {
      throw new Error(`Metadata quality check found an invalid preserved PDF range for ${document.label}.`);
    }
    assertItemPageNumberAudit(item, `in preserved Week ${item.weekNumber}`);
  }

  const generatedItemsForCoverage = input.weeks.flatMap((week) => week.items);
  const allGeneratedItemsUseAtomicUnits =
    generatedItemsForCoverage.length > 0 &&
    generatedItemsForCoverage.every((item) => Boolean(item.sourceUnitId));
  const generatedSchedulableCount = allGeneratedItemsUseAtomicUnits
    ? new Set(generatedItemsForCoverage.map((item) =>
        `${item.documentId}:${item.sourceUnitId}`
      )).size
    : generatedItemsForCoverage.reduce(
        (total, item) => total + item.lastPageIndex - item.firstPageIndex + 1,
        0
      );
  if (generatedSchedulableCount >= input.totalWeeks) {
    const emptyWeek = input.weeks.find((week) => week.items.length === 0);
    if (emptyWeek) {
      throw new Error(
        `Metadata quality check found that Week ${emptyWeek.weekNumber} is empty even though enough approved material exists to cover every week.`
      );
    }
  }

  for (const week of input.weeks) {
    if (
      !Number.isInteger(week.weekNumber) ||
      week.weekNumber < 1 ||
      week.weekNumber > input.totalWeeks ||
      weekNumbers.has(week.weekNumber)
    ) {
      throw new Error(`Metadata quality check found an invalid or duplicate Week ${week.weekNumber}.`);
    }
    weekNumbers.add(week.weekNumber);
    assertTeachingDayCoverage(week.items, input.teachingDaysPerWeek, week.weekNumber);

    week.items.forEach((item, itemIndex) => {
      const document = documentById.get(item.documentId);
      if (!document) {
        throw new Error(`Metadata quality check could not find source document ${item.documentId}.`);
      }
      if (
        item.firstPageIndex < 0 ||
        item.lastPageIndex < item.firstPageIndex ||
        item.lastPageIndex >= document.pageCount
      ) {
        throw new Error(
          `Metadata quality check found an invalid physical PDF range for ${document.label}: ` +
          `pages ${item.firstPageIndex + 1}-${item.lastPageIndex + 1} of ${document.pageCount}.`
        );
      }
      if (item.sortOrder !== itemIndex) {
        throw new Error(`Metadata quality check found a broken sequence in Week ${week.weekNumber}.`);
      }
      if (!PAGE_RANGE_CATEGORIES.has(item.pageRangeCategory)) {
        throw new Error(
          `Metadata quality check found an invalid page-range category in Week ${week.weekNumber}.`
        );
      }
      assertItemPageNumberAudit(item, `in Week ${week.weekNumber}`);
      if (item.pageRangeCategory === "other") {
        throw new Error(`Metadata quality check found an undesirable or unclear category in Week ${week.weekNumber}.`);
      }
      if (document.learningUnits) {
        const sourceUnit = document.learningUnits.find((unit) => unit.id === item.sourceUnitId);
        const sourcePart = sourceUnit?.components[item.sourceUnitPartIndex ?? -1];
        if (
          !sourceUnit ||
          !sourcePart ||
          sourcePart.pdfPageStart !== item.firstPageIndex + 1 ||
          sourcePart.pdfPageEnd !== item.lastPageIndex + 1 ||
          pageRangeCategoryForContentCategory(sourcePart.category, document.documentRole) !==
            item.pageRangeCategory
        ) {
          throw new Error(
            `Metadata quality check found a page range in Week ${week.weekNumber} that was not authorized by a complete learning-unit component from ${document.label}.`
          );
        }
      }
      const classifiedRanges = document.classifiedRanges;
      if (classifiedRanges) {
        const selectedStart = item.firstPageIndex + 1;
        const selectedEnd = item.lastPageIndex + 1;
        const approved = classifiedRanges.some((range) =>
          range.includeInPlan &&
          range.startPage <= selectedStart &&
          range.endPage >= selectedEnd &&
          DESIRABLE_CONTENT_CATEGORIES.has(range.category)
        );
        if (!approved) {
          throw new Error(
            `Metadata quality check found filtered or undesirable source content from ${document.label} in Week ${week.weekNumber}.`
          );
        }
      }
      orderedItems.push({
        weekNumber: week.weekNumber,
        documentId: item.documentId,
        firstPageIndex: item.firstPageIndex,
        lastPageIndex: item.lastPageIndex,
        dayNumber: item.dayNumber,
        pageRangeCategory: item.pageRangeCategory,
        sourceUnitId: item.sourceUnitId,
        sourceUnitPartIndex: item.sourceUnitPartIndex,
        sortOrder: item.sortOrder
      });
    });
  }

  const exactRanges = new Set<string>();
  for (const item of orderedItems) {
    const key = `${sourceIdentity(item.documentId)}:${item.firstPageIndex}:${item.lastPageIndex}`;
    if (exactRanges.has(key)) {
      const document = documentById.get(item.documentId);
      throw new Error(
        `Metadata quality check found a duplicate assignment for ${document?.label ?? item.documentId}, ` +
        `physical PDF pages ${item.firstPageIndex + 1}-${item.lastPageIndex + 1}.`
      );
    }
    exactRanges.add(key);
  }

  for (const document of input.documents) {
    if (!document.learningUnits) continue;
    const documentItems = orderedItems.filter((item) => item.documentId === document.id);
    const excluded = excludedUnitIds(document);
    for (const unit of document.learningUnits) {
      if (excluded.has(unit.id)) continue;
      const unitItems = documentItems.filter((item) => item.sourceUnitId === unit.id);
      const coveredByLegacyPreservedWeek = unitItems.length === 0 &&
        (input.preservedItems ?? []).some((item) =>
          item.documentId === document.id &&
          !item.sourceUnitId &&
          unit.components.some((component) =>
            item.lastPageIndex >= component.pdfPageStart - 1 &&
            item.firstPageIndex <= component.pdfPageEnd - 1
          )
        );
      if (coveredByLegacyPreservedWeek) continue;
      const scheduledPartIndexes = unitItems
        .map((item) => item.sourceUnitPartIndex)
        .filter((index): index is number => index != null)
        .sort((left, right) => left - right);
      if (
        unitItems.length !== unit.components.length ||
        scheduledPartIndexes.some((partIndex, index) => partIndex !== index)
      ) {
        throw new Error(
          `Metadata quality check found that learning unit “${unit.title}” from ${document.label} was omitted or only partially scheduled.`
        );
      }
      const weekNumbers = new Set(unitItems.map((item) => item.weekNumber));
      const dayNumbers = new Set(unitItems.map((item) => item.dayNumber ?? null));
      if (weekNumbers.size !== 1 || dayNumbers.size !== 1) {
        throw new Error(
          `Metadata quality check found that indivisible learning unit “${unit.title}” was split across teaching days or weeks.`
        );
      }
    }
  }

  const orderedPosition = (item: { weekNumber: number; sortOrder: number }) =>
    item.weekNumber * 1_000_000 + item.sortOrder;
  const materialSetById = new Map(
    input.documents
      .filter((document) => document.materialSetId)
      .map((document) => [document.materialSetId as string, {
        label: document.label,
        prerequisiteMaterialSetId: document.prerequisiteMaterialSetId ?? null
      }])
  );
  for (const [materialSetId, materialSet] of materialSetById) {
    if (!materialSet.prerequisiteMaterialSetId) continue;
    const dependentItems = orderedItems.filter(
      (item) => documentById.get(item.documentId)?.materialSetId === materialSetId
    );
    if (dependentItems.length === 0) continue;
    const prerequisiteItems = orderedItems.filter(
      (item) => documentById.get(item.documentId)?.materialSetId === materialSet.prerequisiteMaterialSetId
    );
    const prerequisite = materialSetById.get(materialSet.prerequisiteMaterialSetId);
    if (prerequisiteItems.length === 0) {
      const prerequisiteDocuments = input.documents.filter(
        (document) => document.materialSetId === materialSet.prerequisiteMaterialSetId
      );
      const fulfilledBeforeThisPlan = prerequisiteDocuments.length > 0 && prerequisiteDocuments.every((document) =>
        Boolean(document.learningUnits?.length) &&
        document.learningUnits!.every((unit) => excludedUnitIds(document).has(unit.id))
      );
      if (fulfilledBeforeThisPlan) continue;
      throw new Error(
        `Metadata quality check scheduled ${materialSet.label} before its prerequisite ` +
        `${prerequisite?.label ?? "material"} appeared in the plan.`
      );
    }
    const lastPrerequisite = Math.max(...prerequisiteItems.map(orderedPosition));
    const firstDependent = Math.min(...dependentItems.map(orderedPosition));
    const lastPrerequisiteWeek = Math.max(...prerequisiteItems.map((item) => item.weekNumber));
    const firstDependentWeek = Math.min(...dependentItems.map((item) => item.weekNumber));
    if (firstDependent <= lastPrerequisite || firstDependentWeek <= lastPrerequisiteWeek) {
      throw new Error(
        `Metadata quality check found that ${materialSet.label} begins before ` +
        `${prerequisite?.label ?? "its prerequisite"} is finished.`
      );
    }
    const prerequisiteDocuments = input.documents.filter(
      (document) => document.materialSetId === materialSet.prerequisiteMaterialSetId
    );
    for (const prerequisiteDocument of prerequisiteDocuments) {
      if (!prerequisiteDocument.classifiedRanges) continue;
      const assignedRanges = prerequisiteItems
        .filter((item) =>
          sourceIdentity(item.documentId) === sourceIdentity(prerequisiteDocument.id) &&
          orderedPosition(item) < firstDependent
        )
        .map((item) => ({ startPage: item.firstPageIndex + 1, endPage: item.lastPageIndex + 1 }))
        .sort((left, right) => left.startPage - right.startPage);
      for (const requiredRange of prerequisiteDocument.classifiedRanges.filter((range) => range.includeInPlan)) {
        let nextRequiredPage = requiredRange.startPage;
        const coverageRanges = [...assignedRanges, ...excludedUnitRanges(prerequisiteDocument)]
          .sort((left, right) => left.startPage - right.startPage || left.endPage - right.endPage);
        for (const assignedRange of coverageRanges) {
          if (assignedRange.endPage < nextRequiredPage || assignedRange.startPage > nextRequiredPage) continue;
          nextRequiredPage = Math.max(nextRequiredPage, assignedRange.endPage + 1);
          if (nextRequiredPage > requiredRange.endPage) break;
        }
        if (nextRequiredPage <= requiredRange.endPage) {
          throw new Error(
            `Metadata quality check found that ${materialSet.label} begins before all approved content ` +
            `from ${prerequisiteDocument.label} has been scheduled.`
          );
        }
      }
    }
  }

  const rangesByDocument = new Map<string, typeof orderedItems>();
  for (const item of orderedItems) {
    const identity = sourceIdentity(item.documentId);
    const existing = rangesByDocument.get(identity) ?? [];
    existing.push(item);
    rangesByDocument.set(identity, existing);
  }
  for (const ranges of rangesByDocument.values()) {
    const document = ranges[0] ? documentById.get(ranges[0].documentId) : null;
    if (!document) continue;
    const physicalRanges = [...ranges].sort(
      (left, right) => left.firstPageIndex - right.firstPageIndex || left.lastPageIndex - right.lastPageIndex
    );
    for (let index = 1; index < physicalRanges.length; index += 1) {
      const previous = physicalRanges[index - 1];
      const current = physicalRanges[index];
      if (!previous || !current) continue;
      if (current.firstPageIndex <= previous.lastPageIndex) {
        throw new Error(
          `Metadata quality check found duplicate or overlapping source content for ${document.label}: ` +
          `physical PDF pages ${previous.firstPageIndex + 1}-${previous.lastPageIndex + 1} and ` +
          `${current.firstPageIndex + 1}-${current.lastPageIndex + 1}.`
        );
      }
    }
    if (["answer_key", "teacher"].includes(document.documentRole)) continue;
    const instructionalRanges = ranges
      .filter((range) => !["answer_key", "teacher_support", "reference"].includes(range.pageRangeCategory))
      .sort((left, right) => left.weekNumber - right.weekNumber || left.sortOrder - right.sortOrder);
    for (let index = 1; index < instructionalRanges.length; index += 1) {
      const previous = instructionalRanges[index - 1];
      const current = instructionalRanges[index];
      if (!previous || !current) continue;
      if (current.firstPageIndex <= previous.lastPageIndex) {
        throw new Error(
          `Metadata quality check found overlapping or out-of-order ranges for ${document.label}: ` +
          `physical PDF pages ${previous.firstPageIndex + 1}-${previous.lastPageIndex + 1} followed by ` +
          `${current.firstPageIndex + 1}-${current.lastPageIndex + 1}.`
        );
      }
    }
  }

  for (const document of input.documents) {
    if (!document.classifiedRanges) continue;
    const assignedRanges = orderedItems
      .filter((item) => sourceIdentity(item.documentId) === sourceIdentity(document.id))
      .map((item) => ({ startPage: item.firstPageIndex + 1, endPage: item.lastPageIndex + 1 }))
      .sort((left, right) => left.startPage - right.startPage);
    for (const requiredRange of document.classifiedRanges.filter((range) => range.includeInPlan)) {
      const coveredByLegacyPreservedUnit = document.learningUnits?.some((unit) =>
        unit.components.some((component) =>
          component.pdfPageStart >= requiredRange.startPage &&
          component.pdfPageEnd <= requiredRange.endPage
        ) &&
        (input.preservedItems ?? []).some((item) =>
          item.documentId === document.id &&
          !item.sourceUnitId &&
          unit.components.some((component) =>
            item.lastPageIndex >= component.pdfPageStart - 1 &&
            item.firstPageIndex <= component.pdfPageEnd - 1
          )
        )
      );
      if (coveredByLegacyPreservedUnit) continue;
      let nextRequiredPage = requiredRange.startPage;
      const coverageRanges = [...assignedRanges, ...excludedUnitRanges(document)]
        .sort((left, right) => left.startPage - right.startPage || left.endPage - right.endPage);
      for (const assignedRange of coverageRanges) {
        if (assignedRange.endPage < nextRequiredPage || assignedRange.startPage > nextRequiredPage) continue;
        nextRequiredPage = Math.max(nextRequiredPage, assignedRange.endPage + 1);
        if (nextRequiredPage > requiredRange.endPage) break;
      }
      if (nextRequiredPage <= requiredRange.endPage) {
        throw new Error(
          `Metadata quality check found unscheduled approved content in ${document.label}, beginning at physical PDF page ${nextRequiredPage}.`
        );
      }
    }
  }

  const generatedItems = input.weeks.flatMap((week) => week.items);
  const categoryCounts = Object.fromEntries(
    Array.from(PAGE_RANGE_CATEGORIES).map((category) => [
      category,
      generatedItems.filter((item) => item.pageRangeCategory === category).length
    ])
  );
  return {
    qualityModelVersion: 6,
    checks: {
      allRequiredTeachingDaysPresent: true,
      noDuplicateContent: true,
      prerequisitesRespected: true,
      noUndesirableCategories: true,
      pageNumberConversionAudited: true,
      allPageNumberDependentStepsAudited: true,
      everyPhysicalPageLedgered: true,
      allLearningUnitsComplete: true,
      noIndivisibleUnitSplit: true
    },
    numberingBasis: "one_based_physical_pdf_page",
    sequenceBasis: "one_based_array_order_within_week",
    schedulingBasis: "deterministic_prerequisite_aware_unit_scheduler",
    schedulingAlgorithmVersion: DETERMINISTIC_SCHEDULING_ALGORITHM_VERSION,
    weekCount: input.weeks.length,
    pageRangeCount: generatedItems.length,
    contentPageMappedRangeCount: generatedItems.filter((item) =>
      item.contentPageStart != null && item.contentPageEnd != null
    ).length,
    materialPrerequisiteCount: Array.from(materialSetById.values())
      .filter((materialSet) => materialSet.prerequisiteMaterialSetId).length,
    categoryCounts,
    physicalSourcePageCount: input.weeks.reduce(
      (total, week) => total + week.items.reduce(
        (weekTotal, item) => weekTotal + item.lastPageIndex - item.firstPageIndex + 1,
        0
      ),
      0
    ),
    weeks: input.weeks.map((week) => ({
      weekNumber: week.weekNumber,
      pageRangeCount: week.items.length,
      physicalSourcePageCount: week.items.reduce(
        (total, item) => total + item.lastPageIndex - item.firstPageIndex + 1,
        0
      ),
      teachingDays: Array.from(new Set(
        week.items.map((item) => item.dayNumber).filter((day): day is number => day != null)
      )).sort((left, right) => left - right)
    }))
  };
}

function repairStagedPlanMetadata(input: {
  weeks: NormalizedGeneratedWeek[];
  teachingDaysPerWeek: number | null;
  subjectPreferences: Array<{
    subjectKey: string;
    daysPerWeek: number | null;
  }>;
  documents: Array<{
    id: string;
    label: string;
    pageCount: number;
    subjectId: string | null;
    subjectLabel: string | null;
    materialSetId?: string | null;
    prerequisiteMaterialSetId?: string | null;
    documentRole: string;
    analysisJson: unknown;
    contentFingerprint?: string | null;
    excludedSourceUnitIds?: string[];
    deferredSourceUnitIds?: string[];
  }>;
  preservedItems: Array<{
    weekNumber: number;
    documentId: string;
    firstPageIndex: number;
    lastPageIndex: number;
    sourceUnitId?: string | null;
    sourceUnitPartIndex?: number | null;
  }>;
}) {
  const atomicDocuments = input.documents.map((document, documentIndex) => {
    const excludedSourceUnitIds = new Set(document.excludedSourceUnitIds ?? []);
    return {
      document,
      documentIndex,
      learningUnits: learningUnitsFromAnalysis(document.analysisJson, document.pageCount)
        ?.filter((unit) => !excludedSourceUnitIds.has(unit.id)) ?? null
    };
  });
  if (atomicDocuments.length > 0 && atomicDocuments.every((entry) => entry.learningUnits)) {
    const availableWeeks = [...input.weeks].sort((left, right) => left.weekNumber - right.weekNumber);
    if (availableWeeks.length === 0) return { weeks: input.weeks, repairs: [] };
    const documentById = new Map(atomicDocuments.map((entry) => [entry.document.id, entry]));

    const preservedUnitKeys = new Set<string>();
    for (const item of input.preservedItems) {
      const entry = documentById.get(item.documentId);
      if (!entry?.learningUnits) continue;
      const unit = item.sourceUnitId
        ? entry.learningUnits.find((candidate) => candidate.id === item.sourceUnitId)
        : entry.learningUnits.find((candidate) => candidate.components.some((component) =>
            item.lastPageIndex >= component.pdfPageStart - 1 &&
            item.firstPageIndex <= component.pdfPageEnd - 1
          ));
      if (unit) preservedUnitKeys.add(`${item.documentId}:${unit.id}`);
    }

    const bundles = atomicDocuments.flatMap((entry) =>
      (entry.learningUnits ?? []).map((unit) => {
        const materialSetId = entry.document.materialSetId ?? entry.document.id;
        const deferredSourceUnitIds = new Set(entry.document.deferredSourceUnitIds ?? []);
        return {
          document: entry.document,
          documentIndex: entry.documentIndex,
          materialSetId,
          unit,
          key: `${entry.document.id}:${unit.id}`,
          deferred: deferredSourceUnitIds.has(unit.id)
        };
      })
    ).filter((bundle) => !preservedUnitKeys.has(bundle.key));
    const materialOrder = new Map<string, number>();
    for (const entry of atomicDocuments) {
      const materialSetId = entry.document.materialSetId ?? entry.document.id;
      if (!materialOrder.has(materialSetId)) materialOrder.set(materialSetId, materialOrder.size);
    }
    for (const document of input.documents) {
      const prerequisiteMaterialSetId = document.prerequisiteMaterialSetId ?? null;
      if (prerequisiteMaterialSetId && !materialOrder.has(prerequisiteMaterialSetId)) {
        materialOrder.set(prerequisiteMaterialSetId, materialOrder.size);
      }
    }
    const deterministicSchedule = buildDeterministicPlanSchedule({
      weekNumbers: availableWeeks.map((week) => week.weekNumber),
      teachingDaysPerWeek: input.teachingDaysPerWeek,
      materials: Array.from(materialOrder.entries()).map(([materialSetId, sortOrder]) => {
        const document = input.documents.find(
          (candidate) => (candidate.materialSetId ?? candidate.id) === materialSetId
        );
        return {
          id: materialSetId,
          prerequisiteMaterialSetId: document?.prerequisiteMaterialSetId ?? null,
          sortOrder
        };
      }),
      units: bundles.map((bundle) => ({
        key: bundle.key,
        documentId: bundle.document.id,
        materialSetId: bundle.materialSetId,
        subjectKey: subjectKeyFor({
          subjectId: bundle.document.subjectId,
          subjectLabel: bundle.document.subjectLabel
        }),
        subjectLabel: bundle.document.subjectLabel || "Uncategorized",
        documentOrder: bundle.documentIndex,
        sequenceOrder: bundle.unit.sequenceOrder,
        estimatedMinutes: bundle.unit.estimatedMinutes,
        pageCount: bundle.unit.components.reduce(
          (total, component) => total + component.pdfPageEnd - component.pdfPageStart + 1,
          0
        ),
        progressPriority: bundle.deferred ? "deferred" as const : null
      })),
      subjectPreferences: input.subjectPreferences
    });
    const assignmentByUnit = new Map(
      deterministicSchedule.assignments.map((assignment) => [assignment.unitKey, assignment])
    );
    const repairs: string[] = [];

    const rebuiltWeeks = availableWeeks.map((week) => ({
      ...week,
      subjectTitles: [] as NormalizedGeneratedWeek["subjectTitles"],
      items: [] as NormalizedGeneratedWeek["items"]
    }));
    const rebuiltWeekByNumber = new Map(rebuiltWeeks.map((week) => [week.weekNumber, week]));
    for (const bundle of bundles) {
      const assignment = assignmentByUnit.get(bundle.key);
      if (!assignment) throw new Error(`Could not assign learning unit “${bundle.unit.title}”.`);
      const targetWeekNumber = assignment.weekNumber;
      const targetWeek = targetWeekNumber == null ? null : rebuiltWeekByNumber.get(targetWeekNumber);
      if (!targetWeek) throw new Error(`Could not assign learning unit “${bundle.unit.title}” to an available week.`);
      const subjectLabel = bundle.document.subjectLabel || "Uncategorized";
      const subjectKey = subjectKeyFor({
        subjectId: bundle.document.subjectId,
        subjectLabel
      });
      if (!targetWeek.subjectTitles.some((subject) => subject.subjectKey === subjectKey)) {
        targetWeek.subjectTitles.push({
          subjectKey,
          subjectId: bundle.document.subjectId,
          subjectLabel,
          planTitle: bundle.unit.title
        });
      }
      for (const [componentIndex, component] of bundle.unit.components.entries()) {
        const audit = component.pageNumberConversionAudit;
        targetWeek.items.push({
          documentId: bundle.document.id,
          firstPageIndex: component.pdfPageStart - 1,
          lastPageIndex: component.pdfPageEnd - 1,
          label: bundle.unit.title,
          dayLabel: null,
          dayNumber: normalizeDayNumber(assignment.dayNumber, input.teachingDaysPerWeek),
          pageRangeCategory: pageRangeCategoryForContentCategory(
            component.category,
            bundle.document.documentRole
          ),
          contentPageStart: audit.contentPageStart != null && audit.contentPageEnd != null
            ? audit.contentPageStart
            : null,
          contentPageEnd: audit.contentPageStart != null && audit.contentPageEnd != null
            ? audit.contentPageEnd
            : null,
          pageSelectionAudit: audit,
          sourceUnitId: bundle.unit.id,
          sourceUnitPartIndex: componentIndex,
          conceptLabels: bundle.unit.conceptLabels,
          conceptRedundant: false,
          redundancyReason: null,
          includedInPacket: component.includeInPacket,
          sortOrder: 0
        });
      }
    }

    for (const week of rebuiltWeeks) {
      const unitKeys = Array.from(new Set(week.items.map((item) =>
        `${item.documentId}:${item.sourceUnitId}`
      )));
      const expectedDayCount = input.teachingDaysPerWeek
        ? Math.min(input.teachingDaysPerWeek, unitKeys.length)
        : 0;
      const usedDays = new Set(week.items.map((item) => item.dayNumber).filter(
        (day): day is number => day != null
      ));
      const needsDayRepair = expectedDayCount > 0 && Array.from(
        { length: expectedDayCount },
        (_, index) => index + 1
      ).some((day) => !usedDays.has(day));
      const dayByUnit = needsDayRepair
        ? new Map(unitKeys.map((key, index) => [key, (index % expectedDayCount) + 1]))
        : null;
      week.items = week.items
        .map((item) => ({
          ...item,
          dayNumber: dayByUnit?.get(`${item.documentId}:${item.sourceUnitId}`) ?? item.dayNumber
        }))
        .sort((left, right) =>
          (left.dayNumber ?? Number.MAX_SAFE_INTEGER) -
            (right.dayNumber ?? Number.MAX_SAFE_INTEGER) ||
          (documentById.get(left.documentId)?.documentIndex ?? 0) -
            (documentById.get(right.documentId)?.documentIndex ?? 0) ||
          String(left.sourceUnitId).localeCompare(String(right.sourceUnitId)) ||
          (left.sourceUnitPartIndex ?? 0) - (right.sourceUnitPartIndex ?? 0)
        )
        .map((item, sortOrder) => ({ ...item, sortOrder }));
    }
    repairs.push(
      "Deterministically balanced all unstarted learning units across weeks and teaching days; no source range was trimmed or split."
    );
    return { weeks: rebuiltWeeks, repairs };
  }

  const documentById = new Map(input.documents.map((document) => [document.id, document]));
  const sourceIdentity = (documentId: string) => {
    const document = documentById.get(documentId);
    return document?.contentFingerprint ? `sha256:${document.contentFingerprint}` : `document:${documentId}`;
  };
  const usedRangesBySource = new Map<string, Array<{ firstPageIndex: number; lastPageIndex: number }>>();
  const repairs: string[] = [];
  for (const item of [...input.preservedItems].sort((left, right) =>
    left.weekNumber - right.weekNumber || left.firstPageIndex - right.firstPageIndex
  )) {
    const identity = sourceIdentity(item.documentId);
    usedRangesBySource.set(identity, [
      ...(usedRangesBySource.get(identity) ?? []),
      { firstPageIndex: item.firstPageIndex, lastPageIndex: item.lastPageIndex }
    ]);
  }

  const preliminarilyRepaired = input.weeks.map((week) => ({
    ...week,
    items: week.items.flatMap((item) => {
      const identity = sourceIdentity(item.documentId);
      const usedRanges = usedRangesBySource.get(identity) ?? [];
      let fragments = [{ firstPageIndex: item.firstPageIndex, lastPageIndex: item.lastPageIndex }];
      for (const usedRange of usedRanges) {
        fragments = fragments.flatMap((fragment) => {
          if (
            usedRange.lastPageIndex < fragment.firstPageIndex ||
            usedRange.firstPageIndex > fragment.lastPageIndex
          ) return [fragment];
          const remainder: typeof fragments = [];
          if (usedRange.firstPageIndex > fragment.firstPageIndex) {
            remainder.push({
              firstPageIndex: fragment.firstPageIndex,
              lastPageIndex: usedRange.firstPageIndex - 1
            });
          }
          if (usedRange.lastPageIndex < fragment.lastPageIndex) {
            remainder.push({
              firstPageIndex: usedRange.lastPageIndex + 1,
              lastPageIndex: fragment.lastPageIndex
            });
          }
          return remainder;
        });
      }
      if (fragments.length === 0) {
        repairs.push(`Removed duplicate source content from Week ${week.weekNumber}.`);
        return [];
      }
      if (
        fragments.length !== 1 ||
        fragments[0]?.firstPageIndex !== item.firstPageIndex ||
        fragments[0]?.lastPageIndex !== item.lastPageIndex
      ) {
        repairs.push(`Trimmed overlapping source content in Week ${week.weekNumber}.`);
      }
      usedRangesBySource.set(identity, [
        ...usedRanges,
        ...fragments
      ]);
      return fragments.map((fragment) => ({ ...item, ...fragment }));
    })
  }));

  const coverageRepaired = preliminarilyRepaired.map((week) => ({
    ...week,
    items: [...week.items]
  }));
  for (const document of input.documents) {
    const requiredRanges = classifiedPlanningRangesFromAnalysis(
      document.analysisJson,
      document.pageCount,
      document.documentRole
    )?.filter((range) => range.includeInPlan) ?? [];
    const identity = sourceIdentity(document.id);
    const alreadyScheduled = [...(usedRangesBySource.get(identity) ?? [])]
      .map((range) => ({ startPage: range.firstPageIndex + 1, endPage: range.lastPageIndex + 1 }))
      .sort((left, right) => left.startPage - right.startPage);
    let insertedPageCount = 0;
    for (const requiredRange of requiredRanges) {
      let missingFragments = [{ startPage: requiredRange.startPage, endPage: requiredRange.endPage }];
      for (const assignedRange of alreadyScheduled) {
        missingFragments = missingFragments.flatMap((fragment) => {
          if (assignedRange.endPage < fragment.startPage || assignedRange.startPage > fragment.endPage) {
            return [fragment];
          }
          const remainder: typeof missingFragments = [];
          if (assignedRange.startPage > fragment.startPage) {
            remainder.push({ startPage: fragment.startPage, endPage: assignedRange.startPage - 1 });
          }
          if (assignedRange.endPage < fragment.endPage) {
            remainder.push({ startPage: assignedRange.endPage + 1, endPage: fragment.endPage });
          }
          return remainder;
        });
      }
      for (const fragment of missingFragments) {
        const audit = createPageSelectionAudit(
          pageNumberMappingFromAnalysis(document.analysisJson, document.pageCount),
          fragment.startPage,
          fragment.endPage
        );
        const insertedItem = {
          documentId: document.id,
          firstPageIndex: fragment.startPage - 1,
          lastPageIndex: fragment.endPage - 1,
          label: requiredRange.title,
          dayLabel: null,
          dayNumber: null,
          pageRangeCategory: pageRangeCategoryForContentCategory(requiredRange.category, document.documentRole),
          contentPageStart: audit.contentPageStart != null && audit.contentPageEnd != null ? audit.contentPageStart : null,
          contentPageEnd: audit.contentPageStart != null && audit.contentPageEnd != null ? audit.contentPageEnd : null,
          pageSelectionAudit: audit,
          sourceUnitId: null,
          sourceUnitPartIndex: null,
          conceptLabels: [],
          conceptRedundant: false,
          redundancyReason: null,
          includedInPacket: true,
          sortOrder: 0
        };
        const positions = coverageRepaired.flatMap((week, weekIndex) =>
          week.items.map((item, itemIndex) => ({ weekIndex, itemIndex, item }))
        ).filter((position) => sourceIdentity(position.item.documentId) === identity);
        const nextPosition = positions
          .filter((position) => position.item.firstPageIndex > insertedItem.lastPageIndex)
          .sort((left, right) => left.item.firstPageIndex - right.item.firstPageIndex)[0];
        const previousPosition = positions
          .filter((position) => position.item.lastPageIndex < insertedItem.firstPageIndex)
          .sort((left, right) => right.item.lastPageIndex - left.item.lastPageIndex)[0];
        if (nextPosition) {
          coverageRepaired[nextPosition.weekIndex]!.items.splice(nextPosition.itemIndex, 0, insertedItem);
        } else if (previousPosition) {
          coverageRepaired[previousPosition.weekIndex]!.items.splice(previousPosition.itemIndex + 1, 0, insertedItem);
        } else {
          const prerequisiteMaterialId = document.prerequisiteMaterialSetId ?? null;
          const prerequisiteWeekIndexes = prerequisiteMaterialId
            ? coverageRepaired.flatMap((week, weekIndex) =>
                week.items.some((item) =>
                  input.documents.find((candidate) => candidate.id === item.documentId)?.materialSetId === prerequisiteMaterialId
                ) ? [weekIndex] : []
              )
            : [];
          const targetWeekIndex = prerequisiteWeekIndexes.length > 0
            ? Math.min(coverageRepaired.length - 1, Math.max(...prerequisiteWeekIndexes) + 1)
            : 0;
          coverageRepaired[targetWeekIndex]?.items.push(insertedItem);
        }
        alreadyScheduled.push({ startPage: fragment.startPage, endPage: fragment.endPage });
        insertedPageCount += fragment.endPage - fragment.startPage + 1;
      }
    }
    if (insertedPageCount > 0) {
      repairs.push(
        `Restored ${insertedPageCount} omitted approved ${insertedPageCount === 1 ? "page" : "pages"} from ${document.label}.`
      );
    }
  }

  const sequenceRepaired = coverageRepaired.map((week) => ({
    ...week,
    items: [...week.items]
  }));
  const generatedPositions = sequenceRepaired.flatMap((week, weekIndex) =>
    week.items.map((item, itemIndex) => ({ weekIndex, itemIndex, item }))
  );
  const identities = Array.from(new Set(generatedPositions.map((position) =>
    sourceIdentity(position.item.documentId)
  )));
  for (const identity of identities) {
    const positions = generatedPositions
      .filter((position) => sourceIdentity(position.item.documentId) === identity)
      .sort((left, right) => left.weekIndex - right.weekIndex || left.itemIndex - right.itemIndex);
    const orderedItems = positions
      .map((position) => position.item)
      .sort((left, right) =>
        left.firstPageIndex - right.firstPageIndex || left.lastPageIndex - right.lastPageIndex
      );
    const wasOutOfOrder = positions.some((position, index) => position.item !== orderedItems[index]);
    if (!wasOutOfOrder) continue;
    positions.forEach((position, index) => {
      const item = orderedItems[index];
      if (item) {
        sequenceRepaired[position.weekIndex]!.items[position.itemIndex] = {
          ...item,
          dayNumber: position.item.dayNumber,
          dayLabel: position.item.dayLabel
        };
      }
    });
    const document = documentById.get(orderedItems[0]?.documentId ?? "");
    repairs.push(`Reordered page ranges from ${document?.label ?? "a source workbook"} into source-page sequence.`);
  }

  const prerequisiteRepaired = sequenceRepaired.map((week) => ({
    ...week,
    items: [...week.items]
  }));
  const materialByDocumentId = new Map(input.documents.map((document) => [document.id, document.materialSetId ?? null]));
  const prerequisiteByMaterialId = new Map(
    input.documents.flatMap((document) =>
      document.materialSetId && document.prerequisiteMaterialSetId
        ? [[document.materialSetId, document.prerequisiteMaterialSetId] as const]
        : []
    )
  );
  const prerequisiteEdges = Array.from(prerequisiteByMaterialId.entries());
  for (let pass = 0; pass < Math.max(1, prerequisiteEdges.length); pass += 1) {
    let changed = false;
    for (const [dependentMaterialId, prerequisiteMaterialId] of prerequisiteEdges) {
      const positions = prerequisiteRepaired.flatMap((week, weekIndex) =>
        week.items.map((item, itemIndex) => ({
          weekIndex,
          itemIndex,
          item,
          materialSetId: materialByDocumentId.get(item.documentId) ?? null
        }))
      );
      const prerequisitePositions = positions.filter((position) => position.materialSetId === prerequisiteMaterialId);
      const dependentPositions = positions.filter((position) => position.materialSetId === dependentMaterialId);
      if (prerequisitePositions.length === 0 || dependentPositions.length === 0) continue;
      const lastPrerequisiteWeek = Math.max(...prerequisitePositions.map((position) => position.weekIndex));
      const firstDependentWeek = Math.min(...dependentPositions.map((position) => position.weekIndex));
      if (firstDependentWeek > lastPrerequisiteWeek) continue;

      const affectedSlots = positions
        .filter((position) =>
          position.materialSetId === prerequisiteMaterialId || position.materialSetId === dependentMaterialId
        )
        .sort((left, right) => left.weekIndex - right.weekIndex || left.itemIndex - right.itemIndex);
      const orderedItems = [
        ...affectedSlots.filter((position) => position.materialSetId === prerequisiteMaterialId).map((position) => position.item),
        ...affectedSlots.filter((position) => position.materialSetId === dependentMaterialId).map((position) => position.item)
      ];
      affectedSlots.forEach((slot, index) => {
        const item = orderedItems[index];
        if (item) prerequisiteRepaired[slot.weekIndex]!.items[slot.itemIndex] = item;
      });

      const reorderedPositions = prerequisiteRepaired.flatMap((week, weekIndex) =>
        week.items.map((item, itemIndex) => ({
          weekIndex,
          itemIndex,
          item,
          materialSetId: materialByDocumentId.get(item.documentId) ?? null
        }))
      );
      const reorderedPrerequisites = reorderedPositions.filter((position) => position.materialSetId === prerequisiteMaterialId);
      const boundaryWeekIndex = Math.max(...reorderedPrerequisites.map((position) => position.weekIndex));
      const dependentAtBoundary = prerequisiteRepaired[boundaryWeekIndex]?.items.filter(
        (item) => materialByDocumentId.get(item.documentId) === dependentMaterialId
      ) ?? [];
      if (dependentAtBoundary.length > 0 && boundaryWeekIndex + 1 < prerequisiteRepaired.length) {
        prerequisiteRepaired[boundaryWeekIndex]!.items = prerequisiteRepaired[boundaryWeekIndex]!.items.filter(
          (item) => materialByDocumentId.get(item.documentId) !== dependentMaterialId
        );
        prerequisiteRepaired[boundaryWeekIndex + 1]!.items = [
          ...dependentAtBoundary,
          ...prerequisiteRepaired[boundaryWeekIndex + 1]!.items
        ];
      }
      repairs.push(
        `Reordered ${documentById.get(dependentPositions[0]!.item.documentId)?.label ?? "dependent material"} ` +
        `to begin after its prerequisite was finished.`
      );
      changed = true;
    }
    if (!changed) break;
  }

  let scheduleRepaired = prerequisiteRepaired;
  const scheduledPageCount = prerequisiteRepaired.reduce(
    (total, week) => total + week.items.reduce(
      (weekTotal, item) => weekTotal + item.lastPageIndex - item.firstPageIndex + 1,
      0
    ),
    0
  );
  if (
    scheduledPageCount >= prerequisiteRepaired.length &&
    prerequisiteRepaired.some((week) => week.items.length === 0)
  ) {
    scheduleRepaired = prerequisiteRepaired.map((week) => ({ ...week, items: [] as typeof week.items }));
    let globalPageOffset = 0;
    for (const sourceWeek of prerequisiteRepaired) {
      for (const item of sourceWeek.items) {
        let segmentStart = item.firstPageIndex;
        let segmentWeekIndex = Math.min(
          scheduleRepaired.length - 1,
          Math.floor(globalPageOffset * scheduleRepaired.length / scheduledPageCount)
        );
        for (let pageIndex = item.firstPageIndex; pageIndex <= item.lastPageIndex; pageIndex += 1) {
          const weekIndex = Math.min(
            scheduleRepaired.length - 1,
            Math.floor(globalPageOffset * scheduleRepaired.length / scheduledPageCount)
          );
          if (weekIndex !== segmentWeekIndex) {
            scheduleRepaired[segmentWeekIndex]!.items.push({
              ...item,
              firstPageIndex: segmentStart,
              lastPageIndex: pageIndex - 1,
              dayNumber: null,
              dayLabel: null
            });
            segmentStart = pageIndex;
            segmentWeekIndex = weekIndex;
          }
          globalPageOffset += 1;
        }
        scheduleRepaired[segmentWeekIndex]!.items.push({
          ...item,
          firstPageIndex: segmentStart,
          dayNumber: null,
          dayLabel: null
        });
      }
    }
    repairs.push(`Redistributed approved source ranges across all ${scheduleRepaired.length} teaching weeks.`);
  }

  const weeks = scheduleRepaired.map((week) => {
    const totalSourcePages = week.items.reduce(
      (total, item) => total + item.lastPageIndex - item.firstPageIndex + 1,
      0
    );
    const repairDayCount = input.teachingDaysPerWeek
      ? Math.min(input.teachingDaysPerWeek, totalSourcePages)
      : null;
    const normalized = normalizeGeneratedWeek({
      weekNumber: week.weekNumber,
      summary: week.summary ?? "",
      items: week.items.map((item, itemIndex) => ({
        documentId: item.documentId,
        startPage: item.firstPageIndex + 1,
        endPage: item.lastPageIndex + 1,
        label: item.label,
        subjectTitle: week.subjectTitles.find((subject) =>
          subject.subjectId === documentById.get(item.documentId)?.subjectId ||
          subject.subjectLabel === documentById.get(item.documentId)?.subjectLabel
        )?.planTitle ?? item.label,
        // QC owns the repaired sequence. Assign days in contiguous blocks so
        // normalizeGeneratedWeek's day ordering cannot scramble source pages
        // back out of sequence. It will split ranges when more day separators
        // are needed than there are metadata items.
        dayNumber: repairDayCount
          ? Math.floor(itemIndex * repairDayCount / Math.max(1, week.items.length)) + 1
          : null,
        pageRangeCategory: item.pageRangeCategory,
        conceptLabels: item.conceptLabels,
        conceptRedundant: item.conceptRedundant,
        redundancyReason: item.redundancyReason
      }))
    }, input.documents, week.weekNumber, input.teachingDaysPerWeek);
    repairs.push(...normalized.normalizationRepairs.map((repair) => `Week ${week.weekNumber}: ${repair}`));
    return normalized;
  });
  return { weeks, repairs: Array.from(new Set(repairs)) };
}

async function loadReadyPlanningDocuments(learningYearId: string, documentIds?: string[]) {
  await assertLearningYearPdfPageCapacity({ learningYearId, additionalPageCount: 0 });
  if (documentIds && documentIds.length === 0) {
    throw new Error("Upload at least one curriculum file before planning the year.");
  }
  const documents = await db
    .select()
    .from(contentDocuments)
    .where(and(
      eq(contentDocuments.learningYearId, learningYearId),
      documentIds ? inArray(contentDocuments.id, documentIds) : isNull(contentDocuments.removedAt)
    ))
    .orderBy(asc(contentDocuments.sortOrder), asc(contentDocuments.createdAt));
  if (documents.length === 0) {
    throw new Error("Upload at least one curriculum file before planning the year.");
  }

  const activeDocuments = documents.filter((document) =>
    ["queued", "pending", "analyzing"].includes(document.analysisStatus)
  );
  if (activeDocuments.length > 0) {
    throw new Error("Wait for all uploaded files to finish processing before planning the year.");
  }

  const readyDocuments = documents.filter((document) => document.analysisStatus === "ready");
  const printableDocuments = readyDocuments.filter(isPrintablePdfDocument).filter((document) => {
    const classifiedRanges = classifiedPlanningRangesFromAnalysis(
      document.analysisJson,
      document.pageCount,
      document.documentRole
    );
    return classifiedRanges === null || classifiedRanges.some((range) => range.includeInPlan);
  });
  if (printableDocuments.length === 0) {
    throw new Error("No approved teaching-related PDF ranges are ready. Review or replace materials that were entirely filtered during classification.");
  }

  return { readyDocuments, printableDocuments };
}

async function loadMaterialPrerequisiteMap(learningYearId: string) {
  const materialSets = await db.select().from(learningYearMaterialSets)
    .where(eq(learningYearMaterialSets.learningYearId, learningYearId));
  return new Map(materialSets.map((materialSet) => [materialSet.id, materialSet]));
}

async function loadPlanningProgress(
  profileId: string,
  documents: Array<{ id: string; nativeWorkbookVersionId: string | null }>
) {
  const progressByDocument = await loadWorkbookProgressByDocument({ profileId, documents });
  return new Map(documents.map((document) => [
    document.id,
    {
      excludedSourceUnitIds: (progressByDocument.get(document.id) ?? [])
        .filter((progress) => progress.status === "completed" || progress.status === "mastered")
        .map((progress) => progress.sourceUnitId),
      deferredSourceUnitIds: (progressByDocument.get(document.id) ?? [])
        .filter((progress) => progress.status === "deferred")
        .map((progress) => progress.sourceUnitId)
    }
  ]));
}

async function loadPlanningProgressExclusions(
  profileId: string,
  documents: Array<{ id: string; nativeWorkbookVersionId: string | null }>
) {
  const progress = await loadPlanningProgress(profileId, documents);
  return new Map(Array.from(progress, ([documentId, state]) => [
    documentId,
    state.excludedSourceUnitIds
  ]));
}

async function generateOneWeekPlan(input: {
  year: typeof learningYears.$inferSelect;
  printableDocuments: Array<typeof contentDocuments.$inferSelect>;
  weekNumber: number;
  preservedAssignments: Array<{
    weekNumber: number;
    documentId: string;
    startPage: number;
    endPage: number;
    label: string;
    learningUnitId?: string | null;
  }>;
  subjectPreferences: Array<typeof learningYearSubjectPreferences.$inferSelect>;
  materialSets: Array<typeof learningYearMaterialSets.$inferSelect>;
}) {
  const preservedWeekNumbers = new Set(
    input.preservedAssignments.map((assignment) => assignment.weekNumber)
  );
  const weekNumbersToGenerate = Array.from(
    { length: input.year.totalWeeks },
    (_, index) => index + 1
  ).filter((weekNumber) => !preservedWeekNumbers.has(weekNumber));
  const deterministicMaterialSetById = new Map(
    input.materialSets.map((materialSet) => [materialSet.id, materialSet])
  );
  const progressByDocument = await loadPlanningProgress(
    input.year.profileId,
    input.printableDocuments
  );
  const deterministicWeeks = repairStagedPlanMetadata({
    weeks: weekNumbersToGenerate.map((weekNumber) => ({
      weekNumber,
      title: `Week ${weekNumber}`,
      summary: null,
      subjectTitles: [],
      items: [],
      normalizationRepairs: []
    })),
    teachingDaysPerWeek: input.year.teachingDaysPerWeek,
    subjectPreferences: input.subjectPreferences,
    documents: input.printableDocuments.map((document) => ({
      ...document,
      prerequisiteMaterialSetId:
        deterministicMaterialSetById.get(document.materialSetId)?.prerequisiteMaterialSetId ?? null,
      contentFingerprint: contentFingerprintFromAnalysis(document.analysisJson),
      excludedSourceUnitIds: progressByDocument.get(document.id)?.excludedSourceUnitIds ?? [],
      deferredSourceUnitIds: progressByDocument.get(document.id)?.deferredSourceUnitIds ?? []
    })),
    preservedItems: input.preservedAssignments.map((assignment) => ({
      weekNumber: assignment.weekNumber,
      documentId: assignment.documentId,
      firstPageIndex: assignment.startPage - 1,
      lastPageIndex: assignment.endPage - 1,
      sourceUnitId: assignment.learningUnitId ?? null,
      sourceUnitPartIndex: null
    }))
  }).weeks;
  const deterministicWeek = deterministicWeeks.find(
    (week) => week.weekNumber === input.weekNumber
  );
  if (!deterministicWeek) {
    throw new Error(`The deterministic scheduler did not produce Week ${input.weekNumber}.`);
  }
  return deterministicWeek;
}

async function saveGeneratedWeek(input: {
  learningYearId: string;
  week: ReturnType<typeof normalizeGeneratedWeek>;
}) {
  const preparedItems = await applySavedLessonDispositions(db, input.learningYearId, input.week.items);
  await db.transaction(async (tx) => {
    const [existingWeek] = await tx
      .select({ id: weeklyPlans.id, status: weeklyPlans.status })
      .from(weeklyPlans)
      .where(
        and(
          eq(weeklyPlans.learningYearId, input.learningYearId),
          eq(weeklyPlans.weekNumber, input.week.weekNumber)
        )
      )
      .limit(1);

    if (existingWeek && ["in_progress", "completed"].includes(existingWeek.status)) {
      return;
    }

    const [week] = existingWeek
      ? await tx
          .update(weeklyPlans)
          .set({
            title: input.week.title,
            summary: input.week.summary,
            updatedAt: new Date()
          })
          .where(eq(weeklyPlans.id, existingWeek.id))
          .returning({ id: weeklyPlans.id })
      : await tx
          .insert(weeklyPlans)
          .values({
            learningYearId: input.learningYearId,
            weekNumber: input.week.weekNumber,
            title: input.week.title,
            summary: input.week.summary
          })
          .returning({ id: weeklyPlans.id });

    await tx.delete(weeklyPlanItems).where(eq(weeklyPlanItems.weeklyPlanId, week.id));

    if (preparedItems.length > 0) {
      await tx.insert(weeklyPlanItems).values(
        preparedItems.map((item) => ({
          weeklyPlanId: week.id,
          ...item
        }))
      );
    }

    for (const subject of input.week.subjectTitles) {
      await tx
        .insert(weeklyPlanSubjectGrades)
        .values({ weeklyPlanId: week.id, ...subject })
        .onConflictDoUpdate({
          target: [weeklyPlanSubjectGrades.weeklyPlanId, weeklyPlanSubjectGrades.subjectKey],
          set: {
            subjectId: subject.subjectId,
            subjectLabel: subject.subjectLabel,
            planTitle: subject.planTitle,
            updatedAt: new Date()
          }
        });
    }
  });
}

type PlanSnapshotWeek = {
  weekNumber: number;
  title: string;
  summary: string | null;
  status: string;
  grade: number | null;
  parentNotes: string | null;
  completedAt: string | null;
  pdfAsset: {
    objectPath: string;
    filename: string;
    sizeBytes: number;
  } | null;
  dayPdfAssets: Array<{
    dayNumber: number;
    sourceFingerprint: string;
    objectPath: string;
    filename: string;
    sizeBytes: number;
    qualityStatus: string;
    qualityReport: Record<string, unknown>;
    qualityCheckedAt: string | null;
  }>;
  items: Array<{
    documentId: string;
    firstPageIndex: number;
    lastPageIndex: number;
    label: string;
    dayLabel: string | null;
    dayNumber: number | null;
    pageRangeCategory?: string;
    contentPageStart?: number | null;
    contentPageEnd?: number | null;
    pageSelectionAudit?: Record<string, unknown>;
    sourceUnitId?: string | null;
    sourceUnitPartIndex?: number | null;
    conceptLabels?: string[];
    conceptRedundant?: boolean;
    redundancyReason?: string | null;
    baseIncludedInPacket?: boolean;
    includedInPacket?: boolean;
    lessonDisposition?: "include" | "already_mastered" | "save_for_later" | "remove";
    sortOrder: number;
  }>;
  subjectGrades: Array<{
    subjectId: string | null;
    subjectKey: string;
    subjectLabel: string;
    planTitle: string | null;
    grade: number | null;
  }>;
  daySubjectGrades: Array<{
    dayNumber: number;
    subjectId: string | null;
    subjectKey: string;
    subjectLabel: string;
    title: string | null;
    score: number;
    assessmentRecommended: boolean;
  }>;
};

type PlanSnapshot = { weeks: PlanSnapshotWeek[] };

async function capturePlanSnapshot(learningYearId: string): Promise<PlanSnapshot> {
  const weeks = await db.select().from(weeklyPlans)
    .where(eq(weeklyPlans.learningYearId, learningYearId))
    .orderBy(asc(weeklyPlans.weekNumber));
  if (weeks.length === 0) return { weeks: [] };
  const weekIds = weeks.map((week) => week.id);
  const [items, grades, daySubjectGrades, pdfAssets, dayPdfAssets] = await Promise.all([
    db.select().from(weeklyPlanItems)
      .where(inArray(weeklyPlanItems.weeklyPlanId, weekIds))
      .orderBy(asc(weeklyPlanItems.sortOrder)),
    db.select().from(weeklyPlanSubjectGrades)
      .where(inArray(weeklyPlanSubjectGrades.weeklyPlanId, weekIds)),
    db.select().from(weeklyPlanDaySubjectGrades)
      .where(inArray(weeklyPlanDaySubjectGrades.weeklyPlanId, weekIds)),
    db.select().from(weeklyPlanPdfAssets)
      .where(inArray(weeklyPlanPdfAssets.weeklyPlanId, weekIds)),
    db.select().from(weeklyPlanDayPdfAssets)
      .where(inArray(weeklyPlanDayPdfAssets.weeklyPlanId, weekIds))
  ]);
  return {
    weeks: weeks.map((week) => ({
      weekNumber: week.weekNumber,
      title: week.title,
      summary: week.summary,
      status: week.status,
      grade: week.grade,
      parentNotes: week.parentNotes,
      completedAt: week.completedAt?.toISOString() ?? null,
      pdfAsset: (() => {
        const asset = pdfAssets.find((candidate) => candidate.weeklyPlanId === week.id);
        return asset ? {
          objectPath: asset.objectPath,
          filename: asset.filename,
          sizeBytes: asset.sizeBytes
        } : null;
      })(),
      dayPdfAssets: dayPdfAssets
        .filter((asset) => asset.weeklyPlanId === week.id)
        .map((asset) => ({
          dayNumber: asset.dayNumber,
          sourceFingerprint: asset.sourceFingerprint,
          objectPath: asset.objectPath,
          filename: asset.filename,
          sizeBytes: asset.sizeBytes,
          qualityStatus: asset.qualityStatus,
          qualityReport: asset.qualityReport,
          qualityCheckedAt: asset.qualityCheckedAt?.toISOString() ?? null
        })),
      items: items.filter((item) => item.weeklyPlanId === week.id).map((item) => ({
        documentId: item.documentId,
        firstPageIndex: item.firstPageIndex,
        lastPageIndex: item.lastPageIndex,
        label: item.label,
        dayLabel: item.dayLabel,
        dayNumber: item.dayNumber,
        pageRangeCategory: item.pageRangeCategory,
        contentPageStart: item.contentPageStart,
        contentPageEnd: item.contentPageEnd,
        pageSelectionAudit: item.pageSelectionAudit,
        sourceUnitId: item.sourceUnitId,
        sourceUnitPartIndex: item.sourceUnitPartIndex,
        conceptLabels: item.conceptLabels,
        conceptRedundant: item.conceptRedundant,
        redundancyReason: item.redundancyReason,
        baseIncludedInPacket: item.baseIncludedInPacket,
        includedInPacket: item.includedInPacket,
        lessonDisposition: item.lessonDisposition,
        sortOrder: item.sortOrder
      })),
      subjectGrades: grades.filter((grade) => grade.weeklyPlanId === week.id).map((grade) => ({
        subjectId: grade.subjectId,
        subjectKey: grade.subjectKey,
        subjectLabel: grade.subjectLabel,
        planTitle: grade.planTitle,
        grade: grade.grade
      })),
      daySubjectGrades: daySubjectGrades
        .filter((grade) => grade.weeklyPlanId === week.id)
        .map((grade) => ({
          dayNumber: grade.dayNumber,
          subjectId: grade.subjectId,
          subjectKey: grade.subjectKey,
          subjectLabel: grade.subjectLabel,
          title: grade.title,
          score: grade.score,
          assessmentRecommended: grade.assessmentRecommended
        }))
    }))
  };
}

function snapshotDocumentIds(snapshot: PlanSnapshot) {
  return Array.from(new Set(snapshot.weeks.flatMap((week) => week.items.map((item) => item.documentId))));
}

async function insertSnapshotWeek(tx: any, learningYearId: string, week: PlanSnapshotWeek) {
  const [inserted] = await tx.insert(weeklyPlans).values({
    learningYearId,
    weekNumber: week.weekNumber,
    title: week.title,
    summary: week.summary,
    status: week.status,
    grade: week.grade,
    parentNotes: week.parentNotes,
    completedAt: week.completedAt ? new Date(week.completedAt) : null
  }).returning({ id: weeklyPlans.id });
  if (week.items.length > 0) {
    await tx.insert(weeklyPlanItems).values(week.items.map((item) => ({
      weeklyPlanId: inserted.id,
      ...item,
      pageRangeCategory: item.pageRangeCategory ?? "other",
      contentPageStart: item.contentPageStart ?? null,
      contentPageEnd: item.contentPageEnd ?? null,
      pageSelectionAudit: item.pageSelectionAudit ?? {},
      sourceUnitId: item.sourceUnitId ?? null,
      sourceUnitPartIndex: item.sourceUnitPartIndex ?? null,
      conceptLabels: item.conceptLabels ?? [],
      conceptRedundant: item.conceptRedundant ?? false,
      redundancyReason: item.redundancyReason ?? null,
      baseIncludedInPacket: item.baseIncludedInPacket ?? item.includedInPacket ?? true,
      includedInPacket: item.includedInPacket ?? true,
      lessonDisposition: item.lessonDisposition ?? "include"
    })));
  }
  if (week.subjectGrades.length > 0) {
    await tx.insert(weeklyPlanSubjectGrades).values(
      week.subjectGrades.map((grade) => ({ weeklyPlanId: inserted.id, ...grade }))
    );
  }
  if (week.daySubjectGrades?.length > 0) {
    await tx.insert(weeklyPlanDaySubjectGrades).values(
      week.daySubjectGrades.map((grade) => ({ weeklyPlanId: inserted.id, ...grade }))
    );
  }
  if (week.pdfAsset) {
    await tx.insert(weeklyPlanPdfAssets).values({
      weeklyPlanId: inserted.id,
      objectPath: week.pdfAsset.objectPath,
      filename: week.pdfAsset.filename,
      sizeBytes: week.pdfAsset.sizeBytes
    });
  }
  if (week.dayPdfAssets?.length > 0) {
    await tx.insert(weeklyPlanDayPdfAssets).values(week.dayPdfAssets.map((asset) => ({
      weeklyPlanId: inserted.id,
      dayNumber: asset.dayNumber,
      sourceFingerprint: asset.sourceFingerprint,
      objectPath: asset.objectPath,
      filename: asset.filename,
      sizeBytes: asset.sizeBytes,
      qualityStatus: asset.qualityStatus,
      qualityReport: asset.qualityReport,
      qualityCheckedAt: asset.qualityCheckedAt ? new Date(asset.qualityCheckedAt) : null
    })));
  }
}

async function insertGeneratedWeek(tx: any, learningYearId: string, week: ReturnType<typeof normalizeGeneratedWeek>) {
  const [inserted] = await tx.insert(weeklyPlans).values({
    learningYearId,
    weekNumber: week.weekNumber,
    title: week.title,
    summary: week.summary,
    status: "planned"
  }).returning({ id: weeklyPlans.id });
  if (week.items.length > 0) {
    const preparedItems = await applySavedLessonDispositions(tx, learningYearId, week.items);
    await tx.insert(weeklyPlanItems).values(preparedItems.map((item) => ({ weeklyPlanId: inserted.id, ...item })));
  }
  if (week.subjectTitles.length > 0) {
    await tx.insert(weeklyPlanSubjectGrades).values(
      week.subjectTitles.map((subject) => ({ weeklyPlanId: inserted.id, ...subject }))
    );
  }
}

async function applySavedLessonDispositions<T extends {
  documentId: string;
  sourceUnitId?: string | null;
  includedInPacket: boolean;
}>(executor: any, learningYearId: string, items: T[]) {
  const [[year], decisions] = await Promise.all([
    executor.select({ profileId: learningYears.profileId })
      .from(learningYears)
      .where(eq(learningYears.id, learningYearId))
      .limit(1),
    executor
      .select()
      .from(studentLessonDispositions)
      .where(eq(studentLessonDispositions.learningYearId, learningYearId))
  ]);
  const decisionRows = decisions as Array<typeof studentLessonDispositions.$inferSelect>;
  const decisionByUnit = new Map<string, typeof studentLessonDispositions.$inferSelect>(
    decisionRows
      .filter((decision) => decision.sourceUnitId)
      .map((decision) => [
        `${decision.documentId}:${decision.sourceUnitId}`,
        decision
      ] as const)
  );
  const documentIds = Array.from(new Set(items.map((item) => item.documentId)));
  const documents = documentIds.length === 0
    ? []
    : await executor.select({
        id: contentDocuments.id,
        nativeWorkbookVersionId: contentDocuments.nativeWorkbookVersionId
      }).from(contentDocuments).where(inArray(contentDocuments.id, documentIds));
  const documentRows = documents as Array<{ id: string; nativeWorkbookVersionId: string | null }>;
  const documentById = new Map(documentRows.map((document) => [document.id, document]));
  const nativeVersionIds = documentRows.flatMap((document) =>
    document.nativeWorkbookVersionId ? [document.nativeWorkbookVersionId] : []
  );
  const durableProgress = year && nativeVersionIds.length > 0
    ? await executor.select().from(studentWorkbookUnitProgress).where(and(
        eq(studentWorkbookUnitProgress.profileId, year.profileId),
        inArray(studentWorkbookUnitProgress.nativeWorkbookVersionId, nativeVersionIds)
      ))
    : [];
  const durableRows = durableProgress as Array<typeof studentWorkbookUnitProgress.$inferSelect>;
  const durableByUnit = new Map(durableRows.map((progress) => [
    `${progress.nativeWorkbookVersionId}:${progress.sourceUnitId}`,
    progress
  ]));
  return items.map((item) => {
    const baseline = item.includedInPacket;
    const decision = item.sourceUnitId
      ? decisionByUnit.get(`${item.documentId}:${item.sourceUnitId}`)
      : null;
    const versionId = documentById.get(item.documentId)?.nativeWorkbookVersionId;
    const durable = versionId && item.sourceUnitId
      ? durableByUnit.get(`${versionId}:${item.sourceUnitId}`)
      : null;
    const disposition = decision?.disposition ?? (
      durable?.status === "mastered" || durable?.status === "completed"
        ? "already_mastered"
        : "include"
    );
    return {
      ...item,
      baseIncludedInPacket: baseline,
      lessonDisposition: disposition,
      includedInPacket: disposition === "include" ? baseline : false
    };
  });
}

async function stageGeneratedWeek(planVersionId: string, week: ReturnType<typeof normalizeGeneratedWeek>) {
  await db.insert(planVersionWeeks).values({
    planVersionId,
    weekNumber: week.weekNumber,
    weekJson: week
  }).onConflictDoUpdate({
    target: [planVersionWeeks.planVersionId, planVersionWeeks.weekNumber],
    set: { weekJson: week }
  });
}

async function validatePersistedLearningYearMetadata(
  year: typeof learningYears.$inferSelect
) {
  const weeks = await db.select().from(weeklyPlans)
    .where(eq(weeklyPlans.learningYearId, year.id))
    .orderBy(asc(weeklyPlans.weekNumber));
  const weekIds = weeks.map((week) => week.id);
  const items = weekIds.length > 0
    ? await db.select().from(weeklyPlanItems)
        .where(inArray(weeklyPlanItems.weeklyPlanId, weekIds))
        .orderBy(asc(weeklyPlanItems.sortOrder))
    : [];
  const documentIds = Array.from(new Set(items.map((item) => item.documentId)));
  const documents = documentIds.length > 0
      ? await db.select({
        id: contentDocuments.id,
        materialSetId: contentDocuments.materialSetId,
        label: contentDocuments.label,
        pageCount: contentDocuments.pageCount,
        documentRole: contentDocuments.documentRole,
        analysisJson: contentDocuments.analysisJson,
        nativeWorkbookVersionId: contentDocuments.nativeWorkbookVersionId
      }).from(contentDocuments).where(inArray(contentDocuments.id, documentIds))
    : [];
  const materialSetById = await loadMaterialPrerequisiteMap(year.id);
  const excludedUnitIdsByDocument = await loadPlanningProgressExclusions(year.profileId, documents);
  return validatePlanMetadata({
    totalWeeks: year.totalWeeks,
    teachingDaysPerWeek: year.teachingDaysPerWeek,
    documents: documents.map((document) => ({
      ...document,
      prerequisiteMaterialSetId:
        materialSetById.get(document.materialSetId)?.prerequisiteMaterialSetId ?? null,
      classifiedRanges: classifiedPlanningRangesFromAnalysis(
        document.analysisJson,
        document.pageCount,
        document.documentRole
      ),
      learningUnits: learningUnitsFromAnalysis(document.analysisJson, document.pageCount),
      pageLedger: pageLedgerFromAnalysis(document.analysisJson),
      contentFingerprint: contentFingerprintFromAnalysis(document.analysisJson),
      excludedSourceUnitIds: excludedUnitIdsByDocument.get(document.id) ?? []
    })),
    weeks: weeks.map((week) => ({
      weekNumber: week.weekNumber,
      title: week.title,
      summary: week.summary,
      subjectTitles: [],
      items: items.filter((item) => item.weeklyPlanId === week.id)
    }))
  });
}

async function backfillPersistedPageSelectionAudits(learningYearId: string) {
  const rows = await db.select({ item: weeklyPlanItems, document: contentDocuments })
    .from(weeklyPlanItems)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanItems.weeklyPlanId))
    .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
    .where(eq(weeklyPlans.learningYearId, learningYearId));
  const repairs: string[] = [];
  for (const { item, document } of rows) {
    const mapping = pageNumberMappingFromAnalysis(document.analysisJson, document.pageCount);
    const audit = createPageSelectionAudit(mapping, item.firstPageIndex + 1, item.lastPageIndex + 1);
    const contentPageStart = audit.contentPageStart != null && audit.contentPageEnd != null
      ? audit.contentPageStart
      : null;
    const contentPageEnd = audit.contentPageStart != null && audit.contentPageEnd != null
      ? audit.contentPageEnd
      : null;
    const wasRepaired = JSON.stringify(item.pageSelectionAudit) !== JSON.stringify(audit) ||
      item.contentPageStart !== contentPageStart || item.contentPageEnd !== contentPageEnd;
    await db.update(weeklyPlanItems).set({
      pageSelectionAudit: audit,
      contentPageStart,
      contentPageEnd
    }).where(eq(weeklyPlanItems.id, item.id));
    if (wasRepaired) {
      repairs.push(
        `Rebuilt the page-number conversion utility log for a persisted range in ${document.label}.`
      );
    }
  }
  const uniqueDocuments = Array.from(
    new Map(rows.map(({ document }) => [document.id, document])).values()
  );
  const documentAuditRepair = await repairDocumentClassificationAudits(uniqueDocuments);
  return {
    repairs: Array.from(new Set([...repairs, ...documentAuditRepair.repairs]))
  };
}

async function finalizePlanVersionIfReady(learningYearId: string, planVersionId: string | null) {
  if (!planVersionId) return;
  const [[revision], [year]] = await Promise.all([
    db.select().from(planVersions).where(eq(planVersions.id, planVersionId)).limit(1),
    db.select().from(learningYears).where(eq(learningYears.id, learningYearId)).limit(1)
  ]);
  if (!year) throw new Error("Learning year row not found during metadata quality control.");
  if (!revision || !["generating", "quality_check"].includes(revision.status)) return;

  const [stagedRevisionWeek] = revision.status === "quality_check"
    ? await db.select({ id: planVersionWeeks.id }).from(planVersionWeeks)
        .where(eq(planVersionWeeks.planVersionId, planVersionId)).limit(1)
    : [];

  // A metadata-first plan with staged weeks must run the staged repair/validation
  // path below. The persisted-plan path is only for legacy QC retries that have
  // no staged manifest; using it here could approve an empty published plan.
  if (revision.status === "quality_check" && !stagedRevisionWeek) {
    let report: ReturnType<typeof validatePlanMetadata> & {
      disposition: "approved";
      repairs: string[];
      qualityControlAlgorithmVersion: number;
    };
    let auditRepairs: string[] = [];
    try {
      const auditRepair = await backfillPersistedPageSelectionAudits(learningYearId);
      auditRepairs = auditRepair.repairs;
      report = {
        ...await validatePersistedLearningYearMetadata(year),
        disposition: "approved",
        repairs: auditRepair.repairs,
        qualityControlAlgorithmVersion: METADATA_QUALITY_ALGORITHM_VERSION
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown metadata quality-control failure.";
      await db.transaction(async (tx) => {
        await tx.update(planVersions).set({
          status: "quality_failed",
          metadataQualityStatus: "failed",
          metadataQualityReport: {
            disposition: "rejected",
            qualityControlAlgorithmVersion: METADATA_QUALITY_ALGORITHM_VERSION,
            repairAttempted: true,
            repairsAppliedBeforeRejection: auditRepairs,
            rejectionReasons: [message]
          },
          metadataQualityCheckedAt: new Date()
        }).where(eq(planVersions.id, planVersionId));
        await tx.update(weeklyPlanJobs).set({
          status: "failed",
          lastError: `[Metadata quality] ${message}`,
          updatedAt: new Date()
        }).where(eq(weeklyPlanJobs.planVersionId, planVersionId));
        await tx.update(learningYears).set({ status: "planning_failed", updatedAt: new Date() })
          .where(eq(learningYears.id, learningYearId));
      });
      await finishPlanGenerationEvent(revision.generationEventId, false);
      return;
    }
    const approved = await db.transaction(async (tx) => {
      const [approvedRevision] = await tx.update(planVersions).set({
        status: "active",
        activatedAt: new Date(),
        restoreUntil: null,
        metadataQualityStatus: "passed",
        metadataQualityReport: report,
        metadataQualityCheckedAt: new Date()
      }).where(and(eq(planVersions.id, planVersionId), eq(planVersions.status, "quality_check")))
        .returning({ id: planVersions.id });
      if (!approvedRevision) return false;
      await tx.update(weeklyPlanJobs).set({
        status: "completed",
        lastError: null,
        updatedAt: new Date()
      }).where(eq(weeklyPlanJobs.planVersionId, planVersionId));
      await tx.update(learningYears).set({
        status: "planned",
        lastPlannedAt: revision.createdAt,
        updatedAt: new Date()
      }).where(eq(learningYears.id, learningYearId));
      return true;
    });
    if (!approved) return;

    await finishPlanGenerationEvent(revision.generationEventId, true);
    try {
      const activeSnapshot = await capturePlanSnapshot(learningYearId);
      await db.update(planVersions).set({ snapshotJson: activeSnapshot }).where(eq(planVersions.id, planVersionId));
    } catch (error) {
      console.error(`Failed to refresh active plan snapshot ${planVersionId}:`, error);
    }
    await updatePlanPackPlanningStatus(learningYearId);
    return;
  }

  const jobs = await db.select({ status: weeklyPlanJobs.status }).from(weeklyPlanJobs)
    .where(eq(weeklyPlanJobs.planVersionId, planVersionId));
  if (jobs.length === 0 || jobs.some((job) => job.status === "failed")) {
    await db.update(weeklyPlanJobs).set({
      status: "failed",
      lastError: "Planning stopped because an earlier week could not be completed.",
      updatedAt: new Date()
    }).where(and(
      eq(weeklyPlanJobs.planVersionId, planVersionId),
      inArray(weeklyPlanJobs.status, ["queued", "retry_wait"])
    ));
    await db.update(planVersions).set({ status: "failed" }).where(eq(planVersions.id, planVersionId));
    await finishPlanGenerationEvent(revision.generationEventId, false);
    return;
  }
  if (jobs.some((job) => ["queued", "retry_wait", "running"].includes(job.status))) return;

  const staged = await db.select().from(planVersionWeeks)
    .where(eq(planVersionWeeks.planVersionId, planVersionId))
    .orderBy(asc(planVersionWeeks.weekNumber));
  if (staged.length !== jobs.length) return;
  let stagedWeeks = staged.map((row) => row.weekJson as NormalizedGeneratedWeek);
  let repairResult: ReturnType<typeof repairStagedPlanMetadata> = { weeks: stagedWeeks, repairs: [] };
  const auditRepairs: string[] = [];
  let metadataQualityReport: ReturnType<typeof validatePlanMetadata> & {
    repairs: string[];
    disposition: "approved";
    qualityControlAlgorithmVersion: number;
  };
  try {
    const persistedAuditRepair = await backfillPersistedPageSelectionAudits(learningYearId);
    auditRepairs.push(...persistedAuditRepair.repairs);
    const preservedItems = await db.select({
      weekNumber: weeklyPlans.weekNumber,
      documentId: weeklyPlanItems.documentId,
      firstPageIndex: weeklyPlanItems.firstPageIndex,
      lastPageIndex: weeklyPlanItems.lastPageIndex,
      pageRangeCategory: weeklyPlanItems.pageRangeCategory,
      contentPageStart: weeklyPlanItems.contentPageStart,
      contentPageEnd: weeklyPlanItems.contentPageEnd,
      pageSelectionAudit: weeklyPlanItems.pageSelectionAudit,
      sourceUnitId: weeklyPlanItems.sourceUnitId,
      sourceUnitPartIndex: weeklyPlanItems.sourceUnitPartIndex,
      sortOrder: weeklyPlanItems.sortOrder
    }).from(weeklyPlans)
      .innerJoin(weeklyPlanItems, eq(weeklyPlanItems.weeklyPlanId, weeklyPlans.id))
      .where(and(
        eq(weeklyPlans.learningYearId, learningYearId),
        inArray(weeklyPlans.status, ["in_progress", "completed"])
      ));
    const metadataDocumentIds = Array.from(new Set([
      ...revision.sourceDocumentIds,
      ...stagedWeeks.flatMap((week) => week.items.map((item) => item.documentId)),
      ...preservedItems.map((item) => item.documentId)
    ]));
    const metadataDocuments = metadataDocumentIds.length > 0
      ? await db.select().from(contentDocuments).where(inArray(contentDocuments.id, metadataDocumentIds))
      : [];
    const documentAuditRepair = await repairDocumentClassificationAudits(metadataDocuments);
    auditRepairs.push(...documentAuditRepair.repairs);
    const materialSetById = await loadMaterialPrerequisiteMap(learningYearId);
    const subjectPreferences = await db.select({
      subjectKey: learningYearSubjectPreferences.subjectKey,
      daysPerWeek: learningYearSubjectPreferences.daysPerWeek
    }).from(learningYearSubjectPreferences)
      .where(eq(learningYearSubjectPreferences.learningYearId, learningYearId));
    const excludedUnitIdsByDocument = await loadPlanningProgressExclusions(
      year.profileId,
      metadataDocuments
    );
    const qualityDocuments = metadataDocuments.map((document) => {
      const analysisJson = documentAuditRepair.analysisByDocumentId.get(document.id) ?? document.analysisJson;
      return {
        ...document,
        analysisJson,
        prerequisiteMaterialSetId:
          materialSetById.get(document.materialSetId)?.prerequisiteMaterialSetId ?? null,
        classifiedRanges: classifiedPlanningRangesFromAnalysis(
          analysisJson,
          document.pageCount,
          document.documentRole
        ),
        learningUnits: learningUnitsFromAnalysis(analysisJson, document.pageCount),
        pageLedger: pageLedgerFromAnalysis(analysisJson),
        contentFingerprint: contentFingerprintFromAnalysis(analysisJson),
        excludedSourceUnitIds: excludedUnitIdsByDocument.get(document.id) ?? []
      };
    });
    repairResult = repairStagedPlanMetadata({
      weeks: stagedWeeks,
      teachingDaysPerWeek: year.teachingDaysPerWeek,
      subjectPreferences,
      documents: qualityDocuments,
      preservedItems
    });
    stagedWeeks = repairResult.weeks;
    metadataQualityReport = {
      ...validatePlanMetadata({
      totalWeeks: year.totalWeeks,
      teachingDaysPerWeek: year.teachingDaysPerWeek,
      weeks: stagedWeeks,
      documents: qualityDocuments,
      preservedItems
      }),
      repairs: Array.from(new Set([...auditRepairs, ...repairResult.repairs])),
      qualityControlAlgorithmVersion: METADATA_QUALITY_ALGORITHM_VERSION,
      disposition: "approved"
    };
    await db.transaction(async (tx) => {
      for (const week of stagedWeeks) {
        await tx.insert(planVersionWeeks).values({
          planVersionId,
          weekNumber: week.weekNumber,
          weekJson: week
        }).onConflictDoUpdate({
          target: [planVersionWeeks.planVersionId, planVersionWeeks.weekNumber],
          set: { weekJson: week }
        });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown metadata quality-control failure.";
    await db.transaction(async (tx) => {
      await tx.update(planVersions).set({
        status: "quality_failed",
        metadataQualityStatus: "failed",
        metadataQualityReport: {
          disposition: "rejected",
          qualityControlAlgorithmVersion: METADATA_QUALITY_ALGORITHM_VERSION,
          repairAttempted: true,
          repairsAppliedBeforeRejection: Array.from(new Set([...auditRepairs, ...repairResult.repairs])),
          rejectionReasons: [message]
        },
        metadataQualityCheckedAt: new Date()
      }).where(eq(planVersions.id, planVersionId));
      await tx.update(weeklyPlanJobs).set({
        status: "failed",
        lastError: `[Metadata quality] ${message}`,
        updatedAt: new Date()
      }).where(eq(weeklyPlanJobs.planVersionId, planVersionId));
      await tx.update(learningYears).set({ status: "planning_failed", updatedAt: new Date() })
        .where(eq(learningYears.id, learningYearId));
    });
    await finishPlanGenerationEvent(revision.generationEventId, false);
    await notifyOperationsFailure({
      kind: "metadata_quality_control_failed",
      message,
      identifiers: { learningYearId, planVersionId }
    });
    return;
  }
  const previousSnapshot = await capturePlanSnapshot(learningYearId);
  const [currentRevision] = await db.select().from(planVersions)
    .where(and(eq(planVersions.learningYearId, learningYearId), eq(planVersions.status, "active")))
    .orderBy(desc(planVersions.activatedAt), desc(planVersions.createdAt)).limit(1);
  const previousSourceDocumentIds = currentRevision?.sourceDocumentIds?.length
    ? currentRevision.sourceDocumentIds
    : snapshotDocumentIds(previousSnapshot);
  const restoreUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const activated = await db.transaction(async (tx) => {
      const [claimedRevision] = await tx.update(planVersions).set({ status: "activating" })
        .where(and(
          eq(planVersions.id, planVersionId),
          inArray(planVersions.status, ["generating", "quality_check"])
        ))
        .returning({ id: planVersions.id });
      if (!claimedRevision) return false;

      await tx.update(planVersions).set({ status: "expired", restoreUntil: null })
        .where(and(eq(planVersions.learningYearId, learningYearId), eq(planVersions.status, "recoverable")));
      if (previousSnapshot.weeks.length > 0) {
        if (currentRevision) {
          await tx.update(planVersions).set({
            status: "recoverable",
            snapshotJson: previousSnapshot,
            restoreUntil
          }).where(eq(planVersions.id, currentRevision.id));
        } else {
          await tx.insert(planVersions).values({
            learningYearId,
            status: "recoverable",
            sourceDocumentIds: previousSourceDocumentIds,
            snapshotJson: previousSnapshot,
            restoreUntil,
            activatedAt: new Date()
          });
        }
      }

      const replaceableWeeks = await tx.select({ id: weeklyPlans.id }).from(weeklyPlans)
        .where(and(
          eq(weeklyPlans.learningYearId, learningYearId),
          inArray(weeklyPlans.status, ["planned", "skipped"])
        ));
      if (replaceableWeeks.length > 0) {
        await tx.delete(weeklyPlans).where(inArray(weeklyPlans.id, replaceableWeeks.map((week: { id: string }) => week.id)));
      }
      for (const stagedWeek of stagedWeeks) {
        await insertGeneratedWeek(
          tx,
          learningYearId,
          stagedWeek
        );
      }
      await tx.update(planVersions).set({
        status: "active",
        activatedAt: new Date(),
        restoreUntil: null,
        metadataQualityStatus: "passed",
        metadataQualityReport,
        metadataQualityCheckedAt: new Date()
      }).where(eq(planVersions.id, planVersionId));
      await tx.update(weeklyPlanJobs).set({
        status: "completed",
        lastError: null,
        updatedAt: new Date()
      }).where(eq(weeklyPlanJobs.planVersionId, planVersionId));
      await tx.update(learningYears).set({
        status: "planned",
        lastPlannedAt: revision.createdAt,
        updatedAt: new Date()
      }).where(eq(learningYears.id, learningYearId));
    return true;
  });
  if (!activated) return;
  await finishPlanGenerationEvent(revision.generationEventId, true);
  try {
    const activeSnapshot = await capturePlanSnapshot(learningYearId);
    await db.update(planVersions).set({ snapshotJson: activeSnapshot }).where(eq(planVersions.id, planVersionId));
  } catch (error) {
    console.error(`Failed to refresh active plan snapshot ${planVersionId}:`, error);
  }
  await updatePlanPackPlanningStatus(learningYearId);
}

export async function finalizeReadyPlanVersions() {
  const revisions = await db.select({
    id: planVersions.id,
    learningYearId: planVersions.learningYearId
  }).from(planVersions).where(inArray(planVersions.status, ["generating", "quality_check"]));
  for (const revision of revisions) {
    await finalizePlanVersionIfReady(revision.learningYearId, revision.id);
  }
  return { checked: revisions.length };
}

export async function recoverOutdatedMetadataQualityFailures() {
  const failedVersions = await db.select({
    id: planVersions.id,
    learningYearId: planVersions.learningYearId,
    generationEventId: planVersions.generationEventId,
    sourceDocumentIds: planVersions.sourceDocumentIds,
    metadataQualityReport: planVersions.metadataQualityReport
  }).from(planVersions).where(eq(planVersions.status, "quality_failed"));
  let recovered = 0;
  let refreshedForChangedMaterials = 0;

  for (const revision of failedVersions) {
    const report = revision.metadataQualityReport && typeof revision.metadataQualityReport === "object"
      ? revision.metadataQualityReport as Record<string, unknown>
      : {};
    const failedAlgorithmVersion = Number(report.qualityControlAlgorithmVersion ?? 0);
    if (failedAlgorithmVersion >= METADATA_QUALITY_ALGORITHM_VERSION) continue;

    const [[year], currentDocuments] = await Promise.all([
      db.select({ status: learningYears.status }).from(learningYears)
        .where(eq(learningYears.id, revision.learningYearId)).limit(1),
      db.select({
        id: contentDocuments.id,
        analysisStatus: contentDocuments.analysisStatus
      }).from(contentDocuments).where(and(
        eq(contentDocuments.learningYearId, revision.learningYearId),
        isNull(contentDocuments.removedAt)
      )).orderBy(asc(contentDocuments.sortOrder), asc(contentDocuments.createdAt))
    ]);
    if (!year || year.status !== "planning_failed") continue;
    if (currentDocuments.some((document) =>
      ["queued", "pending", "analyzing"].includes(document.analysisStatus)
    )) continue;

    const currentReadyDocumentIds = currentDocuments
      .filter((document) => document.analysisStatus === "ready")
      .map((document) => document.id);
    if (currentReadyDocumentIds.length === 0) continue;
    const sourceDocumentsChanged =
      currentReadyDocumentIds.length !== revision.sourceDocumentIds.length ||
      currentReadyDocumentIds.some((id, index) => id !== revision.sourceDocumentIds[index]);
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.update(planVersions).set({
        status: "quality_check",
        sourceDocumentIds: sourceDocumentsChanged
          ? currentReadyDocumentIds
          : revision.sourceDocumentIds,
        metadataQualityStatus: "pending",
        metadataQualityReport: {
          ...report,
          automaticRecoveryStartedAt: now.toISOString(),
          automaticRecoveryFromAlgorithmVersion: failedAlgorithmVersion,
          qualityControlAlgorithmVersion: METADATA_QUALITY_ALGORITHM_VERSION,
          sourceDocumentsChanged
        },
        metadataQualityCheckedAt: null
      }).where(eq(planVersions.id, revision.id));

      await tx.update(weeklyPlanJobs).set({
        status: "quality_check",
        attemptCount: 0,
        availableAt: now,
        claimedAt: null,
        heartbeatAt: null,
        workerId: null,
        lastError: null,
        updatedAt: now
      }).where(eq(weeklyPlanJobs.planVersionId, revision.id));
      await tx.update(learningYears).set({
        status: "quality_check",
        updatedAt: now
      }).where(eq(learningYears.id, revision.learningYearId));
      if (revision.generationEventId) {
        await tx.update(planGenerationEvents).set({ status: "queued", completedAt: null })
          .where(eq(planGenerationEvents.id, revision.generationEventId));
      }
    });
    recovered += 1;
    if (sourceDocumentsChanged) refreshedForChangedMaterials += 1;
  }

  return { recovered, refreshedForChangedMaterials };
}

function calculateWeeklyPlanJobRetryDelayMs(attemptCount: number) {
  return Math.min(10 * 60 * 1000, 30_000 * 2 ** Math.max(0, attemptCount - 1));
}

async function claimNextWeeklyPlanJob(workerId: string) {
  const [claimedJob] = await db.execute<WeeklyPlanJobRow>(sql`
    WITH next_job AS (
      SELECT candidate.id
      FROM weekly_plan_jobs candidate
      WHERE candidate.status IN ('queued', 'retry_wait')
        AND candidate.available_at <= NOW()
        AND NOT EXISTS (
          SELECT 1
          FROM weekly_plan_jobs earlier
          WHERE earlier.learning_year_id = candidate.learning_year_id
            AND earlier.plan_version_id IS NOT DISTINCT FROM candidate.plan_version_id
            AND earlier.week_number < candidate.week_number
            AND earlier.status <> 'completed'
        )
      ORDER BY candidate.available_at ASC, candidate.week_number ASC, candidate.updated_at ASC, candidate.created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE weekly_plan_jobs wpj
    SET
      status = 'running',
      claimed_at = NOW(),
      heartbeat_at = NOW(),
      worker_id = ${workerId},
      updated_at = NOW()
    FROM next_job
    WHERE wpj.id = next_job.id
    RETURNING
      wpj.id,
      wpj.learning_year_id AS "learningYearId",
      wpj.plan_version_id AS "planVersionId",
      wpj.week_number AS "weekNumber",
      wpj.status,
      wpj.attempt_count AS "attemptCount",
      wpj.available_at AS "availableAt",
      wpj.claimed_at AS "claimedAt",
      wpj.heartbeat_at AS "heartbeatAt",
      wpj.worker_id AS "workerId",
      wpj.last_error AS "lastError",
      wpj.created_at AS "createdAt",
      wpj.updated_at AS "updatedAt"
  `);

  return claimedJob ?? null;
}

async function markWeeklyPlanJobCompleted(job: WeeklyPlanJobRow, workerId: string) {
  await db
    .update(weeklyPlanJobs)
    .set({
      status: "completed",
      availableAt: new Date(),
      claimedAt: new Date(),
      heartbeatAt: new Date(),
      workerId,
      lastError: null,
      updatedAt: new Date()
    })
    .where(eq(weeklyPlanJobs.id, job.id));
}

async function markWeeklyPlanJobFailed(
  job: WeeklyPlanJobRow,
  workerId: string,
  error: unknown
) {
  const errorMessage = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Unknown weekly planning failure.";
  const errorName = error instanceof Error ? error.name : null;
  const errorDetails: Record<string, unknown> = {
    workerId,
    priorJobStatus: job.status,
    priorAttemptCount: job.attemptCount
  };
  if (error instanceof Error && error.stack) {
    errorDetails.stack = error.stack;
  }
  if (error instanceof Error && error.cause != null) {
    errorDetails.cause = error.cause instanceof Error
      ? { name: error.cause.name, message: error.cause.message }
      : String(error.cause);
  }
  const nextAttemptCount = job.attemptCount + 1;
  const shouldRetry = nextAttemptCount < MAX_WEEKLY_PLAN_JOB_ATTEMPTS;
  await db.transaction(async (tx) => {
    await tx
      .update(weeklyPlanJobs)
      .set({
        status: shouldRetry ? "retry_wait" : "failed",
        attemptCount: nextAttemptCount,
        availableAt: new Date(Date.now() + calculateWeeklyPlanJobRetryDelayMs(nextAttemptCount)),
        claimedAt: null,
        heartbeatAt: null,
        workerId: shouldRetry ? null : workerId,
        lastError: errorMessage,
        updatedAt: new Date()
      })
      .where(eq(weeklyPlanJobs.id, job.id));

    await tx.insert(planGenerationDiagnostics).values({
      learningYearId: job.learningYearId,
      weeklyPlanJobId: job.id,
      planVersionId: job.planVersionId,
      weekNumber: job.weekNumber,
      attemptNumber: nextAttemptCount,
      stage: "weekly_plan_generation",
      provider: "google",
      model: GEMINI_MODEL,
      errorName,
      errorMessage,
      errorDetails,
      willRetry: shouldRetry
    });
  });

  if (!shouldRetry) {
    await notifyOperationsFailure({
      kind: "weekly_plan_job_failed",
      message: errorMessage,
      identifiers: { jobId: job.id, learningYearId: job.learningYearId, weekNumber: job.weekNumber, attempts: nextAttemptCount }
    });
  }
}

export async function retryFailedPlanPackJobs(intakeId: string) {
  const [intake] = await db.select().from(planPackIntakes).where(eq(planPackIntakes.id, intakeId)).limit(1);
  if (!intake?.learningYearId) throw new Error("Plan pack or learning year not found.");

  const failedDocuments = await db
    .select({ id: contentDocuments.id })
    .from(contentDocuments)
    .where(and(eq(contentDocuments.learningYearId, intake.learningYearId), eq(contentDocuments.analysisStatus, "failed")));
  const failedDocumentIds = failedDocuments.map((document) => document.id);
  const failedWeeks = await db
    .select({
      id: weeklyPlanJobs.id,
      planVersionId: weeklyPlanJobs.planVersionId,
      lastError: weeklyPlanJobs.lastError
    })
    .from(weeklyPlanJobs)
    .where(and(eq(weeklyPlanJobs.learningYearId, intake.learningYearId), eq(weeklyPlanJobs.status, "failed")));

  if (failedDocumentIds.length === 0 && failedWeeks.length === 0) {
    throw new Error("This plan pack has no failed jobs to retry.");
  }

  const now = new Date();
  if (failedDocumentIds.length > 0) {
    await db.update(contentDocuments).set({ analysisStatus: "queued", analysisJson: {} }).where(inArray(contentDocuments.id, failedDocumentIds));
    await db.update(paperDocumentJobs).set({
      status: "queued", attemptCount: 0, availableAt: now, claimedAt: null,
      heartbeatAt: null, workerId: null, lastError: null, updatedAt: now
    }).where(inArray(paperDocumentJobs.documentId, failedDocumentIds));
  }
  if (failedWeeks.length > 0) {
    const qualityFailedWeeks = failedWeeks.filter((job) =>
      job.lastError?.startsWith("[PDF quality]") || job.lastError?.startsWith("[Metadata quality]")
    );
    const planningFailedWeeks = failedWeeks.filter((job) => !qualityFailedWeeks.includes(job));
    const failedVersionIds = Array.from(new Set(
      failedWeeks.map((job) => job.planVersionId).filter((id): id is string => Boolean(id))
    ));
    if (failedVersionIds.length > 0) {
      const failedVersions = await db.select({ generationEventId: planVersions.generationEventId })
        .from(planVersions)
        .where(inArray(planVersions.id, failedVersionIds));
      const qualityVersionIds = Array.from(new Set(
        qualityFailedWeeks.map((job) => job.planVersionId).filter((id): id is string => Boolean(id))
      ));
      const planningVersionIds = failedVersionIds.filter((id) => !qualityVersionIds.includes(id));
      if (qualityVersionIds.length > 0) {
        await db.update(planVersions).set({ status: "quality_check" })
          .where(inArray(planVersions.id, qualityVersionIds));
      }
      if (planningVersionIds.length > 0) {
        await db.update(planVersions).set({
          status: "generating",
          metadataQualityStatus: "pending",
          metadataQualityReport: {},
          metadataQualityCheckedAt: null
        })
          .where(inArray(planVersions.id, planningVersionIds));
      }
      const eventIds = failedVersions
        .map((version) => version.generationEventId)
        .filter((id): id is string => Boolean(id));
      if (eventIds.length > 0) {
        await db.update(planGenerationEvents).set({ status: "queued", completedAt: null })
          .where(inArray(planGenerationEvents.id, eventIds));
      }
    }
    if (qualityFailedWeeks.length > 0) {
      await db.update(weeklyPlanJobs).set({
        status: "quality_check", attemptCount: 0, availableAt: now, claimedAt: null,
        heartbeatAt: null, workerId: null, lastError: null, updatedAt: now
      }).where(inArray(weeklyPlanJobs.id, qualityFailedWeeks.map((job) => job.id)));
    }
    if (planningFailedWeeks.length > 0) {
      await db.update(weeklyPlanJobs).set({
        status: "queued", attemptCount: 0, availableAt: now, claimedAt: null,
        heartbeatAt: null, workerId: null, lastError: null, updatedAt: now
      }).where(inArray(weeklyPlanJobs.id, planningFailedWeeks.map((job) => job.id)));
    }
    await db.update(learningYears).set({
      status: qualityFailedWeeks.length > 0 ? "quality_check" : "planning",
      updatedAt: now
    }).where(eq(learningYears.id, intake.learningYearId));
  }
  await db.update(planPackIntakes).set({
    status: failedDocumentIds.length > 0 ? "processing" : "planning",
    lastError: null,
    updatedAt: now
  }).where(eq(planPackIntakes.id, intake.id));

  return { intakeId, documentJobsRetried: failedDocumentIds.length, weeklyJobsRetried: failedWeeks.length };
}

export async function retryFailedLearningYearPlanning(
  parentUserId: string,
  learningYearId: string
) {
  await requireAccountRole(parentUserId, ["OWNER", "ADMIN"]);
  const year = await requireOwnedYear(parentUserId, learningYearId);
  const failedWeeks = await db
    .select({
      id: weeklyPlanJobs.id,
      planVersionId: weeklyPlanJobs.planVersionId,
      lastError: weeklyPlanJobs.lastError
    })
    .from(weeklyPlanJobs)
    .where(and(
      eq(weeklyPlanJobs.learningYearId, year.id),
      eq(weeklyPlanJobs.status, "failed")
    ));

  if (failedWeeks.length === 0) {
    throw new Error("This plan has no failed weeks to retry.");
  }

  const now = new Date();
  const qualityFailedWeeks = failedWeeks.filter((job) =>
    job.lastError?.startsWith("[PDF quality]") || job.lastError?.startsWith("[Metadata quality]")
  );
  const planningFailedWeeks = failedWeeks.filter((job) => !qualityFailedWeeks.includes(job));
  const failedVersionIds = Array.from(new Set(
    failedWeeks.map((job) => job.planVersionId).filter((id): id is string => Boolean(id))
  ));

  await db.transaction(async (tx) => {
    if (failedVersionIds.length > 0) {
      const failedVersions = await tx
        .select({ id: planVersions.id, generationEventId: planVersions.generationEventId })
        .from(planVersions)
        .where(inArray(planVersions.id, failedVersionIds));
      const qualityVersionIds = Array.from(new Set(
        qualityFailedWeeks.map((job) => job.planVersionId).filter((id): id is string => Boolean(id))
      ));
      const planningVersionIds = failedVersionIds.filter((id) => !qualityVersionIds.includes(id));

      if (qualityVersionIds.length > 0) {
        await tx.update(planVersions).set({ status: "quality_check" })
          .where(inArray(planVersions.id, qualityVersionIds));
      }
      if (planningVersionIds.length > 0) {
        await tx.update(planVersions).set({
          status: "generating",
          metadataQualityStatus: "pending",
          metadataQualityReport: {},
          metadataQualityCheckedAt: null
        })
          .where(inArray(planVersions.id, planningVersionIds));
      }

      const generationEventIds = failedVersions
        .map((version) => version.generationEventId)
        .filter((id): id is string => Boolean(id));
      if (generationEventIds.length > 0) {
        await tx.update(planGenerationEvents).set({ status: "queued", completedAt: null })
          .where(inArray(planGenerationEvents.id, generationEventIds));
      }
    }

    if (qualityFailedWeeks.length > 0) {
      await tx.update(weeklyPlanJobs).set({
        status: "quality_check",
        attemptCount: 0,
        availableAt: now,
        claimedAt: null,
        heartbeatAt: null,
        workerId: null,
        lastError: null,
        updatedAt: now
      }).where(inArray(weeklyPlanJobs.id, qualityFailedWeeks.map((job) => job.id)));
    }
    if (planningFailedWeeks.length > 0) {
      await tx.update(weeklyPlanJobs).set({
        status: "queued",
        attemptCount: 0,
        availableAt: now,
        claimedAt: null,
        heartbeatAt: null,
        workerId: null,
        lastError: null,
        updatedAt: now
      }).where(inArray(weeklyPlanJobs.id, planningFailedWeeks.map((job) => job.id)));
    }

    await tx.update(learningYears).set({
      status: planningFailedWeeks.length > 0 ? "planning" : "quality_check",
      updatedAt: now
    }).where(eq(learningYears.id, year.id));
  });

  return {
    learningYearId: year.id,
    weeklyJobsRetried: failedWeeks.length
  };
}

async function updateLearningYearPlanningStatus(learningYearId: string) {
  const jobs = await db
    .select({ status: weeklyPlanJobs.status })
    .from(weeklyPlanJobs)
    .where(eq(weeklyPlanJobs.learningYearId, learningYearId));

  if (jobs.length === 0) return;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const completedCount = jobs.filter((job) => job.status === "completed").length;
  const qualityCheckCount = jobs.filter((job) => job.status === "quality_check").length;
  const status =
    failedCount > 0
      ? "planning_failed"
      : completedCount === jobs.length
        ? "planned"
        : qualityCheckCount > 0
          ? "quality_check"
          : "planning";

  await db
    .update(learningYears)
    .set({
      status,
      updatedAt: new Date()
    })
    .where(eq(learningYears.id, learningYearId));
}

export async function startLearningYearPlanning(parentUserId: string, learningYearId: string) {
  await requireAccountRole(parentUserId, ["OWNER", "ADMIN"]);
  const year = await requireOwnedYear(parentUserId, learningYearId);
  if (!year.startDate || !year.endDate) {
    throw new Error("Set the school-year start and end dates in Plan preferences before creating the lesson plan.");
  }
  const { readyDocuments, printableDocuments } = await loadReadyPlanningDocuments(year.id);
  const outdatedDocuments = readyDocuments.filter((document) => {
    if (!isPrintablePdfDocument(document)) return false;
    const analysis = document.analysisJson && typeof document.analysisJson === "object"
      ? document.analysisJson as Partial<DocumentAnalysis>
      : {};
    return Number(analysis.classificationVersion) < 3 ||
      Number(analysis.structureVersion) < 3 ||
      analysis.documentQuality?.status !== "passed" ||
      !Array.isArray(analysis.learningUnits);
  });
  if (outdatedDocuments.length > 0) {
    await db.update(contentDocuments).set({
      analysisStatus: "queued",
      analysisJson: { reindexReason: "learning_unit_metadata_v3" }
    }).where(inArray(contentDocuments.id, outdatedDocuments.map((document) => document.id)));
    for (const document of outdatedDocuments) await queuePaperDocumentJob(document.id);
    throw new Error(
      `Treeschool is upgrading ${outdatedDocuments.length} existing ${outdatedDocuments.length === 1 ? "material" : "materials"} to the stronger metadata format. Planning can begin after indexing finishes.`
    );
  }
  const planningProgressByDocument = await loadPlanningProgress(year.profileId, printableDocuments);
  const excludedUnitIdsByDocument = new Map(Array.from(planningProgressByDocument, ([documentId, state]) => [
    documentId,
    state.excludedSourceUnitIds
  ]));
  const remainingCanonicalUnitCount = printableDocuments.reduce((total, document) => {
    const excluded = new Set(excludedUnitIdsByDocument.get(document.id) ?? []);
    return total + (learningUnitsFromAnalysis(document.analysisJson, document.pageCount) ?? [])
      .filter((unit) => !excluded.has(unit.id)).length;
  }, 0);
  if (remainingCanonicalUnitCount === 0) {
    throw new Error(
      "All lessons in these Treeschool workbooks are already completed or mastered. Add another workbook before building a new plan."
    );
  }
  const activeJobs = await db.select({ id: weeklyPlanJobs.id }).from(weeklyPlanJobs)
    .where(and(
      eq(weeklyPlanJobs.learningYearId, year.id),
      inArray(weeklyPlanJobs.status, ["queued", "retry_wait", "running", "quality_check"])
    ));
  if (activeJobs.length > 0) throw new Error("A plan update is already running.");
  const existingWeeks = await db
    .select({ id: weeklyPlans.id, weekNumber: weeklyPlans.weekNumber, status: weeklyPlans.status })
    .from(weeklyPlans)
    .where(eq(weeklyPlans.learningYearId, year.id));
  const preservedWeekNumbers = new Set(
    existingWeeks
      .filter((week) => ["in_progress", "completed"].includes(week.status))
      .map((week) => week.weekNumber)
  );
  const weekNumbersToGenerate = Array.from({ length: year.totalWeeks }, (_, index) => index + 1)
    .filter((weekNumber) => !preservedWeekNumbers.has(weekNumber));
  if (weekNumbersToGenerate.length === 0) {
    throw new Error("Every week has already been started or completed, so there are no future weeks to replan.");
  }
  const generationEvent = await reservePlanGeneration({
    userId: parentUserId,
    learningYearId: year.id,
    isReplan: existingWeeks.length > 0
  });
  let revisionId: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const [revision] = await tx.insert(planVersions).values({
        learningYearId: year.id,
        generationEventId: generationEvent.id,
        status: "generating",
        sourceDocumentIds: readyDocuments.map((document) => document.id)
      }).returning({ id: planVersions.id });
      revisionId = revision.id;
      await tx.delete(weeklyPlanJobs).where(eq(weeklyPlanJobs.learningYearId, year.id));
      await tx.insert(weeklyPlanJobs).values(
        weekNumbersToGenerate.map((weekNumber) => ({
          learningYearId: year.id,
          planVersionId: revision.id,
          weekNumber,
          status: "queued",
          attemptCount: 0,
          availableAt: new Date()
        }))
      );
      await tx.update(learningYears).set({ status: "planning", updatedAt: new Date() })
        .where(eq(learningYears.id, year.id));
    });
  } catch (error) {
    await finishPlanGenerationEvent(generationEvent.id, false);
    if (revisionId) await db.update(planVersions).set({ status: "failed" }).where(eq(planVersions.id, revisionId));
    throw error;
  }

  return getPaperPlan(parentUserId, year.profileId);
}

export function curriculumCompletenessInputFingerprint(
  studentGradeLevel: number | null,
  documents: Array<typeof contentDocuments.$inferSelect>
) {
  const normalizedDocuments = documents.map((document) => {
    const analysis = document.analysisJson && typeof document.analysisJson === "object"
      ? document.analysisJson as Record<string, unknown>
      : {};
    const sections = Array.isArray(analysis.sections) ? analysis.sections : [];
    return {
      id: document.id,
      label: document.label,
      subjectId: document.subjectId,
      subjectLabel: document.subjectLabel,
      analysisStatus: document.analysisStatus,
      suggestedTitle: analysis.suggestedTitle ?? null,
      summary: analysis.summary ?? null,
      sectionTitles: sections
        .map((section) => section && typeof section === "object"
          ? String((section as Record<string, unknown>).title ?? "").trim()
          : "")
        .filter(Boolean)
        .slice(0, 40),
      academicLevel: analysis.academicLevel ?? null
    };
  });
  return createHash("sha256")
    .update(JSON.stringify({ version: 3, studentGradeLevel, documents: normalizedDocuments }))
    .digest("hex");
}

export async function evaluateLearningYearCurriculumCompleteness(
  parentUserId: string,
  learningYearId: string
) {
  await requireAccountRole(parentUserId, ["OWNER", "ADMIN"]);
  const year = await requireOwnedYear(parentUserId, learningYearId);
  const [student] = await db
    .select({ gradeLevel: profiles.gradeLevel })
    .from(profiles)
    .where(eq(profiles.id, year.profileId))
    .limit(1);
  const documents = await db
    .select()
    .from(contentDocuments)
    .where(and(eq(contentDocuments.learningYearId, year.id), isNull(contentDocuments.removedAt)))
    .orderBy(asc(contentDocuments.sortOrder), asc(contentDocuments.createdAt));
  if (documents.length === 0) throw new Error("Upload teaching materials before reviewing the curriculum.");
  if (documents.some((document) => ["queued", "pending", "analyzing"].includes(document.analysisStatus))) {
    throw new Error("Wait for the teaching materials to finish indexing before reviewing the curriculum.");
  }
  const initialFingerprint = curriculumCompletenessInputFingerprint(
    student?.gradeLevel ?? null,
    documents
  );
  const cachedResult = parsePersistedCurriculumCompletenessResult(
    year.curriculumCompletenessResult
  );
  if (
    cachedResult &&
    year.curriculumCompletenessInputFingerprint === initialFingerprint
  ) {
    return cachedResult;
  }

  const subjects = new Map<string, {
    name: string;
    parentLevel: string | null;
    materials: Array<{
      title: string;
      summary: string | null;
      sectionTitles: string[];
      academicLevel: AcademicLevelEvidence | null;
    }>;
  }>();

  const preparedDocuments = await Promise.all(
    documents.filter((item) => item.analysisStatus === "ready").slice(0, 30).map(async (document) => {
    let analysis = (document.analysisJson && typeof document.analysisJson === "object"
      ? document.analysisJson
      : {}) as Partial<DocumentAnalysis>;
    let academicLevel = normalizeAcademicLevel(analysis.academicLevel);
    if (!academicLevel && isPrintablePdfDocument(document)) {
      const bytes = await downloadPrivateFile(document.objectPath);
      academicLevel = await inferAcademicLevelFromPdf(
        bytes,
        document.label,
        (analysis.sections ?? []).map((section) => String(section.title ?? "")).filter(Boolean),
        {
          learningYearId: year.id,
          contentDocumentId: document.id
        }
      );
      if (academicLevel) {
        analysis = { ...analysis, academicLevel };
        await db
          .update(contentDocuments)
          .set({ analysisJson: analysis })
          .where(eq(contentDocuments.id, document.id));
      }
    }

    return { document, analysis, academicLevel };
  }));

  for (const { document, analysis, academicLevel } of preparedDocuments) {
    const name = document.subjectLabel?.trim() || document.label.trim() || "Uncategorized";
    const key = normalizeSubjectKey(name) || "uncategorized";
    const subject = subjects.get(key) ?? { name, parentLevel: null, materials: [] };
    subject.materials.push({
      title: String(analysis.suggestedTitle || document.label).trim(),
      summary: String(analysis.summary || "").trim() || null,
      sectionTitles: (analysis.sections ?? [])
        .map((section) => String(section.title || "").trim())
        .filter(Boolean)
        .slice(0, 40),
      academicLevel
    });
    subjects.set(key, subject);
  }

  if (subjects.size === 0) throw new Error("No indexed teaching materials are ready for review.");
  const result = await evaluateCurriculumCompleteness({
    studentGradeLevel: student?.gradeLevel ?? null,
    subjects: Array.from(subjects.values())
  }, {
    learningYearId: year.id
  });
  const effectiveAnalysisByDocumentId = new Map(
    preparedDocuments.map(({ document, analysis }) => [document.id, analysis])
  );
  const finalFingerprint = curriculumCompletenessInputFingerprint(
    student?.gradeLevel ?? null,
    documents.map((document) => ({
      ...document,
      analysisJson: effectiveAnalysisByDocumentId.get(document.id) ?? document.analysisJson
    }))
  );
  await db.update(learningYears).set({
    curriculumCompletenessResult: result,
    curriculumCompletenessInputFingerprint: finalFingerprint,
    curriculumCompletenessReviewedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(learningYears.id, year.id));
  return result;
}

export async function applyNativeWorkbookCoverageToLearningYearCache(input: {
  learningYearId: string;
  coverageProfiles: CurriculumCoverageProfile[];
}) {
  if (!input.coverageProfiles.length) return null;
  const [year] = await db.select({
    id: learningYears.id,
    profileId: learningYears.profileId,
    cachedResult: learningYears.curriculumCompletenessResult
  }).from(learningYears).where(eq(learningYears.id, input.learningYearId)).limit(1);
  const current = parsePersistedCurriculumCompletenessResult(year?.cachedResult);
  if (!year || !current) return null;
  const updated = applyCurriculumCoverageProfiles(current, input.coverageProfiles);
  if (updated === current) return null;
  const [[student], documents] = await Promise.all([
    db.select({ gradeLevel: profiles.gradeLevel }).from(profiles).where(eq(profiles.id, year.profileId)).limit(1),
    db.select().from(contentDocuments).where(and(
      eq(contentDocuments.learningYearId, year.id),
      isNull(contentDocuments.removedAt)
    )).orderBy(asc(contentDocuments.sortOrder), asc(contentDocuments.createdAt))
  ]);
  const fingerprint = curriculumCompletenessInputFingerprint(student?.gradeLevel ?? null, documents);
  await db.update(learningYears).set({
    curriculumCompletenessResult: updated,
    curriculumCompletenessInputFingerprint: fingerprint,
    curriculumCompletenessReviewedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(learningYears.id, year.id));
  return updated;
}

export async function runNextWeeklyPlanJob(workerId: string) {
  const job = await claimNextWeeklyPlanJob(workerId);

  if (!job) {
    return null;
  }

  try {
    const [year] = await db
      .select()
      .from(learningYears)
      .where(eq(learningYears.id, job.learningYearId))
      .limit(1);

    if (!year) {
      await markWeeklyPlanJobFailed(job, workerId, new Error("Learning year row not found."));
      return {
        jobId: job.id,
        learningYearId: job.learningYearId,
        weekNumber: job.weekNumber,
        outcome: "missing"
      };
    }

    const [revision] = job.planVersionId
      ? await db.select({
          sourceDocumentIds: planVersions.sourceDocumentIds
        })
          .from(planVersions).where(eq(planVersions.id, job.planVersionId)).limit(1)
      : [null];
    const { printableDocuments } = await loadReadyPlanningDocuments(
      year.id,
      revision?.sourceDocumentIds
    );
    const subjectPreferences = await db
      .select()
      .from(learningYearSubjectPreferences)
      .where(eq(learningYearSubjectPreferences.learningYearId, year.id));
    const materialSets = await db
      .select()
      .from(learningYearMaterialSets)
      .where(eq(learningYearMaterialSets.learningYearId, year.id));
    const preservedAssignments = await db
      .select({
        weekNumber: weeklyPlans.weekNumber,
        documentId: weeklyPlanItems.documentId,
        firstPageIndex: weeklyPlanItems.firstPageIndex,
        lastPageIndex: weeklyPlanItems.lastPageIndex,
        label: weeklyPlanItems.label,
        sourceUnitId: weeklyPlanItems.sourceUnitId
      })
      .from(weeklyPlans)
      .innerJoin(weeklyPlanItems, eq(weeklyPlanItems.weeklyPlanId, weeklyPlans.id))
      .where(
        and(
          eq(weeklyPlans.learningYearId, year.id),
          inArray(weeklyPlans.status, ["in_progress", "completed"])
        )
      );
    const week = await generateOneWeekPlan({
      year,
      printableDocuments,
      weekNumber: job.weekNumber,
      subjectPreferences,
      materialSets,
      preservedAssignments: preservedAssignments.map((assignment) => ({
        weekNumber: assignment.weekNumber,
        documentId: assignment.documentId,
        startPage: assignment.firstPageIndex + 1,
        endPage: assignment.lastPageIndex + 1,
        label: assignment.label,
        learningUnitId: assignment.sourceUnitId
      }))
    });
    if (job.planVersionId) {
      await stageGeneratedWeek(job.planVersionId, week);
    } else {
      await saveGeneratedWeek({ learningYearId: year.id, week });
    }
    await markWeeklyPlanJobCompleted(job, workerId);
    await finalizePlanVersionIfReady(year.id, job.planVersionId);
    await updateLearningYearPlanningStatus(year.id);
    await updatePlanPackPlanningStatus(year.id);

    return {
      jobId: job.id,
      learningYearId: year.id,
      weekNumber: job.weekNumber,
      outcome: "completed"
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown weekly planning failure.";
    console.error(`Failed to plan week ${job.weekNumber} for learning year ${job.learningYearId}:`, error);
    await markWeeklyPlanJobFailed(job, workerId, error);
    await finalizePlanVersionIfReady(job.learningYearId, job.planVersionId);
    await updateLearningYearPlanningStatus(job.learningYearId);
    await updatePlanPackPlanningStatus(job.learningYearId);

    return {
      jobId: job.id,
      learningYearId: job.learningYearId,
      weekNumber: job.weekNumber,
      outcome: "failed",
      error: errorMessage
    };
  }
}

async function updatePlanPackPlanningStatus(learningYearId: string) {
  const [intake] = await db
    .select()
    .from(planPackIntakes)
    .where(eq(planPackIntakes.learningYearId, learningYearId))
    .limit(1);

  if (!intake) return;

  const jobs = await db
    .select()
    .from(weeklyPlanJobs)
    .where(eq(weeklyPlanJobs.learningYearId, learningYearId));

  if (jobs.length === 0) return;

  const failed = jobs.filter((job) => job.status === "failed").length;
  const active = jobs.filter((job) =>
    ["queued", "retry_wait", "running", "quality_check"].includes(job.status)
  ).length;
  const completed = jobs.filter((job) => job.status === "completed").length;
  const status =
    failed > 0
      ? "failed"
      : active > 0
        ? "planning"
        : completed === jobs.length
          ? "ready"
          : intake.status;
  const trialStartedAt = status === "ready" && !intake.premiumTrialStartedAt
    ? new Date()
    : intake.premiumTrialStartedAt;
  const trialEndsAt = status === "ready" && !intake.premiumTrialEndsAt && trialStartedAt
    ? new Date(trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    : intake.premiumTrialEndsAt;

  await db
    .update(planPackIntakes)
    .set({
      status,
      premiumTrialStartedAt: trialStartedAt,
      premiumTrialEndsAt: trialEndsAt,
      lastError: failed > 0 ? "One or more weekly plans could not be generated." : null,
      updatedAt: new Date()
    })
    .where(eq(planPackIntakes.id, intake.id));
}

export async function generateLearningYearPlan(parentUserId: string, learningYearId: string) {
  const year = await requireOwnedYear(parentUserId, learningYearId);
  const documents = await db
    .select()
    .from(contentDocuments)
    .where(and(eq(contentDocuments.learningYearId, year.id), isNull(contentDocuments.removedAt)))
    .orderBy(asc(contentDocuments.sortOrder), asc(contentDocuments.createdAt));

  if (documents.length === 0) {
    throw new Error("Upload at least one curriculum file before generating the plan.");
  }

  const activeDocuments = documents.filter((document) =>
    ["queued", "pending", "analyzing"].includes(document.analysisStatus)
  );
  if (activeDocuments.length > 0) {
    throw new Error("Wait for all uploaded files to finish processing before building the weekly plan.");
  }

  const readyDocuments = documents.filter((document) => document.analysisStatus === "ready");
  const printableDocuments = readyDocuments.filter(isPrintablePdfDocument).filter((document) => {
    const ranges = classifiedPlanningRangesFromAnalysis(document.analysisJson, document.pageCount, document.documentRole);
    return ranges === null || ranges.some((range) => range.includeInPlan);
  });
  if (printableDocuments.length === 0) {
    throw new Error("No indexed source PDFs are ready yet. Add at least one PDF that can be used in weekly plans.");
  }

  const legacyProgressByDocument = await loadPlanningProgress(year.profileId, printableDocuments);
  const excludedUnitIdsByDocument = new Map(Array.from(legacyProgressByDocument, ([documentId, state]) => [
    documentId,
    state.excludedSourceUnitIds
  ]));

  const documentContext = printableDocuments.map((document) => ({
    id: document.id,
    materialSetId: document.materialSetId,
    label: document.label,
    subjectId: document.subjectId,
    subjectLabel: document.subjectLabel,
    role: document.documentRole,
    sourceKind: document.sourceKind,
    pageCount: document.pageCount,
    parentNotes: document.parentNotes,
    analysis: (() => {
      const analysis = document.analysisJson && typeof document.analysisJson === "object"
        ? document.analysisJson as Record<string, unknown>
        : {};
      const classifiedRanges = classifiedPlanningRangesFromAnalysis(analysis, document.pageCount, document.documentRole);
      const excluded = new Set(excludedUnitIdsByDocument.get(document.id) ?? []);
      const learningUnits = learningUnitsFromAnalysis(analysis, document.pageCount)
        ?.filter((unit) => !excluded.has(unit.id));
      return {
        summary: analysis.summary,
        academicLevel: analysis.academicLevel,
        learningUnits: learningUnits?.map((unit) => ({
          id: unit.id,
          title: unit.title,
          sequenceOrder: unit.sequenceOrder,
          pageCount: unit.components.reduce(
            (total, component) => total + component.pdfPageEnd - component.pdfPageStart + 1,
            0
          ),
          estimatedMinutes: unit.estimatedMinutes,
          conceptLabels: unit.conceptLabels,
          splittable: unit.splittable,
          approvedSplitPoints: unit.approvedSplitPoints
        })) ?? [],
        filteredPageCount: classifiedRanges
          ? classifiedRanges
              .filter((range) => !range.includeInPlan)
              .reduce((total, range) => total + range.endPage - range.startPage + 1, 0)
          : 0
      };
    })()
  }));
  const supplementalContext = readyDocuments
    .filter((document) => !isPrintablePdfDocument(document))
    .map((document) => ({
      id: document.id,
      label: document.label,
      subjectId: document.subjectId,
      subjectLabel: document.subjectLabel,
      role: document.documentRole,
      sourceKind: document.sourceKind,
      parentNotes: document.parentNotes,
      analysis: document.analysisJson
    }));
  const subjectPreferences = await db
    .select()
    .from(learningYearSubjectPreferences)
    .where(eq(learningYearSubjectPreferences.learningYearId, year.id));
  const materialSets = await db.select().from(learningYearMaterialSets)
    .where(eq(learningYearMaterialSets.learningYearId, year.id));

  let generated: GeneratedPlan;
  try {
    generated = await requestGeminiJson<GeneratedPlan>([
      {
        text: `Create a balanced ${year.totalWeeks}-week homeschool learning plan from these uploaded curriculum documents.
Do not assume or invent subjects. Use the content and sequence described by the document analyses.
Do not generate, rewrite, paraphrase, supplement, or replace any educational content. Your only decision is which supplied learningUnitId to place in each week and teaching day.
Learning units should be spread across the year in pedagogical sequence without overloading a week.
The parent may provide subject labels and supplemental text/image files as context. Use supplemental files only as planning hints; they are not schedulable units.
Assign every supplied learning unit exactly once across the year.
Material prerequisites are hard constraints. A dependent material cannot appear in the same or any earlier week than its prerequisite, and every approved page from the prerequisite must be scheduled before the dependent begins.
Never return page numbers. Treeschool expands each learningUnitId into its immutable validated source components. Keep an indivisible unit in one week and one teaching day.
${year.teachingDaysPerWeek
  ? `This family teaches on ${year.teachingDaysPerWeek} days each week. Assign every item a numeric dayNumber from 1 through ${year.teachingDaysPerWeek}; these are numbered teaching days, not named weekdays. When a week contains at least ${year.teachingDaysPerWeek} schedulable learning units, use every teaching day at least once. Balance whole units across days and preserve curriculum order. Never split an indivisible unit merely to fill a day. Honor subject cadence preferences when the available unit count allows.`
  : "This is a legacy learning year without day scheduling. Return null for dayNumber."}
Return JSON only:
{
  "weeks": [{
    "weekNumber": 1,
    "summary": "one sentence for the parent",
    "items": [{
      "documentId": "exact id",
      "learningUnitId": "exact unit id supplied by that document",
      "splitAfterComponentIndex": null,
      "label": "specific lesson or activity",
      "subjectTitle": "short descriptive title for this subject's work in this week",
      "dayNumber": ${year.teachingDaysPerWeek ? `"number from 1 through ${year.teachingDaysPerWeek}"` : "null"},
      "conceptLabels": ["short names of every concept practiced in this exact range"],
      "conceptRedundant": false,
      "redundancyReason": null
    }]
  }]
Include exactly ${year.totalWeeks} weeks. A week may be empty only if the uploaded content is too short.

PDF DOCUMENTS THAT MAY BE ASSIGNED AS WEEKLY PLAN ITEMS:
${JSON.stringify(documentContext)}

SUPPLEMENTAL CONTEXT FILES THAT MUST NOT BE ASSIGNED AS WEEKLY PLAN ITEMS:
${JSON.stringify(supplementalContext)}

SUBJECT CADENCE PREFERENCES:
${JSON.stringify(subjectPreferences.map((preference) => ({
  subjectLabel: preference.subjectLabel,
  daysPerWeek: preference.daysPerWeek
})))}

MATERIAL PREREQUISITES:
${JSON.stringify(materialSets.filter((materialSet) => materialSet.prerequisiteMaterialSetId).map((materialSet) => ({
  materialSetId: materialSet.id,
  label: materialSet.label,
  prerequisiteMaterialSetId: materialSet.prerequisiteMaterialSetId
})))} `
      }
    ], {
      operation: "plan.full_year_generation_legacy",
      context: { learningYearId: year.id }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown full-year planning failure.";
    const errorDetails: Record<string, unknown> = {};
    if (error instanceof Error && error.stack) errorDetails.stack = error.stack;
    await db.insert(planGenerationDiagnostics).values({
      learningYearId: year.id,
      stage: "legacy_full_year_generation",
      provider: "google",
      model: GEMINI_MODEL,
      errorName: error instanceof Error ? error.name : null,
      errorMessage,
      errorDetails,
      willRetry: false
    });
    throw error;
  }

  let normalizedWeeks = Array.from({ length: year.totalWeeks }, (_, index) => {
    const candidate = generated.weeks?.find((week) => Number(week.weekNumber) === index + 1);
    const normalizedWeek = normalizeGeneratedWeek(
      candidate,
      printableDocuments,
      index + 1,
      year.teachingDaysPerWeek
    );
    assertTeachingDayCoverage(normalizedWeek.items, year.teachingDaysPerWeek, index + 1);
    return normalizedWeek;
  });
  const materialSetById = await loadMaterialPrerequisiteMap(year.id);
  const legacyRepair = repairStagedPlanMetadata({
    weeks: normalizedWeeks,
    teachingDaysPerWeek: year.teachingDaysPerWeek,
    subjectPreferences,
    documents: printableDocuments.map((document) => ({
      ...document,
      contentFingerprint: contentFingerprintFromAnalysis(document.analysisJson),
      excludedSourceUnitIds: excludedUnitIdsByDocument.get(document.id) ?? [],
      deferredSourceUnitIds: legacyProgressByDocument.get(document.id)?.deferredSourceUnitIds ?? []
    })),
    preservedItems: []
  });
  normalizedWeeks = legacyRepair.weeks;

  validatePlanMetadata({
    totalWeeks: year.totalWeeks,
    teachingDaysPerWeek: year.teachingDaysPerWeek,
    weeks: normalizedWeeks,
    documents: printableDocuments.map((document) => ({
      id: document.id,
      label: document.label,
      pageCount: document.pageCount,
      documentRole: document.documentRole,
      materialSetId: document.materialSetId,
      prerequisiteMaterialSetId:
        materialSetById.get(document.materialSetId)?.prerequisiteMaterialSetId ?? null,
      classifiedRanges: classifiedPlanningRangesFromAnalysis(
        document.analysisJson,
        document.pageCount,
        document.documentRole
      ),
      learningUnits: learningUnitsFromAnalysis(document.analysisJson, document.pageCount),
      pageLedger: pageLedgerFromAnalysis(document.analysisJson),
      contentFingerprint: contentFingerprintFromAnalysis(document.analysisJson),
      excludedSourceUnitIds: excludedUnitIdsByDocument.get(document.id) ?? []
    }))
  });

  const preparedWeeks = await Promise.all(normalizedWeeks.map(async (week) => ({
    ...week,
    items: await applySavedLessonDispositions(db, year.id, week.items)
  })));

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: weeklyPlans.id })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.learningYearId, year.id));
    if (existing.length > 0) {
      await tx.delete(weeklyPlans).where(eq(weeklyPlans.learningYearId, year.id));
    }

    for (const week of preparedWeeks) {
      const [inserted] = await tx
        .insert(weeklyPlans)
        .values({
          learningYearId: year.id,
          weekNumber: week.weekNumber,
          title: week.title,
          summary: week.summary
        })
        .returning({ id: weeklyPlans.id });

      if (week.items.length > 0) {
        await tx.insert(weeklyPlanItems).values(
          week.items.map((item) => ({
            weeklyPlanId: inserted.id,
            ...item
          }))
        );
      }
      if (week.subjectTitles.length > 0) {
        await tx.insert(weeklyPlanSubjectGrades).values(
          week.subjectTitles.map((subject) => ({ weeklyPlanId: inserted.id, ...subject }))
        );
      }
    }

    await tx
      .update(learningYears)
      .set({ status: "planned", lastPlannedAt: new Date(), updatedAt: new Date() })
      .where(eq(learningYears.id, year.id));
  });

  return getPaperPlan(parentUserId, year.profileId);
}

export async function deleteContentDocument(parentUserId: string, documentId: string) {
  await requireAccountRole(parentUserId, ["OWNER", "ADMIN"]);
  const [document] = await db
    .select()
    .from(contentDocuments)
    .where(eq(contentDocuments.id, documentId))
    .limit(1);
  if (!document) throw new Error("Content file not found.");
  await requireOwnedYear(parentUserId, document.learningYearId);
  const [reference] = await db
    .select({ id: weeklyPlanItems.id })
    .from(weeklyPlanItems)
    .where(eq(weeklyPlanItems.documentId, document.id))
    .limit(1);
  const versions = await db.select({ sourceDocumentIds: planVersions.sourceDocumentIds })
    .from(planVersions)
    .where(and(
      eq(planVersions.learningYearId, document.learningYearId),
      inArray(planVersions.status, ["active", "recoverable", "generating"])
    ));
  const versionReference = versions.some((version) => version.sourceDocumentIds.includes(document.id));
  const retained = Boolean(reference || versionReference);
  if (retained) {
    await db.update(contentDocuments).set({
      removedAt: new Date(),
      retainedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }).where(eq(contentDocuments.id, document.id));
  } else {
    await db.delete(contentDocuments).where(eq(contentDocuments.id, document.id));
    if (document.sourceKind !== "native_workbook") {
      await deletePrivateFile(document.objectPath);
    }
    const [remainingMaterialDocument] = await db.select({ id: contentDocuments.id })
      .from(contentDocuments)
      .where(eq(contentDocuments.materialSetId, document.materialSetId))
      .limit(1);
    if (!remainingMaterialDocument) {
      await db.delete(learningYearMaterialSets)
        .where(eq(learningYearMaterialSets.id, document.materialSetId));
    }
  }
  await db
    .update(learningYears)
    .set({ materialsUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(learningYears.id, document.learningYearId));
  return { deleted: !retained, removedFromFuturePlanning: true, retainedForRecovery: retained };
}

export async function updateContentDocumentMetadata(input: {
  parentUserId: string;
  documentId: string;
  label: string;
  subjectLabel?: string | null;
  parentNotes?: string | null;
  subjectDaysPerWeek?: number | null;
  prerequisiteMaterialSetId?: string | null;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const [document] = await db
    .select()
    .from(contentDocuments)
    .where(eq(contentDocuments.id, input.documentId))
    .limit(1);
  if (!document) throw new Error("Content file not found.");
  const year = await requireOwnedYear(input.parentUserId, document.learningYearId);

  const label = input.label.trim();
  if (!label) throw new Error("Enter a material name.");
  const requestedSubjectLabel = input.subjectLabel?.trim() || null;
  const uploadSubject = await resolveUploadSubject({
    subjectId:
      document.subjectId && requestedSubjectLabel === document.subjectLabel
        ? document.subjectId
        : null,
    subjectLabel: requestedSubjectLabel
  });
  validateSubjectSchedule({
    subjectLabel: uploadSubject.subjectLabel,
    daysPerWeek: input.subjectDaysPerWeek,
    teachingDaysPerWeek: year.teachingDaysPerWeek
  });
  await ensureMaterialSet({
    learningYearId: document.learningYearId,
    materialSetId: document.materialSetId,
    label,
    prerequisiteMaterialSetId: input.prerequisiteMaterialSetId
  });
  const [updated] = await db
    .update(contentDocuments)
    .set({
      label,
      subjectId: uploadSubject.subjectId,
      subjectLabel: uploadSubject.subjectLabel,
      parentNotes: input.parentNotes?.trim() || null
    })
    .where(eq(contentDocuments.id, document.id))
    .returning();

  await upsertSubjectPreference({
    learningYearId: document.learningYearId,
    subjectId: uploadSubject.subjectId,
    subjectLabel: uploadSubject.subjectLabel,
    daysPerWeek: input.subjectDaysPerWeek
  });

  await db
    .update(learningYears)
    .set({ materialsUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(learningYears.id, document.learningYearId));

  return updated;
}

export async function restorePreviousPlanVersion(parentUserId: string, learningYearId: string) {
  await requireAccountRole(parentUserId, ["OWNER", "ADMIN"]);
  const year = await requireOwnedYear(parentUserId, learningYearId);
  const access = await getPremiumFeatureAccess(parentUserId);
  if (!access.allowed) throw new Error("Upgrade to restore a previous plan version.");
  const recoverableVersions = await db.select().from(planVersions)
    .where(and(eq(planVersions.learningYearId, year.id), eq(planVersions.status, "recoverable")))
    .orderBy(desc(planVersions.createdAt));
  const target = recoverableVersions.find((version) => version.restoreUntil && version.restoreUntil > new Date());
  if (!target) throw new Error("There is no previous plan version available to restore.");
  const targetSnapshot = target.snapshotJson as PlanSnapshot;
  if (!Array.isArray(targetSnapshot.weeks)) throw new Error("The previous plan version is incomplete.");
  const currentSnapshot = await capturePlanSnapshot(year.id);
  const [currentRevision] = await db.select().from(planVersions)
    .where(and(eq(planVersions.learningYearId, year.id), eq(planVersions.status, "active")))
    .orderBy(desc(planVersions.activatedAt), desc(planVersions.createdAt)).limit(1);
  const preservedWeeks = currentSnapshot.weeks.filter((week) => ["in_progress", "completed"].includes(week.status));
  const preservedNumbers = new Set(preservedWeeks.map((week) => week.weekNumber));
  const restoredWeeks = targetSnapshot.weeks.filter((week) =>
    !preservedNumbers.has(week.weekNumber) && !["in_progress", "completed"].includes(week.status)
  );
  const restoredDocumentIds = new Set([
    ...target.sourceDocumentIds,
    ...preservedWeeks.flatMap((week) => week.items.map((item) => item.documentId))
  ]);
  const documents = await db.select({ id: contentDocuments.id }).from(contentDocuments)
    .where(eq(contentDocuments.learningYearId, year.id));
  const now = new Date();
  const restoreUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx.update(planVersions).set({ status: "expired", restoreUntil: null })
      .where(and(
        eq(planVersions.learningYearId, year.id),
        eq(planVersions.status, "recoverable"),
        sql`${planVersions.id} <> ${target.id}`
      ));
    if (currentRevision) {
      await tx.update(planVersions).set({
        status: "recoverable",
        snapshotJson: currentSnapshot,
        restoreUntil
      }).where(eq(planVersions.id, currentRevision.id));
    } else if (currentSnapshot.weeks.length > 0) {
      await tx.insert(planVersions).values({
        learningYearId: year.id,
        status: "recoverable",
        sourceDocumentIds: snapshotDocumentIds(currentSnapshot),
        snapshotJson: currentSnapshot,
        restoreUntil,
        activatedAt: now
      });
    }
    const replaceable = await tx.select({ id: weeklyPlans.id }).from(weeklyPlans)
      .where(and(eq(weeklyPlans.learningYearId, year.id), inArray(weeklyPlans.status, ["planned", "skipped"])));
    if (replaceable.length > 0) {
      await tx.delete(weeklyPlans).where(inArray(weeklyPlans.id, replaceable.map((week: { id: string }) => week.id)));
    }
    for (const week of restoredWeeks) await insertSnapshotWeek(tx, year.id, week);
    for (const document of documents) {
      await tx.update(contentDocuments).set(
        restoredDocumentIds.has(document.id)
          ? { removedAt: null, retainedUntil: null }
          : { removedAt: now, retainedUntil: restoreUntil }
      ).where(eq(contentDocuments.id, document.id));
    }
    await tx.update(planVersions).set({ status: "active", restoreUntil: null, activatedAt: now })
      .where(eq(planVersions.id, target.id));
    await tx.update(learningYears).set({
      status: "planned",
      materialsUpdatedAt: now,
      lastPlannedAt: now,
      updatedAt: now
    }).where(eq(learningYears.id, year.id));
  });
  await backfillPersistedPageSelectionAudits(year.id);
  const restoredSnapshot = await capturePlanSnapshot(year.id);
  await db.update(planVersions).set({ snapshotJson: restoredSnapshot }).where(eq(planVersions.id, target.id));
  return getPaperPlan(parentUserId, year.profileId);
}

export async function cleanupExpiredPlanRecovery() {
  const now = new Date();
  const expiredVersions = await db.select().from(planVersions)
    .where(and(eq(planVersions.status, "recoverable"), lte(planVersions.restoreUntil, now)));
  const expiredPdfPaths = expiredVersions.flatMap((version) => {
    const snapshot = version.snapshotJson as Partial<PlanSnapshot>;
    return Array.isArray(snapshot.weeks)
      ? snapshot.weeks.flatMap((week) => [
          ...(week.pdfAsset?.objectPath ? [week.pdfAsset.objectPath] : []),
          ...((week.dayPdfAssets ?? []).map((asset) => asset.objectPath))
        ])
      : [];
  });
  if (expiredVersions.length > 0) {
    await db.update(planVersions).set({ status: "expired", restoreUntil: null })
      .where(inArray(planVersions.id, expiredVersions.map((version) => version.id)));
  }

  const retainedVersions = await db.select({ sourceDocumentIds: planVersions.sourceDocumentIds, snapshotJson: planVersions.snapshotJson })
    .from(planVersions)
    .where(inArray(planVersions.status, ["active", "recoverable", "generating"]));
  const retainedDocumentIds = new Set(retainedVersions.flatMap((version) => version.sourceDocumentIds));
  const currentItemDocuments = await db.select({ documentId: weeklyPlanItems.documentId }).from(weeklyPlanItems);
  for (const item of currentItemDocuments) retainedDocumentIds.add(item.documentId);
  const expiredDocuments = await db.select().from(contentDocuments)
    .where(and(lte(contentDocuments.retainedUntil, now), sql`${contentDocuments.removedAt} is not null`));
  let deletedDocuments = 0;
  for (const document of expiredDocuments) {
    if (retainedDocumentIds.has(document.id)) continue;
    await db.delete(contentDocuments).where(eq(contentDocuments.id, document.id));
    if (document.sourceKind !== "native_workbook") {
      await deletePrivateFile(document.objectPath);
    }
    deletedDocuments += 1;
  }

  const [activePdfAssets, activeDayPdfAssets] = await Promise.all([
    db.select({ objectPath: weeklyPlanPdfAssets.objectPath }).from(weeklyPlanPdfAssets),
    db.select({ objectPath: weeklyPlanDayPdfAssets.objectPath }).from(weeklyPlanDayPdfAssets)
  ]);
  const retainedPdfPaths = new Set([
    ...activePdfAssets.map((asset) => asset.objectPath),
    ...activeDayPdfAssets.map((asset) => asset.objectPath)
  ]);
  for (const version of retainedVersions) {
    const snapshot = version.snapshotJson as Partial<PlanSnapshot>;
    if (!Array.isArray(snapshot.weeks)) continue;
    for (const week of snapshot.weeks) {
      if (week.pdfAsset?.objectPath) retainedPdfPaths.add(week.pdfAsset.objectPath);
      for (const asset of week.dayPdfAssets ?? []) retainedPdfPaths.add(asset.objectPath);
    }
  }
  let deletedPdfAssets = 0;
  for (const objectPath of new Set(expiredPdfPaths)) {
    if (retainedPdfPaths.has(objectPath)) continue;
    await deletePrivateFile(objectPath);
    deletedPdfAssets += 1;
  }
  return { expiredVersions: expiredVersions.length, deletedDocuments, deletedPdfAssets };
}

export async function getPaperPlan(parentUserId: string, profileId: string) {
  const accountMember = await requireOwnedProfile(parentUserId, profileId);
  const permissions = {
    accountRole: accountMember.accountRole ?? "OWNER",
    canManagePlan: accountMember.accountRole !== "TEACHER",
    canRecordLearning: true
  };
  const [year] = await db
    .select()
    .from(learningYears)
    .where(eq(learningYears.profileId, profileId))
    .orderBy(desc(learningYears.createdAt))
    .limit(1);

  if (!year) {
    return {
      permissions,
      materialsChanged: false,
      year: null,
      subjectOptions: [],
      documents: [],
      recovery: { available: false, restoreUntil: null },
      regenerationAllowance: await getPlanRegenerationAllowance(parentUserId),
      planning: {
        total: 0,
        queued: 0,
        running: 0,
        qualityChecking: 0,
        completed: 0,
        failed: 0,
        qualityControlFailed: false,
        runningWeekNumbers: [],
        qualityCheckingWeekNumbers: [],
        nextQueuedWeekNumber: null,
        lastCompletedWeekNumber: null,
        active: 0
      },
      weeks: []
    };
  }

  const documents = await db
    .select()
    .from(contentDocuments)
    .where(and(eq(contentDocuments.learningYearId, year.id), isNull(contentDocuments.removedAt)))
    .orderBy(asc(contentDocuments.sortOrder), asc(contentDocuments.createdAt));
  const nativeWorkbookVersionIds = documents
    .map((document) => document.nativeWorkbookVersionId)
    .filter((versionId): versionId is string => Boolean(versionId));
  const currentNativeWorkbookTitles = nativeWorkbookVersionIds.length === 0
    ? []
    : await db
        .select({
          versionId: nativeWorkbookVersions.id,
          title: nativeWorkbooks.title
        })
        .from(nativeWorkbookVersions)
        .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookVersions.workbookId))
        .where(inArray(nativeWorkbookVersions.id, nativeWorkbookVersionIds));
  const currentNativeWorkbookTitleByVersionId = new Map(
    currentNativeWorkbookTitles.map((workbook) => [workbook.versionId, workbook.title])
  );
  const materialSets = await db
    .select()
    .from(learningYearMaterialSets)
    .where(eq(learningYearMaterialSets.learningYearId, year.id));
  const materialSetById = new Map(materialSets.map((materialSet) => [materialSet.id, materialSet]));
  const allDocuments = await db.select().from(contentDocuments)
    .where(eq(contentDocuments.learningYearId, year.id));
  const subjectPreferences = await db
    .select()
    .from(learningYearSubjectPreferences)
    .where(eq(learningYearSubjectPreferences.learningYearId, year.id));
  const preferenceByKey = new Map(
    subjectPreferences.map((preference) => [preference.subjectKey, preference])
  );
  const systemSubjects = await db
    .select({
      id: curriculumNodes.id,
      title: curriculumNodes.title
    })
    .from(curriculumNodes)
    .where(eq(curriculumNodes.type, "subject"))
    .orderBy(asc(curriculumNodes.title), asc(curriculumNodes.displayOrder), asc(curriculumNodes.order));
  const customSubjectLabels = Array.from(
    new Set(
      documents
        .filter((document) => !document.subjectId && document.subjectLabel)
        .map((document) => document.subjectLabel?.trim())
        .filter((label): label is string => Boolean(label))
    )
  ).sort((left, right) => left.localeCompare(right));
  const planningJobs = await db
    .select()
    .from(weeklyPlanJobs)
    .where(eq(weeklyPlanJobs.learningYearId, year.id))
    .orderBy(asc(weeklyPlanJobs.weekNumber));
  const weeks = await db
    .select()
    .from(weeklyPlans)
    .where(eq(weeklyPlans.learningYearId, year.id))
    .orderBy(asc(weeklyPlans.weekNumber));
  const weekIds = weeks.map((week) => week.id);
  const items =
    weekIds.length === 0
      ? []
      : await db
          .select()
          .from(weeklyPlanItems)
          .where(inArray(weeklyPlanItems.weeklyPlanId, weekIds))
          .orderBy(asc(weeklyPlanItems.sortOrder));
  const [todayAttendance, planDayAttendance, subjectGrades, daySubjectGrades] = await Promise.all([
    db.select({
      weeklyPlanId: attendanceEntries.weeklyPlanId,
      dayNumber: attendanceEntries.weeklyPlanDayNumber
    }).from(attendanceEntries).where(and(
      eq(attendanceEntries.profileId, profileId),
      eq(attendanceEntries.attendanceDate, new Date().toISOString().slice(0, 10)),
      eq(attendanceEntries.entryKind, "plan_day")
    )),
    weekIds.length === 0
      ? Promise.resolve([])
      : db.select({
          id: attendanceEntries.id,
          weeklyPlanId: attendanceEntries.weeklyPlanId,
          dayNumber: attendanceEntries.weeklyPlanDayNumber,
          attendanceDate: attendanceEntries.attendanceDate
        }).from(attendanceEntries).where(and(
          inArray(attendanceEntries.weeklyPlanId, weekIds),
          eq(attendanceEntries.entryKind, "plan_day")
        )),
    weekIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(weeklyPlanSubjectGrades)
          .where(inArray(weeklyPlanSubjectGrades.weeklyPlanId, weekIds)),
    weekIds.length === 0
      ? Promise.resolve([])
      : db.select().from(weeklyPlanDaySubjectGrades)
          .where(inArray(weeklyPlanDaySubjectGrades.weeklyPlanId, weekIds))
  ]);
  const attendanceTodayKeys = new Set(todayAttendance.flatMap((entry) =>
    entry.weeklyPlanId && entry.dayNumber ? [`${entry.weeklyPlanId}:${entry.dayNumber}`] : []
  ));
  const planDayAttendanceSubjects = planDayAttendance.length === 0 ? [] : await db
    .select()
    .from(attendanceEntrySubjects)
    .where(inArray(attendanceEntrySubjects.attendanceEntryId, planDayAttendance.map((entry) => entry.id)));
  const attendanceByEntryId = new Map(planDayAttendance.map((entry) => [entry.id, entry]));
  const pdfAssets =
    weekIds.length === 0
      ? []
      : await db
          .select({
            weeklyPlanId: weeklyPlanPdfAssets.weeklyPlanId,
            qualityStatus: weeklyPlanPdfAssets.qualityStatus,
            qualityReport: weeklyPlanPdfAssets.qualityReport
          })
          .from(weeklyPlanPdfAssets)
          .where(inArray(weeklyPlanPdfAssets.weeklyPlanId, weekIds));

  const documentById = new Map(allDocuments.map((document) => [document.id, document]));
  const recoverableVersions = await db.select({ restoreUntil: planVersions.restoreUntil })
    .from(planVersions)
    .where(and(eq(planVersions.learningYearId, year.id), eq(planVersions.status, "recoverable")))
    .orderBy(desc(planVersions.createdAt));
  const recoverable = recoverableVersions.find((version) => version.restoreUntil && version.restoreUntil > new Date());
  const regenerationAllowance = await getPlanRegenerationAllowance(parentUserId);

  return {
    permissions,
    materialsChanged: Boolean(
      year.lastPlannedAt && year.materialsUpdatedAt.getTime() > year.lastPlannedAt.getTime()
    ),
    year,
    recovery: {
      available: Boolean(recoverable),
      restoreUntil: recoverable?.restoreUntil?.toISOString() ?? null
    },
    regenerationAllowance,
    documents: documents.map((document) => ({
      ...document,
      label: document.nativeWorkbookVersionId
        ? currentNativeWorkbookTitleByVersionId.get(document.nativeWorkbookVersionId) ?? document.label
        : document.label,
      prerequisiteMaterialSetId:
        materialSetById.get(document.materialSetId)?.prerequisiteMaterialSetId ?? null,
      subjectDaysPerWeek:
        preferenceByKey.get(subjectKeyFor({
          subjectId: document.subjectId,
          subjectLabel: document.subjectLabel
        }))?.daysPerWeek ?? null
    })),
    subjectOptions: [
      ...systemSubjects.map((subject) => ({
        kind: "system" as const,
        id: subject.id,
        label: subject.title
      })),
      ...customSubjectLabels.map((label) => ({
        kind: "custom" as const,
        id: subjectKeyFor({ subjectLabel: label }),
        label
      }))
    ],
    planning: {
      total: planningJobs.length,
      queued: planningJobs.filter((job) => job.status === "queued" || job.status === "retry_wait").length,
      running: planningJobs.filter((job) => job.status === "running").length,
      qualityChecking: planningJobs.filter((job) => job.status === "quality_check").length,
      completed: planningJobs.filter((job) => job.status === "completed").length,
      failed: planningJobs.filter((job) => job.status === "failed").length,
      qualityControlFailed: planningJobs.some((job) =>
        job.status === "failed" && job.lastError?.startsWith("[Metadata quality]")
      ),
      runningWeekNumbers: planningJobs.filter((job) => job.status === "running").map((job) => job.weekNumber),
      qualityCheckingWeekNumbers: planningJobs.filter((job) => job.status === "quality_check").map((job) => job.weekNumber),
      nextQueuedWeekNumber: planningJobs.find((job) => job.status === "queued" || job.status === "retry_wait")?.weekNumber ?? null,
      lastCompletedWeekNumber: planningJobs.filter((job) => job.status === "completed").at(-1)?.weekNumber ?? null,
      active: planningJobs.filter((job) =>
        ["queued", "retry_wait", "running", "quality_check"].includes(job.status)
      ).length
    },
    weeks: weeks.map((week) => {
      const weekItems = items
        .filter((item) => item.weeklyPlanId === week.id)
        .map((item) => {
          const document = documentById.get(item.documentId);
          return {
            ...item,
            documentLabel: document?.label ?? "Content",
            subjectId: document?.subjectId ?? null,
            subjectLabel: document?.subjectLabel ?? "Uncategorized"
          };
        });
      const subjectsByKey = new Map<
        string,
        { subjectKey: string; subjectId: string | null; subjectLabel: string; planTitle: string | null }
      >();
      for (const item of weekItems) {
        const subjectLabel = item.subjectLabel || "Uncategorized";
        const subjectKey = subjectKeyFor({ subjectId: item.subjectId, subjectLabel });
        if (!subjectsByKey.has(subjectKey)) {
          subjectsByKey.set(subjectKey, {
            subjectKey,
            subjectId: item.subjectId,
            subjectLabel,
            planTitle: item.label || null
          });
        }
      }
      const savedGrades = subjectGrades.filter((grade) => grade.weeklyPlanId === week.id);
      for (const grade of savedGrades) {
        if (!subjectsByKey.has(grade.subjectKey)) {
          subjectsByKey.set(grade.subjectKey, {
            subjectKey: grade.subjectKey,
            subjectId: grade.subjectId,
            subjectLabel: grade.subjectLabel,
            planTitle: grade.planTitle ?? null
          });
        }
      }

      const pdfAsset = pdfAssets.find((asset) => asset.weeklyPlanId === week.id);
      const reportedPageCount = Number(pdfAsset?.qualityReport?.expectedPageCount);
      const scheduledDayNumbers = Array.from(new Set(
        weekItems
          .filter((item) => item.includedInPacket && item.dayNumber != null)
          .map((item) => item.dayNumber as number)
      )).sort((left, right) => left - right);
      const weekAttendance = planDayAttendance.filter((entry) => entry.weeklyPlanId === week.id);
      const attendedBlocks = new Set(planDayAttendanceSubjects.flatMap((subject) => {
        const attendance = attendanceByEntryId.get(subject.attendanceEntryId);
        return attendance?.weeklyPlanId === week.id && attendance.dayNumber != null
          ? [`${attendance.dayNumber}:${subject.subjectKey}`]
          : [];
      }));
      const savedDayGrades = daySubjectGrades.filter((grade) => grade.weeklyPlanId === week.id);
      const days = scheduledDayNumbers.map((dayNumber) => {
        const dayItems = weekItems.filter((item) => item.includedInPacket && item.dayNumber === dayNumber);
        const daySubjects = new Map<string, {
          subjectKey: string;
          subjectId: string | null;
          subjectLabel: string;
          items: typeof dayItems;
        }>();
        for (const item of dayItems) {
          const subjectLabel = item.subjectLabel || "Uncategorized";
          const subjectKey = subjectKeyFor({ subjectId: item.subjectId, subjectLabel });
          const subject = daySubjects.get(subjectKey) ?? {
            subjectKey,
            subjectId: item.subjectId,
            subjectLabel,
            items: []
          };
          subject.items.push(item);
          daySubjects.set(subjectKey, subject);
        }
        const daySubjectKeys = Array.from(daySubjects.keys());
        const attendedSubjectKeys = daySubjectKeys.filter((subjectKey) =>
          attendedBlocks.has(`${dayNumber}:${subjectKey}`)
        );
        const completed = daySubjectKeys.length > 0 && daySubjectKeys.every((subjectKey) =>
          attendedBlocks.has(`${dayNumber}:${subjectKey}`)
        );
        const partialProgress = daySubjectKeys.length === 0
          ? 0
          : Math.round((attendedSubjectKeys.length / daySubjectKeys.length) * 100);
        return {
          dayNumber,
          status: completed ? "completed" : attendedSubjectKeys.length > 0 ? "in_progress" : "not_started",
          attendanceProgress: completed ? 100 : Math.min(partialProgress, 90),
          attendanceLogged: attendedSubjectKeys.length > 0,
          attendanceLoggedToday: attendanceTodayKeys.has(`${week.id}:${dayNumber}`),
          attendedSubjectKeys,
          attendanceDates: Array.from(new Set(
            weekAttendance
              .filter((entry) => entry.dayNumber === dayNumber)
              .map((entry) => entry.attendanceDate)
          )).sort(),
          subjects: Array.from(daySubjects.values())
            .sort((left, right) => left.subjectLabel.localeCompare(right.subjectLabel))
            .map((subject) => {
              const saved = savedDayGrades.find((grade) =>
                grade.dayNumber === dayNumber && grade.subjectKey === subject.subjectKey
              );
              const assessmentRecommended = subject.items.some((item) =>
                item.pageRangeCategory === "assessment" || /\b(quiz|test|assessment|exam)\b/i.test(item.label)
              );
              return {
                ...subject,
                title: Array.from(new Set(subject.items.map((item) => item.label))).join("; "),
                assessmentRecommended,
                grade: saved?.score ?? null
              };
            })
        };
      });
      const attendanceProgress = days.length === 0
        ? 0
        : Math.round(days.reduce((total, day) => total + day.attendanceProgress, 0) / days.length);
      const attendanceStatus = days.length === 0
        ? week.status
        : attendanceProgress === 0
          ? "planned"
          : attendanceProgress >= 100
            ? "completed"
            : "in_progress";
      return {
        ...week,
        status: attendanceStatus,
        pdfQualityStatus: pdfAsset?.qualityStatus ?? "unverified",
        pdfPageCount: Number.isFinite(reportedPageCount) && reportedPageCount > 0
          ? reportedPageCount
          : null,
        items: weekItems,
        days,
        scheduledDayCount: scheduledDayNumbers.length,
        attendedDayCount: days.filter((day) => day.status === "completed").length,
        attendanceProgress,
        subjectGrades: Array.from(subjectsByKey.values())
          .sort((left, right) => left.subjectLabel.localeCompare(right.subjectLabel))
          .map((subject) => {
            const saved = savedGrades.find((grade) => grade.subjectKey === subject.subjectKey);
            return {
              ...subject,
              planTitle: saved?.planTitle ?? subject.planTitle,
              grade: saved?.grade ?? null
            };
          })
      };
    })
  };
}

export async function getWeeklyPlanManifest(parentUserId: string, weeklyPlanId: string) {
  await requireAdminParent(parentUserId);
  const [week] = await db.select().from(weeklyPlans)
    .where(eq(weeklyPlans.id, weeklyPlanId)).limit(1);
  if (!week) throw new Error("Week not found.");
  const year = await requireOwnedYear(parentUserId, week.learningYearId);

  const [itemRows, subjectGrades, subjectPreferences, pdfAssets, jobs, diagnostics] = await Promise.all([
    db.select({ item: weeklyPlanItems, document: contentDocuments })
      .from(weeklyPlanItems)
      .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
      .where(eq(weeklyPlanItems.weeklyPlanId, week.id))
      .orderBy(asc(weeklyPlanItems.sortOrder)),
    db.select().from(weeklyPlanSubjectGrades)
      .where(eq(weeklyPlanSubjectGrades.weeklyPlanId, week.id)),
    db.select().from(learningYearSubjectPreferences)
      .where(eq(learningYearSubjectPreferences.learningYearId, year.id))
      .orderBy(asc(learningYearSubjectPreferences.subjectLabel)),
    db.select().from(weeklyPlanPdfAssets)
      .where(eq(weeklyPlanPdfAssets.weeklyPlanId, week.id)).limit(1),
    db.select().from(weeklyPlanJobs)
      .where(and(
        eq(weeklyPlanJobs.learningYearId, year.id),
        eq(weeklyPlanJobs.weekNumber, week.weekNumber)
      )).limit(1),
    db.select().from(planGenerationDiagnostics)
      .where(and(
        eq(planGenerationDiagnostics.learningYearId, year.id),
        eq(planGenerationDiagnostics.weekNumber, week.weekNumber)
      ))
      .orderBy(desc(planGenerationDiagnostics.createdAt))
  ]);

  const job = jobs[0] ?? null;
  const materialSetRows = await db.select().from(learningYearMaterialSets)
    .where(eq(learningYearMaterialSets.learningYearId, year.id));
  const materialSetById = new Map(materialSetRows.map((materialSet) => [materialSet.id, materialSet]));
  const versionRows = job?.planVersionId
    ? await db.select({
        id: planVersions.id,
        generationEventId: planVersions.generationEventId,
        status: planVersions.status,
        sourceDocumentIds: planVersions.sourceDocumentIds,
        metadataQualityStatus: planVersions.metadataQualityStatus,
        metadataQualityReport: planVersions.metadataQualityReport,
        metadataQualityCheckedAt: planVersions.metadataQualityCheckedAt,
        createdAt: planVersions.createdAt,
        activatedAt: planVersions.activatedAt
      }).from(planVersions).where(eq(planVersions.id, job.planVersionId)).limit(1)
    : [];
  const version = versionRows[0] ?? null;
  const generationEventRows = version?.generationEventId
    ? await db.select({
        id: planGenerationEvents.id,
        kind: planGenerationEvents.kind,
        allowanceSource: planGenerationEvents.allowanceSource,
        periodKey: planGenerationEvents.periodKey,
        status: planGenerationEvents.status,
        createdAt: planGenerationEvents.createdAt,
        completedAt: planGenerationEvents.completedAt
      }).from(planGenerationEvents)
        .where(eq(planGenerationEvents.id, version.generationEventId)).limit(1)
    : [];
  const [generationRunUsageRows, learningYearUsageRows] = await Promise.all([
    version?.generationEventId
      ? db.select().from(modelUsageEvents)
          .where(eq(modelUsageEvents.planGenerationEventId, version.generationEventId))
          .orderBy(asc(modelUsageEvents.createdAt))
      : Promise.resolve([]),
    db.select().from(modelUsageEvents)
      .where(eq(modelUsageEvents.learningYearId, year.id))
      .orderBy(asc(modelUsageEvents.createdAt))
  ]);
  const stagedWeekRows = version
    ? await db.select({ weekJson: planVersionWeeks.weekJson })
        .from(planVersionWeeks)
        .where(and(
          eq(planVersionWeeks.planVersionId, version.id),
          eq(planVersionWeeks.weekNumber, week.weekNumber)
        )).limit(1)
    : [];

  const documents = Array.from(new Map(itemRows.map(({ document }) => [document.id, document])).values())
    .map((document) => ({
      id: document.id,
      materialSetId: document.materialSetId,
      materialSet: materialSetById.get(document.materialSetId) ? {
        id: document.materialSetId,
        label: materialSetById.get(document.materialSetId)?.label ?? document.label,
        prerequisiteMaterialSetId:
          materialSetById.get(document.materialSetId)?.prerequisiteMaterialSetId ?? null,
        prerequisiteLabel: materialSetById.get(
          materialSetById.get(document.materialSetId)?.prerequisiteMaterialSetId ?? ""
        )?.label ?? null
      } : null,
      label: document.label,
      subjectId: document.subjectId,
      subjectLabel: document.subjectLabel,
      documentRole: document.documentRole,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      sourceKind: document.sourceKind,
      sizeBytes: document.sizeBytes,
      pageCount: document.pageCount,
      sortOrder: document.sortOrder,
      parentNotes: document.parentNotes,
      analysisStatus: document.analysisStatus,
      analysis: document.analysisJson,
      contentFingerprint: contentFingerprintFromAnalysis(document.analysisJson),
      pageNumberMapping: pageNumberMappingFromAnalysis(document.analysisJson, document.pageCount),
      createdAt: document.createdAt
    }));

  const daySequenceByItem = new Map<string, number>();
  const nextDaySequence = new Map<string, number>();
  for (const { item } of itemRows) {
    const dayKey = item.dayNumber == null ? "unscheduled" : String(item.dayNumber);
    const sequence = (nextDaySequence.get(dayKey) ?? 0) + 1;
    nextDaySequence.set(dayKey, sequence);
    daySequenceByItem.set(item.id, sequence);
  }

  return {
    manifestType: "treeschool.weekly-plan",
    schemaVersion: 8,
    exportedAt: new Date().toISOString(),
    learningYear: {
      id: year.id,
      profileId: year.profileId,
      title: year.title,
      totalWeeks: year.totalWeeks,
      teachingDaysPerWeek: year.teachingDaysPerWeek,
      printPageSize: year.printPageSize,
      startDate: year.startDate,
      endDate: year.endDate,
      status: year.status
    },
    generation: {
      event: generationEventRows[0] ?? null,
      version,
      job: job ? {
        id: job.id,
        weekNumber: job.weekNumber,
        status: job.status,
        attemptCount: job.attemptCount,
        availableAt: job.availableAt,
        claimedAt: job.claimedAt,
        heartbeatAt: job.heartbeatAt,
        workerId: job.workerId,
        lastError: job.lastError,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      } : null,
      diagnostics,
      modelUsage: {
        run: {
          summary: summarizeModelUsage(generationRunUsageRows),
          events: generationRunUsageRows
        },
        learningYearToDate: summarizeModelUsage(learningYearUsageRows)
      },
      rawGeneratedWeek: stagedWeekRows[0]?.weekJson ?? null
    },
    subjectPreferences: subjectPreferences.map((preference) => ({
      subjectId: preference.subjectId,
      subjectKey: preference.subjectKey,
      subjectLabel: preference.subjectLabel,
      daysPerWeek: preference.daysPerWeek
    })),
    sourceDocuments: documents,
    week: {
      id: week.id,
      weekNumber: week.weekNumber,
      title: week.title,
      summary: week.summary,
      status: week.status,
      grade: week.grade,
      parentNotes: week.parentNotes,
      completedAt: week.completedAt,
      createdAt: week.createdAt,
      updatedAt: week.updatedAt,
      items: itemRows.map(({ item, document }) => ({
        id: item.id,
        sortOrder: item.sortOrder,
        label: item.label,
        documentId: item.documentId,
        documentLabel: document.label,
        materialSetId: document.materialSetId,
        prerequisiteMaterialSetId:
          materialSetById.get(document.materialSetId)?.prerequisiteMaterialSetId ?? null,
        subjectId: document.subjectId,
        subjectLabel: document.subjectLabel,
        dayNumber: item.dayNumber,
        dayLabel: item.dayLabel,
        sequence: {
          withinWeek: item.sortOrder + 1,
          withinTeachingDay: daySequenceByItem.get(item.id) ?? 1
        },
        pageRangeCategory: item.pageRangeCategory,
        learningUnit: item.sourceUnitId ? {
          id: item.sourceUnitId,
          componentIndex: item.sourceUnitPartIndex,
          schedulingBasis: "validated_atomic_learning_unit"
        } : null,
        pageNumberConversion: item.pageSelectionAudit,
        coverageRole: item.conceptRedundant ? "optional_reinforcement" : "essential",
        pageRange: {
          pdf: {
            firstPageNumber: item.firstPageIndex + 1,
            lastPageNumber: item.lastPageIndex + 1,
            pageCount: Math.max(0, item.lastPageIndex - item.firstPageIndex + 1),
            numberingBasis: "one_based_physical_pdf_page"
          },
          content: item.contentPageStart != null && item.contentPageEnd != null ? {
            firstPageNumber: item.contentPageStart,
            lastPageNumber: item.contentPageEnd,
            numberingBasis: "numeric_page_printed_inside_source"
          } : null
        },
        sourcePages: {
          firstPage: item.firstPageIndex + 1,
          lastPage: item.lastPageIndex + 1,
          pageCount: Math.max(0, item.lastPageIndex - item.firstPageIndex + 1),
          firstPageIndex: item.firstPageIndex,
          lastPageIndex: item.lastPageIndex
        },
        conceptLabels: item.conceptLabels,
        conceptRedundant: item.conceptRedundant,
        redundancyReason: item.redundancyReason,
        baseIncludedInPacket: item.baseIncludedInPacket,
        includedInPacket: item.includedInPacket,
        lessonDisposition: item.lessonDisposition
      })),
      subjectPlans: subjectGrades.map((subject) => ({
        subjectId: subject.subjectId,
        subjectKey: subject.subjectKey,
        subjectLabel: subject.subjectLabel,
        planTitle: subject.planTitle,
        grade: subject.grade
      }))
    },
    pdf: pdfAssets[0] ? {
      filename: pdfAssets[0].filename,
      sizeBytes: pdfAssets[0].sizeBytes,
      qualityStatus: pdfAssets[0].qualityStatus,
      qualityReport: pdfAssets[0].qualityReport,
      qualityCheckedAt: pdfAssets[0].qualityCheckedAt,
      createdAt: pdfAssets[0].createdAt
    } : null
  };
}

export async function getWeeklyPlanQrDestination(parentUserId: string, weeklyPlanId: string) {
  const [week] = await db.select().from(weeklyPlans)
    .where(eq(weeklyPlans.id, weeklyPlanId))
    .limit(1);
  if (!week) throw new Error("Week not found.");
  const year = await requireOwnedYear(parentUserId, week.learningYearId);
  const [student] = await db.select({ slug: profiles.slug })
    .from(profiles)
    .where(eq(profiles.id, year.profileId))
    .limit(1);
  return {
    profileId: year.profileId,
    profileSlug: student?.slug ?? null,
    weeklyPlanId: week.id,
    weekNumber: week.weekNumber
  };
}

function sourcePageCount(items: Array<{ firstPageIndex: number; lastPageIndex: number }>) {
  return items.reduce(
    (total, item) => total + Math.max(0, item.lastPageIndex - item.firstPageIndex + 1),
    0
  );
}

async function invalidateWeeklyPdfAssets(weeklyPlanIds: string[]) {
  if (weeklyPlanIds.length === 0) return;
  const [weeklyAssets, dayAssets] = await Promise.all([
    db.select().from(weeklyPlanPdfAssets)
      .where(inArray(weeklyPlanPdfAssets.weeklyPlanId, weeklyPlanIds)),
    db.select().from(weeklyPlanDayPdfAssets)
      .where(inArray(weeklyPlanDayPdfAssets.weeklyPlanId, weeklyPlanIds))
  ]);
  await Promise.all([
    db.delete(weeklyPlanPdfAssets)
      .where(inArray(weeklyPlanPdfAssets.weeklyPlanId, weeklyPlanIds)),
    db.delete(weeklyPlanDayPdfAssets)
      .where(inArray(weeklyPlanDayPdfAssets.weeklyPlanId, weeklyPlanIds))
  ]);
  await Promise.all([...weeklyAssets, ...dayAssets].map((asset) =>
    deletePrivateFile(asset.objectPath).catch((error) => {
      console.error(`Could not delete stale lesson-plan PDF ${asset.objectPath}:`, error);
    })
  ));
}

export async function setLessonDisposition(input: {
  parentUserId: string;
  weeklyPlanItemId: string;
  disposition: "include" | "already_mastered" | "save_for_later" | "remove";
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const featureAccess = await getPremiumFeatureAccess(input.parentUserId);
  if (!featureAccess.allowed) {
    throw new Error("Upgrade to adjust individual lessons in the plan.");
  }
  const allowed = new Set(["include", "already_mastered", "save_for_later", "remove"]);
  if (!allowed.has(input.disposition)) throw new Error("Choose a valid lesson option.");

  const [seed] = await db
    .select({ item: weeklyPlanItems, week: weeklyPlans, document: contentDocuments })
    .from(weeklyPlanItems)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanItems.weeklyPlanId))
    .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
    .where(eq(weeklyPlanItems.id, input.weeklyPlanItemId))
    .limit(1);
  if (!seed) throw new Error("Lesson not found.");
  const year = await requireOwnedYear(input.parentUserId, seed.week.learningYearId);

  const yearWeeks = await db.select({ id: weeklyPlans.id }).from(weeklyPlans)
    .where(eq(weeklyPlans.learningYearId, year.id));
  const weekIds = yearWeeks.map((week) => week.id);
  const matchingItems = seed.item.sourceUnitId
    ? await db.select().from(weeklyPlanItems).where(and(
        inArray(weeklyPlanItems.weeklyPlanId, weekIds),
        eq(weeklyPlanItems.documentId, seed.item.documentId),
        eq(weeklyPlanItems.sourceUnitId, seed.item.sourceUnitId)
      ))
    : await db.select().from(weeklyPlanItems).where(and(
        eq(weeklyPlanItems.weeklyPlanId, seed.item.weeklyPlanId),
        eq(weeklyPlanItems.documentId, seed.item.documentId),
        eq(weeklyPlanItems.label, seed.item.label),
        seed.item.dayNumber == null
          ? isNull(weeklyPlanItems.dayNumber)
          : eq(weeklyPlanItems.dayNumber, seed.item.dayNumber)
      ));
  if (matchingItems.length === 0) throw new Error("Lesson ranges could not be found.");

  const itemIds = matchingItems.map((item) => item.id);
  await db.transaction(async (tx) => {
    await tx.update(weeklyPlanItems).set({
      lessonDisposition: input.disposition,
      includedInPacket: input.disposition === "include"
        ? sql`${weeklyPlanItems.baseIncludedInPacket}`
        : false
    }).where(inArray(weeklyPlanItems.id, itemIds));

    const sourceUnitKey = seed.item.sourceUnitId
      ? `unit:${seed.item.sourceUnitId}`
      : `legacy:${seed.item.label}:${seed.item.firstPageIndex}:${seed.item.lastPageIndex}`;
    await tx.insert(studentLessonDispositions).values({
      profileId: year.profileId,
      learningYearId: year.id,
      documentId: seed.item.documentId,
      sourceUnitKey,
      sourceUnitId: seed.item.sourceUnitId,
      disposition: input.disposition,
      conceptLabels: Array.from(new Set(matchingItems.flatMap((item) => item.conceptLabels))),
      selectedByUserId: input.parentUserId,
      selectedAt: new Date(),
      updatedAt: new Date()
    }).onConflictDoUpdate({
      target: [
        studentLessonDispositions.profileId,
        studentLessonDispositions.documentId,
        studentLessonDispositions.sourceUnitKey
      ],
      set: {
        disposition: input.disposition,
        conceptLabels: Array.from(new Set(matchingItems.flatMap((item) => item.conceptLabels))),
        selectedByUserId: input.parentUserId,
        selectedAt: new Date(),
        updatedAt: new Date()
      }
    });
  });

  if (seed.document.nativeWorkbookVersionId && seed.item.sourceUnitId) {
    const progressInput = {
      profileId: year.profileId,
      nativeWorkbookVersionId: seed.document.nativeWorkbookVersionId,
      sourceUnitIds: [seed.item.sourceUnitId]
    };
    if (input.disposition === "already_mastered" || input.disposition === "save_for_later") {
      await upsertWorkbookUnitProgress({
        ...progressInput,
        status: input.disposition === "already_mastered" ? "mastered" : "deferred",
        sourceLearningYearId: year.id,
        sourceWeeklyPlanId: seed.item.weeklyPlanId,
        selectedByUserId: input.parentUserId
      });
    } else {
      await clearWorkbookUnitProgress({
        ...progressInput,
        statuses: ["mastered", "deferred"]
      });
    }
  }

  const affectedWeekIds = Array.from(new Set(matchingItems.map((item) => item.weeklyPlanId)));
  await invalidateWeeklyPdfAssets(affectedWeekIds);
  return {
    disposition: input.disposition,
    affectedItemIds: itemIds,
    affectedWeeklyPlanIds: affectedWeekIds
  };
}

export async function buildLessonPreview(
  parentUserId: string,
  weeklyPlanItemId: string
): Promise<{ bytes: Uint8Array; filename: string }> {
  const [seed] = await db
    .select({
      item: weeklyPlanItems,
      week: weeklyPlans,
      document: contentDocuments
    })
    .from(weeklyPlanItems)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanItems.weeklyPlanId))
    .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
    .where(eq(weeklyPlanItems.id, weeklyPlanItemId))
    .limit(1);
  if (!seed) throw new Error("Lesson not found.");

  await requireOwnedYear(parentUserId, seed.week.learningYearId);
  if (!isPrintablePdfDocument(seed.document)) {
    throw new Error("This lesson does not have PDF pages available to preview.");
  }

  const lessonItems = seed.item.sourceUnitId
    ? await db.select().from(weeklyPlanItems).where(and(
        eq(weeklyPlanItems.weeklyPlanId, seed.item.weeklyPlanId),
        eq(weeklyPlanItems.documentId, seed.item.documentId),
        eq(weeklyPlanItems.sourceUnitId, seed.item.sourceUnitId)
      )).orderBy(asc(weeklyPlanItems.firstPageIndex), asc(weeklyPlanItems.sortOrder))
    : await db.select().from(weeklyPlanItems).where(and(
        eq(weeklyPlanItems.weeklyPlanId, seed.item.weeklyPlanId),
        eq(weeklyPlanItems.documentId, seed.item.documentId),
        eq(weeklyPlanItems.label, seed.item.label),
        seed.item.dayNumber == null
          ? isNull(weeklyPlanItems.dayNumber)
          : eq(weeklyPlanItems.dayNumber, seed.item.dayNumber)
      )).orderBy(asc(weeklyPlanItems.firstPageIndex), asc(weeklyPlanItems.sortOrder));
  if (lessonItems.length === 0) throw new Error("Lesson pages could not be found.");

  const pageIndexes = Array.from(new Set(lessonItems.flatMap((item) => {
    if (
      item.firstPageIndex < 0 ||
      item.lastPageIndex < item.firstPageIndex ||
      item.lastPageIndex >= seed.document.pageCount
    ) {
      throw new Error(
        `Lesson preview found an invalid range for ${seed.document.label}: pages ${item.firstPageIndex + 1}-${item.lastPageIndex + 1} of ${seed.document.pageCount}.`
      );
    }
    return Array.from(
      { length: item.lastPageIndex - item.firstPageIndex + 1 },
      (_, offset) => item.firstPageIndex + offset
    );
  }))).sort((left, right) => left - right);
  if (pageIndexes.length === 0) throw new Error("Lesson pages could not be found.");

  const contiguousRanges: Array<{ firstPageIndex: number; lastPageIndex: number }> = [];
  for (const pageIndex of pageIndexes) {
    const current = contiguousRanges.at(-1);
    if (current && pageIndex === current.lastPageIndex + 1) {
      current.lastPageIndex = pageIndex;
    } else {
      contiguousRanges.push({ firstPageIndex: pageIndex, lastPageIndex: pageIndex });
    }
  }

  const sourceBytes = await downloadPrivateFile(seed.document.objectPath);
  const preview = await PDFDocument.create();
  for (const range of contiguousRanges) {
    await appendPdfPageRange(
      preview,
      sourceBytes,
      range.firstPageIndex,
      range.lastPageIndex
    );
  }
  if (preview.getPageCount() === 0) throw new Error("Lesson pages could not be rendered.");

  const safeLabel = seed.item.label
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return {
    bytes: await preview.save(),
    filename: `${safeLabel || "lesson"}-preview.pdf`
  };
}

export async function setWeeklyPlanPracticeCompression(input: {
  parentUserId: string;
  weeklyPlanId: string;
  compressed: boolean;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const featureAccess = await getPremiumFeatureAccess(input.parentUserId);
  if (!featureAccess.allowed) {
    throw new Error("Upgrade to adjust the practice included in weekly PDFs.");
  }

  const [week] = await db.select().from(weeklyPlans)
    .where(eq(weeklyPlans.id, input.weeklyPlanId)).limit(1);
  if (!week) throw new Error("Week not found.");
  await requireOwnedYear(input.parentUserId, week.learningYearId);
  if (!["planned", "skipped"].includes(week.status)) {
    throw new Error("Practice pages can only be adjusted before a week has been started.");
  }

  const items = await db.select().from(weeklyPlanItems)
    .where(eq(weeklyPlanItems.weeklyPlanId, week.id))
    .orderBy(asc(weeklyPlanItems.sortOrder));
  const includedItems = items.filter((item) => item.includedInPacket);
  const currentSourcePages = sourcePageCount(includedItems);
  const candidates = items.filter((item) =>
    item.lessonDisposition === "include" &&
    item.conceptRedundant &&
    (input.compressed ? item.includedInPacket : !item.includedInPacket && item.baseIncludedInPacket)
  );

  if (candidates.length === 0) {
    throw new Error(input.compressed
      ? "No optional repeated-practice ranges are available in this week."
      : "This week does not have any excluded practice ranges to restore.");
  }
  if (input.compressed && currentSourcePages <= OVERSIZED_WEEK_SOURCE_PAGE_THRESHOLD) {
    throw new Error("This week is already within the recommended printable size.");
  }
  if (input.compressed) {
    const essentialItems = includedItems.filter((item) => !item.conceptRedundant);
    if (essentialItems.length === 0 || sourcePageCount(essentialItems) === 0) {
      throw new Error("Treeschool could not verify enough essential material to safely shrink this week.");
    }
  }

  const candidateIds = candidates.map((item) => item.id);
  await db.update(weeklyPlanItems)
    .set({ includedInPacket: input.compressed ? false : sql`${weeklyPlanItems.baseIncludedInPacket}` })
    .where(inArray(weeklyPlanItems.id, candidateIds));

  const [staleAsset] = await db.select().from(weeklyPlanPdfAssets)
    .where(eq(weeklyPlanPdfAssets.weeklyPlanId, week.id)).limit(1);
  if (staleAsset) {
    await db.delete(weeklyPlanPdfAssets).where(eq(weeklyPlanPdfAssets.id, staleAsset.id));
    await deletePrivateFile(staleAsset.objectPath).catch((error) => {
      console.error(`Could not delete stale weekly PDF ${staleAsset.objectPath}:`, error);
    });
  }
  const staleDayAssets = await db.select().from(weeklyPlanDayPdfAssets)
    .where(eq(weeklyPlanDayPdfAssets.weeklyPlanId, week.id));
  if (staleDayAssets.length > 0) {
    await db.delete(weeklyPlanDayPdfAssets)
      .where(eq(weeklyPlanDayPdfAssets.weeklyPlanId, week.id));
    await Promise.all(staleDayAssets.map((asset) =>
      deletePrivateFile(asset.objectPath).catch((error) => {
        console.error(`Could not delete stale daily PDF ${asset.objectPath}:`, error);
      })
    ));
  }

  const updatedItems = items.map((item) =>
    candidateIds.includes(item.id)
      ? {
          ...item,
          includedInPacket: input.compressed ? false : item.baseIncludedInPacket
        }
      : item
  );
  const updatedSourcePages = sourcePageCount(updatedItems.filter((item) => item.includedInPacket));
  return {
    weeklyPlanId: week.id,
    compressed: input.compressed,
    previousSourcePages: currentSourcePages,
    sourcePages: updatedSourcePages,
    adjustedRanges: candidates.length
  };
}

export async function setWeeklyPlanDaySubjectGrade(input: {
  parentUserId: string;
  weeklyPlanId: string;
  dayNumber: number;
  subjectKey: string;
  score: number | null;
}) {
  if (input.score == null) {
    await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  }
  const [week] = await db.select().from(weeklyPlans)
    .where(eq(weeklyPlans.id, input.weeklyPlanId)).limit(1);
  if (!week) throw new Error("Week not found.");
  const year = await requireOwnedYear(input.parentUserId, week.learningYearId);
  if (!Number.isInteger(input.dayNumber) || input.dayNumber < 1 || input.dayNumber > 7) {
    throw new Error("Choose a valid planned day.");
  }
  const rows = await db.select({ item: weeklyPlanItems, document: contentDocuments })
    .from(weeklyPlanItems)
    .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
    .where(and(
      eq(weeklyPlanItems.weeklyPlanId, input.weeklyPlanId),
      eq(weeklyPlanItems.dayNumber, input.dayNumber),
      eq(weeklyPlanItems.includedInPacket, true)
    ))
    .orderBy(asc(weeklyPlanItems.sortOrder));
  const matching = rows.filter(({ document }) => {
    const subjectLabel = document.subjectLabel || "Uncategorized";
    return subjectKeyFor({ subjectId: document.subjectId, subjectLabel }) === input.subjectKey;
  });
  if (matching.length === 0) throw new Error("That subject is not scheduled for this day.");
  const first = matching[0]!;
  const subjectLabel = first.document.subjectLabel || "Uncategorized";
  const [existingGrade] = await db.select({ score: weeklyPlanDaySubjectGrades.score })
    .from(weeklyPlanDaySubjectGrades)
    .where(and(
      eq(weeklyPlanDaySubjectGrades.weeklyPlanId, input.weeklyPlanId),
      eq(weeklyPlanDaySubjectGrades.dayNumber, input.dayNumber),
      eq(weeklyPlanDaySubjectGrades.subjectKey, input.subjectKey)
    ))
    .limit(1);
  if (input.score == null) {
    await db.delete(weeklyPlanDaySubjectGrades).where(and(
      eq(weeklyPlanDaySubjectGrades.weeklyPlanId, input.weeklyPlanId),
      eq(weeklyPlanDaySubjectGrades.dayNumber, input.dayNumber),
      eq(weeklyPlanDaySubjectGrades.subjectKey, input.subjectKey)
    ));
    if (existingGrade) {
      await recordTeacherGradeActivity({
        actorUserId: input.parentUserId,
        studentProfileId: year.profileId,
        weeklyPlanId: input.weeklyPlanId,
        eventType: "grade_removed",
        subjectKey: input.subjectKey,
        subjectLabel,
        score: null,
        previousScore: existingGrade.score,
        dayNumber: input.dayNumber
      });
    }
    return { removed: true };
  }
  const score = clampGrade(input.score);
  if (score == null) throw new Error("Enter a grade from 0 to 100.");
  const titles = Array.from(new Set(matching.map(({ item }) => item.label)));
  const title = titles.length > 2 ? `${titles.slice(0, 2).join("; ")} + ${titles.length - 2} more` : titles.join("; ");
  const assessmentRecommended = matching.some(({ item }) =>
    item.pageRangeCategory === "assessment" || /\b(quiz|test|assessment|exam)\b/i.test(item.label)
  );
  const [saved] = await db.insert(weeklyPlanDaySubjectGrades).values({
    weeklyPlanId: input.weeklyPlanId,
    dayNumber: input.dayNumber,
    subjectId: first.document.subjectId,
    subjectKey: input.subjectKey,
    subjectLabel,
    title: title || null,
    score,
    assessmentRecommended
  }).onConflictDoUpdate({
    target: [
      weeklyPlanDaySubjectGrades.weeklyPlanId,
      weeklyPlanDaySubjectGrades.dayNumber,
      weeklyPlanDaySubjectGrades.subjectKey
    ],
    set: {
      subjectId: first.document.subjectId,
      subjectLabel,
      title: title || null,
      score,
      assessmentRecommended,
      updatedAt: new Date()
    }
  }).returning();
  await recordTeacherGradeActivity({
    actorUserId: input.parentUserId,
    studentProfileId: year.profileId,
    weeklyPlanId: input.weeklyPlanId,
    eventType: "grade_saved",
    subjectKey: input.subjectKey,
    subjectLabel,
    score,
    previousScore: existingGrade?.score ?? null,
    dayNumber: input.dayNumber
  });
  return saved;
}

function wrapText(text: string, maxCharacters: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function appendFullPopplerRenderedPdfPages(
  packet: PDFDocument,
  sourceBytes: Uint8Array,
  firstPageIndex: number,
  lastPageIndex: number,
  targetPageSize?: readonly [number, number]
) {
  if (firstPageIndex < 0 || lastPageIndex < firstPageIndex) {
    throw new Error(
      `PDF page range ${firstPageIndex + 1}-${lastPageIndex + 1} is invalid.`
    );
  }

  const workingDirectory = await mkdtemp(join(tmpdir(), "treeschool-full-pages-"));
  const sourcePath = join(workingDirectory, "source.pdf");
  const outputPrefix = join(workingDirectory, "page");

  try {
    await writeFile(sourcePath, sourceBytes);
    let renderer: ReturnType<typeof Bun.spawn>;
    try {
      renderer = Bun.spawn([
        "pdftoppm",
        "-png",
        "-r",
        "144",
        "-f",
        String(firstPageIndex + 1),
        "-l",
        String(lastPageIndex + 1),
        sourcePath,
        outputPrefix
      ], {
        stdout: "pipe",
        stderr: "pipe"
      });
    } catch (error) {
      throw new Error(
        `The full-page PDF renderer is unavailable. Treeschool stopped rather than risk cropping the parent's original pages. ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const [exitCode, stderr] = await Promise.all([
      renderer.exited,
      new Response(renderer.stderr as ReadableStream<Uint8Array>).text()
    ]);
    if (exitCode !== 0) {
      throw new Error(
        `The full-page PDF renderer failed (exit ${exitCode}). Treeschool stopped rather than risk cropping the parent's original pages.${stderr.trim() ? ` ${stderr.trim()}` : ""}`
      );
    }

    const renderedPages = (await readdir(workingDirectory))
      .map((filename) => ({
        filename,
        pageNumber: Number(filename.match(/^page-(\d+)\.png$/)?.[1] ?? Number.NaN)
      }))
      .filter(({ pageNumber }) => Number.isInteger(pageNumber))
      .sort((left, right) => left.pageNumber - right.pageNumber);
    const expectedPageCount = lastPageIndex - firstPageIndex + 1;
    if (
      renderedPages.length !== expectedPageCount ||
      renderedPages[0]?.pageNumber !== firstPageIndex + 1 ||
      renderedPages.at(-1)?.pageNumber !== lastPageIndex + 1
    ) {
      throw new Error(
        `The full-page PDF renderer returned ${renderedPages.length} of ${expectedPageCount} requested pages. Treeschool stopped rather than deliver an incomplete packet.`
      );
    }

    let appendedPageCount = 0;
    for (const renderedPage of renderedPages) {
      const image = await packet.embedPng(
        await readFile(join(workingDirectory, renderedPage.filename))
      );
      const sourceWidth = image.width / 2;
      const sourceHeight = image.height / 2;
      const pageWidth = targetPageSize?.[0] ?? sourceWidth;
      const pageHeight = targetPageSize?.[1] ?? sourceHeight;
      const safeMargin = targetPageSize ? 12 : 0;
      const scale = Math.min(
        (pageWidth - safeMargin * 2) / sourceWidth,
        (pageHeight - safeMargin * 2) / sourceHeight
      );
      const imageWidth = sourceWidth * scale;
      const imageHeight = sourceHeight * scale;
      const page = packet.addPage([pageWidth, pageHeight]);
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: rgb(1, 1, 1)
      });
      page.drawImage(image, {
        x: (pageWidth - imageWidth) / 2,
        y: (pageHeight - imageHeight) / 2,
        width: imageWidth,
        height: imageHeight
      });
      appendedPageCount += 1;
    }
    return appendedPageCount;
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

async function appendVectorFittedPdfPages(
  packet: PDFDocument,
  sourceBytes: Uint8Array,
  firstPageIndex: number,
  lastPageIndex: number,
  targetPageSize: readonly [number, number]
) {
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  if (
    firstPageIndex < 0 ||
    lastPageIndex < firstPageIndex ||
    lastPageIndex >= source.getPageCount()
  ) {
    throw new Error(
      `PDF page range ${firstPageIndex + 1}-${lastPageIndex + 1} is outside the source document's ${source.getPageCount()} pages.`
    );
  }

  let appendedPageCount = 0;
  for (let pageIndex = firstPageIndex; pageIndex <= lastPageIndex; pageIndex += 1) {
    // Normalize one page at a time. This isolates malformed publisher references
    // without rasterizing or altering any of the original page artwork.
    const normalized = await PDFDocument.create();
    const [copiedPage] = await normalized.copyPages(source, [pageIndex]);
    if (!copiedPage) throw new Error(`Could not copy source PDF page ${pageIndex + 1}.`);
    normalized.addPage(copiedPage);
    const normalizedBytes = await normalized.save();
    const normalizedSource = await PDFDocument.load(normalizedBytes);
    const normalizedPage = normalizedSource.getPage(0);
    if (!normalizedPage) throw new Error(`Could not normalize source PDF page ${pageIndex + 1}.`);
    const mediaBox = normalizedPage.getMediaBox();
    // The workbook's MediaBox is the complete physical page. Ignore a smaller
    // CropBox here so no publisher-defined crop can remove original content.
    normalizedPage.setCropBox(mediaBox.x, mediaBox.y, mediaBox.width, mediaBox.height);
    const embeddedPage = await packet.embedPage(normalizedPage);
    const pageWidth = targetPageSize[0];
    const pageHeight = targetPageSize[1];
    const safeMargin = 12;
    const scale = Math.min(
      (pageWidth - safeMargin * 2) / embeddedPage.width,
      (pageHeight - safeMargin * 2) / embeddedPage.height
    );
    const embeddedWidth = embeddedPage.width * scale;
    const embeddedHeight = embeddedPage.height * scale;
    const page = packet.addPage([pageWidth, pageHeight]);
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) });
    page.drawPage(embeddedPage, {
      x: (pageWidth - embeddedWidth) / 2,
      y: (pageHeight - embeddedHeight) / 2,
      width: embeddedWidth,
      height: embeddedHeight
    });
    appendedPageCount += 1;
  }
  return appendedPageCount;
}

async function appendPdfPageRange(
  packet: PDFDocument,
  sourceBytes: Uint8Array,
  firstPageIndex: number,
  lastPageIndex: number,
  targetPageSize?: readonly [number, number]
) {
  if (targetPageSize) {
    try {
      return await appendVectorFittedPdfPages(
        packet,
        sourceBytes,
        firstPageIndex,
        lastPageIndex,
        targetPageSize
      );
    } catch (error) {
      console.warn(
        "Falling back to full-page Poppler rendering for weekly plan item:",
        error instanceof Error ? error.message : error
      );
      return appendFullPopplerRenderedPdfPages(
        packet,
        sourceBytes,
        firstPageIndex,
        lastPageIndex,
        targetPageSize
      );
    }
  }
  try {
    const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    const indexes = Array.from(
      { length: lastPageIndex - firstPageIndex + 1 },
      (_, index) => firstPageIndex + index
    );
    // Some publisher PDFs contain broken indirect references. Test and normalize
    // the requested pages in an isolated document first so a failed copy cannot
    // corrupt pages already assembled in the parent's packet.
    const normalized = await PDFDocument.create();
    const probePages = await normalized.copyPages(source, indexes);
    probePages.forEach((page) => normalized.addPage(page));
    const normalizedBytes = await normalized.save();
    const normalizedSource = await PDFDocument.load(normalizedBytes);
    const copiedPages = await packet.copyPages(
      normalizedSource,
      Array.from({ length: normalizedSource.getPageCount() }, (_, index) => index)
    );
    copiedPages.forEach((page) => {
      // Publisher PDFs sometimes define a smaller CropBox than MediaBox. A
      // lesson preview must always show the complete original workbook page.
      const mediaBox = page.getMediaBox();
      page.setCropBox(mediaBox.x, mediaBox.y, mediaBox.width, mediaBox.height);
      packet.addPage(page);
    });
    return copiedPages.length;
  } catch (error) {
    console.warn(
      "Falling back to full-page Poppler rendering for weekly plan item:",
      error instanceof Error ? error.message : error
    );
    return appendFullPopplerRenderedPdfPages(
      packet,
      sourceBytes,
      firstPageIndex,
      lastPageIndex,
      targetPageSize
    );
  }
}

type WeeklyPacketItem = {
  item: typeof weeklyPlanItems.$inferSelect;
  document: typeof contentDocuments.$inferSelect;
};

let treeschoolLogoBytesPromise: Promise<Uint8Array | null> | null = null;

function loadTreeschoolLogoBytes() {
  if (!treeschoolLogoBytesPromise) {
    const logoPath = join(process.cwd(), "app", "ts-frontend", "public", "tree-icon.png");
    treeschoolLogoBytesPromise = readFile(logoPath)
      .then((bytes) => new Uint8Array(bytes))
      .catch((error) => {
        console.warn("Could not load the Treeschool logo for a weekly PDF cover.", error);
        return null;
      });
  }
  return treeschoolLogoBytesPromise;
}

function fitPdfText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const suffix = "...";
  let fitted = text;
  while (fitted.length > 1 && font.widthOfTextAtSize(`${fitted}${suffix}`, size) > maxWidth) {
    fitted = fitted.slice(0, -1).trimEnd();
  }
  return `${fitted}${suffix}`;
}

function weeklyCoverDaySummaries(items: WeeklyPacketItem[]) {
  const hasNumberedDays = items.some(({ item }) => item.dayNumber != null);
  const grouped = new Map<number, string[]>();
  for (const { item, document } of items) {
    const dayNumber = hasNumberedDays ? (item.dayNumber ?? 0) : 0;
    const subjects = grouped.get(dayNumber) ?? [];
    const subject = document.subjectLabel?.trim() || "Other";
    if (!subjects.includes(subject)) subjects.push(subject);
    grouped.set(dayNumber, subjects);
  }
  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([dayNumber, subjects]) => ({
      label: dayNumber > 0 ? `Day ${dayNumber}` : "This week",
      subjects
    }));
}

async function drawWeeklyPacketCover(input: {
  packet: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  pageSize: readonly [number, number];
  yearTitle: string;
  weekNumber: number;
  summary: string | null;
  items: WeeklyPacketItem[];
}) {
  const cover = input.packet.addPage([input.pageSize[0], input.pageSize[1]]);
  const { width, height } = cover.getSize();
  const ink = rgb(0.145, 0.125, 0.106);
  const mutedInk = rgb(0.39, 0.39, 0.36);
  const leaf = rgb(0.45, 0.62, 0.34);
  const leafDark = rgb(0.31, 0.45, 0.23);
  const paleLeaf = rgb(0.93, 0.96, 0.89);
  const cream = rgb(1, 0.98, 0.95);
  const sand = rgb(0.965, 0.93, 0.86);
  const white = rgb(1, 1, 1);
  const margin = 42;

  cover.drawRectangle({ x: 0, y: 0, width, height, color: cream });

  const logoBytes = await loadTreeschoolLogoBytes();
  if (logoBytes) {
    const logo = await input.packet.embedPng(logoBytes);
    const logoHeight = 35;
    const logoWidth = logoHeight * (logo.width / logo.height);
    cover.drawImage(logo, {
      x: margin,
      y: height - 76,
      width: logoWidth,
      height: logoHeight
    });
    cover.drawText("treeschool", {
      x: margin + logoWidth + 8,
      y: height - 63,
      size: 15,
      font: input.bold,
      color: leafDark
    });
  } else {
    cover.drawText("treeschool", {
      x: margin,
      y: height - 63,
      size: 15,
      font: input.bold,
      color: leafDark
    });
  }
  const coverLabel = "PRINTABLE WEEKLY LESSON PLAN";
  cover.drawText(coverLabel, {
    x: width - margin - input.bold.widthOfTextAtSize(coverLabel, 8.5),
    y: height - 61,
    size: 8.5,
    font: input.bold,
    color: leafDark
  });

  const heroHeight = 140;
  const heroY = height - 248;
  cover.drawRectangle({
    x: margin - 6,
    y: heroY,
    width: width - (margin - 6) * 2,
    height: heroHeight,
    color: leaf
  });
  cover.drawText("WEEKLY LESSON PLAN", {
    x: margin + 16,
    y: heroY + 104,
    size: 9,
    font: input.bold,
    color: paleLeaf
  });
  cover.drawText(`Week ${input.weekNumber}`, {
    x: margin + 16,
    y: heroY + 59,
    size: 32,
    font: input.bold,
    color: white
  });
  cover.drawText(fitPdfText(input.yearTitle, input.font, 14, width - margin * 2 - 32), {
    x: margin + 16,
    y: heroY + 27,
    size: 14,
    font: input.font,
    color: white
  });

  cover.drawText("This week", {
    x: margin,
    y: heroY - 34,
    size: 13,
    font: input.bold,
    color: ink
  });
  const summaryLines = wrapText(
    input.summary?.trim() || "Work through the included lessons at a pace that fits your family.",
    88
  ).slice(0, 3);
  let summaryY = heroY - 57;
  for (const line of summaryLines) {
    cover.drawText(fitPdfText(line, input.font, 10.5, width - margin * 2), {
      x: margin,
      y: summaryY,
      size: 10.5,
      font: input.font,
      color: mutedInk
    });
    summaryY -= 15;
  }

  const daySummaries = weeklyCoverDaySummaries(input.items);
  const uniqueLessons = new Set(input.items.map(({ item, document }) =>
    `${item.dayNumber ?? 0}:${document.subjectLabel ?? document.label}:${item.label}`
  )).size;
  const sourcePages = input.items.reduce(
    (total, { item }) => total + item.lastPageIndex - item.firstPageIndex + 1,
    0
  );
  const uniqueSubjects = new Set(input.items.map(({ document }) =>
    document.subjectLabel?.trim() || "Other"
  )).size;
  const stats = [
    { value: daySummaries.length, label: daySummaries.length === 1 ? "school day" : "school days" },
    { value: uniqueLessons, label: uniqueLessons === 1 ? "lesson" : "lessons" },
    { value: sourcePages, label: sourcePages === 1 ? "workbook page" : "workbook pages" }
  ];
  const statsY = heroY - 145;
  const statsGap = 10;
  const statsWidth = (width - margin * 2 - statsGap * 2) / 3;
  stats.forEach((stat, index) => {
    const x = margin + index * (statsWidth + statsGap);
    cover.drawRectangle({
      x,
      y: statsY,
      width: statsWidth,
      height: 52,
      color: paleLeaf,
      borderColor: rgb(0.77, 0.84, 0.69),
      borderWidth: 0.8
    });
    cover.drawText(String(stat.value), {
      x: x + 12,
      y: statsY + 27,
      size: 16,
      font: input.bold,
      color: leafDark
    });
    cover.drawText(stat.label, {
      x: x + 12,
      y: statsY + 11,
      size: 8.5,
      font: input.font,
      color: mutedInk
    });
  });

  const glanceHeadingY = statsY - 42;
  cover.drawText("Week at a glance", {
    x: margin,
    y: glanceHeadingY,
    size: 14,
    font: input.bold,
    color: ink
  });
  cover.drawText(`${uniqueSubjects} ${uniqueSubjects === 1 ? "subject" : "subjects"}`, {
    x: width - margin - input.font.widthOfTextAtSize(`${uniqueSubjects} ${uniqueSubjects === 1 ? "subject" : "subjects"}`, 9),
    y: glanceHeadingY + 1,
    size: 9,
    font: input.font,
    color: mutedInk
  });

  const listTop = glanceHeadingY - 20;
  const listBottom = 78;
  const rowHeight = Math.min(43, (listTop - listBottom) / Math.max(1, daySummaries.length));
  daySummaries.forEach((day, index) => {
    const rowTop = listTop - index * rowHeight;
    const rowBottom = rowTop - rowHeight + 4;
    cover.drawRectangle({
      x: margin,
      y: rowBottom,
      width: width - margin * 2,
      height: rowHeight - 4,
      color: index % 2 === 0 ? white : sand
    });
    cover.drawText(day.label, {
      x: margin + 12,
      y: rowBottom + (rowHeight - 4) / 2 - 4,
      size: 10.5,
      font: input.bold,
      color: leafDark
    });
    const subjects = fitPdfText(day.subjects.join(", "), input.font, 9.5, width - margin * 2 - 88);
    cover.drawText(subjects, {
      x: margin + 76,
      y: rowBottom + (rowHeight - 4) / 2 - 3.5,
      size: 9.5,
      font: input.font,
      color: ink
    });
  });

  cover.drawLine({
    start: { x: margin, y: 55 },
    end: { x: width - margin, y: 55 },
    thickness: 0.7,
    color: rgb(0.86, 0.79, 0.68)
  });
  cover.drawText("Print the plan, close the screen, and teach.", {
    x: margin,
    y: 36,
    size: 8.5,
    font: input.font,
    color: mutedInk
  });
}

function teachingDaySummaryLines(items: WeeklyPacketItem[]) {
  const grouped = new Map<string, Array<string>>();
  for (const { item, document } of items) {
    const subject = document.subjectLabel?.trim() || "Other";
    const range = item.firstPageIndex === item.lastPageIndex
      ? `page ${item.firstPageIndex + 1}`
      : `pages ${item.firstPageIndex + 1}-${item.lastPageIndex + 1}`;
    const entries = grouped.get(subject) ?? [];
    entries.push(`${item.label} - ${document.label}, ${range}`);
    grouped.set(subject, entries);
  }

  const lines: Array<{ text: string; kind: "subject" | "item" | "itemContinuation" | "empty" }> = [];
  if (grouped.size === 0) {
    lines.push({ text: "No workbook pages are assigned for this day.", kind: "empty" });
  } else {
    for (const [subject, entries] of grouped) {
      lines.push({ text: subject, kind: "subject" });
      for (const entry of entries) {
        for (const [lineIndex, wrapped] of wrapText(entry, 74).entries()) {
          lines.push({ text: wrapped, kind: lineIndex === 0 ? "item" : "itemContinuation" });
        }
      }
    }
  }
  return lines;
}

function teachingDaySummaryPageCount(items: WeeklyPacketItem[]) {
  return Math.max(1, Math.ceil(teachingDaySummaryLines(items).length / 31));
}

function dailySummaryQrTarget(input: {
  weeklyPlanId: string;
  dayNumber: number;
}) {
  const appUrl = (env.PUBLIC_APP_URL || "https://www.treehomeschool.com").replace(/\/$/, "");
  return `${appUrl}/q/${encodeURIComponent(input.weeklyPlanId)}/${input.dayNumber}`;
}

async function addTeachingDaySummaryPages(input: {
  packet: PDFDocument;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  weeklyPlanId: string;
  yearTitle: string;
  weekNumber: number;
  dayNumber: number;
  pageSize: readonly [number, number];
  items: WeeklyPacketItem[];
}) {
  const lines = teachingDaySummaryLines(input.items);

  const linesPerPage = 31;
  const chunks = Array.from(
    { length: Math.max(1, Math.ceil(lines.length / linesPerPage)) },
    (_, index) => lines.slice(index * linesPerPage, (index + 1) * linesPerPage)
  );

  const qrBytes = await QRCode.toBuffer(dailySummaryQrTarget(input), {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 4,
    width: 512,
    color: { dark: "#172012", light: "#FFFFFF" }
  });
  const qrImage = await input.packet.embedPng(qrBytes);
  const logoBytes = await loadTreeschoolLogoBytes();
  const logoImage = logoBytes ? await input.packet.embedPng(logoBytes) : null;

  chunks.forEach((chunk, pageIndex) => {
    const page = input.packet.addPage([input.pageSize[0], input.pageSize[1]]);
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.99, 0.97, 0.92) });
    page.drawRectangle({ x: 0, y: height - 154, width, height: 154, color: rgb(0.49, 0.63, 0.35) });
    page.drawText(`DAY ${input.dayNumber}`, {
      x: 44,
      y: height - 70,
      size: 29,
      font: input.bold,
      color: rgb(1, 1, 1)
    });
    page.drawText(
      pageIndex === 0 ? "School-day summary" : "School-day summary (continued)",
      { x: 44, y: height - 104, size: 15, font: input.font, color: rgb(1, 1, 1) }
    );
    page.drawText(`${input.yearTitle} - Week ${input.weekNumber}`, {
      x: 44,
      y: height - 130,
      size: 10.5,
      font: input.font,
      color: rgb(0.93, 0.98, 0.9)
    });

    const qrSize = 68;
    const qrX = width - 44 - qrSize;
    const qrY = height - 18 - qrSize;
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    if (logoImage) {
      const logoBackdropSize = 16;
      const logoBackdropX = qrX + (qrSize - logoBackdropSize) / 2;
      const logoBackdropY = qrY + (qrSize - logoBackdropSize) / 2;
      page.drawRectangle({
        x: logoBackdropX,
        y: logoBackdropY,
        width: logoBackdropSize,
        height: logoBackdropSize,
        color: rgb(1, 1, 1)
      });
      const logoSize = 12;
      page.drawImage(logoImage, {
        x: qrX + (qrSize - logoSize) / 2,
        y: qrY + (qrSize - logoSize) / 2,
        width: logoSize,
        height: logoSize
      });
    }
    const qrCaption = `Scan to update Day ${input.dayNumber}`;
    page.drawText(qrCaption, {
      x: width - 44 - input.bold.widthOfTextAtSize(qrCaption, 7.5),
      y: height - 100,
      size: 7.5,
      font: input.bold,
      color: rgb(0.93, 0.98, 0.9)
    });

    let y = height - 200;
    for (const line of chunk) {
      if (line.kind === "subject") {
        if (y < height - 210) y -= 8;
        page.drawText(line.text, {
          x: 44,
          y,
          size: 14,
          font: input.bold,
          color: rgb(0.25, 0.36, 0.18)
        });
        y -= 24;
      } else if (line.kind === "item" || line.kind === "itemContinuation") {
        if (line.kind === "item") {
          page.drawRectangle({
            x: 47,
            y: y + 1,
            width: 9,
            height: 9,
            borderWidth: 1,
            borderColor: rgb(0.49, 0.63, 0.35),
            color: rgb(1, 1, 1)
          });
        }
        page.drawText(line.text, {
          x: 66,
          y,
          size: 10.5,
          font: input.font,
          color: rgb(0.18, 0.2, 0.16)
        });
        y -= 18;
      } else {
        page.drawText(line.text, {
          x: 44,
          y,
          size: 12,
          font: input.font,
          color: rgb(0.35, 0.36, 0.32)
        });
      }
    }
  });

  return chunks.length;
}

type WeeklyPacketQualityReport = {
  version: number;
  checkedAt: string;
  expectedPageCount: number;
  actualPageCount: number;
  sourceItemCount: number;
  sourcePageCount: number;
  summaryPageCount: number;
  teachingDays: number[];
  excludedOptionalPracticeRangeCount: number;
  excludedOptionalPracticePageCount: number;
  renderedPageDarkPixelRatios: number[];
  checks: {
    metadataRangesValid: true;
    expectedPageCountMatches: true;
    everyPageRendered: true;
    noBlankRenderedPages: true;
    noEmptyDaySummaryPages: true;
    onlyOptionalPracticeExcluded: true;
  };
};

async function inspectWeeklyPacketQuality(input: {
  bytes: Uint8Array;
  expectedPageCount: number;
  sourceItemCount: number;
  sourcePageCount: number;
  summaryPageCount: number;
  teachingDays: number[];
  excludedOptionalPracticeRangeCount: number;
  excludedOptionalPracticePageCount: number;
}): Promise<WeeklyPacketQualityReport> {
  // pdf.js creates Path2D objects while rendering publisher PDFs. In a bundled
  // Cloud Run build, pdf.js can otherwise resolve a second native canvas
  // binding through createRequire(), making those Path2D objects incompatible
  // with the canvas context used below. Install all canvas globals from the
  // same module instance before loading pdf.js so visual QC remains reliable.
  const canvas = await import("@napi-rs/canvas");
  Object.assign(globalThis, {
    DOMMatrix: canvas.DOMMatrix,
    ImageData: canvas.ImageData,
    Path2D: canvas.Path2D
  });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = canvas;
  const document = await pdfjs.getDocument({ data: input.bytes.slice(), stopAtErrors: false }).promise;

  try {
    if (document.numPages !== input.expectedPageCount) {
      throw new Error(
        `PDF quality check expected ${input.expectedPageCount} pages from the weekly metadata but rendered ${document.numPages}.`
      );
    }

    const renderedPageDarkPixelRatios: number[] = [];
    const blankPageNumbers: number[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.35 });
      const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
      const context = canvas.getContext("2d");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let darkPixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 16) {
        const red = pixels[offset] ?? 255;
        const green = pixels[offset + 1] ?? 255;
        const blue = pixels[offset + 2] ?? 255;
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        if (luminance < 230) darkPixels += 1;
      }
      const sampledPixels = Math.max(1, Math.floor(pixels.length / 16));
      const darkPixelRatio = darkPixels / sampledPixels;
      renderedPageDarkPixelRatios.push(Number(darkPixelRatio.toFixed(6)));
      if (darkPixelRatio < MIN_RENDERED_PAGE_DARK_PIXEL_RATIO) blankPageNumbers.push(pageNumber);
      page.cleanup();
    }

    if (blankPageNumbers.length > 0) {
      throw new Error(`PDF quality check found blank rendered page${blankPageNumbers.length === 1 ? "" : "s"}: ${blankPageNumbers.join(", ")}.`);
    }

    return {
      version: PDF_QUALITY_REPORT_VERSION,
      checkedAt: new Date().toISOString(),
      expectedPageCount: input.expectedPageCount,
      actualPageCount: document.numPages,
      sourceItemCount: input.sourceItemCount,
      sourcePageCount: input.sourcePageCount,
      summaryPageCount: input.summaryPageCount,
      teachingDays: input.teachingDays,
      excludedOptionalPracticeRangeCount: input.excludedOptionalPracticeRangeCount,
      excludedOptionalPracticePageCount: input.excludedOptionalPracticePageCount,
      renderedPageDarkPixelRatios,
      checks: {
        metadataRangesValid: true,
        expectedPageCountMatches: true,
        everyPageRendered: true,
        noBlankRenderedPages: true,
        noEmptyDaySummaryPages: true,
        onlyOptionalPracticeExcluded: true
      }
    };
  } finally {
    await document.destroy();
  }
}

async function buildLegacyWeeklyPacket(
  parentUserId: string,
  weeklyPlanId: string,
  options: { qualityControl?: boolean; forceRebuild?: boolean } = {}
): Promise<{ bytes: Uint8Array; filename: string }> {
  const [week] = await db
    .select()
    .from(weeklyPlans)
    .where(eq(weeklyPlans.id, weeklyPlanId))
    .limit(1);
  if (!week) throw new Error("Week not found.");
  const year = await requireOwnedYear(parentUserId, week.learningYearId);
  if (year.status === "quality_check" && !options.qualityControl) {
    throw new Error("This weekly PDF is still being quality checked. Please try again after planning finishes.");
  }
  const printPageSize = normalizePrintPageSize(year.printPageSize) ?? "letter";
  const pageSize = PRINT_PAGE_DIMENSIONS[printPageSize];
  const studentFilenameStem = safeDownloadFilenameStem(year.studentName);
  const filename = `${studentFilenameStem}-week-${week.weekNumber}.pdf`;
  const [cachedAsset] = await db.select().from(weeklyPlanPdfAssets)
    .where(eq(weeklyPlanPdfAssets.weeklyPlanId, week.id)).limit(1);
  if (
    cachedAsset?.qualityStatus === "passed" &&
    Number(cachedAsset.qualityReport.templateVersion) === WEEKLY_PACKET_TEMPLATE_VERSION &&
    !options.forceRebuild
  ) {
    const bytes = await downloadPrivateFile(cachedAsset.objectPath);
    return { bytes, filename };
  }

  const items = await db
    .select({
      item: weeklyPlanItems,
      document: contentDocuments
    })
    .from(weeklyPlanItems)
    .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
    .where(eq(weeklyPlanItems.weeklyPlanId, week.id))
    .orderBy(asc(weeklyPlanItems.sortOrder));
  const includedItems = items.filter(({ item }) => item.includedInPacket);
  const excludedItems = items.filter(({ item }) => !item.includedInPacket);
  if (excludedItems.some(({ item }) =>
    item.lessonDisposition === "include" &&
    (!item.conceptRedundant || item.conceptLabels.length === 0 || !item.redundancyReason)
  )) {
    throw new Error("PDF quality check found an excluded range that was not verified as optional repeated practice.");
  }
  const packetItems = includedItems.filter(({ document }) => isPrintablePdfDocument(document));
  if (packetItems.length !== includedItems.length) {
    throw new Error("PDF quality check found a weekly metadata item that does not point to a printable PDF.");
  }
  if (packetItems.length === 0) {
    throw new Error("PDF quality check found no printable teaching material for this week.");
  }
  for (const { item, document } of packetItems) {
    if (
      document.pageCount < 1 ||
      item.firstPageIndex < 0 ||
      item.lastPageIndex < item.firstPageIndex ||
      item.lastPageIndex >= document.pageCount
    ) {
      throw new Error(
        `PDF quality check found an invalid range for ${document.label}: pages ${item.firstPageIndex + 1}-${item.lastPageIndex + 1} of ${document.pageCount}.`
      );
    }
  }

  const packet = await PDFDocument.create();
  const font = await packet.embedFont(StandardFonts.Helvetica);
  const bold = await packet.embedFont(StandardFonts.HelveticaBold);
  await drawWeeklyPacketCover({
    packet,
    font,
    bold,
    pageSize,
    yearTitle: year.title,
    weekNumber: week.weekNumber,
    summary: week.summary,
    items: packetItems
  });

  let summaryPageCount = 0;
  let appendedSourcePageCount = 0;
  const teachingDays = year.teachingDaysPerWeek
    ? Array.from(new Set(packetItems.map(({ item }, itemIndex) =>
        item.dayNumber ?? ((itemIndex % year.teachingDaysPerWeek!) + 1)
      ))).sort((left, right) => left - right)
    : [];
  const baselinePacketItems = items.filter(({ item, document }) =>
    (item.baseIncludedInPacket || item.includedInPacket) && isPrintablePdfDocument(document)
  );
  assertTeachingDayCoverage(
    baselinePacketItems.map(({ item }) => item),
    year.teachingDaysPerWeek,
    week.weekNumber
  );

  if (year.teachingDaysPerWeek) {
    for (const dayNumber of teachingDays) {
      const dayItems = packetItems.filter(({ item }, itemIndex) =>
        (item.dayNumber ?? ((itemIndex % year.teachingDaysPerWeek!) + 1)) === dayNumber
      );
      summaryPageCount += await addTeachingDaySummaryPages({
        packet,
        font,
        bold,
        weeklyPlanId: week.id,
        yearTitle: year.title,
        weekNumber: week.weekNumber,
        dayNumber,
        pageSize,
        items: dayItems
      });
      for (const { item, document } of dayItems) {
        const sourceBytes = await downloadPrivateFile(document.objectPath);
        // Day-separated packets include generated pages between source ranges.
        // Rendering prevents malformed publisher PDF references from corrupting
        // those inserted summary pages while preserving print fidelity.
        appendedSourcePageCount += await appendPdfPageRange(
          packet,
          sourceBytes,
          item.firstPageIndex,
          item.lastPageIndex,
          pageSize
        );
      }
    }
  } else {
    for (const { item, document } of packetItems) {
      const sourceBytes = await downloadPrivateFile(document.objectPath);
      appendedSourcePageCount += await appendPdfPageRange(
        packet,
        sourceBytes,
        item.firstPageIndex,
        item.lastPageIndex,
        pageSize
      );
    }
  }

  const bytes = await packet.save();
  const expectedSourcePageCount = packetItems.reduce(
    (total, { item }) => total + item.lastPageIndex - item.firstPageIndex + 1,
    0
  );
  if (appendedSourcePageCount !== expectedSourcePageCount) {
    throw new Error(
      `PDF quality check expected ${expectedSourcePageCount} source pages from the weekly metadata but appended ${appendedSourcePageCount}.`
    );
  }
  const qualityReport = await inspectWeeklyPacketQuality({
    bytes,
    expectedPageCount: 1 + summaryPageCount + expectedSourcePageCount,
    sourceItemCount: packetItems.length,
    sourcePageCount: expectedSourcePageCount,
    summaryPageCount,
    teachingDays,
    excludedOptionalPracticeRangeCount: excludedItems.length,
    excludedOptionalPracticePageCount: excludedItems.reduce(
      (total, { item }) => total + item.lastPageIndex - item.firstPageIndex + 1,
      0
    )
  });
  const storedQualityReport = {
    ...qualityReport,
    templateVersion: WEEKLY_PACKET_TEMPLATE_VERSION,
    assetKind: "week"
  };
  const objectPath = `paper-plans/${year.profileId}/${year.id}/weekly-pdfs/${week.id}.pdf`;
  await uploadPrivateFile({ objectPath, contentType: "application/pdf", data: bytes });
  await db.insert(weeklyPlanPdfAssets).values({
    weeklyPlanId: week.id,
    objectPath,
    filename,
    sizeBytes: bytes.byteLength,
    qualityStatus: "passed",
    qualityReport: storedQualityReport,
    qualityCheckedAt: new Date(qualityReport.checkedAt)
  }).onConflictDoUpdate({
    target: weeklyPlanPdfAssets.weeklyPlanId,
    set: {
      objectPath,
      filename,
      sizeBytes: bytes.byteLength,
      qualityStatus: "passed",
      qualityReport: storedQualityReport,
      qualityCheckedAt: new Date(qualityReport.checkedAt)
    }
  });
  return {
    bytes,
    filename
  };
}

type WeeklyPacketContext = {
  week: typeof weeklyPlans.$inferSelect;
  year: Awaited<ReturnType<typeof requireOwnedYear>>;
  pageSize: readonly [number, number];
  filename: string;
  packetItems: WeeklyPacketItem[];
  excludedItems: WeeklyPacketItem[];
  teachingDays: number[];
  itemsByDay: Map<number, WeeklyPacketItem[]>;
};

type CachedDayPacket = {
  dayNumber: number;
  bytes: Uint8Array;
  filename: string;
  sourceFingerprint: string;
  sourcePageCount: number;
  summaryPageCount: number;
  pageCount: number;
};

async function loadWeeklyPacketContext(
  parentUserId: string,
  weeklyPlanId: string,
  options: { qualityControl?: boolean } = {}
): Promise<WeeklyPacketContext> {
  const [week] = await db.select().from(weeklyPlans)
    .where(eq(weeklyPlans.id, weeklyPlanId)).limit(1);
  if (!week) throw new Error("Week not found.");
  const year = await requireOwnedYear(parentUserId, week.learningYearId);
  if (year.status === "quality_check" && !options.qualityControl) {
    throw new Error("This weekly PDF is still being quality checked. Please try again after planning finishes.");
  }
  if (!year.teachingDaysPerWeek) {
    throw new Error("This plan does not contain day-by-day scheduling metadata.");
  }

  const rows = await db.select({ item: weeklyPlanItems, document: contentDocuments })
    .from(weeklyPlanItems)
    .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
    .where(eq(weeklyPlanItems.weeklyPlanId, week.id))
    .orderBy(asc(weeklyPlanItems.sortOrder));
  const includedItems = rows.filter(({ item }) => item.includedInPacket);
  const excludedItems = rows.filter(({ item }) => !item.includedInPacket);
  if (excludedItems.some(({ item }) =>
    item.lessonDisposition === "include" &&
    (!item.conceptRedundant || item.conceptLabels.length === 0 || !item.redundancyReason)
  )) {
    throw new Error("PDF quality check found an excluded range that was not verified as optional repeated practice.");
  }
  const packetItems = includedItems.filter(({ document }) => isPrintablePdfDocument(document));
  if (packetItems.length !== includedItems.length) {
    throw new Error("PDF quality check found a weekly metadata item that does not point to a printable PDF.");
  }
  if (packetItems.length === 0) {
    throw new Error("PDF quality check found no printable teaching material for this week.");
  }
  for (const { item, document } of packetItems) {
    if (
      document.pageCount < 1 ||
      item.firstPageIndex < 0 ||
      item.lastPageIndex < item.firstPageIndex ||
      item.lastPageIndex >= document.pageCount
    ) {
      throw new Error(
        `PDF quality check found an invalid range for ${document.label}: pages ${item.firstPageIndex + 1}-${item.lastPageIndex + 1} of ${document.pageCount}.`
      );
    }
  }
  const baselinePacketItems = rows.filter(({ item, document }) =>
    (item.baseIncludedInPacket || item.includedInPacket) && isPrintablePdfDocument(document)
  );
  assertTeachingDayCoverage(
    baselinePacketItems.map(({ item }) => item),
    year.teachingDaysPerWeek,
    week.weekNumber
  );

  const itemsByDay = new Map<number, WeeklyPacketItem[]>();
  packetItems.forEach((entry, index) => {
    const dayNumber = entry.item.dayNumber ?? ((index % year.teachingDaysPerWeek!) + 1);
    const dayItems = itemsByDay.get(dayNumber) ?? [];
    dayItems.push(entry);
    itemsByDay.set(dayNumber, dayItems);
  });
  const teachingDays = Array.from(itemsByDay.keys()).sort((left, right) => left - right);
  const printPageSize = normalizePrintPageSize(year.printPageSize) ?? "letter";
  const studentFilenameStem = safeDownloadFilenameStem(year.studentName);
  return {
    week,
    year,
    pageSize: PRINT_PAGE_DIMENSIONS[printPageSize],
    filename: `${studentFilenameStem}-week-${week.weekNumber}.pdf`,
    packetItems,
    excludedItems,
    teachingDays,
    itemsByDay
  };
}

async function dayPacketFingerprint(context: WeeklyPacketContext, dayNumber: number) {
  const dayItems = context.itemsByDay.get(dayNumber) ?? [];
  const payload = {
    templateVersion: DAY_PACKET_TEMPLATE_VERSION,
    printPageSize: context.year.printPageSize,
    yearTitle: context.year.title,
    weekNumber: context.week.weekNumber,
    dayNumber,
    items: dayItems.map(({ item, document }) => ({
      itemId: item.id,
      documentId: document.id,
      objectPath: document.objectPath,
      documentPageCount: document.pageCount,
      documentLabel: document.label,
      subjectLabel: document.subjectLabel,
      firstPageIndex: item.firstPageIndex,
      lastPageIndex: item.lastPageIndex,
      label: item.label,
      sortOrder: item.sortOrder
    }))
  };
  return sha256Hex(new TextEncoder().encode(JSON.stringify(payload)));
}

async function ensureWeeklyDayPackets(
  parentUserId: string,
  weeklyPlanId: string,
  options: { qualityControl?: boolean; forceRebuild?: boolean } = {}
) {
  const context = await loadWeeklyPacketContext(parentUserId, weeklyPlanId, options);
  const existingAssets = await db.select().from(weeklyPlanDayPdfAssets)
    .where(eq(weeklyPlanDayPdfAssets.weeklyPlanId, context.week.id));
  const activeDayNumbers = new Set(context.teachingDays);
  const obsoleteAssets = existingAssets.filter((asset) => !activeDayNumbers.has(asset.dayNumber));
  if (obsoleteAssets.length > 0) {
    await db.delete(weeklyPlanDayPdfAssets)
      .where(inArray(weeklyPlanDayPdfAssets.id, obsoleteAssets.map((asset) => asset.id)));
    await Promise.all(obsoleteAssets.map((asset) =>
      deletePrivateFile(asset.objectPath).catch((error) => {
        console.error(`Could not delete obsolete daily PDF ${asset.objectPath}:`, error);
      })
    ));
  }

  const sourceBytesByPath = new Map<string, Uint8Array>();
  const dayPackets: CachedDayPacket[] = [];
  const baseFilename = context.filename.replace(/\.pdf$/i, "");
  for (const dayNumber of context.teachingDays) {
    const filename = `${baseFilename}-day-${dayNumber}.pdf`;
    const dayItems = context.itemsByDay.get(dayNumber) ?? [];
    const sourceFingerprint = await dayPacketFingerprint(context, dayNumber);
    const cachedAsset = existingAssets.find((asset) => asset.dayNumber === dayNumber);
    if (
      !options.forceRebuild &&
      cachedAsset?.qualityStatus === "passed" &&
      cachedAsset.sourceFingerprint === sourceFingerprint
    ) {
      try {
        const bytes = await downloadPrivateFile(cachedAsset.objectPath);
        const summaryPageCount = Number(cachedAsset.qualityReport.summaryPageCount);
        const sourcePageCount = Number(cachedAsset.qualityReport.sourcePageCount);
        const pageCount = Number(cachedAsset.qualityReport.expectedPageCount);
        if (
          Number.isFinite(summaryPageCount) && summaryPageCount > 0 &&
          Number.isFinite(sourcePageCount) && sourcePageCount > 0 &&
          Number.isFinite(pageCount) && pageCount === summaryPageCount + sourcePageCount
        ) {
          dayPackets.push({
            dayNumber,
            bytes,
            filename,
            sourceFingerprint,
            sourcePageCount,
            summaryPageCount,
            pageCount
          });
          continue;
        }
      } catch (error) {
        console.warn(`Could not reuse cached Day ${dayNumber} PDF; rebuilding it.`, error);
      }
    }

    const packet = await PDFDocument.create();
    const font = await packet.embedFont(StandardFonts.Helvetica);
    const bold = await packet.embedFont(StandardFonts.HelveticaBold);
    const summaryPageCount = await addTeachingDaySummaryPages({
      packet,
      font,
      bold,
      weeklyPlanId: context.week.id,
      yearTitle: context.year.title,
      weekNumber: context.week.weekNumber,
      dayNumber,
      pageSize: context.pageSize,
      items: dayItems
    });
    let appendedSourcePageCount = 0;
    for (const { item, document } of dayItems) {
      let sourceBytes = sourceBytesByPath.get(document.objectPath);
      if (!sourceBytes) {
        sourceBytes = await downloadPrivateFile(document.objectPath);
        sourceBytesByPath.set(document.objectPath, sourceBytes);
      }
      appendedSourcePageCount += await appendPdfPageRange(
        packet,
        sourceBytes,
        item.firstPageIndex,
        item.lastPageIndex,
        context.pageSize
      );
    }
    const expectedSourcePageCount = dayItems.reduce(
      (total, { item }) => total + item.lastPageIndex - item.firstPageIndex + 1,
      0
    );
    if (appendedSourcePageCount !== expectedSourcePageCount) {
      throw new Error(
        `Day ${dayNumber} expected ${expectedSourcePageCount} source pages but appended ${appendedSourcePageCount}.`
      );
    }
    const bytes = await packet.save();
    const excludedForDay = context.excludedItems.filter(({ item }) => item.dayNumber === dayNumber);
    const qualityReport = await inspectWeeklyPacketQuality({
      bytes,
      expectedPageCount: summaryPageCount + expectedSourcePageCount,
      sourceItemCount: dayItems.length,
      sourcePageCount: expectedSourcePageCount,
      summaryPageCount,
      teachingDays: [dayNumber],
      excludedOptionalPracticeRangeCount: excludedForDay.length,
      excludedOptionalPracticePageCount: excludedForDay.reduce(
        (total, { item }) => total + item.lastPageIndex - item.firstPageIndex + 1,
        0
      )
    });
    const storedQualityReport = {
      ...qualityReport,
      assetKind: "day",
      sourceFingerprint
    };
    const objectPath = `paper-plans/${context.year.profileId}/${context.year.id}/weekly-days/${context.week.id}/day-${dayNumber}.pdf`;
    await uploadPrivateFile({ objectPath, contentType: "application/pdf", data: bytes });
    await db.insert(weeklyPlanDayPdfAssets).values({
      weeklyPlanId: context.week.id,
      dayNumber,
      sourceFingerprint,
      objectPath,
      filename,
      sizeBytes: bytes.byteLength,
      qualityStatus: "passed",
      qualityReport: storedQualityReport,
      qualityCheckedAt: new Date(qualityReport.checkedAt)
    }).onConflictDoUpdate({
      target: [weeklyPlanDayPdfAssets.weeklyPlanId, weeklyPlanDayPdfAssets.dayNumber],
      set: {
        sourceFingerprint,
        objectPath,
        filename,
        sizeBytes: bytes.byteLength,
        qualityStatus: "passed",
        qualityReport: storedQualityReport,
        qualityCheckedAt: new Date(qualityReport.checkedAt),
        updatedAt: new Date()
      }
    });
    dayPackets.push({
      dayNumber,
      bytes,
      filename,
      sourceFingerprint,
      sourcePageCount: expectedSourcePageCount,
      summaryPageCount,
      pageCount: summaryPageCount + expectedSourcePageCount
    });
  }

  return { context, dayPackets };
}

async function addWeeklyPacketCover(input: {
  packet: PDFDocument;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  context: WeeklyPacketContext;
}) {
  await drawWeeklyPacketCover({
    packet: input.packet,
    font: input.font,
    bold: input.bold,
    pageSize: input.context.pageSize,
    yearTitle: input.context.year.title,
    weekNumber: input.context.week.weekNumber,
    summary: input.context.week.summary,
    items: input.context.packetItems
  });
}

export async function buildWeeklyPacket(
  parentUserId: string,
  weeklyPlanId: string,
  options: { qualityControl?: boolean; forceRebuild?: boolean } = {}
): Promise<{ bytes: Uint8Array; filename: string }> {
  const [week] = await db.select().from(weeklyPlans)
    .where(eq(weeklyPlans.id, weeklyPlanId)).limit(1);
  if (!week) throw new Error("Week not found.");
  const year = await requireOwnedYear(parentUserId, week.learningYearId);
  if (!year.teachingDaysPerWeek) {
    return buildLegacyWeeklyPacket(parentUserId, weeklyPlanId, options);
  }

  const { context, dayPackets } = await ensureWeeklyDayPackets(parentUserId, weeklyPlanId, options);
  const sourceFingerprint = await sha256Hex(new TextEncoder().encode(JSON.stringify({
    templateVersion: WEEKLY_PACKET_TEMPLATE_VERSION,
    yearTitle: context.year.title,
    weekNumber: context.week.weekNumber,
    weekSummary: context.week.summary,
    dailyPackets: dayPackets.map((packet) => ({
      dayNumber: packet.dayNumber,
      sourceFingerprint: packet.sourceFingerprint
    }))
  })));
  const [cachedAsset] = await db.select().from(weeklyPlanPdfAssets)
    .where(eq(weeklyPlanPdfAssets.weeklyPlanId, context.week.id)).limit(1);
  if (
    !options.forceRebuild &&
    cachedAsset?.qualityStatus === "passed" &&
    cachedAsset.qualityReport.sourceFingerprint === sourceFingerprint
  ) {
    try {
      const bytes = await downloadPrivateFile(cachedAsset.objectPath);
      return { bytes, filename: context.filename };
    } catch (error) {
      console.warn("Could not reuse the cached weekly PDF; assembling it again.", error);
    }
  }

  const packet = await PDFDocument.create();
  const font = await packet.embedFont(StandardFonts.Helvetica);
  const bold = await packet.embedFont(StandardFonts.HelveticaBold);
  await addWeeklyPacketCover({ packet, font, bold, context });
  for (const dayPacket of dayPackets) {
    const dailySource = await PDFDocument.load(dayPacket.bytes);
    const copiedPages = await packet.copyPages(
      dailySource,
      Array.from({ length: dailySource.getPageCount() }, (_, index) => index)
    );
    copiedPages.forEach((page) => packet.addPage(page));
  }
  const bytes = await packet.save();
  const sourcePageCount = dayPackets.reduce((total, day) => total + day.sourcePageCount, 0);
  const summaryPageCount = dayPackets.reduce((total, day) => total + day.summaryPageCount, 0);
  const qualityReport = await inspectWeeklyPacketQuality({
    bytes,
    expectedPageCount: 1 + sourcePageCount + summaryPageCount,
    sourceItemCount: context.packetItems.length,
    sourcePageCount,
    summaryPageCount,
    teachingDays: context.teachingDays,
    excludedOptionalPracticeRangeCount: context.excludedItems.length,
    excludedOptionalPracticePageCount: context.excludedItems.reduce(
      (total, { item }) => total + item.lastPageIndex - item.firstPageIndex + 1,
      0
    )
  });
  const storedQualityReport = {
    ...qualityReport,
    assetKind: "week",
    templateVersion: WEEKLY_PACKET_TEMPLATE_VERSION,
    sourceFingerprint,
    dayFingerprints: dayPackets.map((day) => ({
      dayNumber: day.dayNumber,
      sourceFingerprint: day.sourceFingerprint
    }))
  };
  const objectPath = `paper-plans/${context.year.profileId}/${context.year.id}/weekly-pdfs/${context.week.id}.pdf`;
  await uploadPrivateFile({ objectPath, contentType: "application/pdf", data: bytes });
  await db.insert(weeklyPlanPdfAssets).values({
    weeklyPlanId: context.week.id,
    objectPath,
    filename: context.filename,
    sizeBytes: bytes.byteLength,
    qualityStatus: "passed",
    qualityReport: storedQualityReport,
    qualityCheckedAt: new Date(qualityReport.checkedAt)
  }).onConflictDoUpdate({
    target: weeklyPlanPdfAssets.weeklyPlanId,
    set: {
      objectPath,
      filename: context.filename,
      sizeBytes: bytes.byteLength,
      qualityStatus: "passed",
      qualityReport: storedQualityReport,
      qualityCheckedAt: new Date(qualityReport.checkedAt)
    }
  });
  return { bytes, filename: context.filename };
}

export async function buildWeeklyPacketDayArchive(
  parentUserId: string,
  weeklyPlanId: string
): Promise<{ bytes: Uint8Array; filename: string }> {
  const { context, dayPackets } = await ensureWeeklyDayPackets(parentUserId, weeklyPlanId);
  const zipEntries = Object.fromEntries(dayPackets.map((packet) => [packet.filename, packet.bytes]));
  return {
    bytes: zipSync(zipEntries, { level: 0 }),
    filename: `${context.filename.replace(/\.pdf$/i, "")}-days.zip`
  };
}
