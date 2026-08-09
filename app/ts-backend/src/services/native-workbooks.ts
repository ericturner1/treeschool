import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import Stripe from "stripe";
import {
  accounts,
  contentDocuments,
  curriculumSubjects,
  learningYearMaterialSets,
  learningYears,
  learningYearSubjectPreferences,
  nativeWorkbookBundleItems,
  nativeWorkbookBundles,
  nativeWorkbookDownloadLinks,
  nativeWorkbookEditions,
  nativeWorkbookJobs,
  nativeWorkbookPurchases,
  nativeWorkbookVersions,
  nativeWorkbooks,
  profiles,
  studentWorkbookEditionUnitCarryovers,
  studentWorkbookUnitProgress,
  subscriptions,
  users,
  weeklyPlanDownloadEvents,
  weeklyPlanDayPdfAssets,
  weeklyPlanItems,
  weeklyPlanPdfAssets,
  weeklyPlans,
  workbookContentRevisions,
  workbookProjects
} from "ts-db";
import { db, env } from "../db";
import { withTreeschoolCheckoutBranding } from "./stripe-checkout";
import { getPremiumFeatureAccess } from "./entitlements";
import {
  deletePrivateFile,
  downloadPrivateFile,
  getPrivateFileMetadata,
  getSignedLessonAssetUrl,
  getSignedPrivateUploadUrl,
  uploadPrivateFile
} from "./media";
import {
  analyzePdf,
  applyNativeWorkbookCoverageToLearningYearCache,
  extractPdfPageTexts,
  generateNativeWorkbookCatalogDescription,
  getPdfPageCount,
  startLearningYearPlanning
} from "./paper-plans";
import type { CurriculumCompletenessResult } from "./curriculum-completeness";
import {
  summarizeWorkbookProgress,
  type NativeWorkbookProgressSummary
} from "./student-workbook-progress";
import { catalogItemOverlapsAttachedWorkbooks } from "./native-workbook-recommendations";
import { normalizeCurriculumAreaKey } from "./native-workbook-taxonomy";
import {
  buildNativeWorkbookLessonSummaries,
  nativeWorkbookLessonPageIndexes
} from "./native-workbook-preview";
import {
  CURRICULUM_COVERAGE_FRAMEWORK_VERSION,
  generateCurriculumCoverageProfile,
  mergeCompetencyCoverage,
  parseCurriculumCoverageProfile,
  scoreCompetencyCoverage
} from "./curriculum-coverage";
import { checkWorkbookReplacementCompatibility } from "./native-workbook-replacement";
import {
  funnelCheckoutMetadata,
  type FunnelCheckoutAttribution
} from "./funnels";
import {
  parseWorkbookContent,
  workbookLessonIds
} from "./workbook-studio-model";

const MAX_NATIVE_WORKBOOK_PAGES = 2_000;
const MAX_NATIVE_WORKBOOK_JOB_ATTEMPTS = 3;
const MAX_NATIVE_WORKBOOK_CART_ITEMS = 10;
const DOWNLOAD_LINK_LIFETIME_DAYS = 7;

export function nativeWorkbookErrorReference(workbookVersionId: string) {
  const compactId = workbookVersionId.replaceAll("-", "").slice(0, 8).toUpperCase();
  return `NW-${compactId || "UNKNOWN"}`;
}

const PUBLIC_NATIVE_WORKBOOK_ERROR =
  "We couldn't finish indexing this workbook. Retry indexing, or contact support if the problem continues.";

type WorkbookType = "core" | "elective";

type EditionLearningUnit = {
  id: string;
  title: string;
};

function editionLearningUnitsFromAnalysis(analysis: unknown): EditionLearningUnit[] {
  if (!analysis || typeof analysis !== "object") return [];
  const candidates = (analysis as { learningUnits?: unknown }).learningUnits;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const value = candidate as { id?: unknown; title?: unknown };
    const id = String(value.id ?? "").trim();
    const title = String(value.title ?? "").trim();
    return id && title ? [{ id, title }] : [];
  });
}

function normalizedEditionUnitTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function mapEditionLearningUnits(input: {
  sourceUnits: EditionLearningUnit[];
  targetUnits: EditionLearningUnit[];
  protectedSourceUnitIds: string[];
}) {
  const sourceById = new Map(input.sourceUnits.map((unit) => [unit.id, unit]));
  const targetById = new Map(input.targetUnits.map((unit) => [unit.id, unit]));
  const targetsByTitle = new Map<string, EditionLearningUnit[]>();
  for (const unit of input.targetUnits) {
    const key = normalizedEditionUnitTitle(unit.title);
    targetsByTitle.set(key, [...(targetsByTitle.get(key) ?? []), unit]);
  }
  const mappings = new Map<string, {
    targetSourceUnitId: string;
    matchMethod: "exact_id" | "exact_title";
  }>();
  const unmatched: string[] = [];
  const claimedTargets = new Set<string>();
  for (const sourceUnitId of Array.from(new Set(input.protectedSourceUnitIds))) {
    const source = sourceById.get(sourceUnitId);
    const exactIdTarget = targetById.get(sourceUnitId);
    const titleTargets = source
      ? targetsByTitle.get(normalizedEditionUnitTitle(source.title)) ?? []
      : [];
    const target = exactIdTarget ?? (titleTargets.length === 1 ? titleTargets[0] : null);
    if (!source || !target || claimedTargets.has(target.id)) {
      unmatched.push(source?.title || sourceUnitId);
      continue;
    }
    claimedTargets.add(target.id);
    mappings.set(sourceUnitId, {
      targetSourceUnitId: target.id,
      matchMethod: exactIdTarget ? "exact_id" : "exact_title"
    });
  }
  return { mappings, unmatched };
}
type AccessState = "owned" | "included" | "purchase_required";
type CatalogKind = "workbook" | "bundle";
type ProductPreviewImage = {
  objectPath: string;
  pdfPageNumber: number;
  label: string;
};

type WorkbookReplacementState = {
  previousVersionId: string;
  restoreStatus: string;
  restoreActive: boolean;
  requiresCompatibilityCheck?: boolean;
  expectedPageCount?: number;
  compatibilityMode?: "pdf_structure" | "lesson_ids";
};

type WorkbookStudioArtifact = {
  projectId: string;
  contentRevisionId: string;
  renderRunId: string;
  themeVersionId: string;
  autoPublish?: boolean;
};

type WorkbookStudioReleaseState = {
  projectId: string;
  autoPublish: boolean;
  requestedByUserId: string;
};

type WorkbookEditionReleaseState = {
  previousVersionId: string;
  previousEditionId: string;
};

function readWorkbookEditionReleaseState(
  analysisJson: Record<string, unknown> | null | undefined
): WorkbookEditionReleaseState | null {
  const release = analysisJson?.editionRelease;
  if (!release || typeof release !== "object") return null;
  const value = release as Partial<WorkbookEditionReleaseState>;
  return typeof value.previousVersionId === "string" &&
    typeof value.previousEditionId === "string"
    ? {
        previousVersionId: value.previousVersionId,
        previousEditionId: value.previousEditionId
      }
    : null;
}

class WorkbookReplacementCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbookReplacementCompatibilityError";
  }
}

type NativeWorkbookJobRow = {
  id: string;
  workbookVersionId: string;
  status: string;
  attemptCount: number;
  availableAt: Date;
  claimedAt: Date | null;
  heartbeatAt: Date | null;
  workerId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let stripeClient: Stripe | null = null;

function getStripe() {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}

function nativeWorkbookStripeMetadata(input: {
  id: string;
  subjectLabel: string;
  curriculumAreaKey: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  type: WorkbookType;
  coverageTags: string[];
  prerequisiteWorkbookId: string | null;
}) {
  return {
    nativeWorkbookId: input.id,
    subjectKey: slugify(input.subjectLabel),
    subjectLabel: input.subjectLabel.slice(0, 500),
    curriculumAreaKey: input.curriculumAreaKey,
    gradeMin: String(input.gradeMin),
    gradeMax: String(input.gradeMax),
    languageCode: input.languageCode,
    catalogRole: input.type,
    coverageTags: input.coverageTags.join(",").slice(0, 500),
    prerequisiteWorkbookId: input.prerequisiteWorkbookId ?? ""
  };
}

function nativeWorkbookBundleStripeMetadata(input: {
  id: string;
  memberCount: number;
  isRecommendedCurriculum: boolean;
  recommendedGradeLevel: number | null;
}) {
  return {
    nativeWorkbookBundleId: input.id,
    catalogKind: "bundle",
    memberCount: String(input.memberCount),
    recommendedCurriculum: String(input.isRecommendedCurriculum),
    recommendedGradeLevel: input.recommendedGradeLevel == null ? "" : String(input.recommendedGradeLevel)
  };
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeOptionalUuid(value: unknown) {
  const candidate = String(value ?? "").trim().toLowerCase();
  if (!candidate) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)) {
    throw new Error("Choose a valid prerequisite workbook.");
  }
  return candidate;
}

function normalizeOptionalCurriculumSubjectId(value: unknown) {
  const candidate = String(value ?? "").trim().toLowerCase();
  if (!candidate) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)) {
    throw new Error("Choose a valid subject.");
  }
  return candidate;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "workbook";
}

function buildWorkbookSlugBase(input: {
  title: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  type: WorkbookType;
}) {
  const titleSlug = slugify(input.title);
  const singleGrade = input.gradeMin === input.gradeMax;
  const gradeSlug = singleGrade
    ? input.gradeMin === 0
      ? "kindergarten"
      : `grade-${input.gradeMin}`
    : `grades-${input.gradeMin === 0 ? "kindergarten" : input.gradeMin}-to-${input.gradeMax}`;
  const alreadyNamesGrade = titleSlug === gradeSlug || titleSlug.startsWith(`${gradeSlug}-`);
  const alreadyNamesCatalogRole = new RegExp(`(?:^|-)${input.type}(?:-|$)`).test(titleSlug);
  const alreadyNamesProductType = /(?:^|-)(?:workbook|workbooks|worksheet|worksheets|curriculum|practice-book)(?:-|$)/.test(titleSlug);
  const parts = [
    alreadyNamesGrade ? null : gradeSlug,
    alreadyNamesCatalogRole ? null : input.type,
    titleSlug,
    alreadyNamesProductType ? null : "workbook",
    input.languageCode === "en" ? null : input.languageCode
  ].filter((part): part is string => Boolean(part));
  return slugify(parts.join("-"));
}

function safeFilename(value: string, fallback: string) {
  const safe = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return safe || fallback;
}

function normalizeGrade(value: unknown) {
  const grade = Number(value);
  if (!Number.isInteger(grade) || grade < 0 || grade > 12) {
    throw new Error("Choose a grade from Kindergarten through Grade 12.");
  }
  return grade;
}

function normalizePrice(value: unknown) {
  const price = Number(value);
  if (!Number.isInteger(price) || price < 0 || price > 100_000) {
    throw new Error("Enter a valid workbook price in cents.");
  }
  return price;
}

function normalizeWorkbookType(value: unknown): WorkbookType {
  if (value !== "core" && value !== "elective") {
    throw new Error("Choose whether this workbook is core or elective.");
  }
  return value;
}

function normalizeCatalogKind(value: unknown): CatalogKind {
  if (value !== "workbook" && value !== "bundle") throw new Error("Choose a valid catalog item.");
  return value;
}

function normalizeTags(value: unknown) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(new Set(source
    .map((tag) => normalizeText(tag, 80).toLowerCase())
    .filter(Boolean)))
    .slice(0, 30);
}

function readProductPreviewImages(analysisJson: unknown) {
  if (!analysisJson || typeof analysisJson !== "object") return [];
  const raw = (analysisJson as { productPreviewImages?: unknown }).productPreviewImages;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const preview = item as Partial<ProductPreviewImage>;
    const pdfPageNumber = Number(preview.pdfPageNumber);
    return typeof preview.objectPath === "string" && preview.objectPath
      && Number.isInteger(pdfPageNumber) && pdfPageNumber > 0
      ? [{
          objectPath: preview.objectPath,
          pdfPageNumber,
          label: normalizeText(preview.label || `Sample page ${pdfPageNumber}`, 160)
        }]
      : [];
  }).slice(0, 4);
}

function readWorkbookReplacementState(analysisJson: unknown): WorkbookReplacementState | null {
  if (!analysisJson || typeof analysisJson !== "object") return null;
  const replacement = (analysisJson as { replacement?: unknown }).replacement;
  if (!replacement || typeof replacement !== "object") return null;
  const value = replacement as Partial<WorkbookReplacementState>;
  return typeof value.previousVersionId === "string" && value.previousVersionId
    && typeof value.restoreStatus === "string" && value.restoreStatus
    && typeof value.restoreActive === "boolean"
      ? {
        previousVersionId: value.previousVersionId,
        restoreStatus: value.restoreStatus,
        restoreActive: value.restoreActive,
        requiresCompatibilityCheck: value.requiresCompatibilityCheck === true,
        expectedPageCount: Number.isInteger(Number(value.expectedPageCount))
          ? Number(value.expectedPageCount)
          : undefined,
        compatibilityMode: value.compatibilityMode === "lesson_ids" ? "lesson_ids" : "pdf_structure"
      }
    : null;
}

function readWorkbookStudioReleaseState(analysisJson: unknown): WorkbookStudioReleaseState | null {
  if (!analysisJson || typeof analysisJson !== "object") return null;
  const release = (analysisJson as { studioRelease?: unknown }).studioRelease;
  if (!release || typeof release !== "object") return null;
  const value = release as Partial<WorkbookStudioReleaseState>;
  return typeof value.projectId === "string" && value.projectId
    && typeof value.requestedByUserId === "string" && value.requestedByUserId
      ? {
        projectId: value.projectId,
        autoPublish: value.autoPublish === true,
        requestedByUserId: value.requestedByUserId
      }
    : null;
}

function selectProductPreviewPages(analysis: unknown, pageCount: number) {
  const analysisRecord = analysis && typeof analysis === "object"
    ? analysis as { learningUnits?: unknown }
    : {};
  const units = Array.isArray(analysisRecord.learningUnits) ? analysisRecord.learningUnits : [];
  const candidates = units.flatMap((unit) => {
    if (!unit || typeof unit !== "object") return [];
    const unitRecord = unit as { title?: unknown; components?: unknown };
    const components = Array.isArray(unitRecord.components) ? unitRecord.components : [];
    const component = components.find((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const value = candidate as { role?: unknown; includeInPacket?: unknown; pdfPageStart?: unknown };
      const role = String(value.role ?? "");
      const page = Number(value.pdfPageStart);
      return value.includeInPacket !== false
        && !["answer_key", "reference", "teacher_support"].includes(role)
        && Number.isInteger(page)
        && page > 1
        && page <= pageCount;
    }) as { pdfPageStart?: unknown } | undefined;
    const pdfPageNumber = Number(component?.pdfPageStart);
    return Number.isInteger(pdfPageNumber)
      ? [{
          pdfPageNumber,
          label: normalizeText(unitRecord.title || `Sample page ${pdfPageNumber}`, 160)
        }]
      : [];
  });
  const unique = Array.from(new Map(candidates.map((candidate) => [candidate.pdfPageNumber, candidate])).values());
  if (unique.length <= 4) return unique;
  return Array.from({ length: 4 }, (_, index) => unique[
    Math.round(index * (unique.length - 1) / 3)
  ]).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
}

async function renderNativeWorkbookPage(input: {
  bytes: Uint8Array;
  pageNumber: number;
  maxWidth: number;
}) {
  const workingDirectory = await mkdtemp(join(tmpdir(), "treeschool-workbook-preview-"));
  const sourcePath = join(workingDirectory, "source.pdf");
  const outputPrefix = join(workingDirectory, "page");
  const outputPath = `${outputPrefix}.png`;
  try {
    await writeFile(sourcePath, input.bytes);
    const renderer = Bun.spawn([
      "pdftoppm",
      "-png",
      "-singlefile",
      "-f",
      String(input.pageNumber),
      "-l",
      String(input.pageNumber),
      "-scale-to-x",
      String(input.maxWidth),
      "-scale-to-y",
      "-1",
      sourcePath,
      outputPrefix
    ], {
      stdout: "ignore",
      stderr: "pipe"
    });
    const [exitCode, stderr] = await Promise.all([
      renderer.exited,
      new Response(renderer.stderr as ReadableStream<Uint8Array>).text()
    ]);
    if (exitCode !== 0) {
      throw new Error(
        `Workbook preview rendering failed (exit ${exitCode}).${stderr.trim() ? ` ${stderr.trim()}` : ""}`
      );
    }
    return await readFile(outputPath);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

async function watermarkNativeWorkbookPreview(data: Uint8Array) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(data);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const bandHeight = Math.max(28, Math.round(canvas.height * 0.055));
  context.fillStyle = "rgba(76, 91, 56, 0.82)";
  context.fillRect(0, canvas.height - bandHeight, canvas.width, bandHeight);
  context.fillStyle = "white";
  context.font = `700 ${Math.max(12, Math.round(bandHeight * 0.4))}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("TREESCHOOL SAMPLE", canvas.width / 2, canvas.height - bandHeight / 2);
  return canvas.toBuffer("image/png");
}

async function createProductPreviewImages(input: {
  workbookId: string;
  versionId: string;
  bytes: Uint8Array;
  pageCount: number;
  analysis: unknown;
}) {
  const selectedPages = selectProductPreviewPages(input.analysis, input.pageCount);
  if (!selectedPages.length) return [];
  const previews: ProductPreviewImage[] = [];
  for (const selected of selectedPages) {
    const renderedPage = await renderNativeWorkbookPage({
      bytes: input.bytes,
      pageNumber: selected.pdfPageNumber,
      maxWidth: 720
    });
    const objectPath = `native-workbooks/${input.workbookId}/versions/${input.versionId}/previews/page-${selected.pdfPageNumber}.png`;
    await uploadPrivateFile({
      objectPath,
      contentType: "image/png",
      data: await watermarkNativeWorkbookPreview(renderedPage)
    });
    previews.push({ objectPath, pdfPageNumber: selected.pdfPageNumber, label: selected.label });
  }
  return previews;
}

async function createGeneratedCoverImage(input: {
  bytes: Uint8Array;
  objectPath: string;
}) {
  await uploadPrivateFile({
    objectPath: input.objectPath,
    contentType: "image/png",
    data: await renderNativeWorkbookPage({ bytes: input.bytes, pageNumber: 1, maxWidth: 720 })
  });
}

function workbookGradeLabel(min: number, max: number) {
  if (min === max) return min === 0 ? "Kindergarten" : `Grade ${min}`;
  const rangeGrade = (grade: number) => grade === 0 ? "K" : String(grade);
  return `Grades ${rangeGrade(min)}-${rangeGrade(max)}`;
}

function fallbackWorkbookDescription(input: {
  title: string;
  subject: string;
  gradeMin: number;
  gradeMax: number;
  pageCount: number;
  analysis: { learningUnits?: Array<{ title?: string }> };
}) {
  const topics = (input.analysis.learningUnits ?? [])
    .map((unit) => normalizeText(unit.title, 100).replace(/^lesson\s+[\d.]+\s*[—:-]?\s*/i, ""))
    .filter(Boolean)
    .slice(0, 5);
  const topicText = topics.length ? ` covering ${topics.join(", ")}` : " with sequenced lessons and practice";
  return `${workbookGradeLabel(input.gradeMin, input.gradeMax)} ${input.subject} workbook with ${input.pageCount.toLocaleString()} printable pages${topicText}.`;
}

async function requireAdmin(userId: string) {
  const [admin] = await db
    .select({ profileId: profiles.id, accountId: profiles.accountId, isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);
  if (!admin?.isAdmin) throw new Error("Administrator access is required.");
  return admin;
}

async function resolveCurriculumSubjectSelection(input: {
  userId: string;
  curriculumAreaKey: string;
  curriculumSubjectId?: string | null;
  subject?: string;
  addSubjectToTaxonomy?: boolean;
}) {
  const curriculumSubjectId = normalizeOptionalCurriculumSubjectId(input.curriculumSubjectId);
  if (curriculumSubjectId) {
    const [subject] = await db.select({
      id: curriculumSubjects.id,
      key: curriculumSubjects.key,
      label: curriculumSubjects.label,
      curriculumAreaKey: curriculumSubjects.curriculumAreaKey,
      active: curriculumSubjects.active
    }).from(curriculumSubjects).where(eq(curriculumSubjects.id, curriculumSubjectId)).limit(1);
    if (!subject?.active) throw new Error("The selected subject is no longer available.");
    if (subject.curriculumAreaKey !== input.curriculumAreaKey) {
      throw new Error("Choose a subject from the selected curriculum area.");
    }
    return { curriculumSubjectId: subject.id, subjectKey: subject.key, subjectLabel: subject.label };
  }

  const subjectLabel = normalizeText(input.subject, 120);
  if (!subjectLabel) throw new Error("Choose a subject or enter one that is not listed.");
  const subjectKey = slugify(subjectLabel);
  if (!input.addSubjectToTaxonomy) {
    return { curriculumSubjectId: null, subjectKey, subjectLabel };
  }

  const [existing] = await db.select({
    id: curriculumSubjects.id,
    key: curriculumSubjects.key,
    label: curriculumSubjects.label,
    curriculumAreaKey: curriculumSubjects.curriculumAreaKey
  }).from(curriculumSubjects).where(eq(curriculumSubjects.key, subjectKey)).limit(1);
  if (existing && existing.curriculumAreaKey !== input.curriculumAreaKey) {
    throw new Error(`“${existing.label}” already exists under a different curriculum area.`);
  }
  if (existing) {
    await db.update(curriculumSubjects).set({ active: true, updatedAt: new Date() })
      .where(eq(curriculumSubjects.id, existing.id));
    return { curriculumSubjectId: existing.id, subjectKey: existing.key, subjectLabel: existing.label };
  }

  const id = randomUUID();
  await db.insert(curriculumSubjects).values({
    id,
    key: subjectKey,
    label: subjectLabel,
    curriculumAreaKey: input.curriculumAreaKey,
    aliases: [],
    displayOrder: 1_000,
    active: true,
    createdByUserId: input.userId
  }).onConflictDoNothing({ target: curriculumSubjects.key });
  const [created] = await db.select({
    id: curriculumSubjects.id,
    key: curriculumSubjects.key,
    label: curriculumSubjects.label,
    curriculumAreaKey: curriculumSubjects.curriculumAreaKey
  }).from(curriculumSubjects).where(eq(curriculumSubjects.key, subjectKey)).limit(1);
  if (!created || created.curriculumAreaKey !== input.curriculumAreaKey) {
    throw new Error("Could not add this subject to the Treeschool subject list.");
  }
  return { curriculumSubjectId: created.id, subjectKey: created.key, subjectLabel: created.label };
}

export async function listCurriculumSubjectsForAdmin(userId: string) {
  await requireAdmin(userId);
  return db.select({
    id: curriculumSubjects.id,
    key: curriculumSubjects.key,
    label: curriculumSubjects.label,
    curriculumAreaKey: curriculumSubjects.curriculumAreaKey,
    aliases: curriculumSubjects.aliases
  }).from(curriculumSubjects)
    .where(eq(curriculumSubjects.active, true))
    .orderBy(asc(curriculumSubjects.curriculumAreaKey), asc(curriculumSubjects.displayOrder), asc(curriculumSubjects.label));
}

async function getNativeWorkbookUsage(workbookId: string) {
  const versionRows = await db
    .select({ id: nativeWorkbookVersions.id })
    .from(nativeWorkbookVersions)
    .where(eq(nativeWorkbookVersions.workbookId, workbookId));
  const versionIds = versionRows.map((version) => version.id);
  const [[purchaseCount], [attachmentCount], [runningJobCount]] = await Promise.all([
    db.select({ value: sql<number>`count(*)::integer` })
      .from(nativeWorkbookPurchases)
      .where(eq(nativeWorkbookPurchases.workbookId, workbookId)),
    versionIds.length
      ? db.select({ value: sql<number>`count(*)::integer` })
          .from(contentDocuments)
          .where(inArray(contentDocuments.nativeWorkbookVersionId, versionIds))
      : Promise.resolve([{ value: 0 }]),
    versionIds.length
      ? db.select({ value: sql<number>`count(*)::integer` })
          .from(nativeWorkbookJobs)
          .where(and(
            inArray(nativeWorkbookJobs.workbookVersionId, versionIds),
            eq(nativeWorkbookJobs.status, "running")
          ))
      : Promise.resolve([{ value: 0 }])
  ]);
  return {
    purchaseCount: Number(purchaseCount?.value ?? 0),
    attachmentCount: Number(attachmentCount?.value ?? 0),
    runningJobCount: Number(runningJobCount?.value ?? 0)
  };
}

function assertNativeWorkbookCanBeReplaced(usage: Awaited<ReturnType<typeof getNativeWorkbookUsage>>) {
  if (usage.runningJobCount > 0) {
    throw new Error("Wait for the current workbook job to finish before replacing this PDF.");
  }
}

async function getParentContext(userId: string) {
  const [parent] = await db
    .select({
      accountId: profiles.accountId,
      accountRole: profiles.accountRole,
      email: users.email,
      isAdmin: profiles.isAdmin
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);
  if (!parent) throw new Error("Parent account not found.");
  return parent;
}

async function getOptionalParentContext(userId?: string | null) {
  if (!userId) return null;
  return getParentContext(userId).catch(() => null);
}

async function accessByWorkbookIds(userId: string | null | undefined, workbookIds: string[]) {
  const result = new Map<string, AccessState>();
  if (workbookIds.length === 0) return result;
  const parent = await getOptionalParentContext(userId);
  if (!parent) {
    for (const id of workbookIds) result.set(id, "purchase_required");
    return result;
  }

  const [access, purchases] = await Promise.all([
    getPremiumFeatureAccess(userId!).catch(() => null),
    db
      .select({ workbookId: nativeWorkbookPurchases.workbookId })
      .from(nativeWorkbookPurchases)
      .where(and(
        eq(nativeWorkbookPurchases.accountId, parent.accountId),
        eq(nativeWorkbookPurchases.status, "paid"),
        inArray(nativeWorkbookPurchases.workbookId, workbookIds)
      ))
  ]);
  const owned = new Set(purchases.map((purchase) => purchase.workbookId));
  const rows = await db
    .select({ id: nativeWorkbooks.id, type: nativeWorkbooks.type })
    .from(nativeWorkbooks)
    .where(inArray(nativeWorkbooks.id, workbookIds));
  for (const workbook of rows) {
    result.set(
      workbook.id,
      owned.has(workbook.id)
        ? "owned"
        : workbook.type === "core" && access?.isSubscriber
          ? "included"
          : "purchase_required"
    );
  }
  return result;
}

function publicCurriculumCoverageProfile(value: unknown) {
  const profile = parseCurriculumCoverageProfile(value);
  return profile?.gradeProfiles.map((gradeProfile) => ({
    gradeLevel: gradeProfile.gradeLevel,
    role: gradeProfile.role,
    scores: gradeProfile.scores,
    competencies: gradeProfile.competencies.map((competency) => ({
      competencyId: competency.competencyId,
      label: competency.label,
      depth: competency.depth,
      strength: competency.strength,
      confidence: competency.confidence
    }))
  })) ?? [];
}

function aggregatePublicCurriculumCoverageProfiles(values: unknown[]) {
  const profiles = values
    .map((value) => parseCurriculumCoverageProfile(value))
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
  const gradeLevels = Array.from(new Set(profiles.flatMap((profile) =>
    profile.gradeProfiles.map((gradeProfile) => gradeProfile.gradeLevel)
  ))).sort((left, right) => left - right);

  return gradeLevels.map((gradeLevel) => {
    const matching = profiles.flatMap((profile) =>
      profile.gradeProfiles.filter((gradeProfile) => gradeProfile.gradeLevel === gradeLevel)
    );
    const competencies = mergeCompetencyCoverage(...matching.map((gradeProfile) => gradeProfile.competencies));
    return {
      gradeLevel,
      role: matching.every((gradeProfile) => gradeProfile.role === "core")
        ? "core" as const
        : "supplemental" as const,
      scores: scoreCompetencyCoverage(gradeLevel, competencies),
      competencies: competencies.map((competency) => ({
        competencyId: competency.competencyId,
        label: competency.label,
        depth: competency.depth,
        strength: competency.strength,
        confidence: competency.confidence
      }))
    };
  });
}

async function serializeCatalogRows<T extends {
  id: string;
  thumbnailObjectPath: string;
  curriculumCoverageProfile?: unknown;
}>(rows: T[], userId?: string | null) {
  const access = await accessByWorkbookIds(userId, rows.map((row) => row.id));
  return Promise.all(rows.map(async (row) => {
    const { curriculumCoverageProfile, ...catalogRow } = row;
    return {
      ...catalogRow,
      catalogKind: "workbook" as const,
      memberCount: 1,
      memberWorkbookIds: [row.id],
      isRecommendedCurriculum: false,
      recommendedGradeLevel: null,
      curriculumCoverage: publicCurriculumCoverageProfile(curriculumCoverageProfile),
      thumbnailUrl: await getSignedLessonAssetUrl(row.thumbnailObjectPath, 60).catch(() => null),
      accessState: access.get(row.id) ?? "purchase_required" as AccessState
    };
  }));
}

async function loadBundleCatalogRows(input: { includeInactive?: boolean; userId?: string | null }) {
  const bundles = await db.select({
    id: nativeWorkbookBundles.id,
    slug: nativeWorkbookBundles.slug,
    title: nativeWorkbookBundles.title,
    description: nativeWorkbookBundles.description,
    priceInCents: nativeWorkbookBundles.priceInCents,
    currencyCode: nativeWorkbookBundles.currencyCode,
    thumbnailObjectPath: nativeWorkbookBundles.thumbnailObjectPath,
    stripeProductId: nativeWorkbookBundles.stripeProductId,
    stripePriceId: nativeWorkbookBundles.stripePriceId,
    active: nativeWorkbookBundles.active,
    isRecommendedCurriculum: nativeWorkbookBundles.isRecommendedCurriculum,
    recommendedGradeLevel: nativeWorkbookBundles.recommendedGradeLevel,
    createdAt: nativeWorkbookBundles.createdAt
  }).from(nativeWorkbookBundles)
    .where(input.includeInactive ? undefined : eq(nativeWorkbookBundles.active, true))
    .orderBy(desc(nativeWorkbookBundles.createdAt));
  if (!bundles.length) return [];

  const members = await db.select({
    bundleId: nativeWorkbookBundleItems.bundleId,
    sortOrder: nativeWorkbookBundleItems.sortOrder,
    id: nativeWorkbooks.id,
    slug: nativeWorkbooks.slug,
    title: nativeWorkbooks.title,
    subjectKey: nativeWorkbooks.subjectKey,
    subjectLabel: nativeWorkbooks.subjectLabel,
    curriculumAreaKey: nativeWorkbooks.curriculumAreaKey,
    gradeMin: nativeWorkbooks.gradeMin,
    gradeMax: nativeWorkbooks.gradeMax,
    languageCode: nativeWorkbooks.languageCode,
    description: nativeWorkbooks.description,
    coverageTags: nativeWorkbooks.coverageTags,
    type: nativeWorkbooks.type,
    priceInCents: nativeWorkbooks.priceInCents,
    currencyCode: nativeWorkbooks.currencyCode,
    thumbnailObjectPath: nativeWorkbooks.thumbnailObjectPath,
    activeVersionId: nativeWorkbooks.activeVersionId,
    active: nativeWorkbooks.active,
    status: nativeWorkbooks.status,
    pageCount: nativeWorkbookVersions.pageCount,
    curriculumCoverageProfile: nativeWorkbookVersions.curriculumCoverageProfile
  }).from(nativeWorkbookBundleItems)
    .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookBundleItems.workbookId))
    .leftJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, nativeWorkbooks.activeVersionId))
    .where(inArray(nativeWorkbookBundleItems.bundleId, bundles.map((bundle) => bundle.id)))
    .orderBy(asc(nativeWorkbookBundleItems.bundleId), asc(nativeWorkbookBundleItems.sortOrder));
  const membersByBundle = new Map<string, typeof members>();
  for (const member of members) {
    const current = membersByBundle.get(member.bundleId) ?? [];
    current.push(member);
    membersByBundle.set(member.bundleId, current);
  }
  const access = await accessByWorkbookIds(input.userId, Array.from(new Set(members.map((member) => member.id))));

  return Promise.all(bundles.flatMap((bundle) => {
    const bundleMembers = membersByBundle.get(bundle.id) ?? [];
    if (!bundleMembers.length) return [];
    if (!input.includeInactive && bundleMembers.some((member) => !member.active || member.status !== "published" || !member.activeVersionId)) return [];
    const subjects = Array.from(new Set(bundleMembers.map((member) => member.subjectLabel)));
    const curriculumAreas = Array.from(new Set(bundleMembers.map((member) => member.curriculumAreaKey)));
    const languages = Array.from(new Set(bundleMembers.map((member) => member.languageCode)));
    const memberStates = bundleMembers.map((member) => access.get(member.id) ?? "purchase_required");
    const accessState: AccessState = memberStates.every((state) => state === "owned")
      ? "owned"
      : memberStates.every((state) => state !== "purchase_required")
        ? "included"
        : "purchase_required";
    return [Promise.resolve({
      id: bundle.id,
      slug: bundle.slug,
      title: bundle.title,
      subjectKey: subjects.length === 1 ? slugify(subjects[0]) : "multiple-subjects",
      subjectLabel: subjects.length === 1 ? subjects[0] : "Multiple subjects",
      curriculumAreaKey: curriculumAreas.length === 1 ? curriculumAreas[0] : "multiple",
      gradeMin: Math.min(...bundleMembers.map((member) => member.gradeMin)),
      gradeMax: Math.max(...bundleMembers.map((member) => member.gradeMax)),
      languageCode: languages.length === 1 ? languages[0] : "multi",
      description: bundle.description,
      coverageTags: Array.from(new Set(bundleMembers.flatMap((member) => member.coverageTags))),
      type: bundleMembers.every((member) => member.type === "core") ? "core" as const : "elective" as const,
      priceInCents: bundle.priceInCents,
      currencyCode: bundle.currencyCode,
      activeVersionId: null,
      pageCount: bundleMembers.reduce((total, member) => total + Number(member.pageCount ?? 0), 0),
      catalogKind: "bundle" as const,
      memberCount: bundleMembers.length,
      memberWorkbookIds: bundleMembers.map((member) => member.id),
      members: bundleMembers.map((member) => ({
        id: member.id,
        activeVersionId: member.activeVersionId,
        slug: member.slug,
        title: member.title,
        subjectLabel: member.subjectLabel,
        curriculumAreaKey: member.curriculumAreaKey,
        gradeMin: member.gradeMin,
        gradeMax: member.gradeMax,
        pageCount: member.pageCount
      })),
      thumbnailUrl: null as string | null,
      thumbnailObjectPath: bundle.thumbnailObjectPath,
      stripeProductId: bundle.stripeProductId,
      stripePriceId: bundle.stripePriceId,
      active: bundle.active,
      isRecommendedCurriculum: bundle.isRecommendedCurriculum,
      recommendedGradeLevel: bundle.recommendedGradeLevel,
      curriculumCoverage: aggregatePublicCurriculumCoverageProfiles(
        bundleMembers.map((member) => member.curriculumCoverageProfile)
      ),
      createdAt: bundle.createdAt,
      accessState
    })];
  })).then(async (rows) => Promise.all(rows.map(async (row) => ({
    ...row,
    thumbnailUrl: await getSignedLessonAssetUrl(row.thumbnailObjectPath, 60).catch(() => null)
  }))));
}

export async function getNativeWorkbookNavigation(userId: string) {
  const parent = await getParentContext(userId);
  const [count] = await db
    .select({ value: sql<number>`count(*)::integer` })
    .from(nativeWorkbookPurchases)
    .where(and(
      eq(nativeWorkbookPurchases.accountId, parent.accountId),
      eq(nativeWorkbookPurchases.status, "paid")
    ));
  return { isAdmin: parent.isAdmin, purchasedWorkbookCount: Number(count?.value ?? 0) };
}

export async function listNativeWorkbookCatalog(input: {
  userId?: string | null;
  profileId?: string | null;
  grade?: number | null;
  subject?: string | null;
}) {
  const conditions = [eq(nativeWorkbooks.active, true), eq(nativeWorkbooks.status, "published")];
  if (input.grade != null) {
    const grade = normalizeGrade(input.grade);
    conditions.push(lte(nativeWorkbooks.gradeMin, grade), gte(nativeWorkbooks.gradeMax, grade));
  }
  if (input.subject?.trim()) {
    const subject = input.subject.trim();
    conditions.push(or(
      ilike(nativeWorkbooks.subjectKey, `%${subject}%`),
      ilike(nativeWorkbooks.subjectLabel, `%${subject}%`),
      ilike(nativeWorkbooks.curriculumAreaKey, `%${subject}%`)
    )!);
  }
  const rows = await db
    .select({
      id: nativeWorkbooks.id,
      slug: nativeWorkbooks.slug,
      title: nativeWorkbooks.title,
      subjectKey: nativeWorkbooks.subjectKey,
      subjectLabel: nativeWorkbooks.subjectLabel,
      curriculumAreaKey: nativeWorkbooks.curriculumAreaKey,
      gradeMin: nativeWorkbooks.gradeMin,
      gradeMax: nativeWorkbooks.gradeMax,
      languageCode: nativeWorkbooks.languageCode,
      description: nativeWorkbooks.description,
      coverageTags: nativeWorkbooks.coverageTags,
      type: nativeWorkbooks.type,
      priceInCents: nativeWorkbooks.priceInCents,
      currencyCode: nativeWorkbooks.currencyCode,
      thumbnailObjectPath: nativeWorkbooks.thumbnailObjectPath,
      activeVersionId: nativeWorkbooks.activeVersionId,
      pageCount: nativeWorkbookVersions.pageCount,
      curriculumCoverageProfile: nativeWorkbookVersions.curriculumCoverageProfile
    })
    .from(nativeWorkbooks)
    .leftJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, nativeWorkbooks.activeVersionId))
    .where(and(...conditions))
    .orderBy(asc(nativeWorkbooks.gradeMin), asc(nativeWorkbooks.subjectLabel), asc(nativeWorkbooks.title));
  const [workbooks, allBundles] = await Promise.all([
    serializeCatalogRows(rows, input.userId),
    loadBundleCatalogRows({ userId: input.userId })
  ]);
  const subject = input.subject?.trim().toLowerCase() ?? "";
  const bundles = allBundles.filter((bundle) => {
    if (input.grade != null && (bundle.gradeMin > input.grade || bundle.gradeMax < input.grade)) return false;
    if (subject && ![
      bundle.subjectKey,
      bundle.subjectLabel,
      bundle.curriculumAreaKey,
      bundle.title,
      ...bundle.coverageTags
    ].some((value) => value.toLowerCase().includes(subject))) return false;
    return true;
  });
  const catalog = [...workbooks, ...bundles].sort((left, right) =>
    left.gradeMin - right.gradeMin || left.subjectLabel.localeCompare(right.subjectLabel) || left.title.localeCompare(right.title)
  );
  if (!input.userId || !input.profileId || catalog.length === 0) return catalog;

  const parent = await getParentContext(input.userId);
  const [profile] = await db.select({ accountId: profiles.accountId })
    .from(profiles)
    .where(eq(profiles.id, input.profileId))
    .limit(1);
  if (!profile || profile.accountId !== parent.accountId) {
    throw new Error("Student profile not found.");
  }
  const workbookIds = Array.from(new Set(catalog.flatMap((item) =>
    item.catalogKind === "bundle" ? item.memberWorkbookIds : [item.id]
  )));
  const workbookVersions = workbookIds.length === 0 ? [] : await db.select({
    workbookId: nativeWorkbooks.id,
    versionId: nativeWorkbooks.activeVersionId
  }).from(nativeWorkbooks).where(inArray(nativeWorkbooks.id, workbookIds));
  const versionByWorkbookId = new Map(workbookVersions.flatMap((workbook) =>
    workbook.versionId ? [[workbook.workbookId, workbook.versionId] as const] : []
  ));
  const summaries = await summarizeWorkbookProgress({
    profileId: input.profileId,
    nativeWorkbookVersionIds: Array.from(versionByWorkbookId.values())
  });
  const emptySummary = (): NativeWorkbookProgressSummary => ({
    total: 0,
    completed: 0,
    mastered: 0,
    deferred: 0,
    notStarted: 0
  });
  return catalog.map((item) => {
    const memberIds = item.catalogKind === "bundle" ? item.memberWorkbookIds : [item.id];
    const progressSummary = memberIds.reduce((total, workbookId) => {
      const versionId = versionByWorkbookId.get(workbookId);
      const summary = versionId ? summaries.get(versionId) : null;
      if (!summary) return total;
      total.total += summary.total;
      total.completed += summary.completed;
      total.mastered += summary.mastered;
      total.deferred += summary.deferred;
      total.notStarted += summary.notStarted;
      return total;
    }, emptySummary());
    return {
      ...item,
      progressSummary: progressSummary.completed || progressSummary.mastered || progressSummary.deferred
        ? progressSummary
        : null
    };
  });
}

export async function getNativeWorkbookProduct(input: { slug: string; userId?: string | null }) {
  const [row] = await db
    .select({
      id: nativeWorkbooks.id,
      slug: nativeWorkbooks.slug,
      title: nativeWorkbooks.title,
      subjectKey: nativeWorkbooks.subjectKey,
      subjectLabel: nativeWorkbooks.subjectLabel,
      curriculumAreaKey: nativeWorkbooks.curriculumAreaKey,
      gradeMin: nativeWorkbooks.gradeMin,
      gradeMax: nativeWorkbooks.gradeMax,
      languageCode: nativeWorkbooks.languageCode,
      description: nativeWorkbooks.description,
      coverageTags: nativeWorkbooks.coverageTags,
      type: nativeWorkbooks.type,
      priceInCents: nativeWorkbooks.priceInCents,
      currencyCode: nativeWorkbooks.currencyCode,
      thumbnailObjectPath: nativeWorkbooks.thumbnailObjectPath,
      activeVersionId: nativeWorkbooks.activeVersionId
    })
    .from(nativeWorkbooks)
    .where(and(eq(nativeWorkbooks.slug, input.slug), eq(nativeWorkbooks.active, true), eq(nativeWorkbooks.status, "published")))
    .limit(1);
  if (!row) {
    const bundle = (await loadBundleCatalogRows({ userId: input.userId }))
      .find((candidate) => candidate.slug === input.slug);
    if (!bundle) throw new Error("Catalog item not found.");
    return { ...bundle, previewImages: [] };
  }
  const [version] = row.activeVersionId ? await db
    .select({
      id: nativeWorkbookVersions.id,
      objectPath: nativeWorkbookVersions.objectPath,
      pageCount: nativeWorkbookVersions.pageCount,
      analysisJson: nativeWorkbookVersions.analysisJson
    })
    .from(nativeWorkbookVersions)
    .where(eq(nativeWorkbookVersions.id, row.activeVersionId))
    .limit(1) : [];
  let previewImages = readProductPreviewImages(version?.analysisJson);
  if (version && !previewImages.length) {
    previewImages = await (async () => {
      const bytes = await downloadPrivateFile(version.objectPath);
      return createProductPreviewImages({
        workbookId: row.id,
        versionId: version.id,
        bytes,
        pageCount: version.pageCount,
        analysis: version.analysisJson
      });
    })().catch((error) => {
      console.warn(`Could not backfill product previews for native workbook ${row.id}:`, error);
      return [];
    });
    if (previewImages.length) {
      await db.update(nativeWorkbookVersions).set({
        analysisJson: {
          ...version.analysisJson,
          productPreviewImages: previewImages
        }
      }).where(eq(nativeWorkbookVersions.id, version.id));
    }
  }
  const product = (await serializeCatalogRows([row], input.userId))[0];
  return {
    ...product,
    pageCount: version?.pageCount ?? null,
    previewImages: await Promise.all(previewImages.map(async (preview) => ({
      pdfPageNumber: preview.pdfPageNumber,
      label: preview.label,
      url: await getSignedLessonAssetUrl(preview.objectPath, 60)
    })))
  };
}

async function requireAttachedNativeWorkbookDocument(input: {
  userId: string;
  learningYearId: string;
  documentId: string;
}) {
  const parent = await getParentContext(input.userId);
  const [document] = await db.select({
    id: contentDocuments.id,
    learningYearId: contentDocuments.learningYearId,
    label: contentDocuments.label,
    subjectLabel: contentDocuments.subjectLabel,
    sourceKind: contentDocuments.sourceKind,
    nativeWorkbookVersionId: contentDocuments.nativeWorkbookVersionId,
    objectPath: contentDocuments.objectPath,
    pageCount: contentDocuments.pageCount,
    analysisStatus: contentDocuments.analysisStatus,
    analysisJson: contentDocuments.analysisJson,
    profileAccountId: profiles.accountId
  })
    .from(contentDocuments)
    .innerJoin(learningYears, eq(learningYears.id, contentDocuments.learningYearId))
    .innerJoin(profiles, eq(profiles.id, learningYears.profileId))
    .where(and(
      eq(contentDocuments.id, input.documentId),
      eq(contentDocuments.learningYearId, input.learningYearId),
      isNull(contentDocuments.removedAt)
    ))
    .limit(1);

  if (!document || document.profileAccountId !== parent.accountId) {
    throw new Error("Workbook not found in this lesson plan.");
  }
  if (document.sourceKind !== "native_workbook" || !document.nativeWorkbookVersionId) {
    throw new Error("Only indexed Treeschool workbooks can be reviewed before planning.");
  }
  if (document.analysisStatus !== "ready") {
    throw new Error("This workbook's lesson index is not ready yet.");
  }
  return document;
}

export async function getNativeWorkbookPlanningPreview(input: {
  userId: string;
  learningYearId: string;
  documentId: string;
}) {
  const document = await requireAttachedNativeWorkbookDocument(input);
  const lessons = buildNativeWorkbookLessonSummaries(document.analysisJson, document.pageCount);
  if (!lessons.length) {
    throw new Error("This workbook's indexed lesson list is not available yet.");
  }
  return {
    documentId: document.id,
    title: document.label,
    subjectLabel: document.subjectLabel,
    pageCount: document.pageCount,
    lessonCount: lessons.filter((lesson) => lesson.kind === "lesson").length,
    sectionCount: lessons.filter((lesson) => lesson.kind === "section").length,
    lessons
  };
}

export async function buildNativeWorkbookLessonPreview(input: {
  userId: string;
  learningYearId: string;
  documentId: string;
  learningUnitId: string;
}): Promise<{ bytes: Uint8Array; filename: string }> {
  const document = await requireAttachedNativeWorkbookDocument(input);
  const lessons = buildNativeWorkbookLessonSummaries(document.analysisJson, document.pageCount);
  const lesson = lessons.find((candidate) => candidate.id === input.learningUnitId);
  if (!lesson) throw new Error("That indexed lesson could not be found.");

  const pageIndexes = nativeWorkbookLessonPageIndexes(lesson);
  if (!pageIndexes.length) throw new Error("That lesson does not have previewable pages.");
  const sourceBytes = await downloadPrivateFile(document.objectPath);
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const preview = await PDFDocument.create();
  for (const pageIndex of pageIndexes) {
    if (pageIndex < 0 || pageIndex >= source.getPageCount()) {
      throw new Error("The indexed lesson contains a page outside the source workbook.");
    }
    const [copiedPage] = await preview.copyPages(source, [pageIndex]);
    if (!copiedPage) throw new Error("A lesson page could not be copied from the source workbook.");
    const mediaBox = copiedPage.getMediaBox();
    copiedPage.setCropBox(mediaBox.x, mediaBox.y, mediaBox.width, mediaBox.height);
    preview.addPage(copiedPage);
  }

  const safeWorkbook = document.label.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);
  const safeLesson = lesson.title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);
  return {
    bytes: await preview.save(),
    filename: `${safeWorkbook || "workbook"}-${safeLesson || "lesson"}.pdf`
  };
}

export async function listAdminNativeWorkbooks(userId: string) {
  await requireAdmin(userId);
  const rows = await db
    .select({
      id: nativeWorkbooks.id,
      slug: nativeWorkbooks.slug,
      title: nativeWorkbooks.title,
      curriculumSubjectId: nativeWorkbooks.curriculumSubjectId,
      subjectLabel: nativeWorkbooks.subjectLabel,
      subjectKey: nativeWorkbooks.subjectKey,
      curriculumAreaKey: nativeWorkbooks.curriculumAreaKey,
      gradeMin: nativeWorkbooks.gradeMin,
      gradeMax: nativeWorkbooks.gradeMax,
      languageCode: nativeWorkbooks.languageCode,
      description: nativeWorkbooks.description,
      coverageTags: nativeWorkbooks.coverageTags,
      type: nativeWorkbooks.type,
      priceInCents: nativeWorkbooks.priceInCents,
      currencyCode: nativeWorkbooks.currencyCode,
      thumbnailObjectPath: nativeWorkbooks.thumbnailObjectPath,
      prerequisiteWorkbookId: nativeWorkbooks.prerequisiteWorkbookId,
      status: nativeWorkbooks.status,
      active: nativeWorkbooks.active,
      activeVersionId: nativeWorkbooks.activeVersionId,
      createdAt: nativeWorkbooks.createdAt,
      versionId: nativeWorkbookVersions.id,
      versionNumber: nativeWorkbookVersions.versionNumber,
      editionId: nativeWorkbookVersions.editionId,
      revisionNumber: nativeWorkbookVersions.revisionNumber,
      editionLabel: nativeWorkbookVersions.editionLabel,
      releaseStatus: nativeWorkbookVersions.releaseStatus,
      versionCreatedAt: nativeWorkbookVersions.createdAt,
      versionPublishedAt: nativeWorkbookVersions.publishedAt,
      changeNotes: nativeWorkbookVersions.changeNotes,
      originalFilename: nativeWorkbookVersions.originalFilename,
      pageCount: nativeWorkbookVersions.pageCount,
      analysisStatus: nativeWorkbookVersions.analysisStatus,
      analysisJson: nativeWorkbookVersions.analysisJson,
      curriculumCoverageProfile: nativeWorkbookVersions.curriculumCoverageProfile,
      curriculumCoverageFrameworkVersion: nativeWorkbookVersions.curriculumCoverageFrameworkVersion,
      curriculumCoverageProfiledAt: nativeWorkbookVersions.curriculumCoverageProfiledAt,
      lastError: nativeWorkbookVersions.lastError,
      indexedAt: nativeWorkbookVersions.indexedAt
    })
    .from(nativeWorkbooks)
    .leftJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.workbookId, nativeWorkbooks.id))
    .orderBy(desc(nativeWorkbooks.createdAt), desc(nativeWorkbookVersions.versionNumber));
  const seenWorkbookIds = new Set<string>();
  const latestRows = rows.filter((row) => {
    if (seenWorkbookIds.has(row.id)) return false;
    seenWorkbookIds.add(row.id);
    return true;
  });
  const titleByWorkbookId = new Map(latestRows.map((row) => [row.id, row.title]));
  const releasesByWorkbookId = new Map<string, Array<{
    versionId: string;
    editionId: string;
    versionNumber: number;
    editionLabel: string;
    revisionNumber: number;
    releaseStatus: string;
    analysisStatus: string;
    pageCount: number;
    createdAt: Date;
    publishedAt: Date | null;
    changeNotes: string | null;
  }>>();
  for (const row of rows) {
    if (!row.versionId || !row.editionId || row.versionNumber == null || row.revisionNumber == null) continue;
    const releases = releasesByWorkbookId.get(row.id) ?? [];
    releases.push({
      versionId: row.versionId,
      editionId: row.editionId,
      versionNumber: row.versionNumber,
      editionLabel: row.editionLabel ?? "1st edition",
      revisionNumber: row.revisionNumber,
      releaseStatus: row.releaseStatus ?? "draft",
      analysisStatus: row.analysisStatus ?? "unknown",
      pageCount: row.pageCount ?? 0,
      createdAt: row.versionCreatedAt!,
      publishedAt: row.versionPublishedAt,
      changeNotes: row.changeNotes
    });
    releasesByWorkbookId.set(row.id, releases);
  }
  return Promise.all(latestRows.map(async (row) => {
    const usage = await getNativeWorkbookUsage(row.id);
    const replacement = readWorkbookReplacementState(row.analysisJson);
    const coverageProfile = parseCurriculumCoverageProfile(row.curriculumCoverageProfile);
    const canReplacePdf = row.versionId != null
      && row.versionId === row.activeVersionId
      && (!replacement || ["failed", "rejected"].includes(row.analysisStatus ?? ""))
      && !["awaiting_upload", "queued", "analyzing"].includes(row.analysisStatus ?? "")
      && row.status !== "indexing"
      && usage.runningJobCount === 0;
    const safeReplacementError = row.lastError?.startsWith("Replacement rejected:")
      ? row.lastError
      : null;
    return {
      ...row,
      pageCount: replacement?.expectedPageCount ?? row.pageCount,
      lastError: safeReplacementError ?? (row.lastError ? PUBLIC_NATIVE_WORKBOOK_ERROR : null),
      lastErrorCode: row.lastError && row.versionId
        ? nativeWorkbookErrorReference(row.versionId)
        : null,
      analysisJson: undefined,
      curriculumCoverageProfile: undefined,
      curriculumCoverageScores: coverageProfile?.gradeProfiles.map((profile) => ({
        gradeLevel: profile.gradeLevel,
        role: profile.role,
        scores: profile.scores
      })) ?? [],
      purchaseCount: usage.purchaseCount,
      planAttachmentCount: usage.attachmentCount,
      canReplacePdf,
      isActiveVersion: row.versionId === row.activeVersionId,
      canPublishVersion: row.versionId != null &&
        row.versionId !== row.activeVersionId &&
        row.analysisStatus === "ready",
      releases: releasesByWorkbookId.get(row.id) ?? [],
      prerequisiteWorkbookTitle: row.prerequisiteWorkbookId
        ? titleByWorkbookId.get(row.prerequisiteWorkbookId) ?? "Unavailable workbook"
        : null,
      thumbnailUrl: await getPrivateFileMetadata(row.thumbnailObjectPath)
        .then(() => getSignedLessonAssetUrl(row.thumbnailObjectPath, 60))
        .catch(() => null)
    };
  }));
}

export async function listAdminNativeWorkbookBundles(userId: string) {
  await requireAdmin(userId);
  return loadBundleCatalogRows({ includeInactive: true, userId });
}

export async function prepareNativeWorkbookBundle(input: {
  userId: string;
  title: string;
  descriptionMode?: "auto" | "custom";
  description: string;
  priceInCents: number;
  currencyCode?: string;
  workbookIds: string[];
  thumbnailFilename: string;
  thumbnailMimeType: string;
  isRecommendedCurriculum?: boolean;
  recommendedGradeLevel?: number | null;
}) {
  await requireAdmin(input.userId);
  const title = normalizeText(input.title, 180);
  const descriptionMode = input.descriptionMode === "custom" ? "custom" : "auto";
  let description = normalizeText(input.description, 3_000);
  const priceInCents = normalizePrice(input.priceInCents);
  const currencyCode = normalizeText(input.currencyCode || "USD", 3).toUpperCase();
  const workbookIds = Array.from(new Set(input.workbookIds.map((id) => normalizeOptionalUuid(id)).filter((id): id is string => Boolean(id))));
  const thumbnailMimeType = normalizeText(input.thumbnailMimeType, 80).toLowerCase();
  if (!title) throw new Error("Bundle title is required.");
  if (descriptionMode === "custom" && !description) throw new Error("Write a description for this bundle.");
  if (workbookIds.length < 2) throw new Error("Choose at least two workbooks for the bundle.");
  if (workbookIds.length > 30) throw new Error("A bundle may contain up to 30 workbooks.");
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(thumbnailMimeType)) {
    throw new Error("Choose a JPG, PNG, or WebP bundle thumbnail.");
  }
  const members = await db.select({
    id: nativeWorkbooks.id,
    title: nativeWorkbooks.title,
    subjectLabel: nativeWorkbooks.subjectLabel,
    gradeMin: nativeWorkbooks.gradeMin,
    gradeMax: nativeWorkbooks.gradeMax,
    coverageTags: nativeWorkbooks.coverageTags,
    type: nativeWorkbooks.type,
    languageCode: nativeWorkbooks.languageCode,
    activeVersionId: nativeWorkbooks.activeVersionId
  }).from(nativeWorkbooks).where(and(
    inArray(nativeWorkbooks.id, workbookIds),
    eq(nativeWorkbooks.active, true),
    eq(nativeWorkbooks.status, "published")
  ));
  if (members.length !== workbookIds.length || members.some((member) => !member.activeVersionId)) {
    throw new Error("Bundles can only contain published, indexed workbooks.");
  }
  const isRecommendedCurriculum = input.isRecommendedCurriculum === true;
  const recommendedGradeLevel = isRecommendedCurriculum && input.recommendedGradeLevel != null
    ? normalizeGrade(input.recommendedGradeLevel)
    : null;
  if (isRecommendedCurriculum) {
    if (recommendedGradeLevel == null) throw new Error("Choose a grade for the recommended curriculum.");
    if (members.some((member) => member.type !== "core")) {
      throw new Error("A recommended curriculum bundle may contain only core workbooks.");
    }
    const languageFamilies = new Set(members.map((member) => member.languageCode.trim().toLowerCase().split(/[-_]/)[0]));
    if (languageFamilies.size !== 1) {
      throw new Error("A recommended curriculum bundle must use one language.");
    }
    if (members.some((member) => member.gradeMin > recommendedGradeLevel || member.gradeMax < recommendedGradeLevel)) {
      throw new Error("Every workbook in a recommended curriculum bundle must support the designated grade.");
    }
  }
  if (descriptionMode === "auto") {
    const gradeMin = Math.min(...members.map((member) => member.gradeMin));
    const gradeMax = Math.max(...members.map((member) => member.gradeMax));
    const subjects = Array.from(new Set(members.map((member) => member.subjectLabel)));
    const titles = workbookIds.map((id) => members.find((member) => member.id === id)?.title).filter(Boolean);
    const topics = Array.from(new Set(members.flatMap((member) => member.coverageTags))).slice(0, 6);
    description = `${workbookGradeLabel(gradeMin, gradeMax)} printable workbook bundle containing ${titles.join(", ")}. ${subjects.length === 1 ? `Builds a sequenced ${subjects[0]} curriculum` : `Covers ${subjects.join(", ")}`}${topics.length ? `, including ${topics.join(", ")}` : ""}.`;
  }

  const bundleId = randomUUID();
  const slugBase = slugify(`${title}-workbook-bundle`);
  const [[bundleCollision], [workbookCollision]] = await Promise.all([
    db.select({ id: nativeWorkbookBundles.id }).from(nativeWorkbookBundles)
      .where(eq(nativeWorkbookBundles.slug, slugBase)).limit(1),
    db.select({ id: nativeWorkbooks.id }).from(nativeWorkbooks)
      .where(eq(nativeWorkbooks.slug, slugBase)).limit(1)
  ]);
  const slug = bundleCollision || workbookCollision ? `${slugBase}-${bundleId.slice(0, 8)}` : slugBase;
  const thumbnailObjectPath = `native-workbook-bundles/${bundleId}/thumbnail/${safeFilename(input.thumbnailFilename, "bundle-cover.png")}`;
  await db.transaction(async (tx) => {
    await tx.insert(nativeWorkbookBundles).values({
      id: bundleId,
      slug,
      title,
      description,
      priceInCents,
      currencyCode,
      thumbnailObjectPath,
      active: false,
      isRecommendedCurriculum,
      recommendedGradeLevel,
      createdByUserId: input.userId
    });
    await tx.insert(nativeWorkbookBundleItems).values(workbookIds.map((workbookId, sortOrder) => ({
      bundleId,
      workbookId,
      sortOrder
    })));
  });
  try {
    const thumbnailUploadUrl = await getSignedPrivateUploadUrl({
      objectPath: thumbnailObjectPath,
      contentType: thumbnailMimeType,
      expiresInMinutes: 30
    });
    return { bundleId, thumbnailUploadUrl };
  } catch (error) {
    await db.delete(nativeWorkbookBundles).where(eq(nativeWorkbookBundles.id, bundleId)).catch(() => undefined);
    throw error;
  }
}

export async function completeNativeWorkbookBundle(input: { userId: string; bundleId: string }) {
  await requireAdmin(input.userId);
  const bundle = (await loadBundleCatalogRows({ includeInactive: true, userId: input.userId }))
    .find((candidate) => candidate.id === input.bundleId);
  if (!bundle) throw new Error("Workbook bundle not found.");
  if (bundle.isRecommendedCurriculum && (
    bundle.type !== "core" ||
    bundle.languageCode === "multi" ||
    bundle.recommendedGradeLevel == null ||
    bundle.members.some((member) => member.gradeMin > bundle.recommendedGradeLevel! || member.gradeMax < bundle.recommendedGradeLevel!)
  )) {
    throw new Error("A recommended curriculum bundle must contain core workbooks in one language that all support its designated grade.");
  }
  await getPrivateFileMetadata(bundle.thumbnailObjectPath).catch(() => {
    throw new Error("Upload the bundle thumbnail before completing the bundle.");
  });
  let stripeProductId = bundle.stripeProductId;
  let stripePriceId = bundle.stripePriceId;
  if ((!stripeProductId || !stripePriceId) && env.STRIPE_SECRET_KEY) {
    const stripe = getStripe();
    const product = await stripe.products.create({
      name: bundle.title,
      description: bundle.description,
      metadata: nativeWorkbookBundleStripeMetadata(bundle)
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: bundle.currencyCode.toLowerCase(),
      unit_amount: bundle.priceInCents
    });
    stripeProductId = product.id;
    stripePriceId = price.id;
  }
  await db.update(nativeWorkbookBundles).set({
    stripeProductId,
    stripePriceId,
    active: true,
    updatedAt: new Date()
  }).where(eq(nativeWorkbookBundles.id, bundle.id));
  if (bundle.isRecommendedCurriculum) {
    await setNativeWorkbookBundleRecommended({
      userId: input.userId,
      bundleId: bundle.id,
      isRecommendedCurriculum: true,
      recommendedGradeLevel: bundle.recommendedGradeLevel
    });
  }
  return { created: true, bundleId: bundle.id };
}

export async function prepareNativeWorkbookBundleThumbnail(input: {
  userId: string;
  bundleId: string;
  thumbnailFilename: string;
  thumbnailMimeType: string;
}) {
  await requireAdmin(input.userId);
  const [bundle] = await db.select({ id: nativeWorkbookBundles.id })
    .from(nativeWorkbookBundles)
    .where(eq(nativeWorkbookBundles.id, input.bundleId))
    .limit(1);
  if (!bundle) throw new Error("Workbook bundle not found.");
  const thumbnailMimeType = normalizeText(input.thumbnailMimeType, 80).toLowerCase();
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(thumbnailMimeType)) {
    throw new Error("Choose a JPG, PNG, or WebP bundle thumbnail.");
  }
  const thumbnailObjectPath = `native-workbook-bundles/${bundle.id}/thumbnail/${randomUUID()}-${safeFilename(input.thumbnailFilename, "bundle-cover.png")}`;
  const thumbnailUploadUrl = await getSignedPrivateUploadUrl({
    objectPath: thumbnailObjectPath,
    contentType: thumbnailMimeType,
    expiresInMinutes: 30
  });
  return { bundleId: bundle.id, thumbnailObjectPath, thumbnailUploadUrl };
}

export async function discardNativeWorkbookBundleThumbnail(input: {
  userId: string;
  bundleId: string;
  thumbnailObjectPath: string;
}) {
  await requireAdmin(input.userId);
  const [bundle] = await db.select({ thumbnailObjectPath: nativeWorkbookBundles.thumbnailObjectPath })
    .from(nativeWorkbookBundles)
    .where(eq(nativeWorkbookBundles.id, input.bundleId))
    .limit(1);
  if (!bundle) return { discarded: false };
  const thumbnailObjectPath = normalizeText(input.thumbnailObjectPath, 500);
  const expectedPrefix = `native-workbook-bundles/${input.bundleId}/thumbnail/`;
  if (!thumbnailObjectPath.startsWith(expectedPrefix) || thumbnailObjectPath === bundle.thumbnailObjectPath) {
    return { discarded: false };
  }
  await deletePrivateFile(thumbnailObjectPath).catch(() => undefined);
  return { discarded: true };
}

export async function updateNativeWorkbookBundle(input: {
  userId: string;
  bundleId: string;
  title: string;
  descriptionMode?: "auto" | "custom";
  description: string;
  priceInCents: number;
  workbookIds: string[];
  isRecommendedCurriculum?: boolean;
  recommendedGradeLevel?: number | null;
  thumbnailObjectPath?: string | null;
}) {
  await requireAdmin(input.userId);
  const existingBundle = (await loadBundleCatalogRows({ includeInactive: true, userId: input.userId }))
    .find((candidate) => candidate.id === input.bundleId);
  if (!existingBundle) throw new Error("Workbook bundle not found.");

  const title = normalizeText(input.title, 180);
  const descriptionMode = input.descriptionMode === "auto" ? "auto" : "custom";
  let description = normalizeText(input.description, 3_000);
  const priceInCents = normalizePrice(input.priceInCents);
  const workbookIds = Array.from(new Set(
    input.workbookIds.map((id) => normalizeOptionalUuid(id)).filter((id): id is string => Boolean(id))
  ));
  if (!title) throw new Error("Bundle title is required.");
  if (descriptionMode === "custom" && !description) throw new Error("Write a description for this bundle.");
  if (workbookIds.length < 2) throw new Error("Choose at least two workbooks for the bundle.");
  if (workbookIds.length > 30) throw new Error("A bundle may contain up to 30 workbooks.");

  const members = await db.select({
    id: nativeWorkbooks.id,
    title: nativeWorkbooks.title,
    subjectLabel: nativeWorkbooks.subjectLabel,
    gradeMin: nativeWorkbooks.gradeMin,
    gradeMax: nativeWorkbooks.gradeMax,
    coverageTags: nativeWorkbooks.coverageTags,
    type: nativeWorkbooks.type,
    languageCode: nativeWorkbooks.languageCode,
    activeVersionId: nativeWorkbooks.activeVersionId
  }).from(nativeWorkbooks).where(and(
    inArray(nativeWorkbooks.id, workbookIds),
    eq(nativeWorkbooks.active, true),
    eq(nativeWorkbooks.status, "published")
  ));
  if (members.length !== workbookIds.length || members.some((member) => !member.activeVersionId)) {
    throw new Error("Bundles can only contain published, indexed workbooks.");
  }

  const isRecommendedCurriculum = input.isRecommendedCurriculum === true;
  const recommendedGradeLevel = isRecommendedCurriculum && input.recommendedGradeLevel != null
    ? normalizeGrade(input.recommendedGradeLevel)
    : null;
  if (isRecommendedCurriculum) {
    if (recommendedGradeLevel == null) throw new Error("Choose a grade for the recommended curriculum.");
    if (members.some((member) => member.type !== "core")) {
      throw new Error("A recommended curriculum bundle may contain only core workbooks.");
    }
    const languageFamilies = new Set(members.map((member) => member.languageCode.trim().toLowerCase().split(/[-_]/)[0]));
    if (languageFamilies.size !== 1) {
      throw new Error("A recommended curriculum bundle must use one language.");
    }
    if (members.some((member) => member.gradeMin > recommendedGradeLevel || member.gradeMax < recommendedGradeLevel)) {
      throw new Error("Every workbook in a recommended curriculum bundle must support the designated grade.");
    }
  }

  if (descriptionMode === "auto") {
    const gradeMin = Math.min(...members.map((member) => member.gradeMin));
    const gradeMax = Math.max(...members.map((member) => member.gradeMax));
    const subjects = Array.from(new Set(members.map((member) => member.subjectLabel)));
    const titles = workbookIds.map((id) => members.find((member) => member.id === id)?.title).filter(Boolean);
    const topics = Array.from(new Set(members.flatMap((member) => member.coverageTags))).slice(0, 6);
    description = `${workbookGradeLabel(gradeMin, gradeMax)} printable workbook bundle containing ${titles.join(", ")}. ${subjects.length === 1 ? `Builds a sequenced ${subjects[0]} curriculum` : `Covers ${subjects.join(", ")}`}${topics.length ? `, including ${topics.join(", ")}` : ""}.`;
  }

  const replacementThumbnailObjectPath = normalizeText(input.thumbnailObjectPath, 500) || null;
  const expectedThumbnailPrefix = `native-workbook-bundles/${existingBundle.id}/thumbnail/`;
  if (replacementThumbnailObjectPath && replacementThumbnailObjectPath !== existingBundle.thumbnailObjectPath) {
    if (!replacementThumbnailObjectPath.startsWith(expectedThumbnailPrefix)) {
      throw new Error("The replacement bundle thumbnail is invalid.");
    }
    const thumbnailMetadata = await getPrivateFileMetadata(replacementThumbnailObjectPath).catch(() => null);
    if (!thumbnailMetadata || thumbnailMetadata.size <= 0 || !["image/jpeg", "image/png", "image/webp"].includes(thumbnailMetadata.contentType)) {
      throw new Error("Upload a valid JPG, PNG, or WebP bundle thumbnail before saving.");
    }
  }
  const nextThumbnailObjectPath = replacementThumbnailObjectPath ?? existingBundle.thumbnailObjectPath;

  const priceChanged = existingBundle.priceInCents !== priceInCents;
  const currentMemberIds = existingBundle.memberWorkbookIds;
  const membersChanged = currentMemberIds.length !== workbookIds.length || currentMemberIds.some((id, index) => id !== workbookIds[index]);
  const productDetailsChanged = existingBundle.title !== title ||
    existingBundle.description !== description ||
    membersChanged ||
    existingBundle.isRecommendedCurriculum !== isRecommendedCurriculum ||
    existingBundle.recommendedGradeLevel !== recommendedGradeLevel;
  const needsStripeUpdate = Boolean(existingBundle.stripeProductId && (priceChanged || productDetailsChanged));
  if (needsStripeUpdate && !env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe must be configured before changing a published bundle's title, description, membership, or price.");
  }

  const stripe = needsStripeUpdate ? getStripe() : null;
  const newPrice = stripe && priceChanged && existingBundle.stripeProductId
    ? await stripe.prices.create({
        product: existingBundle.stripeProductId,
        currency: existingBundle.currencyCode.toLowerCase(),
        unit_amount: priceInCents,
        metadata: { nativeWorkbookBundleId: existingBundle.id }
      }, {
        idempotencyKey: `native-workbook-bundle-price:${existingBundle.id}:${existingBundle.stripePriceId ?? "none"}:${priceInCents}`
      })
    : null;

  const languageFamily = members[0]?.languageCode.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  const conflictingRecommendationIds = isRecommendedCurriculum && existingBundle.active
    ? (await loadBundleCatalogRows({ includeInactive: true, userId: input.userId }))
        .filter((candidate) => candidate.id !== existingBundle.id &&
          candidate.isRecommendedCurriculum &&
          candidate.recommendedGradeLevel === recommendedGradeLevel &&
          candidate.languageCode.trim().toLowerCase().split(/[-_]/)[0] === languageFamily)
        .map((candidate) => candidate.id)
    : [];

  try {
    if (stripe && existingBundle.stripeProductId) {
      await stripe.products.update(existingBundle.stripeProductId, {
        name: title,
        description,
        metadata: nativeWorkbookBundleStripeMetadata({
          id: existingBundle.id,
          memberCount: workbookIds.length,
          isRecommendedCurriculum,
          recommendedGradeLevel
        }),
        ...(newPrice ? { default_price: newPrice.id } : {})
      });
    }
    await db.transaction(async (tx) => {
      if (conflictingRecommendationIds.length) {
        await tx.update(nativeWorkbookBundles).set({
          isRecommendedCurriculum: false,
          recommendedGradeLevel: null,
          updatedAt: new Date()
        }).where(inArray(nativeWorkbookBundles.id, conflictingRecommendationIds));
      }
      await tx.update(nativeWorkbookBundles).set({
        title,
        description,
        priceInCents,
        thumbnailObjectPath: nextThumbnailObjectPath,
        isRecommendedCurriculum,
        recommendedGradeLevel,
        ...(newPrice ? { stripePriceId: newPrice.id } : {}),
        updatedAt: new Date()
      }).where(eq(nativeWorkbookBundles.id, existingBundle.id));
      await tx.delete(nativeWorkbookBundleItems).where(eq(nativeWorkbookBundleItems.bundleId, existingBundle.id));
      await tx.insert(nativeWorkbookBundleItems).values(workbookIds.map((workbookId, sortOrder) => ({
        bundleId: existingBundle.id,
        workbookId,
        sortOrder
      })));
    });
  } catch (error) {
    if (stripe && existingBundle.stripeProductId) {
      await stripe.products.update(existingBundle.stripeProductId, {
        name: existingBundle.title,
        description: existingBundle.description,
        metadata: nativeWorkbookBundleStripeMetadata(existingBundle),
        ...(newPrice && existingBundle.stripePriceId ? { default_price: existingBundle.stripePriceId } : {})
      }).catch(() => undefined);
      if (newPrice) await stripe.prices.update(newPrice.id, { active: false }).catch(() => undefined);
    }
    if (replacementThumbnailObjectPath && replacementThumbnailObjectPath !== existingBundle.thumbnailObjectPath) {
      await deletePrivateFile(replacementThumbnailObjectPath).catch(() => undefined);
    }
    throw error;
  }

  if (stripe && newPrice && existingBundle.stripePriceId && existingBundle.stripePriceId !== newPrice.id) {
    await stripe.prices.update(existingBundle.stripePriceId, { active: false }).catch((error) => {
      console.warn(`Could not retire previous Stripe bundle price ${existingBundle.stripePriceId}:`, error);
    });
  }
  if (replacementThumbnailObjectPath && replacementThumbnailObjectPath !== existingBundle.thumbnailObjectPath) {
    await deletePrivateFile(existingBundle.thumbnailObjectPath).catch((error) => {
      console.warn(`Could not remove previous bundle thumbnail ${existingBundle.thumbnailObjectPath}:`, error);
    });
  }
  return {
    bundleId: existingBundle.id,
    title,
    priceInCents,
    currencyCode: existingBundle.currencyCode,
    memberCount: workbookIds.length,
    stripeUpdated: needsStripeUpdate
  };
}

export async function discardNativeWorkbookBundle(input: { userId: string; bundleId: string }) {
  await requireAdmin(input.userId);
  const [bundle] = await db.select({ thumbnailObjectPath: nativeWorkbookBundles.thumbnailObjectPath })
    .from(nativeWorkbookBundles).where(eq(nativeWorkbookBundles.id, input.bundleId)).limit(1);
  if (!bundle) return { discarded: false };
  await db.delete(nativeWorkbookBundles).where(eq(nativeWorkbookBundles.id, input.bundleId));
  await deletePrivateFile(bundle.thumbnailObjectPath).catch(() => undefined);
  return { discarded: true };
}

export async function setNativeWorkbookBundlePublished(input: { userId: string; bundleId: string; active: boolean }) {
  await requireAdmin(input.userId);
  let restoreRecommendation = false;
  let restoredGradeLevel: number | null = null;
  if (input.active) {
    const bundle = (await loadBundleCatalogRows({ includeInactive: true, userId: input.userId }))
      .find((candidate) => candidate.id === input.bundleId);
    if (!bundle || bundle.members.length < 2) throw new Error("Workbook bundle not found.");
    const activeMembers = await db.select({ value: sql<number>`count(*)::integer` })
      .from(nativeWorkbooks)
      .where(and(
        inArray(nativeWorkbooks.id, bundle.memberWorkbookIds),
        eq(nativeWorkbooks.active, true),
        eq(nativeWorkbooks.status, "published")
      ));
    if (Number(activeMembers[0]?.value ?? 0) !== bundle.memberCount) {
      throw new Error("Republish every workbook in this bundle before showing the bundle.");
    }
    restoreRecommendation = bundle.isRecommendedCurriculum;
    restoredGradeLevel = bundle.recommendedGradeLevel;
  }
  await db.update(nativeWorkbookBundles).set({ active: input.active, updatedAt: new Date() })
    .where(eq(nativeWorkbookBundles.id, input.bundleId));
  if (input.active && restoreRecommendation) {
    await setNativeWorkbookBundleRecommended({
      userId: input.userId,
      bundleId: input.bundleId,
      isRecommendedCurriculum: true,
      recommendedGradeLevel: restoredGradeLevel
    });
  }
  return { active: input.active };
}

export async function setNativeWorkbookBundleRecommended(input: {
  userId: string;
  bundleId: string;
  isRecommendedCurriculum: boolean;
  recommendedGradeLevel?: number | null;
}) {
  await requireAdmin(input.userId);
  if (!input.isRecommendedCurriculum) {
    await db.update(nativeWorkbookBundles).set({
      isRecommendedCurriculum: false,
      recommendedGradeLevel: null,
      updatedAt: new Date()
    }).where(eq(nativeWorkbookBundles.id, input.bundleId));
    return { isRecommendedCurriculum: false, recommendedGradeLevel: null };
  }

  const bundles = await loadBundleCatalogRows({ includeInactive: true, userId: input.userId });
  const bundle = bundles.find((candidate) => candidate.id === input.bundleId);
  if (!bundle) throw new Error("Workbook bundle not found.");
  if (!bundle.active) throw new Error("Publish this bundle before making it a recommended curriculum.");
  if (bundle.type !== "core") {
    throw new Error("A recommended curriculum bundle may contain only core workbooks.");
  }
  if (bundle.languageCode === "multi") {
    throw new Error("A recommended curriculum bundle must use one language.");
  }
  const recommendedGradeLevel = normalizeGrade(input.recommendedGradeLevel);
  if (bundle.members.some((member) => member.gradeMin > recommendedGradeLevel || member.gradeMax < recommendedGradeLevel)) {
    throw new Error("Every workbook in a recommended curriculum bundle must support the designated grade.");
  }

  const languageFamily = bundle.languageCode.trim().toLowerCase().split(/[-_]/)[0];
  const conflictingIds = bundles
    .filter((candidate) => {
      const candidateGradeMin = Math.max(...candidate.members.map((member) => member.gradeMin));
      const candidateGradeMax = Math.min(...candidate.members.map((member) => member.gradeMax));
      return candidate.id !== bundle.id &&
        candidate.isRecommendedCurriculum &&
        candidate.recommendedGradeLevel === recommendedGradeLevel &&
        candidate.languageCode.trim().toLowerCase().split(/[-_]/)[0] === languageFamily &&
        candidateGradeMin <= recommendedGradeLevel &&
        candidateGradeMax >= recommendedGradeLevel;
    })
    .map((candidate) => candidate.id);

  await db.transaction(async (tx) => {
    if (conflictingIds.length) {
      await tx.update(nativeWorkbookBundles).set({
        isRecommendedCurriculum: false,
        recommendedGradeLevel: null,
        updatedAt: new Date()
      }).where(inArray(nativeWorkbookBundles.id, conflictingIds));
    }
    await tx.update(nativeWorkbookBundles).set({
      isRecommendedCurriculum: true,
      recommendedGradeLevel,
      updatedAt: new Date()
    }).where(eq(nativeWorkbookBundles.id, bundle.id));
  });
  return { isRecommendedCurriculum: true, recommendedGradeLevel };
}

export async function prepareNativeWorkbookUpload(input: {
  userId: string;
  title: string;
  subject?: string;
  curriculumSubjectId?: string | null;
  addSubjectToTaxonomy?: boolean;
  curriculumAreaKey: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  descriptionMode?: "auto" | "custom";
  description: string;
  type: WorkbookType;
  priceInCents: number;
  currencyCode?: string;
  coverageTags?: string[] | string;
  prerequisiteWorkbookId?: string | null;
  editionLabel: string;
  pdfFilename: string;
  pdfMimeType?: string;
  studioArtifact?: WorkbookStudioArtifact;
}) {
  await requireAdmin(input.userId);
  const title = normalizeText(input.title, 180);
  const curriculumAreaKey = normalizeCurriculumAreaKey(input.curriculumAreaKey);
  const descriptionMode = input.descriptionMode === "custom" ? "custom" : "auto";
  const description = normalizeText(input.description, 3_000);
  if (!title) throw new Error("Title is required.");
  if (descriptionMode === "custom" && !description) throw new Error("Write a custom description or choose auto-generate.");
  const gradeMin = normalizeGrade(input.gradeMin);
  const gradeMax = normalizeGrade(input.gradeMax);
  if (gradeMax < gradeMin) throw new Error("The ending grade cannot be lower than the starting grade.");
  const type = normalizeWorkbookType(input.type);
  const priceInCents = normalizePrice(input.priceInCents);
  const languageCode = normalizeText(input.languageCode || "en", 12).toLowerCase();
  const currencyCode = normalizeText(input.currencyCode || "USD", 3).toUpperCase();
  const prerequisiteWorkbookId = normalizeOptionalUuid(input.prerequisiteWorkbookId);
  const editionLabel = normalizeText(input.editionLabel, 80);
  if (!editionLabel) throw new Error("Edition is required.");
  const pdfMimeType = input.pdfMimeType || "application/pdf";
  if (pdfMimeType !== "application/pdf" && !input.pdfFilename.toLowerCase().endsWith(".pdf")) {
    throw new Error("The workbook must be a PDF file.");
  }
  if (prerequisiteWorkbookId) {
    const [prerequisite] = await db.select({ id: nativeWorkbooks.id })
      .from(nativeWorkbooks)
      .where(eq(nativeWorkbooks.id, prerequisiteWorkbookId))
      .limit(1);
    if (!prerequisite) throw new Error("The selected prerequisite workbook no longer exists.");
  }
  const subject = await resolveCurriculumSubjectSelection({
    userId: input.userId,
    curriculumAreaKey,
    curriculumSubjectId: input.curriculumSubjectId,
    subject: input.subject,
    addSubjectToTaxonomy: input.addSubjectToTaxonomy
  });

  const workbookId = randomUUID();
  const editionId = randomUUID();
  const versionId = randomUUID();
  const slugBase = buildWorkbookSlugBase({ title, gradeMin, gradeMax, languageCode, type });
  const [[workbookSlugCollision], [bundleSlugCollision]] = await Promise.all([
    db.select({ id: nativeWorkbooks.id }).from(nativeWorkbooks)
      .where(eq(nativeWorkbooks.slug, slugBase)).limit(1),
    db.select({ id: nativeWorkbookBundles.id }).from(nativeWorkbookBundles)
      .where(eq(nativeWorkbookBundles.slug, slugBase)).limit(1)
  ]);
  const slug = workbookSlugCollision || bundleSlugCollision ? `${slugBase}-${workbookId.slice(0, 8)}` : slugBase;
  const objectPath = `native-workbooks/${workbookId}/versions/${versionId}/${safeFilename(input.pdfFilename, "workbook.pdf")}`;
  const thumbnailObjectPath = `native-workbooks/${workbookId}/thumbnail/generated-cover.png`;

  await db.transaction(async (tx) => {
    await tx.insert(nativeWorkbooks).values({
      id: workbookId,
      slug,
      title,
      curriculumSubjectId: subject.curriculumSubjectId,
      subjectKey: subject.subjectKey,
      subjectLabel: subject.subjectLabel,
      curriculumAreaKey,
      gradeMin,
      gradeMax,
      languageCode,
      description,
      coverageTags: normalizeTags(input.coverageTags),
      type,
      priceInCents,
      currencyCode,
      thumbnailObjectPath,
      prerequisiteWorkbookId,
      status: "awaiting_upload",
      active: false,
      createdByUserId: input.userId
    });
    await tx.insert(nativeWorkbookEditions).values({
      id: editionId,
      workbookId,
      editionNumber: 1,
      editionLabel,
      status: "draft",
      themeVersionId: input.studioArtifact?.themeVersionId ?? null,
      createdByUserId: input.userId
    });
    await tx.insert(nativeWorkbookVersions).values({
      id: versionId,
      workbookId,
      versionNumber: 1,
      editionId,
      revisionNumber: 1,
      editionLabel,
      releaseStatus: "draft",
      originalFilename: normalizeText(input.pdfFilename, 240),
      objectPath,
      mimeType: "application/pdf",
      sizeBytes: 1,
      pageCount: 0,
      analysisStatus: "awaiting_upload",
      analysisJson: {
        descriptionMode,
        ...(input.studioArtifact ? {
          studioRelease: {
            projectId: input.studioArtifact.projectId,
            autoPublish: input.studioArtifact.autoPublish === true,
            requestedByUserId: input.userId
          }
        } : {})
      },
      artifactSource: input.studioArtifact ? "workbook_studio" : "uploaded_pdf",
      workbookContentRevisionId: input.studioArtifact?.contentRevisionId ?? null,
      workbookRenderRunId: input.studioArtifact?.renderRunId ?? null,
      createdByUserId: input.userId
    });
  });

  try {
    const pdfUploadUrl = await getSignedPrivateUploadUrl({ objectPath, contentType: "application/pdf", expiresInMinutes: 30 });
    return { workbookId, versionId, objectPath, pdfUploadUrl };
  } catch (error) {
    await db.delete(nativeWorkbooks).where(eq(nativeWorkbooks.id, workbookId)).catch(() => undefined);
    throw error;
  }
}

export async function completeNativeWorkbookUpload(input: {
  userId: string;
  workbookId: string;
  versionId: string;
}) {
  await requireAdmin(input.userId);
  const [row] = await db
    .select({
      workbookId: nativeWorkbooks.id,
      versionId: nativeWorkbookVersions.id,
      objectPath: nativeWorkbookVersions.objectPath
    })
    .from(nativeWorkbooks)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.workbookId, nativeWorkbooks.id))
    .where(and(eq(nativeWorkbooks.id, input.workbookId), eq(nativeWorkbookVersions.id, input.versionId)))
    .limit(1);
  if (!row) throw new Error("Workbook upload was not found.");
  const pdfMetadata = await getPrivateFileMetadata(row.objectPath);
  if (!pdfMetadata.contentType.includes("pdf")) throw new Error("The uploaded workbook is not a PDF.");
  if (pdfMetadata.size <= 0) throw new Error("The uploaded workbook is empty.");

  await db.transaction(async (tx) => {
    await tx.update(nativeWorkbookVersions).set({
      sizeBytes: pdfMetadata.size,
      mimeType: pdfMetadata.contentType,
      analysisStatus: "queued",
      lastError: null
    }).where(eq(nativeWorkbookVersions.id, row.versionId));
    await tx.insert(nativeWorkbookJobs).values({ workbookVersionId: row.versionId, status: "queued" })
      .onConflictDoUpdate({
        target: nativeWorkbookJobs.workbookVersionId,
        set: {
          status: "queued",
          attemptCount: 0,
          availableAt: new Date(),
          claimedAt: null,
          heartbeatAt: null,
          workerId: null,
          lastError: null,
          updatedAt: new Date()
        }
      });
    await tx.update(nativeWorkbooks).set({ status: "indexing", updatedAt: new Date() })
      .where(eq(nativeWorkbooks.id, row.workbookId));
  });
  return { queued: true, workbookId: row.workbookId, versionId: row.versionId };
}

export async function discardNativeWorkbookUpload(input: {
  userId: string;
  workbookId: string;
  versionId: string;
}) {
  await requireAdmin(input.userId);
  const [row] = await db
    .select({
      workbookId: nativeWorkbooks.id,
      thumbnailObjectPath: nativeWorkbooks.thumbnailObjectPath,
      objectPath: nativeWorkbookVersions.objectPath
    })
    .from(nativeWorkbooks)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.workbookId, nativeWorkbooks.id))
    .where(and(
      eq(nativeWorkbooks.id, input.workbookId),
      eq(nativeWorkbookVersions.id, input.versionId),
      eq(nativeWorkbooks.status, "awaiting_upload")
    ))
    .limit(1);

  if (!row) return { discarded: false };

  await Promise.all([
    deletePrivateFile(row.objectPath),
    deletePrivateFile(row.thumbnailObjectPath)
  ]);
  await db.delete(nativeWorkbooks).where(and(
    eq(nativeWorkbooks.id, row.workbookId),
    eq(nativeWorkbooks.status, "awaiting_upload")
  ));
  return { discarded: true };
}

export async function prepareNativeWorkbookReplacement(input: {
  userId: string;
  workbookId: string;
  pdfFilename: string;
  pdfMimeType?: string;
  studioArtifact?: WorkbookStudioArtifact;
}) {
  await requireAdmin(input.userId);
  const pdfMimeType = input.pdfMimeType || "application/pdf";
  if (pdfMimeType !== "application/pdf" && !input.pdfFilename.toLowerCase().endsWith(".pdf")) {
    throw new Error("The replacement file must be a PDF.");
  }
  const [workbook] = await db
    .select({
      id: nativeWorkbooks.id,
      status: nativeWorkbooks.status,
      active: nativeWorkbooks.active,
      activeVersionId: nativeWorkbooks.activeVersionId
    })
    .from(nativeWorkbooks)
    .where(eq(nativeWorkbooks.id, input.workbookId))
    .limit(1);
  if (!workbook) throw new Error("Workbook not found.");
  if (!workbook.activeVersionId) {
    throw new Error("Index and publish this workbook before replacing its PDF.");
  }
  const [[latestVersion], [activeVersion]] = await Promise.all([
    db.select({
      id: nativeWorkbookVersions.id,
      versionNumber: nativeWorkbookVersions.versionNumber,
      objectPath: nativeWorkbookVersions.objectPath,
      analysisStatus: nativeWorkbookVersions.analysisStatus,
      analysisJson: nativeWorkbookVersions.analysisJson
    }).from(nativeWorkbookVersions)
      .where(eq(nativeWorkbookVersions.workbookId, workbook.id))
      .orderBy(desc(nativeWorkbookVersions.versionNumber))
      .limit(1),
    db.select({
      id: nativeWorkbookVersions.id,
      versionNumber: nativeWorkbookVersions.versionNumber,
      editionId: nativeWorkbookVersions.editionId,
      revisionNumber: nativeWorkbookVersions.revisionNumber,
      editionLabel: nativeWorkbookVersions.editionLabel,
      pageCount: nativeWorkbookVersions.pageCount,
      analysisStatus: nativeWorkbookVersions.analysisStatus,
      analysisJson: nativeWorkbookVersions.analysisJson,
      workbookContentRevisionId: nativeWorkbookVersions.workbookContentRevisionId
    }).from(nativeWorkbookVersions)
      .where(eq(nativeWorkbookVersions.id, workbook.activeVersionId))
      .limit(1)
  ]);
  if (!latestVersion || !activeVersion) throw new Error("The published workbook edition could not be found.");
  if (activeVersion.analysisStatus !== "ready" || activeVersion.pageCount < 1) {
    throw new Error("The published workbook must have a complete lesson index before its PDF can be replaced.");
  }
  if (["awaiting_upload", "queued", "analyzing"].includes(latestVersion.analysisStatus)) {
    throw new Error("Wait for the current workbook indexing to finish before replacing its PDF.");
  }
  if (
    readWorkbookReplacementState(latestVersion.analysisJson) &&
    !["failed", "rejected"].includes(latestVersion.analysisStatus)
  ) {
    throw new Error("A replacement PDF is already being processed for this workbook.");
  }
  assertNativeWorkbookCanBeReplaced(await getNativeWorkbookUsage(workbook.id));
  const staleReplacement = readWorkbookReplacementState(latestVersion.analysisJson);
  if (staleReplacement && ["failed", "rejected"].includes(latestVersion.analysisStatus)) {
    await db.delete(nativeWorkbookVersions).where(eq(nativeWorkbookVersions.id, latestVersion.id));
    await deletePrivateFile(latestVersion.objectPath).catch((error) => {
      console.warn(`Could not delete superseded replacement upload ${latestVersion.objectPath}:`, error);
    });
  }

  const versionId = randomUUID();
  const objectPath = `native-workbooks/${workbook.id}/versions/${versionId}/${safeFilename(input.pdfFilename, "workbook.pdf")}`;
  const descriptionMode = activeVersion.analysisJson?.descriptionMode === "auto" ? "auto" : "custom";
  const replacement: WorkbookReplacementState = {
    previousVersionId: activeVersion.id,
    restoreStatus: workbook.status,
    restoreActive: workbook.active,
    requiresCompatibilityCheck: true,
    expectedPageCount: input.studioArtifact ? undefined : activeVersion.pageCount,
    compatibilityMode: input.studioArtifact ? "lesson_ids" : "pdf_structure"
  };
  if (input.studioArtifact && !activeVersion.workbookContentRevisionId) {
    throw new Error("The published workbook is not a structured Studio release; create a new edition instead.");
  }

  await db.insert(nativeWorkbookVersions).values({
    id: versionId,
    workbookId: workbook.id,
    versionNumber: latestVersion.versionNumber + 1,
    editionId: activeVersion.editionId,
    revisionNumber: activeVersion.revisionNumber + 1,
    editionLabel: activeVersion.editionLabel,
    releaseStatus: "draft",
    supersedesVersionId: activeVersion.id,
    originalFilename: normalizeText(input.pdfFilename, 240),
    objectPath,
    mimeType: "application/pdf",
    sizeBytes: 1,
    pageCount: 0,
    analysisStatus: "awaiting_upload",
    analysisJson: {
      descriptionMode,
      replacement,
      ...(input.studioArtifact ? {
        studioRelease: {
          projectId: input.studioArtifact.projectId,
          autoPublish: true,
          requestedByUserId: input.userId
        }
      } : {})
    },
    artifactSource: input.studioArtifact ? "workbook_studio" : "uploaded_pdf",
    workbookContentRevisionId: input.studioArtifact?.contentRevisionId ?? null,
    workbookRenderRunId: input.studioArtifact?.renderRunId ?? null,
    createdByUserId: input.userId
  });
  await db.update(nativeWorkbookVersions).set({ lastError: null })
    .where(eq(nativeWorkbookVersions.id, activeVersion.id));

  try {
    const pdfUploadUrl = await getSignedPrivateUploadUrl({
      objectPath,
      contentType: "application/pdf",
      expiresInMinutes: 30
    });
    return { workbookId: workbook.id, versionId, objectPath, pdfUploadUrl };
  } catch (error) {
    await db.delete(nativeWorkbookVersions).where(eq(nativeWorkbookVersions.id, versionId))
      .catch(() => undefined);
    throw error;
  }
}

export async function completeNativeWorkbookReplacement(input: {
  userId: string;
  workbookId: string;
  versionId: string;
}) {
  await requireAdmin(input.userId);
  const [row] = await db
    .select({
      workbookId: nativeWorkbooks.id,
      workbookStatus: nativeWorkbooks.status,
      versionId: nativeWorkbookVersions.id,
      objectPath: nativeWorkbookVersions.objectPath,
      analysisStatus: nativeWorkbookVersions.analysisStatus,
      analysisJson: nativeWorkbookVersions.analysisJson
    })
    .from(nativeWorkbooks)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.workbookId, nativeWorkbooks.id))
    .where(and(
      eq(nativeWorkbooks.id, input.workbookId),
      eq(nativeWorkbookVersions.id, input.versionId)
    ))
    .limit(1);
  if (!row
    || row.analysisStatus !== "awaiting_upload"
    || !readWorkbookReplacementState(row.analysisJson)) {
    throw new Error("The replacement upload is no longer available.");
  }
  assertNativeWorkbookCanBeReplaced(await getNativeWorkbookUsage(row.workbookId));
  const pdfMetadata = await getPrivateFileMetadata(row.objectPath);
  if (!pdfMetadata.contentType.includes("pdf")) throw new Error("The uploaded replacement is not a PDF.");
  if (pdfMetadata.size <= 0) throw new Error("The uploaded replacement is empty.");

  await db.transaction(async (tx) => {
    await tx.update(nativeWorkbookVersions).set({
      sizeBytes: pdfMetadata.size,
      mimeType: pdfMetadata.contentType,
      analysisStatus: "queued",
      lastError: null
    }).where(eq(nativeWorkbookVersions.id, row.versionId));
    await tx.insert(nativeWorkbookJobs).values({ workbookVersionId: row.versionId, status: "queued" })
      .onConflictDoUpdate({
        target: nativeWorkbookJobs.workbookVersionId,
        set: {
          status: "queued",
          attemptCount: 0,
          availableAt: new Date(),
          claimedAt: null,
          heartbeatAt: null,
          workerId: null,
          lastError: null,
          updatedAt: new Date()
        }
      });
  });
  return { queued: true, workbookId: row.workbookId, versionId: row.versionId };
}

export async function prepareNativeWorkbookEdition(input: {
  userId: string;
  workbookId: string;
  editionLabel: string;
  changeNotes?: string | null;
  pdfFilename: string;
  pdfMimeType?: string;
  studioArtifact?: WorkbookStudioArtifact;
}) {
  await requireAdmin(input.userId);
  const editionLabel = normalizeText(input.editionLabel, 80);
  const changeNotes = normalizeText(input.changeNotes ?? "", 2_000) || null;
  if (!editionLabel) throw new Error("Edition is required.");
  const pdfMimeType = input.pdfMimeType || "application/pdf";
  if (pdfMimeType !== "application/pdf" && !input.pdfFilename.toLowerCase().endsWith(".pdf")) {
    throw new Error("The new edition must be a PDF.");
  }
  const [workbook] = await db.select({
    id: nativeWorkbooks.id,
    activeVersionId: nativeWorkbooks.activeVersionId
  }).from(nativeWorkbooks).where(eq(nativeWorkbooks.id, input.workbookId)).limit(1);
  if (!workbook?.activeVersionId) {
    throw new Error("Publish the current edition before adding a new edition.");
  }
  const [[activeVersion], [latestVersion], [latestEdition], [pendingEdition]] = await Promise.all([
    db.select({
      id: nativeWorkbookVersions.id,
      editionId: nativeWorkbookVersions.editionId,
      analysisJson: nativeWorkbookVersions.analysisJson
    }).from(nativeWorkbookVersions)
      .where(eq(nativeWorkbookVersions.id, workbook.activeVersionId))
      .limit(1),
    db.select({ versionNumber: nativeWorkbookVersions.versionNumber })
      .from(nativeWorkbookVersions)
      .where(eq(nativeWorkbookVersions.workbookId, workbook.id))
      .orderBy(desc(nativeWorkbookVersions.versionNumber))
      .limit(1),
    db.select({ editionNumber: nativeWorkbookEditions.editionNumber })
      .from(nativeWorkbookEditions)
      .where(eq(nativeWorkbookEditions.workbookId, workbook.id))
      .orderBy(desc(nativeWorkbookEditions.editionNumber))
      .limit(1),
    db.select({ id: nativeWorkbookEditions.id })
      .from(nativeWorkbookEditions)
      .where(and(
        eq(nativeWorkbookEditions.workbookId, workbook.id),
        eq(nativeWorkbookEditions.status, "draft")
      ))
      .limit(1)
  ]);
  if (!activeVersion) throw new Error("The published workbook edition could not be found.");
  if (pendingEdition) throw new Error("Finish or discard the current draft edition before adding another.");

  const editionId = randomUUID();
  const versionId = randomUUID();
  const objectPath =
    `native-workbooks/${workbook.id}/editions/${editionId}/revisions/${versionId}/${safeFilename(input.pdfFilename, "workbook.pdf")}`;
  const descriptionMode = activeVersion.analysisJson?.descriptionMode === "auto" ? "auto" : "custom";
  await db.transaction(async (tx) => {
    await tx.insert(nativeWorkbookEditions).values({
      id: editionId,
      workbookId: workbook.id,
      editionNumber: (latestEdition?.editionNumber ?? 0) + 1,
      editionLabel,
      status: "draft",
      themeVersionId: input.studioArtifact?.themeVersionId ?? null,
      changeNotes,
      createdByUserId: input.userId
    });
    await tx.insert(nativeWorkbookVersions).values({
      id: versionId,
      workbookId: workbook.id,
      versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
      editionId,
      revisionNumber: 1,
      editionLabel,
      releaseStatus: "draft",
      supersedesVersionId: activeVersion.id,
      changeNotes,
      originalFilename: normalizeText(input.pdfFilename, 240),
      objectPath,
      mimeType: "application/pdf",
      sizeBytes: 1,
      pageCount: 0,
      analysisStatus: "awaiting_upload",
      analysisJson: {
        descriptionMode,
        editionRelease: {
          previousVersionId: activeVersion.id,
          previousEditionId: activeVersion.editionId
        } satisfies WorkbookEditionReleaseState,
        ...(input.studioArtifact ? {
          studioRelease: {
            projectId: input.studioArtifact.projectId,
            autoPublish: input.studioArtifact.autoPublish === true,
            requestedByUserId: input.userId
          }
        } : {})
      },
      artifactSource: input.studioArtifact ? "workbook_studio" : "uploaded_pdf",
      workbookContentRevisionId: input.studioArtifact?.contentRevisionId ?? null,
      workbookRenderRunId: input.studioArtifact?.renderRunId ?? null,
      createdByUserId: input.userId
    });
  });
  try {
    const pdfUploadUrl = await getSignedPrivateUploadUrl({
      objectPath,
      contentType: "application/pdf",
      expiresInMinutes: 30
    });
    return { workbookId: workbook.id, editionId, versionId, objectPath, pdfUploadUrl };
  } catch (error) {
    await db.delete(nativeWorkbookVersions).where(eq(nativeWorkbookVersions.id, versionId)).catch(() => undefined);
    await db.delete(nativeWorkbookEditions).where(eq(nativeWorkbookEditions.id, editionId)).catch(() => undefined);
    throw error;
  }
}

export async function completeNativeWorkbookEdition(input: {
  userId: string;
  workbookId: string;
  versionId: string;
}) {
  await requireAdmin(input.userId);
  const [row] = await db.select({
    workbookId: nativeWorkbookVersions.workbookId,
    versionId: nativeWorkbookVersions.id,
    objectPath: nativeWorkbookVersions.objectPath,
    analysisStatus: nativeWorkbookVersions.analysisStatus,
    analysisJson: nativeWorkbookVersions.analysisJson
  }).from(nativeWorkbookVersions).where(and(
    eq(nativeWorkbookVersions.id, input.versionId),
    eq(nativeWorkbookVersions.workbookId, input.workbookId)
  )).limit(1);
  if (!row || row.analysisStatus !== "awaiting_upload" || !readWorkbookEditionReleaseState(row.analysisJson)) {
    throw new Error("The new-edition upload is no longer available.");
  }
  const pdfMetadata = await getPrivateFileMetadata(row.objectPath);
  if (!pdfMetadata.contentType.includes("pdf")) throw new Error("The uploaded edition is not a PDF.");
  if (pdfMetadata.size <= 0) throw new Error("The uploaded edition is empty.");
  await db.transaction(async (tx) => {
    await tx.update(nativeWorkbookVersions).set({
      sizeBytes: pdfMetadata.size,
      mimeType: pdfMetadata.contentType,
      analysisStatus: "queued",
      lastError: null
    }).where(eq(nativeWorkbookVersions.id, row.versionId));
    await tx.insert(nativeWorkbookJobs).values({ workbookVersionId: row.versionId, status: "queued" })
      .onConflictDoUpdate({
        target: nativeWorkbookJobs.workbookVersionId,
        set: {
          status: "queued",
          attemptCount: 0,
          availableAt: new Date(),
          claimedAt: null,
          heartbeatAt: null,
          workerId: null,
          lastError: null,
          updatedAt: new Date()
        }
      });
  });
  return { queued: true, workbookId: row.workbookId, versionId: row.versionId };
}

export async function discardNativeWorkbookEdition(input: {
  userId: string;
  workbookId: string;
  versionId: string;
}) {
  await requireAdmin(input.userId);
  const [row] = await db.select({
    versionId: nativeWorkbookVersions.id,
    editionId: nativeWorkbookVersions.editionId,
    objectPath: nativeWorkbookVersions.objectPath,
    analysisStatus: nativeWorkbookVersions.analysisStatus,
    releaseStatus: nativeWorkbookVersions.releaseStatus
  }).from(nativeWorkbookVersions).where(and(
    eq(nativeWorkbookVersions.id, input.versionId),
    eq(nativeWorkbookVersions.workbookId, input.workbookId)
  )).limit(1);
  if (!row || row.releaseStatus !== "draft" || !["awaiting_upload", "failed"].includes(row.analysisStatus)) {
    return { discarded: false };
  }
  await db.transaction(async (tx) => {
    await tx.delete(nativeWorkbookJobs).where(eq(nativeWorkbookJobs.workbookVersionId, row.versionId));
    await tx.delete(nativeWorkbookVersions).where(eq(nativeWorkbookVersions.id, row.versionId));
    await tx.delete(nativeWorkbookEditions).where(eq(nativeWorkbookEditions.id, row.editionId));
  });
  await deletePrivateFile(row.objectPath).catch(() => undefined);
  return { discarded: true };
}

export async function discardNativeWorkbookReplacement(input: {
  userId: string;
  workbookId: string;
  versionId: string;
}) {
  await requireAdmin(input.userId);
  const [row] = await db
    .select({
      workbookId: nativeWorkbooks.id,
      workbookStatus: nativeWorkbooks.status,
      objectPath: nativeWorkbookVersions.objectPath,
      analysisStatus: nativeWorkbookVersions.analysisStatus,
      analysisJson: nativeWorkbookVersions.analysisJson
    })
    .from(nativeWorkbooks)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.workbookId, nativeWorkbooks.id))
    .where(and(
      eq(nativeWorkbooks.id, input.workbookId),
      eq(nativeWorkbookVersions.id, input.versionId)
    ))
    .limit(1);
  const replacement = readWorkbookReplacementState(row?.analysisJson);
  if (!row || !replacement || row.analysisStatus !== "awaiting_upload") {
    return { discarded: false };
  }
  await deletePrivateFile(row.objectPath).catch(() => undefined);
  await db.delete(nativeWorkbookVersions).where(eq(nativeWorkbookVersions.id, input.versionId));
  return { discarded: true };
}

export async function retryNativeWorkbookIndexing(input: { userId: string; workbookId: string }) {
  await requireAdmin(input.userId);
  const [version] = await db
    .select({
      id: nativeWorkbookVersions.id,
      analysisJson: nativeWorkbookVersions.analysisJson,
      activeVersionId: nativeWorkbooks.activeVersionId,
      workbookStatus: nativeWorkbooks.status,
      workbookActive: nativeWorkbooks.active
    })
    .from(nativeWorkbookVersions)
    .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookVersions.workbookId))
    .where(eq(nativeWorkbookVersions.workbookId, input.workbookId))
    .orderBy(desc(nativeWorkbookVersions.versionNumber))
    .limit(1);
  if (!version) throw new Error("Workbook version not found.");
  const shouldRestorePublishedState = version.activeVersionId === version.id && version.workbookActive;
  const analysisJson = version.analysisJson && typeof version.analysisJson === "object"
    ? version.analysisJson
    : {};
  const replacement = readWorkbookReplacementState(analysisJson);
  await db.transaction(async (tx) => {
    await tx.update(nativeWorkbookVersions).set({
      analysisStatus: "queued",
      lastError: null,
      ...(shouldRestorePublishedState ? {
        analysisJson: {
          ...analysisJson,
          replacement: {
            previousVersionId: version.id,
            restoreStatus: version.workbookStatus,
            restoreActive: true
          } satisfies WorkbookReplacementState
        }
      } : {})
    })
      .where(eq(nativeWorkbookVersions.id, version.id));
    await tx.insert(nativeWorkbookJobs).values({ workbookVersionId: version.id, status: "queued" })
      .onConflictDoUpdate({
        target: nativeWorkbookJobs.workbookVersionId,
        set: { status: "queued", attemptCount: 0, availableAt: new Date(), lastError: null, workerId: null, updatedAt: new Date() }
      });
    await tx.update(nativeWorkbooks).set({
      ...(replacement ? {} : { status: "indexing" }),
      updatedAt: new Date()
    }).where(eq(nativeWorkbooks.id, input.workbookId));
  });
  return { queued: true };
}

export async function publishNativeWorkbook(input: { userId: string; workbookId: string }) {
  await requireAdmin(input.userId);
  const [row] = await db
    .select({
      id: nativeWorkbooks.id,
      title: nativeWorkbooks.title,
      subjectLabel: nativeWorkbooks.subjectLabel,
      curriculumAreaKey: nativeWorkbooks.curriculumAreaKey,
      gradeMin: nativeWorkbooks.gradeMin,
      gradeMax: nativeWorkbooks.gradeMax,
      languageCode: nativeWorkbooks.languageCode,
      description: nativeWorkbooks.description,
      coverageTags: nativeWorkbooks.coverageTags,
      type: nativeWorkbooks.type,
      prerequisiteWorkbookId: nativeWorkbooks.prerequisiteWorkbookId,
      priceInCents: nativeWorkbooks.priceInCents,
      currencyCode: nativeWorkbooks.currencyCode,
      stripeProductId: nativeWorkbooks.stripeProductId,
      stripePriceId: nativeWorkbooks.stripePriceId,
      versionId: nativeWorkbookVersions.id,
      editionId: nativeWorkbookVersions.editionId,
      analysisJson: nativeWorkbookVersions.analysisJson,
      analysisStatus: nativeWorkbookVersions.analysisStatus
    })
    .from(nativeWorkbooks)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.workbookId, nativeWorkbooks.id))
    .where(eq(nativeWorkbooks.id, input.workbookId))
    .orderBy(desc(nativeWorkbookVersions.versionNumber))
    .limit(1);
  if (!row) throw new Error("Workbook not found.");
  if (row.analysisStatus !== "ready") throw new Error("Wait for indexing to finish before publishing.");

  let stripeProductId = row.stripeProductId;
  let stripePriceId = row.stripePriceId;
  if ((!stripeProductId || !stripePriceId) && env.STRIPE_SECRET_KEY) {
    const stripe = getStripe();
    const product = await stripe.products.create({
      name: row.title,
      description: row.description,
      metadata: nativeWorkbookStripeMetadata(row)
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: row.currencyCode.toLowerCase(),
      unit_amount: row.priceInCents
    });
    stripeProductId = product.id;
    stripePriceId = price.id;
  }

  await db.transaction(async (tx) => {
    const publishedAt = new Date();
    const [previous] = await tx.select({
      versionId: nativeWorkbooks.activeVersionId,
      editionId: nativeWorkbooks.latestEditionId
    }).from(nativeWorkbooks).where(eq(nativeWorkbooks.id, row.id)).limit(1);
    if (previous?.versionId && previous.versionId !== row.versionId) {
      await tx.update(nativeWorkbookVersions).set({ releaseStatus: "superseded" })
        .where(eq(nativeWorkbookVersions.id, previous.versionId));
    }
    if (previous?.editionId && previous.editionId !== row.editionId) {
      await tx.update(nativeWorkbookEditions).set({
        status: "superseded",
        updatedAt: publishedAt
      }).where(eq(nativeWorkbookEditions.id, previous.editionId));
    }
    await tx.update(nativeWorkbookVersions).set({
      publishedAt,
      releaseStatus: "published"
    })
      .where(eq(nativeWorkbookVersions.id, row.versionId));
    await tx.update(nativeWorkbookEditions).set({
      currentRevisionId: row.versionId,
      status: "published",
      publishedAt,
      updatedAt: publishedAt
    }).where(eq(nativeWorkbookEditions.id, row.editionId));
    await tx.update(nativeWorkbooks).set({
      activeVersionId: row.versionId,
      latestEditionId: row.editionId,
      ...(typeof row.analysisJson.catalogDescription === "string"
        ? { description: row.analysisJson.catalogDescription }
        : {}),
      ...(typeof row.analysisJson.generatedThumbnailObjectPath === "string"
        ? { thumbnailObjectPath: row.analysisJson.generatedThumbnailObjectPath }
        : {}),
      stripeProductId,
      stripePriceId,
      status: "published",
      active: true,
      updatedAt: new Date()
    }).where(eq(nativeWorkbooks.id, row.id));
  });
  return { published: true };
}

export async function setNativeWorkbookPublished(input: { userId: string; workbookId: string; active: boolean }) {
  await requireAdmin(input.userId);
  await db.update(nativeWorkbooks).set({
    active: input.active,
    status: input.active ? "published" : "unpublished",
    updatedAt: new Date()
  }).where(eq(nativeWorkbooks.id, input.workbookId));
  return { active: input.active };
}

export async function updateNativeWorkbookDetails(input: {
  userId: string;
  workbookId: string;
  title: string;
  subject?: string;
  curriculumSubjectId?: string | null;
  addSubjectToTaxonomy?: boolean;
  curriculumAreaKey: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  description: string;
  coverageTags?: string[] | string;
  type: WorkbookType;
  priceInCents: number;
  prerequisiteWorkbookId?: string | null;
  editionLabel: string;
}) {
  await requireAdmin(input.userId);
  const title = normalizeText(input.title, 180);
  const curriculumAreaKey = normalizeCurriculumAreaKey(input.curriculumAreaKey);
  const description = normalizeText(input.description, 3_000);
  if (!title) throw new Error("Title is required.");
  const gradeMin = normalizeGrade(input.gradeMin);
  const gradeMax = normalizeGrade(input.gradeMax);
  if (gradeMax < gradeMin) throw new Error("The ending grade cannot be lower than the starting grade.");
  const languageCode = normalizeText(input.languageCode || "en", 12).toLowerCase();
  const type = normalizeWorkbookType(input.type);
  const priceInCents = normalizePrice(input.priceInCents);
  const coverageTags = normalizeTags(input.coverageTags);
  const prerequisiteWorkbookId = normalizeOptionalUuid(input.prerequisiteWorkbookId);
  const editionLabel = normalizeText(input.editionLabel, 80);
  if (!editionLabel) throw new Error("Edition is required.");
  const [workbook] = await db.select({
    id: nativeWorkbooks.id,
    title: nativeWorkbooks.title,
    curriculumSubjectId: nativeWorkbooks.curriculumSubjectId,
    subjectLabel: nativeWorkbooks.subjectLabel,
    curriculumAreaKey: nativeWorkbooks.curriculumAreaKey,
    gradeMin: nativeWorkbooks.gradeMin,
    gradeMax: nativeWorkbooks.gradeMax,
    languageCode: nativeWorkbooks.languageCode,
    description: nativeWorkbooks.description,
    coverageTags: nativeWorkbooks.coverageTags,
    type: nativeWorkbooks.type,
    priceInCents: nativeWorkbooks.priceInCents,
    currencyCode: nativeWorkbooks.currencyCode,
    prerequisiteWorkbookId: nativeWorkbooks.prerequisiteWorkbookId,
    stripeProductId: nativeWorkbooks.stripeProductId,
    stripePriceId: nativeWorkbooks.stripePriceId
  }).from(nativeWorkbooks).where(eq(nativeWorkbooks.id, input.workbookId)).limit(1);
  if (!workbook) throw new Error("Workbook not found.");
  if (prerequisiteWorkbookId === workbook.id) throw new Error("A workbook cannot be its own prerequisite.");
  if (prerequisiteWorkbookId) {
    const prerequisiteRows = await db.select({
      id: nativeWorkbooks.id,
      prerequisiteWorkbookId: nativeWorkbooks.prerequisiteWorkbookId
    }).from(nativeWorkbooks);
    const prerequisiteById = new Map(
      prerequisiteRows.map((row) => [row.id, row.prerequisiteWorkbookId])
    );
    if (!prerequisiteById.has(prerequisiteWorkbookId)) {
      throw new Error("The selected prerequisite workbook no longer exists.");
    }
    let cursor: string | null = prerequisiteWorkbookId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === workbook.id) throw new Error("This prerequisite would create a circular workbook sequence.");
      if (visited.has(cursor)) throw new Error("The existing workbook prerequisites contain a circular sequence.");
      visited.add(cursor);
      cursor = prerequisiteById.get(cursor) ?? null;
    }
  }
  const subject = await resolveCurriculumSubjectSelection({
    userId: input.userId,
    curriculumAreaKey,
    curriculumSubjectId: input.curriculumSubjectId,
    subject: input.subject,
    addSubjectToTaxonomy: input.addSubjectToTaxonomy
  });

  const priceChanged = workbook.priceInCents !== priceInCents;
  const productDetailsChanged =
    workbook.title !== title ||
    workbook.description !== description ||
    workbook.curriculumSubjectId !== subject.curriculumSubjectId ||
    workbook.subjectLabel !== subject.subjectLabel ||
    workbook.curriculumAreaKey !== curriculumAreaKey ||
    workbook.gradeMin !== gradeMin ||
    workbook.gradeMax !== gradeMax ||
    workbook.languageCode !== languageCode ||
    workbook.type !== type ||
    workbook.coverageTags.join("\u0000") !== coverageTags.join("\u0000") ||
    workbook.prerequisiteWorkbookId !== prerequisiteWorkbookId;
  const needsStripeUpdate = Boolean(workbook.stripeProductId && (priceChanged || productDetailsChanged));
  if (needsStripeUpdate && !env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe must be configured before changing a published workbook's title, description, or price.");
  }

  const stripe = needsStripeUpdate ? getStripe() : null;
  const newPrice = stripe && priceChanged && workbook.stripeProductId
    ? await stripe.prices.create({
        product: workbook.stripeProductId,
        currency: workbook.currencyCode.toLowerCase(),
        unit_amount: priceInCents,
        metadata: { nativeWorkbookId: workbook.id }
      }, {
        idempotencyKey: `native-workbook-price:${workbook.id}:${workbook.stripePriceId ?? "none"}:${priceInCents}`
      })
    : null;
  const [latestVersion] = await db.select({
        id: nativeWorkbookVersions.id,
        editionId: nativeWorkbookVersions.editionId,
        editionLabel: nativeWorkbookVersions.editionLabel,
        analysisJson: nativeWorkbookVersions.analysisJson
      }).from(nativeWorkbookVersions)
        .where(eq(nativeWorkbookVersions.workbookId, workbook.id))
        .orderBy(desc(nativeWorkbookVersions.versionNumber))
        .limit(1)
  ;
  const workbookVersionIds = (await db.select({ id: nativeWorkbookVersions.id })
    .from(nativeWorkbookVersions)
    .where(eq(nativeWorkbookVersions.workbookId, workbook.id)))
    .map((version) => version.id);

  try {
    if (stripe && workbook.stripeProductId) {
      await stripe.products.update(workbook.stripeProductId, {
        name: title,
        description,
        metadata: nativeWorkbookStripeMetadata({
          id: workbook.id,
          subjectLabel: subject.subjectLabel,
          curriculumAreaKey,
          gradeMin,
          gradeMax,
          languageCode,
          type,
          coverageTags,
          prerequisiteWorkbookId
        }),
        ...(newPrice ? { default_price: newPrice.id } : {})
      });
    }
    await db.transaction(async (tx) => {
      const attachedDocuments = workbookVersionIds.length === 0
        ? []
        : await tx.select({ materialSetId: contentDocuments.materialSetId })
            .from(contentDocuments)
            .where(inArray(contentDocuments.nativeWorkbookVersionId, workbookVersionIds));
      await tx.update(nativeWorkbooks).set({
        title,
        curriculumSubjectId: subject.curriculumSubjectId,
        subjectKey: subject.subjectKey,
        subjectLabel: subject.subjectLabel,
        curriculumAreaKey,
        gradeMin,
        gradeMax,
        languageCode,
        description,
        coverageTags,
        type,
        priceInCents,
        prerequisiteWorkbookId,
        ...(newPrice ? { stripePriceId: newPrice.id } : {}),
        updatedAt: new Date()
      }).where(eq(nativeWorkbooks.id, workbook.id));
      if (latestVersion) {
        await tx.update(nativeWorkbookVersions).set({
          editionLabel,
          ...(workbook.description !== description
            ? { analysisJson: { ...latestVersion.analysisJson, descriptionMode: "custom" } }
            : {})
        }).where(eq(nativeWorkbookVersions.id, latestVersion.id));
        await tx.update(nativeWorkbookEditions).set({
          editionLabel,
          updatedAt: new Date()
        }).where(eq(nativeWorkbookEditions.id, latestVersion.editionId));
      }
      if (workbookVersionIds.length > 0) {
        await tx.update(contentDocuments).set({
          label: title,
          subjectLabel: subject.subjectLabel
        }).where(inArray(contentDocuments.nativeWorkbookVersionId, workbookVersionIds));
      }
      const attachedMaterialSetIds = Array.from(new Set(
        attachedDocuments.map((document) => document.materialSetId)
      ));
      if (attachedMaterialSetIds.length > 0) {
        await tx.update(learningYearMaterialSets).set({
          label: title,
          updatedAt: new Date()
        }).where(inArray(learningYearMaterialSets.id, attachedMaterialSetIds));
      }
    });
  } catch (error) {
    if (stripe && workbook.stripeProductId) {
      await stripe.products.update(workbook.stripeProductId, {
        name: workbook.title,
        description: workbook.description,
        metadata: nativeWorkbookStripeMetadata(workbook),
        ...(newPrice && workbook.stripePriceId ? { default_price: workbook.stripePriceId } : {})
      }).catch(() => undefined);
      if (newPrice && workbook.stripePriceId) {
        await stripe.prices.update(newPrice.id, { active: false }).catch(() => undefined);
      }
    }
    throw error;
  }

  if (stripe && newPrice && workbook.stripePriceId && workbook.stripePriceId !== newPrice.id) {
    await stripe.prices.update(workbook.stripePriceId, { active: false }).catch((error) => {
      console.warn(`Could not retire previous Stripe price ${workbook.stripePriceId}:`, error);
    });
  }
  return {
    workbookId: workbook.id,
    title,
    priceInCents,
    currencyCode: workbook.currencyCode,
    stripeUpdated: needsStripeUpdate
  };
}

export async function deleteNativeWorkbook(input: { userId: string; workbookId: string }) {
  await requireAdmin(input.userId);
  const [workbook] = await db
    .select({
      id: nativeWorkbooks.id,
      thumbnailObjectPath: nativeWorkbooks.thumbnailObjectPath,
      stripeProductId: nativeWorkbooks.stripeProductId
    })
    .from(nativeWorkbooks)
    .where(eq(nativeWorkbooks.id, input.workbookId))
    .limit(1);
  if (!workbook) throw new Error("Workbook not found.");

  const versions = await db
    .select({
      id: nativeWorkbookVersions.id,
      objectPath: nativeWorkbookVersions.objectPath,
      analysisJson: nativeWorkbookVersions.analysisJson
    })
    .from(nativeWorkbookVersions)
    .where(eq(nativeWorkbookVersions.workbookId, workbook.id));
  const versionIds = versions.map((version) => version.id);
  const [[purchaseCount], [attachmentCount], [runningJobCount]] = await Promise.all([
    db.select({ value: sql<number>`count(*)::integer` })
      .from(nativeWorkbookPurchases)
      .where(eq(nativeWorkbookPurchases.workbookId, workbook.id)),
    versionIds.length
      ? db.select({ value: sql<number>`count(*)::integer` })
          .from(contentDocuments)
          .where(inArray(contentDocuments.nativeWorkbookVersionId, versionIds))
      : Promise.resolve([{ value: 0 }]),
    versionIds.length
      ? db.select({ value: sql<number>`count(*)::integer` })
          .from(nativeWorkbookJobs)
          .where(and(
            inArray(nativeWorkbookJobs.workbookVersionId, versionIds),
            eq(nativeWorkbookJobs.status, "running")
          ))
      : Promise.resolve([{ value: 0 }])
  ]);

  if (Number(purchaseCount?.value ?? 0) > 0) {
    throw new Error("This workbook cannot be deleted because it has already been purchased. Hide it from the store instead.");
  }
  if (Number(attachmentCount?.value ?? 0) > 0) {
    throw new Error("This workbook cannot be deleted because it is already used in a family's lesson plan. Hide it from the store instead.");
  }
  if (Number(runningJobCount?.value ?? 0) > 0) {
    throw new Error("This workbook is currently being indexed. Wait for indexing to finish before deleting it.");
  }

  if (workbook.stripeProductId && env.STRIPE_SECRET_KEY) {
    await getStripe().products.update(workbook.stripeProductId, { active: false });
  }

  await db.delete(nativeWorkbooks).where(eq(nativeWorkbooks.id, workbook.id));

  const objectPaths = Array.from(new Set([
    workbook.thumbnailObjectPath,
    ...versions.flatMap((version) => [
      version.objectPath,
      ...readProductPreviewImages(version.analysisJson).map((preview) => preview.objectPath)
    ])
  ].filter(Boolean)));
  await Promise.all(objectPaths.map((objectPath) => deletePrivateFile(objectPath).catch((error) => {
    console.warn(`Could not delete native workbook object ${objectPath}:`, error);
  })));
  return { deleted: true };
}

async function claimNextNativeWorkbookJob(workerId: string) {
  const [job] = await db.execute<NativeWorkbookJobRow>(sql`
    WITH next_job AS (
      SELECT id FROM native_workbook_jobs
      WHERE status IN ('queued', 'retry_wait') AND available_at <= NOW()
      ORDER BY available_at ASC, updated_at ASC, created_at ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE native_workbook_jobs nwj SET
      status = 'running', claimed_at = NOW(), heartbeat_at = NOW(), worker_id = ${workerId}, updated_at = NOW()
    FROM next_job WHERE nwj.id = next_job.id
    RETURNING nwj.id, nwj.workbook_version_id AS "workbookVersionId", nwj.status,
      nwj.attempt_count AS "attemptCount", nwj.available_at AS "availableAt",
      nwj.claimed_at AS "claimedAt", nwj.heartbeat_at AS "heartbeatAt",
      nwj.worker_id AS "workerId", nwj.last_error AS "lastError",
      nwj.created_at AS "createdAt", nwj.updated_at AS "updatedAt"
  `);
  return job ?? null;
}

async function promoteCompatibleWorkbookReplacement(input: {
  job: NativeWorkbookJobRow;
  version: {
    id: string;
    workbookId: string;
    objectPath: string;
    originalFilename: string;
    mimeType: string;
    analysisJson: Record<string, unknown>;
    workbookContentRevisionId: string | null;
    title: string;
  };
  replacement: WorkbookReplacementState;
  bytes: Uint8Array;
  pageCount: number;
  fingerprint: string;
  candidateAnalysis: unknown;
}) {
  const [publishedVersion] = await db.select({
    id: nativeWorkbookVersions.id,
    workbookId: nativeWorkbookVersions.workbookId,
    editionId: nativeWorkbookVersions.editionId,
    revisionNumber: nativeWorkbookVersions.revisionNumber,
    objectPath: nativeWorkbookVersions.objectPath,
    pageCount: nativeWorkbookVersions.pageCount,
    analysisStatus: nativeWorkbookVersions.analysisStatus,
    analysisJson: nativeWorkbookVersions.analysisJson,
    workbookContentRevisionId: nativeWorkbookVersions.workbookContentRevisionId,
    curriculumCoverageProfile: nativeWorkbookVersions.curriculumCoverageProfile,
    curriculumCoverageFrameworkVersion: nativeWorkbookVersions.curriculumCoverageFrameworkVersion,
    curriculumCoverageProfiledAt: nativeWorkbookVersions.curriculumCoverageProfiledAt
  }).from(nativeWorkbookVersions)
    .where(eq(nativeWorkbookVersions.id, input.replacement.previousVersionId))
    .limit(1);
  if (!publishedVersion || publishedVersion.workbookId !== input.version.workbookId) {
    throw new WorkbookReplacementCompatibilityError(
      "Replacement rejected: the published workbook version could not be verified."
    );
  }
  if (publishedVersion.analysisStatus !== "ready") {
    throw new WorkbookReplacementCompatibilityError(
      "Replacement rejected: the published workbook no longer has a complete lesson index."
    );
  }

  const compatibility = input.replacement.compatibilityMode === "lesson_ids"
    ? await (async () => {
      if (!publishedVersion.workbookContentRevisionId || !input.version.workbookContentRevisionId) {
        return {
          compatible: false,
          currentLessonCount: 0,
          reasons: ["Structured lesson ids were unavailable for one of the revisions."]
        };
      }
      const revisions = await db.select({
        id: workbookContentRevisions.id,
        lessonIdFingerprint: workbookContentRevisions.lessonIdFingerprint,
        contentJson: workbookContentRevisions.contentJson
      }).from(workbookContentRevisions).where(inArray(workbookContentRevisions.id, [
        publishedVersion.workbookContentRevisionId,
        input.version.workbookContentRevisionId
      ]));
      const current = revisions.find((revision) => revision.id === publishedVersion.workbookContentRevisionId);
      const replacement = revisions.find((revision) => revision.id === input.version.workbookContentRevisionId);
      const lessonCount = current ? workbookLessonIds(parseWorkbookContent(current.contentJson)).length : 0;
      const compatible = Boolean(
        current && replacement && current.lessonIdFingerprint === replacement.lessonIdFingerprint
      );
      return {
        compatible,
        currentLessonCount: lessonCount,
        reasons: compatible
          ? ["Stable lesson ids match. PDF page count is allowed to change."]
          : ["A lesson was added, removed, or replaced; publish this change as a new edition."]
      };
    })()
    : await (async () => {
      const [currentPageTexts, replacementPageTexts] = await Promise.all([
        downloadPrivateFile(publishedVersion.objectPath).then(extractPdfPageTexts),
        extractPdfPageTexts(input.bytes)
      ]);
      return checkWorkbookReplacementCompatibility({
        currentPageCount: publishedVersion.pageCount,
        replacementPageCount: input.pageCount,
        currentAnalysis: publishedVersion.analysisJson,
        replacementAnalysis: input.candidateAnalysis,
        currentPageTexts,
        replacementPageTexts
      });
    })();
  if (!compatibility.compatible) {
    throw new WorkbookReplacementCompatibilityError(
      `Replacement rejected: ${compatibility.reasons.join(" ")} The published PDF and all customer data were left unchanged.`
    );
  }

  const thumbnailObjectPath =
    `native-workbooks/${input.version.workbookId}/versions/${input.version.id}/cover.png`;
  await createGeneratedCoverImage({ bytes: input.bytes, objectPath: thumbnailObjectPath });
  const productPreviewImages = await createProductPreviewImages({
    workbookId: input.version.workbookId,
    versionId: input.version.id,
    bytes: input.bytes,
    pageCount: input.pageCount,
    // Keep the established lesson contract. Compatibility checking proved the
    // replacement maps to these same lesson ranges.
    analysis: input.replacement.compatibilityMode === "lesson_ids"
      ? input.candidateAnalysis
      : publishedVersion.analysisJson
  });

  const analysisSource = input.replacement.compatibilityMode === "lesson_ids"
    ? input.candidateAnalysis
    : publishedVersion.analysisJson;
  const currentAnalysis = analysisSource && typeof analysisSource === "object"
    ? analysisSource as Record<string, unknown>
    : {};
  const finalAnalysisJson: Record<string, unknown> = {
    ...input.version.analysisJson,
    ...currentAnalysis,
    contentFingerprint: input.fingerprint,
    nativeWorkbook: true,
    productPreviewImages,
    correctedFromVersionId: publishedVersion.id,
    compatibilityVerifiedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };
  delete finalAnalysisJson.replacement;

  await db.transaction(async (tx) => {
    const promotedAt = new Date();
    await tx.update(nativeWorkbookVersions).set({
      pageCount: input.pageCount,
      sizeBytes: input.bytes.byteLength,
      contentFingerprint: input.fingerprint,
      analysisStatus: "ready",
      analysisJson: finalAnalysisJson,
      curriculumCoverageProfile: publishedVersion.curriculumCoverageProfile,
      curriculumCoverageFrameworkVersion: publishedVersion.curriculumCoverageFrameworkVersion,
      curriculumCoverageProfiledAt: publishedVersion.curriculumCoverageProfiledAt,
      releaseStatus: "published",
      supersedesVersionId: publishedVersion.id,
      compatibilityReport: {
        compatible: true,
        checkedAt: new Date().toISOString(),
        lessonCount: compatibility.currentLessonCount,
        reasons: compatibility.reasons
      },
      lastError: null,
      indexedAt: promotedAt,
      ...(input.replacement.restoreActive ? { publishedAt: promotedAt } : {})
    }).where(eq(nativeWorkbookVersions.id, input.version.id));
    await tx.update(nativeWorkbookVersions).set({ releaseStatus: "superseded" })
      .where(eq(nativeWorkbookVersions.id, publishedVersion.id));
    await tx.update(nativeWorkbookEditions).set({
      currentRevisionId: input.version.id,
      status: "published",
      updatedAt: promotedAt
    }).where(eq(nativeWorkbookEditions.id, publishedVersion.editionId));
    await tx.update(nativeWorkbookJobs).set({
      status: "completed",
      heartbeatAt: promotedAt,
      lastError: null,
      updatedAt: promotedAt
    }).where(eq(nativeWorkbookJobs.id, input.job.id));
    await tx.update(nativeWorkbooks).set({
      activeVersionId: input.version.id,
      latestEditionId: publishedVersion.editionId,
      thumbnailObjectPath,
      status: input.replacement.restoreStatus,
      active: input.replacement.restoreActive,
      updatedAt: promotedAt
    }).where(eq(nativeWorkbooks.id, input.version.workbookId));

    const attachments = await tx.select().from(contentDocuments).where(and(
      eq(contentDocuments.nativeWorkbookVersionId, publishedVersion.id),
      isNull(contentDocuments.removedAt)
    ));
    for (const attachment of attachments) {
      const [promotedDocument] = await tx.insert(contentDocuments).values({
        learningYearId: attachment.learningYearId,
        materialSetId: attachment.materialSetId,
        label: attachment.label,
        subjectId: attachment.subjectId,
        subjectLabel: attachment.subjectLabel,
        documentRole: attachment.documentRole,
        originalFilename: input.version.originalFilename,
        objectPath: input.version.objectPath,
        mimeType: input.version.mimeType,
        sourceKind: attachment.sourceKind,
        nativeWorkbookVersionId: input.version.id,
        clientUploadId: `native:${input.version.id}:revision:${randomUUID().slice(0, 8)}`,
        sizeBytes: input.bytes.byteLength,
        pageCount: input.pageCount,
        sortOrder: attachment.sortOrder,
        parentNotes: attachment.parentNotes,
        analysisStatus: "ready",
        analysisJson: {
          ...finalAnalysisJson,
          nativeWorkbookId: input.version.workbookId,
          nativeWorkbookVersionId: input.version.id,
          compatibleRevisionUpgrade: true,
          upgradedFromNativeWorkbookVersionId: publishedVersion.id
        }
      }).returning({ id: contentDocuments.id });

      const affectedWeeks = await tx.select({
        id: weeklyPlans.id,
        status: weeklyPlans.status,
        sourceUnitId: weeklyPlanItems.sourceUnitId
      }).from(weeklyPlanItems)
        .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanItems.weeklyPlanId))
        .where(eq(weeklyPlanItems.documentId, attachment.id))
        .for("update");
      const affectedWeekIds = Array.from(new Set(affectedWeeks.map((week) => week.id)));
      const downloadedEvents = affectedWeekIds.length
        ? await tx.select({ weeklyPlanId: weeklyPlanDownloadEvents.weeklyPlanId })
            .from(weeklyPlanDownloadEvents)
            .where(inArray(weeklyPlanDownloadEvents.weeklyPlanId, affectedWeekIds))
        : [];
      const downloadedWeekIds = new Set(downloadedEvents.map((event) => event.weeklyPlanId));
      const [attachmentYear] = await tx.select({
        profileId: learningYears.profileId
      }).from(learningYears)
        .where(eq(learningYears.id, attachment.learningYearId))
        .limit(1);
      if (attachmentYear) {
        const preservedUnitById = new Map<string, string>();
        for (const week of affectedWeeks) {
          if (
            week.sourceUnitId &&
            (
              ["in_progress", "completed"].includes(week.status) ||
              downloadedWeekIds.has(week.id)
            ) &&
            !preservedUnitById.has(week.sourceUnitId)
          ) {
            preservedUnitById.set(week.sourceUnitId, week.id);
          }
        }
        const carryovers = Array.from(preservedUnitById, ([sourceUnitId, weeklyPlanId]) => ({
          profileId: attachmentYear.profileId,
          fromNativeWorkbookVersionId: publishedVersion.id,
          fromSourceUnitId: sourceUnitId,
          toNativeWorkbookVersionId: input.version.id,
          toSourceUnitId: sourceUnitId,
          sourceLearningYearId: attachment.learningYearId,
          sourceWeeklyPlanId: weeklyPlanId,
          reason: "preserved_week",
          matchMethod: "exact_id"
        }));
        if (carryovers.length) {
          await tx.insert(studentWorkbookEditionUnitCarryovers).values(carryovers)
            .onConflictDoNothing({
              target: [
                studentWorkbookEditionUnitCarryovers.profileId,
                studentWorkbookEditionUnitCarryovers.sourceLearningYearId,
                studentWorkbookEditionUnitCarryovers.toNativeWorkbookVersionId,
                studentWorkbookEditionUnitCarryovers.toSourceUnitId
              ]
            });
        }
        const progressRows = await tx.select().from(studentWorkbookUnitProgress).where(and(
          eq(studentWorkbookUnitProgress.profileId, attachmentYear.profileId),
          eq(studentWorkbookUnitProgress.nativeWorkbookVersionId, publishedVersion.id)
        ));
        if (progressRows.length) {
          await tx.insert(studentWorkbookUnitProgress).values(progressRows.map((progress) => ({
            profileId: progress.profileId,
            nativeWorkbookVersionId: input.version.id,
            sourceUnitId: progress.sourceUnitId,
            status: progress.status,
            sourceLearningYearId: progress.sourceLearningYearId,
            sourceWeeklyPlanId: progress.sourceWeeklyPlanId,
            selectedByUserId: progress.selectedByUserId,
            recordedAt: progress.recordedAt,
            updatedAt: promotedAt
          }))).onConflictDoUpdate({
            target: [
              studentWorkbookUnitProgress.profileId,
              studentWorkbookUnitProgress.nativeWorkbookVersionId,
              studentWorkbookUnitProgress.sourceUnitId
            ],
            set: {
              status: sql`excluded.status`,
              sourceLearningYearId: sql`excluded.source_learning_year_id`,
              sourceWeeklyPlanId: sql`excluded.source_weekly_plan_id`,
              selectedByUserId: sql`excluded.selected_by_user_id`,
              recordedAt: sql`excluded.recorded_at`,
              updatedAt: promotedAt
            }
          });
        }
      }
      const replaceableWeekIds = affectedWeeks
        .filter((week) =>
          ["planned", "skipped"].includes(week.status) &&
          !downloadedWeekIds.has(week.id)
        )
        .map((week) => week.id);
      if (replaceableWeekIds.length) {
        await tx.update(weeklyPlanItems).set({ documentId: promotedDocument.id }).where(and(
          eq(weeklyPlanItems.documentId, attachment.id),
          inArray(weeklyPlanItems.weeklyPlanId, replaceableWeekIds)
        ));
        await tx.delete(weeklyPlanPdfAssets)
          .where(inArray(weeklyPlanPdfAssets.weeklyPlanId, replaceableWeekIds));
        await tx.delete(weeklyPlanDayPdfAssets)
          .where(inArray(weeklyPlanDayPdfAssets.weeklyPlanId, replaceableWeekIds));
      }
      await tx.update(contentDocuments).set({
        removedAt: promotedAt,
        retainedUntil: null
      }).where(eq(contentDocuments.id, attachment.id));
    }
  });

  const studioRelease = readWorkbookStudioReleaseState(input.version.analysisJson);
  if (studioRelease && input.version.workbookContentRevisionId) {
    await db.update(workbookProjects).set({
      nativeWorkbookId: input.version.workbookId,
      publishedRevisionId: input.version.workbookContentRevisionId,
      status: "released",
      updatedAt: new Date()
    }).where(eq(workbookProjects.id, studioRelease.projectId));
  }

  return {
    jobId: input.job.id,
    versionId: input.version.id,
    outcome: "completed",
    replacementVerified: true,
    lessonCount: compatibility.currentLessonCount
  };
}

export async function runNextNativeWorkbookJob(workerId: string) {
  const job = await claimNextNativeWorkbookJob(workerId);
  if (!job) return null;
  const [version] = await db
    .select({
      id: nativeWorkbookVersions.id,
      workbookId: nativeWorkbookVersions.workbookId,
      editionId: nativeWorkbookVersions.editionId,
      objectPath: nativeWorkbookVersions.objectPath,
      originalFilename: nativeWorkbookVersions.originalFilename,
      mimeType: nativeWorkbookVersions.mimeType,
      analysisJson: nativeWorkbookVersions.analysisJson,
      workbookContentRevisionId: nativeWorkbookVersions.workbookContentRevisionId,
      title: nativeWorkbooks.title,
      subjectLabel: nativeWorkbooks.subjectLabel,
      curriculumAreaKey: nativeWorkbooks.curriculumAreaKey,
      gradeMin: nativeWorkbooks.gradeMin,
      gradeMax: nativeWorkbooks.gradeMax,
      languageCode: nativeWorkbooks.languageCode,
      description: nativeWorkbooks.description,
      thumbnailObjectPath: nativeWorkbooks.thumbnailObjectPath
    })
    .from(nativeWorkbookVersions)
    .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookVersions.workbookId))
    .where(eq(nativeWorkbookVersions.id, job.workbookVersionId))
    .limit(1);
  if (!version) {
    await db.update(nativeWorkbookJobs).set({ status: "failed", lastError: "Workbook version not found.", updatedAt: new Date() })
      .where(eq(nativeWorkbookJobs.id, job.id));
    return { jobId: job.id, versionId: job.workbookVersionId, outcome: "failed", error: "Workbook version not found." };
  }
  const errorReference = nativeWorkbookErrorReference(version.id);
  const editionRelease = readWorkbookEditionReleaseState(version.analysisJson);
  try {
    await db.update(nativeWorkbookVersions).set({ analysisStatus: "analyzing", lastError: null })
      .where(eq(nativeWorkbookVersions.id, version.id));
    const bytes = await downloadPrivateFile(version.objectPath);
    const pageCount = await getPdfPageCount(bytes);
    if (pageCount > MAX_NATIVE_WORKBOOK_PAGES) {
      throw new Error("This workbook is too large to process as one item.");
    }
    const replacement = readWorkbookReplacementState(version.analysisJson);
    if (
      replacement?.requiresCompatibilityCheck &&
      replacement.expectedPageCount != null &&
      replacement.expectedPageCount !== pageCount
    ) {
      throw new WorkbookReplacementCompatibilityError(
        `Replacement rejected: the replacement has ${pageCount} pages; the published workbook has ${replacement.expectedPageCount}. The published PDF and all customer data were left unchanged.`
      );
    }
    const fingerprint = createHash("sha256").update(bytes).digest("hex");
    const analysis = await analyzePdf({
      bytes,
      label: version.title,
      role: "student",
      pageCount,
      usageContext: { nativeWorkbookVersionId: version.id, nativeWorkbookJobId: job.id }
    });
    if (
      replacement?.requiresCompatibilityCheck &&
      replacement.previousVersionId !== version.id
    ) {
      return await promoteCompatibleWorkbookReplacement({
        job,
        version,
        replacement,
        bytes,
        pageCount,
        fingerprint,
        candidateAnalysis: analysis
      });
    }
    const curriculumCoverageProfile = await generateCurriculumCoverageProfile({
      title: version.title,
      subjectLabel: version.subjectLabel,
      curriculumAreaKey: version.curriculumAreaKey,
      gradeMin: version.gradeMin,
      gradeMax: version.gradeMax,
      languageCode: version.languageCode,
      analysis,
      source: "ai_indexing",
      usageContext: { nativeWorkbookVersionId: version.id, nativeWorkbookJobId: job.id }
    }).catch((error) => {
      // Coverage scoring enriches ACC recommendations, but it is not part of
      // the workbook's lesson/page index. Keep a valid index usable and let the
      // coverage backfill retry this derived metadata independently.
      console.warn(
        `[${errorReference}] Workbook indexing completed without a curriculum coverage profile; coverage remains pending.`,
        error
      );
      return null;
    });
    const generatedThumbnailObjectPath = editionRelease
      ? `native-workbooks/${version.workbookId}/versions/${version.id}/cover.png`
      : version.thumbnailObjectPath;
    await createGeneratedCoverImage({ bytes, objectPath: generatedThumbnailObjectPath });
    const descriptionMode = version.analysisJson?.descriptionMode === "auto" ? "auto" : "custom";
    const generatedDescription = descriptionMode === "auto"
      ? await generateNativeWorkbookCatalogDescription({
          title: version.title,
          subject: version.subjectLabel,
          gradeLabel: workbookGradeLabel(version.gradeMin, version.gradeMax),
          languageCode: version.languageCode,
          pageCount,
          analysis,
          usageContext: { nativeWorkbookVersionId: version.id, nativeWorkbookJobId: job.id }
        }).catch((error) => {
          console.warn(`Could not generate catalog description for native workbook ${version.workbookId}; using metadata fallback.`, error);
          return fallbackWorkbookDescription({
            title: version.title,
            subject: version.subjectLabel,
            gradeMin: version.gradeMin,
            gradeMax: version.gradeMax,
            pageCount,
            analysis
          });
        })
      : version.description;
    const productPreviewImages = await createProductPreviewImages({
      workbookId: version.workbookId,
      versionId: version.id,
      bytes,
      pageCount,
      analysis
    }).catch((error) => {
      console.warn(`Could not create product previews for native workbook ${version.workbookId}:`, error);
      return [];
    });
    const [currentCatalogState] = await db.select({
      description: nativeWorkbooks.description,
      analysisJson: nativeWorkbookVersions.analysisJson
    }).from(nativeWorkbookVersions)
      .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookVersions.workbookId))
      .where(eq(nativeWorkbookVersions.id, version.id))
      .limit(1);
    const finalDescription = currentCatalogState?.analysisJson?.descriptionMode === "auto"
      ? generatedDescription
      : currentCatalogState?.description ?? generatedDescription;
    const currentReplacement = readWorkbookReplacementState(
      currentCatalogState?.analysisJson ?? version.analysisJson
    );
    const finalAnalysisJson: Record<string, unknown> = {
      ...version.analysisJson,
      ...analysis,
      contentFingerprint: fingerprint,
      nativeWorkbook: true,
      productPreviewImages,
      catalogDescription: finalDescription,
      generatedThumbnailObjectPath,
      completedAt: new Date().toISOString()
    };
    delete finalAnalysisJson.replacement;
    const restoredStatus = currentReplacement?.restoreActive
      ? "published"
      : currentReplacement?.restoreStatus === "unpublished"
        ? "unpublished"
        : "ready";
    await db.transaction(async (tx) => {
      await tx.update(nativeWorkbookVersions).set({
        pageCount,
        contentFingerprint: fingerprint,
        analysisStatus: "ready",
        analysisJson: finalAnalysisJson,
        curriculumCoverageProfile: curriculumCoverageProfile ?? {},
        curriculumCoverageFrameworkVersion: curriculumCoverageProfile
          ? CURRICULUM_COVERAGE_FRAMEWORK_VERSION
          : null,
        curriculumCoverageProfiledAt: curriculumCoverageProfile ? new Date() : null,
        lastError: null,
        indexedAt: new Date(),
        ...(currentReplacement?.restoreActive ? { publishedAt: new Date() } : {})
      }).where(eq(nativeWorkbookVersions.id, version.id));
      await tx.update(contentDocuments).set({
        pageCount,
        analysisStatus: "ready",
        analysisJson: {
          ...finalAnalysisJson,
          nativeWorkbookId: version.workbookId,
          nativeWorkbookVersionId: version.id
        }
      }).where(eq(contentDocuments.nativeWorkbookVersionId, version.id));
      await tx.update(nativeWorkbookJobs).set({ status: "completed", heartbeatAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(nativeWorkbookJobs.id, job.id));
      await tx.update(nativeWorkbooks).set({
        ...(!editionRelease ? { description: finalDescription } : {}),
        ...(currentReplacement ? {
          activeVersionId: version.id,
          status: restoredStatus,
          active: currentReplacement.restoreActive
        } : editionRelease ? {} : { status: "ready" }),
        updatedAt: new Date()
      })
        .where(eq(nativeWorkbooks.id, version.workbookId));
    });
    const studioRelease = readWorkbookStudioReleaseState(finalAnalysisJson);
    if (studioRelease?.autoPublish && !currentReplacement) {
      await publishNativeWorkbook({
        userId: studioRelease.requestedByUserId,
        workbookId: version.workbookId
      });
      await db.update(workbookProjects).set({
        nativeWorkbookId: version.workbookId,
        publishedRevisionId: version.workbookContentRevisionId,
        status: "released",
        updatedAt: new Date()
      }).where(eq(workbookProjects.id, studioRelease.projectId));
    }
    return { jobId: job.id, versionId: version.id, outcome: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown native workbook indexing error.";
    const replacement = readWorkbookReplacementState(version.analysisJson);
    const compatibilityRejected =
      error instanceof WorkbookReplacementCompatibilityError &&
      replacement?.requiresCompatibilityCheck === true;
    console.error(
      `[${errorReference}] Native workbook indexing failed for workbook ${version.workbookId}, version ${version.id}, job ${job.id}:`,
      error
    );
    if (compatibilityRejected && replacement) {
      await db.transaction(async (tx) => {
        await tx.update(nativeWorkbookVersions).set({
          lastError: message
        }).where(eq(nativeWorkbookVersions.id, replacement.previousVersionId));
        await tx.delete(nativeWorkbookJobs).where(eq(nativeWorkbookJobs.id, job.id));
        await tx.delete(nativeWorkbookVersions).where(eq(nativeWorkbookVersions.id, version.id));
        await tx.update(nativeWorkbooks).set({
          status: replacement.restoreStatus,
          active: replacement.restoreActive,
          activeVersionId: replacement.previousVersionId,
          updatedAt: new Date()
        }).where(eq(nativeWorkbooks.id, version.workbookId));
      });
      await deletePrivateFile(version.objectPath).catch((cleanupError) => {
        console.warn(`Could not delete rejected workbook replacement ${version.objectPath}:`, cleanupError);
      });
      return {
        jobId: job.id,
        versionId: version.id,
        outcome: "rejected",
        error: message
      };
    }
    const attemptCount = job.attemptCount + 1;
    const retry = attemptCount < MAX_NATIVE_WORKBOOK_JOB_ATTEMPTS;
    await db.transaction(async (tx) => {
      await tx.update(nativeWorkbookJobs).set({
        status: retry ? "retry_wait" : "failed",
        attemptCount,
        availableAt: new Date(Date.now() + Math.min(10 * 60_000, 30_000 * (2 ** Math.max(0, attemptCount - 1)))),
        claimedAt: null,
        heartbeatAt: null,
        workerId: retry ? null : workerId,
        lastError: message,
        updatedAt: new Date()
      }).where(eq(nativeWorkbookJobs.id, job.id));
      await tx.update(nativeWorkbookVersions).set({ analysisStatus: retry ? "queued" : "failed", lastError: message })
        .where(eq(nativeWorkbookVersions.id, version.id));
      await tx.update(nativeWorkbooks).set({
        ...(replacement ? {
          status: replacement.restoreStatus,
          active: replacement.restoreActive,
          activeVersionId: replacement.previousVersionId
        } : editionRelease ? {} : {
          status: retry ? "indexing" : "indexing_failed"
        }),
        updatedAt: new Date()
      }).where(eq(nativeWorkbooks.id, version.workbookId));
    });
    return { jobId: job.id, versionId: version.id, outcome: "failed", error: message };
  }
}

async function requireWorkbookAccess(input: { userId: string; workbookId: string }) {
  const [access] = await Promise.all([accessByWorkbookIds(input.userId, [input.workbookId])]);
  const state = access.get(input.workbookId) ?? "purchase_required";
  if (state === "purchase_required") throw new Error("Purchase this workbook before adding or downloading it.");
  return state;
}

async function applyNativeWorkbookPrerequisites(input: {
  learningYearId: string;
}) {
  const attachedMaterials = await db.select({
      materialSetId: contentDocuments.materialSetId,
      workbookId: nativeWorkbookVersions.workbookId,
      prerequisiteWorkbookId: nativeWorkbooks.prerequisiteWorkbookId,
      prerequisiteMaterialSetId: learningYearMaterialSets.prerequisiteMaterialSetId
    })
      .from(contentDocuments)
      .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, contentDocuments.nativeWorkbookVersionId))
      .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookVersions.workbookId))
      .innerJoin(learningYearMaterialSets, eq(learningYearMaterialSets.id, contentDocuments.materialSetId))
      .where(and(
        eq(contentDocuments.learningYearId, input.learningYearId),
        isNull(contentDocuments.removedAt)
      ));
  const materialSetByWorkbookId = new Map(
    attachedMaterials.map((material) => [material.workbookId, material.materialSetId])
  );
  const updates = attachedMaterials.flatMap((material) => {
    if (material.prerequisiteMaterialSetId || !material.prerequisiteWorkbookId) return [];
    const prerequisiteMaterialSetId = materialSetByWorkbookId.get(material.prerequisiteWorkbookId);
    return prerequisiteMaterialSetId
      ? [{ materialSetId: material.materialSetId, prerequisiteMaterialSetId }]
      : [];
  });
  if (!updates.length) return { applied: 0 };

  let applied = 0;
  await db.transaction(async (tx) => {
    for (const update of updates) {
      const changed = await tx.update(learningYearMaterialSets).set({
        prerequisiteMaterialSetId: update.prerequisiteMaterialSetId,
        updatedAt: new Date()
      }).where(and(
        eq(learningYearMaterialSets.id, update.materialSetId),
        isNull(learningYearMaterialSets.prerequisiteMaterialSetId)
      )).returning({ id: learningYearMaterialSets.id });
      applied += changed.length;
    }
    if (applied > 0) {
      await tx.update(learningYears).set({ materialsUpdatedAt: new Date(), updatedAt: new Date() })
        .where(eq(learningYears.id, input.learningYearId));
    }
  });
  return { applied };
}

export async function upgradeNativeWorkbookEditionForLearningYear(input: {
  userId: string;
  learningYearId: string;
  documentId: string;
}) {
  const parent = await getParentContext(input.userId);
  if (parent.accountRole === "TEACHER") {
    throw new Error("An account owner or administrator must update workbook editions.");
  }
  const [attached] = await db.select({
    document: contentDocuments,
    profileAccountId: profiles.accountId,
    profileId: profiles.id,
    workbookId: nativeWorkbookVersions.workbookId,
    currentEditionId: nativeWorkbookVersions.editionId,
    activeVersionId: nativeWorkbooks.activeVersionId,
    latestEditionId: nativeWorkbooks.latestEditionId,
    workbookTitle: nativeWorkbooks.title
  }).from(contentDocuments)
    .innerJoin(learningYears, eq(learningYears.id, contentDocuments.learningYearId))
    .innerJoin(profiles, eq(profiles.id, learningYears.profileId))
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, contentDocuments.nativeWorkbookVersionId))
    .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookVersions.workbookId))
    .where(and(
      eq(contentDocuments.id, input.documentId),
      eq(contentDocuments.learningYearId, input.learningYearId),
      isNull(contentDocuments.removedAt)
    ))
    .limit(1);
  if (!attached || attached.profileAccountId !== parent.accountId) throw new Error("Workbook not found in this lesson plan.");
  if (!attached.activeVersionId || !attached.latestEditionId || attached.latestEditionId === attached.currentEditionId) {
    throw new Error("This lesson plan already uses the latest edition.");
  }
  const currentVersionId = attached.document.nativeWorkbookVersionId;
  if (!currentVersionId) throw new Error("The current workbook release could not be identified.");
  const [latest] = await db.select().from(nativeWorkbookVersions)
    .where(and(
      eq(nativeWorkbookVersions.id, attached.activeVersionId),
      eq(nativeWorkbookVersions.workbookId, attached.workbookId),
      eq(nativeWorkbookVersions.analysisStatus, "ready"),
      eq(nativeWorkbookVersions.releaseStatus, "published")
    ))
    .limit(1);
  if (!latest) throw new Error("The latest edition is not ready yet.");

  const oldWeekItems = await db.select({
    weeklyPlanId: weeklyPlans.id,
    weeklyPlanStatus: weeklyPlans.status,
    sourceUnitId: weeklyPlanItems.sourceUnitId
  }).from(weeklyPlanItems)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanItems.weeklyPlanId))
    .where(eq(weeklyPlanItems.documentId, attached.document.id));
  const oldWeekIds = Array.from(new Set(oldWeekItems.map((item) => item.weeklyPlanId)));
  const downloadEvents = oldWeekIds.length
    ? await db.select({ weeklyPlanId: weeklyPlanDownloadEvents.weeklyPlanId })
        .from(weeklyPlanDownloadEvents)
        .where(inArray(weeklyPlanDownloadEvents.weeklyPlanId, oldWeekIds))
    : [];
  const downloadedWeekIds = new Set(downloadEvents.map((event) => event.weeklyPlanId));
  const preservedWeekUnits = oldWeekItems.filter((item) =>
    ["in_progress", "completed"].includes(item.weeklyPlanStatus) ||
    downloadedWeekIds.has(item.weeklyPlanId)
  );
  const durableProgress = await db.select().from(studentWorkbookUnitProgress).where(and(
    eq(studentWorkbookUnitProgress.profileId, attached.profileId),
    eq(studentWorkbookUnitProgress.nativeWorkbookVersionId, currentVersionId)
  ));
  if (preservedWeekUnits.some((item) => !item.sourceUnitId)) {
    throw new Error(
      "This edition changed too much to update safely after teaching began. Keep the current edition for this school year, then choose the new edition next year."
    );
  }
  const unitMapping = mapEditionLearningUnits({
    sourceUnits: editionLearningUnitsFromAnalysis(attached.document.analysisJson),
    targetUnits: editionLearningUnitsFromAnalysis(latest.analysisJson),
    protectedSourceUnitIds: [
      ...preservedWeekUnits.flatMap((item) => item.sourceUnitId ? [item.sourceUnitId] : []),
      ...durableProgress.map((progress) => progress.sourceUnitId)
    ]
  });
  if (unitMapping.unmatched.length > 0) {
    throw new Error(
      "This edition changed too much to update safely after teaching began. Keep the current edition for this school year, then choose the new edition next year."
    );
  }

  const [newDocument] = await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(contentDocuments).set({
      removedAt: now,
      retainedUntil: null
    }).where(eq(contentDocuments.id, attached.document.id));
    await tx.update(learningYearMaterialSets).set({
      label: attached.workbookTitle,
      updatedAt: now
    }).where(eq(learningYearMaterialSets.id, attached.document.materialSetId));
    const [created] = await tx.insert(contentDocuments).values({
      learningYearId: attached.document.learningYearId,
      materialSetId: attached.document.materialSetId,
      label: attached.workbookTitle,
      subjectId: attached.document.subjectId,
      subjectLabel: attached.document.subjectLabel,
      documentRole: attached.document.documentRole,
      originalFilename: latest.originalFilename,
      objectPath: latest.objectPath,
      mimeType: latest.mimeType,
      sourceKind: "native_workbook",
      nativeWorkbookVersionId: latest.id,
      clientUploadId: `native:${latest.id}:upgrade:${randomUUID().slice(0, 8)}`,
      sizeBytes: latest.sizeBytes,
      pageCount: latest.pageCount,
      sortOrder: attached.document.sortOrder,
      parentNotes: attached.document.parentNotes,
      analysisStatus: "ready",
      analysisJson: {
        ...latest.analysisJson,
        nativeWorkbookId: attached.workbookId,
        nativeWorkbookVersionId: latest.id,
        upgradedFromNativeWorkbookVersionId: attached.document.nativeWorkbookVersionId
      }
    }).returning({ id: contentDocuments.id });
    const preservedUnitById = new Map<string, string>();
    for (const item of preservedWeekUnits) {
      if (item.sourceUnitId && !preservedUnitById.has(item.sourceUnitId)) {
        preservedUnitById.set(item.sourceUnitId, item.weeklyPlanId);
      }
    }
    const carryovers = Array.from(preservedUnitById, ([sourceUnitId, weeklyPlanId]) => {
      const mapping = unitMapping.mappings.get(sourceUnitId);
      if (!mapping) return null;
      return {
        profileId: attached.profileId,
        fromNativeWorkbookVersionId: currentVersionId,
        fromSourceUnitId: sourceUnitId,
        toNativeWorkbookVersionId: latest.id,
        toSourceUnitId: mapping.targetSourceUnitId,
        sourceLearningYearId: input.learningYearId,
        sourceWeeklyPlanId: weeklyPlanId,
        reason: "preserved_week",
        matchMethod: mapping.matchMethod
      };
    }).filter((row): row is NonNullable<typeof row> => Boolean(row));
    if (carryovers.length) {
      await tx.insert(studentWorkbookEditionUnitCarryovers).values(carryovers)
        .onConflictDoNothing({
          target: [
            studentWorkbookEditionUnitCarryovers.profileId,
            studentWorkbookEditionUnitCarryovers.sourceLearningYearId,
            studentWorkbookEditionUnitCarryovers.toNativeWorkbookVersionId,
            studentWorkbookEditionUnitCarryovers.toSourceUnitId
          ]
        });
    }
    const migratedProgress = durableProgress.flatMap((progress) => {
      const mapping = unitMapping.mappings.get(progress.sourceUnitId);
      return mapping ? [{
        profileId: progress.profileId,
        nativeWorkbookVersionId: latest.id,
        sourceUnitId: mapping.targetSourceUnitId,
        status: progress.status,
        sourceLearningYearId: progress.sourceLearningYearId,
        sourceWeeklyPlanId: progress.sourceWeeklyPlanId,
        selectedByUserId: progress.selectedByUserId,
        recordedAt: progress.recordedAt,
        updatedAt: now
      }] : [];
    });
    if (migratedProgress.length) {
      await tx.insert(studentWorkbookUnitProgress).values(migratedProgress)
        .onConflictDoUpdate({
          target: [
            studentWorkbookUnitProgress.profileId,
            studentWorkbookUnitProgress.nativeWorkbookVersionId,
            studentWorkbookUnitProgress.sourceUnitId
          ],
          set: {
            status: sql`excluded.status`,
            sourceLearningYearId: sql`excluded.source_learning_year_id`,
            sourceWeeklyPlanId: sql`excluded.source_weekly_plan_id`,
            selectedByUserId: sql`excluded.selected_by_user_id`,
            recordedAt: sql`excluded.recorded_at`,
            updatedAt: now
          }
        });
    }
    await tx.update(learningYears).set({
      materialsUpdatedAt: now,
      curriculumCompletenessInputFingerprint: null,
      curriculumCompletenessReviewedAt: null,
      updatedAt: now
    }).where(eq(learningYears.id, input.learningYearId));
    return [created];
  });
  await applyNativeWorkbookPrerequisites({ learningYearId: input.learningYearId });
  let planningStarted = false;
  let planningMessage: string | null = null;
  try {
    await startLearningYearPlanning(input.userId, input.learningYearId);
    planningStarted = true;
  } catch (error) {
    planningMessage = error instanceof Error ? error.message : "The workbook was updated, but replanning has not started.";
  }
  return {
    upgraded: true,
    documentId: newDocument.id,
    versionId: latest.id,
    editionLabel: latest.editionLabel,
    planningStarted,
    planningMessage
  };
}

export async function attachNativeWorkbookToLearningYear(input: {
  userId: string;
  workbookId: string;
  learningYearId: string;
  deferCoverageRefresh?: boolean;
}) {
  const parent = await getParentContext(input.userId);
  const [year] = await db
    .select({ id: learningYears.id, profileAccountId: profiles.accountId })
    .from(learningYears)
    .innerJoin(profiles, eq(profiles.id, learningYears.profileId))
    .where(eq(learningYears.id, input.learningYearId))
    .limit(1);
  if (!year || year.profileAccountId !== parent.accountId) throw new Error("Learning year not found.");
  const accessState = await requireWorkbookAccess({
    userId: input.userId,
    workbookId: input.workbookId
  });
  const [catalogWorkbook] = await db
    .select({
      id: nativeWorkbooks.id,
      title: nativeWorkbooks.title,
      subjectKey: nativeWorkbooks.subjectKey,
      subjectLabel: nativeWorkbooks.subjectLabel,
      prerequisiteWorkbookId: nativeWorkbooks.prerequisiteWorkbookId,
      activeVersionId: nativeWorkbooks.activeVersionId,
      active: nativeWorkbooks.active,
      status: nativeWorkbooks.status
    })
    .from(nativeWorkbooks)
    .where(eq(nativeWorkbooks.id, input.workbookId))
    .limit(1);
  if (!catalogWorkbook?.activeVersionId) throw new Error("This workbook is not currently available.");
  const [ownedPurchase] = accessState === "owned"
    ? await db.select({
        workbookVersionId: nativeWorkbookPurchases.workbookVersionId
      }).from(nativeWorkbookPurchases).where(and(
        eq(nativeWorkbookPurchases.accountId, parent.accountId),
        eq(nativeWorkbookPurchases.workbookId, input.workbookId),
        eq(nativeWorkbookPurchases.status, "paid")
      )).orderBy(desc(nativeWorkbookPurchases.purchasedAt)).limit(1)
    : [];
  if (
    accessState !== "owned" &&
    (!catalogWorkbook.active || catalogWorkbook.status !== "published")
  ) {
    throw new Error("This workbook is not currently available.");
  }
  const selectedVersionId =
    ownedPurchase?.workbookVersionId ?? catalogWorkbook.activeVersionId;
  const [selectedVersion] = await db.select({
      versionId: nativeWorkbookVersions.id,
      originalFilename: nativeWorkbookVersions.originalFilename,
      objectPath: nativeWorkbookVersions.objectPath,
      mimeType: nativeWorkbookVersions.mimeType,
      sizeBytes: nativeWorkbookVersions.sizeBytes,
      pageCount: nativeWorkbookVersions.pageCount,
      analysisJson: nativeWorkbookVersions.analysisJson,
      curriculumCoverageProfile: nativeWorkbookVersions.curriculumCoverageProfile
    }).from(nativeWorkbookVersions)
    .where(and(
      eq(nativeWorkbookVersions.id, selectedVersionId),
      eq(nativeWorkbookVersions.workbookId, input.workbookId),
      eq(nativeWorkbookVersions.analysisStatus, "ready")
    ))
    .limit(1);
  if (!selectedVersion) throw new Error("The selected workbook edition is not ready.");
  const workbook = { ...catalogWorkbook, ...selectedVersion };
  const [existing] = await db
    .select({ id: contentDocuments.id })
    .from(contentDocuments)
    .innerJoin(
      nativeWorkbookVersions,
      eq(nativeWorkbookVersions.id, contentDocuments.nativeWorkbookVersionId)
    )
    .where(and(
      eq(contentDocuments.learningYearId, input.learningYearId),
      eq(nativeWorkbookVersions.workbookId, input.workbookId),
      isNull(contentDocuments.removedAt)
    )).limit(1);
  if (existing) {
    const prerequisiteResult = await applyNativeWorkbookPrerequisites({
      learningYearId: input.learningYearId
    });
    return {
      attached: false,
      alreadyAttached: true,
      documentId: existing.id,
      prerequisiteApplied: prerequisiteResult.applied > 0,
      curriculumCompletenessResult: null
    };
  }

  const [pageTotal, sortOrder] = await Promise.all([
    db.select({ value: sql<number>`coalesce(sum(${contentDocuments.pageCount}), 0)::integer` })
      .from(contentDocuments)
      .where(and(eq(contentDocuments.learningYearId, input.learningYearId), isNull(contentDocuments.removedAt))),
    db.select({ value: sql<number>`coalesce(max(${contentDocuments.sortOrder}), -1)::integer + 1` })
      .from(contentDocuments)
      .where(eq(contentDocuments.learningYearId, input.learningYearId))
  ]);
  if (Number(pageTotal[0]?.value ?? 0) + workbook.pageCount > MAX_NATIVE_WORKBOOK_PAGES) {
    throw new Error("This lesson plan contains too much material to add another workbook. Remove one or more workbooks, or split the curriculum into separate plans.");
  }

  const result = await db.transaction(async (tx) => {
    const [materialSet] = await tx.insert(learningYearMaterialSets).values({
      learningYearId: input.learningYearId,
      label: workbook.title
    }).returning({ id: learningYearMaterialSets.id });
    const [document] = await tx.insert(contentDocuments).values({
      learningYearId: input.learningYearId,
      materialSetId: materialSet.id,
      label: workbook.title,
      subjectId: null,
      subjectLabel: workbook.subjectLabel,
      documentRole: "student",
      originalFilename: workbook.originalFilename,
      objectPath: workbook.objectPath,
      mimeType: workbook.mimeType,
      sourceKind: "native_workbook",
      nativeWorkbookVersionId: workbook.versionId,
      clientUploadId: `native:${workbook.versionId}`,
      sizeBytes: workbook.sizeBytes,
      pageCount: workbook.pageCount,
      sortOrder: Number(sortOrder[0]?.value ?? 0),
      analysisStatus: "ready",
      analysisJson: {
        ...workbook.analysisJson,
        nativeWorkbookId: workbook.id,
        nativeWorkbookVersionId: workbook.versionId
      }
    }).returning({ id: contentDocuments.id });
    await tx.insert(learningYearSubjectPreferences).values({
      learningYearId: input.learningYearId,
      subjectId: null,
      subjectKey: `custom:${workbook.subjectKey}`,
      subjectLabel: workbook.subjectLabel,
      daysPerWeek: null
    }).onConflictDoUpdate({
      target: [learningYearSubjectPreferences.learningYearId, learningYearSubjectPreferences.subjectKey],
      set: { subjectLabel: workbook.subjectLabel, updatedAt: new Date() }
    });
    await tx.update(learningYears).set({ materialsUpdatedAt: new Date(), updatedAt: new Date() })
      .where(eq(learningYears.id, input.learningYearId));
    return document;
  });
  const prerequisiteResult = await applyNativeWorkbookPrerequisites({
    learningYearId: input.learningYearId
  });
  const coverageProfile = parseCurriculumCoverageProfile(workbook.curriculumCoverageProfile);
  const curriculumCompletenessResult = !input.deferCoverageRefresh && coverageProfile
    ? await applyNativeWorkbookCoverageToLearningYearCache({
        learningYearId: input.learningYearId,
        coverageProfiles: [coverageProfile]
      })
    : null;
  return {
    attached: true,
    alreadyAttached: false,
    documentId: result.id,
    prerequisiteApplied: prerequisiteResult.applied > 0,
    curriculumCompletenessResult
  };
}

async function enrichCurriculumCompletenessResult(input: {
  userId: string;
  learningYearId: string;
  result: CurriculumCompletenessResult | null;
}) {
  if (!input.result) return null;
  const recommendationGroups = await recommendNativeWorkbooksForLearningYear({
    userId: input.userId,
    learningYearId: input.learningYearId,
    concerns: input.result.concerns
  });
  return {
    ...input.result,
    concerns: input.result.concerns.map((concern) => ({
      ...concern,
      workbooks: recommendationGroups.find((group) => group.subject === concern.subject)?.workbooks ?? []
    }))
  };
}

export async function attachNativeCatalogItemToLearningYear(input: {
  userId: string;
  workbookId: string;
  learningYearId: string;
}) {
  const bundle = (await loadBundleCatalogRows({ userId: input.userId }))
    .find((candidate) => candidate.id === input.workbookId);
  if (!bundle) {
    const result = await attachNativeWorkbookToLearningYear(input);
    return {
      ...result,
      curriculumCompletenessResult: await enrichCurriculumCompletenessResult({
        userId: input.userId,
        learningYearId: input.learningYearId,
        result: result.curriculumCompletenessResult
      })
    };
  }
  if (bundle.accessState === "purchase_required") {
    throw new Error("Purchase this workbook bundle before adding it to a lesson plan.");
  }

  const memberVersions = await db.select({
    workbookId: nativeWorkbooks.id,
    versionId: nativeWorkbooks.activeVersionId,
    pageCount: nativeWorkbookVersions.pageCount,
    curriculumCoverageProfile: nativeWorkbookVersions.curriculumCoverageProfile
  }).from(nativeWorkbooks)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, nativeWorkbooks.activeVersionId))
    .where(inArray(nativeWorkbooks.id, bundle.memberWorkbookIds));
  const existing = await db.select({ versionId: contentDocuments.nativeWorkbookVersionId })
    .from(contentDocuments)
    .where(and(
      eq(contentDocuments.learningYearId, input.learningYearId),
      isNull(contentDocuments.removedAt),
      inArray(contentDocuments.nativeWorkbookVersionId, memberVersions.map((member) => member.versionId!))
    ));
  const existingVersionIds = new Set(existing.map((item) => item.versionId));
  const [pageTotal] = await db.select({ value: sql<number>`coalesce(sum(${contentDocuments.pageCount}), 0)::integer` })
    .from(contentDocuments)
    .where(and(eq(contentDocuments.learningYearId, input.learningYearId), isNull(contentDocuments.removedAt)));
  const addedPages = memberVersions
    .filter((member) => !existingVersionIds.has(member.versionId))
    .reduce((total, member) => total + member.pageCount, 0);
  if (Number(pageTotal?.value ?? 0) + addedPages > MAX_NATIVE_WORKBOOK_PAGES) {
    throw new Error("This lesson plan contains too much material to add this bundle. Remove one or more workbooks, or split the curriculum into separate plans.");
  }

  const results = [];
  for (const member of bundle.members) {
    results.push(await attachNativeWorkbookToLearningYear({
      userId: input.userId,
      workbookId: member.id,
      learningYearId: input.learningYearId,
      deferCoverageRefresh: true
    }));
  }
  const attachedCount = results.filter((result) => result.attached).length;
  const coverageProfiles = memberVersions.flatMap((member) => {
    if (existingVersionIds.has(member.versionId)) return [];
    const profile = parseCurriculumCoverageProfile(member.curriculumCoverageProfile);
    return profile ? [profile] : [];
  });
  const coverageResult = coverageProfiles.length
    ? await applyNativeWorkbookCoverageToLearningYearCache({
        learningYearId: input.learningYearId,
        coverageProfiles
      })
    : null;
  return {
    attached: attachedCount > 0,
    alreadyAttached: attachedCount === 0,
    attachedCount,
    documentId: results[0]?.documentId ?? "",
    prerequisiteApplied: results.some((result) => result.prerequisiteApplied),
    curriculumCompletenessResult: await enrichCurriculumCompletenessResult({
      userId: input.userId,
      learningYearId: input.learningYearId,
      result: coverageResult
    })
  };
}

export async function listPurchasedNativeWorkbooks(userId: string) {
  const parent = await getParentContext(userId);
  const rows = await db
    .select({
      purchaseId: nativeWorkbookPurchases.id,
      purchasedAt: nativeWorkbookPurchases.purchasedAt,
      workbookId: nativeWorkbooks.id,
      slug: nativeWorkbooks.slug,
      title: nativeWorkbooks.title,
      subjectLabel: nativeWorkbooks.subjectLabel,
      gradeMin: nativeWorkbooks.gradeMin,
      gradeMax: nativeWorkbooks.gradeMax,
      description: nativeWorkbooks.description,
      thumbnailObjectPath: nativeWorkbooks.thumbnailObjectPath,
      versionId: nativeWorkbookVersions.id,
      pageCount: nativeWorkbookVersions.pageCount
    })
    .from(nativeWorkbookPurchases)
    .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookPurchases.workbookId))
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, nativeWorkbookPurchases.workbookVersionId))
    .where(and(eq(nativeWorkbookPurchases.accountId, parent.accountId), eq(nativeWorkbookPurchases.status, "paid")))
    .orderBy(desc(nativeWorkbookPurchases.purchasedAt));
  return Promise.all(rows.map(async (row) => ({
    ...row,
    thumbnailUrl: await getSignedLessonAssetUrl(row.thumbnailObjectPath, 60).catch(() => null)
  })));
}

async function resolveCheckoutCatalogItems(ids: string[], userId?: string | null) {
  const [workbooks, bundles] = await Promise.all([
    db.select({
      id: nativeWorkbooks.id,
      title: nativeWorkbooks.title,
      description: nativeWorkbooks.description,
      priceInCents: nativeWorkbooks.priceInCents,
      currencyCode: nativeWorkbooks.currencyCode,
      stripePriceId: nativeWorkbooks.stripePriceId,
      activeVersionId: nativeWorkbooks.activeVersionId,
      type: nativeWorkbooks.type,
      pageCount: nativeWorkbookVersions.pageCount
    }).from(nativeWorkbooks)
      .leftJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, nativeWorkbooks.activeVersionId))
      .where(and(
      inArray(nativeWorkbooks.id, ids),
      eq(nativeWorkbooks.active, true),
      eq(nativeWorkbooks.status, "published")
    )),
    loadBundleCatalogRows({ userId })
  ]);
  const byId = new Map<string, {
    id: string;
    catalogKind: CatalogKind;
    title: string;
    description: string;
    priceInCents: number;
    currencyCode: string;
    stripePriceId: string | null;
    activeVersionId: string | null;
    accessState: AccessState;
    type: WorkbookType;
    pageCount: number;
    memberWorkbookIds: string[];
    memberVersionIds: string[];
  }>();
  const workbookAccess = await accessByWorkbookIds(userId, workbooks.map((workbook) => workbook.id));
  for (const workbook of workbooks) {
    byId.set(workbook.id, {
      ...workbook,
      catalogKind: "workbook",
      accessState: workbookAccess.get(workbook.id) ?? "purchase_required",
      pageCount: Number(workbook.pageCount ?? 0),
      memberWorkbookIds: [workbook.id],
      memberVersionIds: workbook.activeVersionId ? [workbook.activeVersionId] : []
    });
  }
  for (const bundle of bundles) {
    if (!ids.includes(bundle.id)) continue;
    byId.set(bundle.id, {
      id: bundle.id,
      catalogKind: "bundle",
      title: bundle.title,
      description: bundle.description,
      priceInCents: bundle.priceInCents,
      currencyCode: bundle.currencyCode,
      stripePriceId: bundle.stripePriceId,
      activeVersionId: null,
      accessState: bundle.accessState,
      type: bundle.type,
      pageCount: Number(bundle.pageCount ?? 0),
      memberWorkbookIds: bundle.memberWorkbookIds,
      memberVersionIds: bundle.members
        .map((member) => member.activeVersionId)
        .filter((versionId): versionId is string => Boolean(versionId))
    });
  }
  return ids.map((id) => byId.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function snapshotBundleActiveVersionIds(bundleId: string) {
  const members = await db.select({
    workbookId: nativeWorkbookBundleItems.workbookId,
    versionId: nativeWorkbooks.activeVersionId
  }).from(nativeWorkbookBundleItems)
    .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookBundleItems.workbookId))
    .where(eq(nativeWorkbookBundleItems.bundleId, bundleId))
    .orderBy(asc(nativeWorkbookBundleItems.sortOrder));
  if (!members.length || members.some((member) => !member.versionId)) {
    throw new Error("This workbook bundle contains an unavailable edition.");
  }
  return members.map((member) => member.versionId!);
}

export async function resolveNativeWorkbookCheckoutSelections(input: {
  ids: string[];
  userId?: string | null;
}) {
  const ids = Array.from(new Set(input.ids.map((id) => normalizeText(id, 80)).filter(Boolean)));
  if (ids.length > MAX_NATIVE_WORKBOOK_CART_ITEMS) {
    throw new Error(`Choose no more than ${MAX_NATIVE_WORKBOOK_CART_ITEMS} Treeschool catalog items.`);
  }
  if (!ids.length) return [];

  const selections = await resolveCheckoutCatalogItems(ids, input.userId);
  if (selections.length !== ids.length || selections.some((item) => item.catalogKind === "workbook" && !item.activeVersionId)) {
    throw new Error("One or more selected Treeschool workbooks are no longer available.");
  }
  const currencies = new Set(selections.map((item) => item.currencyCode.toUpperCase()));
  if (currencies.size !== 1) {
    throw new Error("All selected Treeschool workbooks must use the same currency.");
  }
  const seenWorkbookIds = new Set<string>();
  for (const selection of selections) {
    if (selection.memberWorkbookIds.some((id) => seenWorkbookIds.has(id))) {
      throw new Error("A selected workbook is already included in another selected bundle.");
    }
    selection.memberWorkbookIds.forEach((id) => seenWorkbookIds.add(id));
  }
  const pageCount = selections.reduce((total, item) => total + item.pageCount, 0);
  if (pageCount > MAX_NATIVE_WORKBOOK_PAGES) {
    throw new Error("These selections contain too much material for one lesson plan. Remove one or more workbooks, or split the curriculum into separate plans.");
  }
  return selections;
}

export async function createNativeWorkbookCheckout(input: {
  userId?: string | null;
  email?: string | null;
  workbookId: string;
  successUrl: string;
  cancelUrl: string;
  addToLearningYearId?: string | null;
  funnelKey?: string | null;
  landingVariant?: string | null;
  funnelVisitorId?: string | null;
  funnelAttribution?: FunnelCheckoutAttribution | null;
}) {
  const parent = await getOptionalParentContext(input.userId);
  const email = normalizeText(parent?.email || input.email, 320).toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Enter a valid delivery email address.");
  const [workbook] = await resolveCheckoutCatalogItems([input.workbookId], input.userId);
  if (!workbook || (workbook.catalogKind === "workbook" && !workbook.activeVersionId)) {
    throw new Error("This catalog item is not currently available.");
  }
  if (parent && workbook.accessState === "owned") throw new Error("You already own every workbook in this selection.");
  const [subscription] = parent ? await db.select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions).where(eq(subscriptions.accountId, parent.accountId)).limit(1) : [];
  const funnelKey = normalizeText(input.funnelKey, 80);
  const isFirstGradeFunnel = funnelKey === "first_grade_curriculum";
  const landingVariant =
    isFirstGradeFunnel && (input.landingVariant === "a" || input.landingVariant === "b")
      ? input.landingVariant
      : null;
  const funnelVisitorId =
    isFirstGradeFunnel &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.funnelVisitorId ?? ""
    )
      ? input.funnelVisitorId!.toLowerCase()
      : null;
  const checkoutKind = workbook.catalogKind === "bundle" ? "native_workbook_bundle" : "native_workbook";
  const bundleVersionIds = workbook.catalogKind === "bundle"
    ? await snapshotBundleActiveVersionIds(workbook.id)
    : [];
  const checkoutMetadata = {
    checkoutKind,
    ...(workbook.catalogKind === "bundle"
      ? {
          nativeWorkbookBundleId: workbook.id,
          nativeWorkbookBundleVersionIds: bundleVersionIds.join("|")
        }
      : { nativeWorkbookId: workbook.id, nativeWorkbookVersionId: workbook.activeVersionId! }),
    deliveryEmail: email,
    ...(parent ? { accountId: parent.accountId, userId: input.userId! } : {}),
    ...(input.addToLearningYearId ? { addToLearningYearId: input.addToLearningYearId } : {}),
    ...(funnelKey ? { funnelKey } : {}),
    ...(landingVariant ? { landingVariant } : {}),
    ...(funnelVisitorId ? { funnelVisitorId } : {}),
    ...funnelCheckoutMetadata(input.funnelAttribution)
  };
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(withTreeschoolCheckoutBranding({
    mode: "payment",
    customer: subscription?.stripeCustomerId ?? undefined,
    customer_email: subscription?.stripeCustomerId ? undefined : email,
    customer_creation: isFirstGradeFunnel && !subscription?.stripeCustomerId ? "always" : undefined,
    client_reference_id: parent?.accountId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: true,
    line_items: [{
      quantity: 1,
      ...(workbook.stripePriceId
        ? { price: workbook.stripePriceId }
        : {
            price_data: {
              currency: workbook.currencyCode.toLowerCase(),
              unit_amount: workbook.priceInCents,
              product_data: { name: workbook.title, description: workbook.description }
            }
          })
    }],
    metadata: checkoutMetadata,
    payment_intent_data: isFirstGradeFunnel || input.funnelAttribution
      ? {
          ...(isFirstGradeFunnel ? { setup_future_usage: "off_session" as const } : {}),
          metadata: checkoutMetadata
        }
      : undefined
  }));
  return { id: session.id, url: session.url };
}

export async function createNativeWorkbookCartCheckout(input: {
  userId?: string | null;
  email?: string | null;
  workbookIds: string[];
  successUrl: string;
  cancelUrl: string;
  funnelKey?: string | null;
  landingVariant?: "a" | "b" | null;
  funnelVisitorId?: string | null;
  funnelAttribution?: FunnelCheckoutAttribution | null;
}) {
  const workbookIds = Array.from(new Set(input.workbookIds.map((id) => normalizeText(id, 80)).filter(Boolean)));
  if (!workbookIds.length) throw new Error("Add at least one item to your cart.");
  if (workbookIds.length > MAX_NATIVE_WORKBOOK_CART_ITEMS) {
    throw new Error(`A cart may contain up to ${MAX_NATIVE_WORKBOOK_CART_ITEMS} items.`);
  }

  const parent = await getOptionalParentContext(input.userId);
  const email = normalizeText(parent?.email || input.email, 320).toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Enter a valid delivery email address.");

  const workbooks = await resolveCheckoutCatalogItems(workbookIds, input.userId);
  if (workbooks.length !== workbookIds.length || workbooks.some((workbook) => workbook.catalogKind === "workbook" && !workbook.activeVersionId)) {
    throw new Error("One or more items in your cart are no longer available.");
  }
  const selectedBundleIds = workbooks.filter((item) => item.catalogKind === "bundle").map((item) => item.id);
  const bundleMembers = selectedBundleIds.length ? await db.select({
    bundleId: nativeWorkbookBundleItems.bundleId,
    workbookId: nativeWorkbookBundleItems.workbookId,
    activeVersionId: nativeWorkbooks.activeVersionId
  }).from(nativeWorkbookBundleItems)
    .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookBundleItems.workbookId))
    .where(inArray(nativeWorkbookBundleItems.bundleId, selectedBundleIds))
    .orderBy(asc(nativeWorkbookBundleItems.bundleId), asc(nativeWorkbookBundleItems.sortOrder)) : [];
  const bundleMembersById = new Map<string, Array<{ workbookId: string; versionId: string }>>();
  for (const member of bundleMembers) {
    if (!member.activeVersionId) throw new Error("A selected workbook bundle contains an unavailable edition.");
    const current = bundleMembersById.get(member.bundleId) ?? [];
    current.push({ workbookId: member.workbookId, versionId: member.activeVersionId });
    bundleMembersById.set(member.bundleId, current);
  }
  const seenMemberIds = new Set<string>();
  for (const item of workbooks) {
    const memberIds = item.catalogKind === "bundle"
      ? (bundleMembersById.get(item.id) ?? []).map((member) => member.workbookId)
      : [item.id];
    if (memberIds.some((id) => seenMemberIds.has(id))) {
      throw new Error("Your cart contains overlapping bundles or a workbook that is already inside a selected bundle.");
    }
    memberIds.forEach((id) => seenMemberIds.add(id));
  }
  const currencies = new Set(workbooks.map((workbook) => workbook.currencyCode));
  if (currencies.size !== 1) throw new Error("All workbooks in a cart must use the same currency.");

  const alreadyOwned = parent ? workbooks.find((workbook) => workbook.accessState === "owned") : null;
  if (alreadyOwned) throw new Error(`You already own ${alreadyOwned.title}. Remove it from the cart to continue.`);

  const [subscription] = parent ? await db.select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions).where(eq(subscriptions.accountId, parent.accountId)).limit(1) : [];
  const itemMetadata = Object.fromEntries(workbooks.flatMap((workbook, index) => [
    [`kind${index}`, workbook.catalogKind],
    [`item${index}`, workbook.id],
    ...(workbook.catalogKind === "bundle"
      ? [[`versions${index}`, (bundleMembersById.get(workbook.id) ?? []).map((member) => member.versionId).join("|")]]
      : [[`version${index}`, workbook.activeVersionId!]]),
    [`amount${index}`, String(workbook.priceInCents)]
  ]));
  const funnelKey = normalizeText(input.funnelKey, 80) === "first_grade_curriculum"
    ? "first_grade_curriculum"
    : null;
  const landingVariant = input.landingVariant === "a" || input.landingVariant === "b"
    ? input.landingVariant
    : null;
  const funnelVisitorCandidate = String(input.funnelVisitorId ?? "").trim().toLowerCase();
  const funnelVisitorId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(funnelVisitorCandidate)
    ? funnelVisitorCandidate
    : null;
  const legacyFunnelMetadata = funnelKey && landingVariant && funnelVisitorId
    ? { funnelKey, landingVariant, funnelVisitorId }
    : {};
  const checkoutMetadata = {
    checkoutKind: "native_workbook_cart",
    itemCount: String(workbooks.length),
    deliveryEmail: email,
    ...(parent ? { accountId: parent.accountId, userId: input.userId! } : {}),
    ...itemMetadata,
    ...legacyFunnelMetadata,
    ...funnelCheckoutMetadata(input.funnelAttribution)
  };
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(withTreeschoolCheckoutBranding({
    mode: "payment",
    customer: subscription?.stripeCustomerId ?? undefined,
    customer_email: subscription?.stripeCustomerId ? undefined : email,
    client_reference_id: parent?.accountId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: true,
    line_items: workbooks.map((workbook) => ({
      quantity: 1,
      ...(workbook.stripePriceId
        ? { price: workbook.stripePriceId }
        : {
            price_data: {
              currency: workbook.currencyCode.toLowerCase(),
              unit_amount: workbook.priceInCents,
              product_data: { name: workbook.title, description: workbook.description }
            }
          })
    })),
    metadata: checkoutMetadata,
    payment_intent_data: Object.keys(legacyFunnelMetadata).length || input.funnelAttribution
      ? {
          metadata: checkoutMetadata
        }
      : undefined
  }));
  return { id: session.id, url: session.url };
}

export type PostCheckoutWorkbookOfferItem = {
  id: string;
  versionId: string;
  title: string;
  description: string;
  priceInCents: number;
  currencyCode: string;
  thumbnailUrl: string | null;
};

export async function resolveJapanesePostCheckoutWorkbookOffer(input: {
  accountId?: string | null;
  email: string;
}) {
  const rows = await db
    .select({
      id: nativeWorkbooks.id,
      versionId: nativeWorkbookVersions.id,
      title: nativeWorkbooks.title,
      description: nativeWorkbooks.description,
      subjectKey: nativeWorkbooks.subjectKey,
      subjectLabel: nativeWorkbooks.subjectLabel,
      priceInCents: nativeWorkbooks.priceInCents,
      currencyCode: nativeWorkbooks.currencyCode,
      thumbnailObjectPath: nativeWorkbooks.thumbnailObjectPath
    })
    .from(nativeWorkbooks)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, nativeWorkbooks.activeVersionId))
    .where(and(
      eq(nativeWorkbooks.active, true),
      eq(nativeWorkbooks.status, "published"),
      lte(nativeWorkbooks.gradeMin, 1),
      gte(nativeWorkbooks.gradeMax, 1),
      or(
        eq(nativeWorkbooks.subjectKey, "japanese"),
        ilike(nativeWorkbooks.subjectLabel, "Japanese"),
        ilike(nativeWorkbooks.title, "Japanese %")
      )
    ))
    .orderBy(asc(nativeWorkbooks.title));

  const letteredRows = rows.filter((row) => /\bjapanese\s+[a-d]\b/i.test(row.title));
  const candidates = (letteredRows.length ? letteredRows : rows).slice(0, 4);
  if (!candidates.length) {
    return { full: null, starter: null };
  }

  const purchaseConditions = [
    eq(nativeWorkbookPurchases.status, "paid"),
    inArray(nativeWorkbookPurchases.workbookId, candidates.map((item) => item.id))
  ];
  const ownershipScope = input.accountId
    ? or(
        eq(nativeWorkbookPurchases.accountId, input.accountId),
        eq(nativeWorkbookPurchases.email, input.email.toLowerCase())
      )
    : eq(nativeWorkbookPurchases.email, input.email.toLowerCase());
  const ownedRows = await db
    .select({ workbookId: nativeWorkbookPurchases.workbookId })
    .from(nativeWorkbookPurchases)
    .where(and(...purchaseConditions, ownershipScope));
  const ownedIds = new Set(ownedRows.map((row) => row.workbookId));
  const available = candidates.filter((item) => !ownedIds.has(item.id));
  if (!available.length) {
    return { full: null, starter: null };
  }

  const currencies = new Set(available.map((item) => item.currencyCode.toUpperCase()));
  if (currencies.size !== 1) {
    throw new Error("The Japanese workbook collection must use one currency.");
  }

  const serialize = async (items: typeof available): Promise<PostCheckoutWorkbookOfferItem[]> =>
    Promise.all(items.map(async (item) => ({
      id: item.id,
      versionId: item.versionId,
      title: item.title,
      description: item.description,
      priceInCents: item.priceInCents,
      currencyCode: item.currencyCode,
      thumbnailUrl: await getSignedLessonAssetUrl(item.thumbnailObjectPath, 60).catch(() => null)
    })));

  const fullItems = await serialize(available);
  const starterCandidate = available.find((item) => /\bjapanese\s+a\b/i.test(item.title)) ?? available[0];
  const starterItems = available.length > 1 ? await serialize([starterCandidate]) : null;
  return {
    full: {
      key: "japanese-a-d",
      title: fullItems.length > 1
        ? `Japanese A–${String.fromCharCode(64 + fullItems.length)}`
        : fullItems[0].title,
      description: fullItems.length > 1
        ? "Add a printable Japanese language sequence that can grow with your child beyond the core first-grade subjects."
        : "Add a printable Japanese language elective alongside the core first-grade subjects.",
      items: fullItems,
      priceInCents: fullItems.reduce((total, item) => total + item.priceInCents, 0),
      currencyCode: fullItems[0].currencyCode
    },
    starter: starterItems
      ? {
          key: "japanese-a",
          title: starterItems[0].title,
          description: "Begin with the first Japanese workbook now. You can add later levels whenever your family is ready.",
          items: starterItems,
          priceInCents: starterItems[0].priceInCents,
          currencyCode: starterItems[0].currencyCode
        }
      : null
  };
}

function downloadTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendWorkbookDeliveryEmail(input: {
  email: string;
  items: Array<{ title: string; downloadUrl: string }>;
}) {
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    throw new Error("Workbook delivery email is not configured.");
  }
  if ((env.SMTP_USER && !env.SMTP_PASSWORD) || (!env.SMTP_USER && env.SMTP_PASSWORD)) {
    throw new Error("SMTP authentication is incomplete. Set both SMTP_USER and SMTP_PASSWORD, or neither for local Mailpit.");
  }
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.default.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER && env.SMTP_PASSWORD
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {})
  });
  await transport.sendMail({
    from: env.SMTP_FROM,
    to: input.email,
    subject: input.items.length === 1
      ? `Your Treeschool workbook: ${input.items[0].title}`
      : `Your ${input.items.length} Treeschool workbooks`,
    text: `Thank you for your purchase.\n\n${input.items.map((item) => `${item.title}: ${item.downloadUrl}`).join("\n")}\n\nThese secure links expire in ${DOWNLOAD_LINK_LIFETIME_DAYS} days. Purchased workbooks also remain available in your Treeschool account when the purchase email matches your account.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px"><h1 style="font-size:26px">Your workbook${input.items.length === 1 ? " is" : "s are"} ready</h1><p>Thank you for your purchase.</p>${input.items.map((item) => `<div style="margin:18px 0"><p style="font-weight:700;margin-bottom:8px">${escapeHtml(item.title)}</p><a href="${escapeHtml(item.downloadUrl)}" style="display:inline-block;background:#7a5a43;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Download PDF</a></div>`).join("")}<p style="color:#667085;font-size:13px">These secure links expire in ${DOWNLOAD_LINK_LIFETIME_DAYS} days. If this email matches your Treeschool account, the workbooks also remain in Purchased Workbooks.</p></div>`
  });
}

async function expandPurchasedCatalogSelections(input: {
  checkoutKind: string;
  metadata: Record<string, string>;
  session: Stripe.Checkout.Session;
}) {
  const selections: Array<{
    catalogKind: CatalogKind;
    id: string;
    versionId?: string;
    versionIds?: string[];
    priceInCents: number;
    purchased?: boolean;
  }> = input.checkoutKind === "native_workbook"
    ? [{
        catalogKind: "workbook",
        id: input.metadata.nativeWorkbookId ?? "",
        versionId: input.metadata.nativeWorkbookVersionId ?? "",
        priceInCents: input.session.amount_subtotal ?? input.session.amount_total ?? 0
      }]
    : input.checkoutKind === "native_workbook_bundle"
      ? [{
          catalogKind: "bundle",
          id: input.metadata.nativeWorkbookBundleId ?? "",
          versionIds: input.metadata.nativeWorkbookBundleVersionIds?.split("|").filter(Boolean),
          priceInCents: input.session.amount_subtotal ?? input.session.amount_total ?? 0
        }]
      : Array.from({
          length: Number(
            ["plan_pack", "core_subscription"].includes(input.checkoutKind)
              ? input.metadata.nativeItemCount ?? 0
              : input.metadata.itemCount ?? 0
          )
        }, (_, index) => ({
          catalogKind: input.metadata[
            ["plan_pack", "core_subscription"].includes(input.checkoutKind) ? `nativeKind${index}` : `kind${index}`
          ]
            ? normalizeCatalogKind(input.metadata[
                ["plan_pack", "core_subscription"].includes(input.checkoutKind) ? `nativeKind${index}` : `kind${index}`
              ])
            : "workbook",
          id: input.metadata[
            ["plan_pack", "core_subscription"].includes(input.checkoutKind) ? `nativeItem${index}` : `item${index}`
          ] ?? input.metadata[`workbook${index}`] ?? "",
          versionId: input.metadata[`version${index}`] || undefined,
          versionIds: input.metadata[`versions${index}`]?.split("|").filter(Boolean),
          priceInCents: Number(input.metadata[
            ["plan_pack", "core_subscription"].includes(input.checkoutKind) ? `nativeAmount${index}` : `amount${index}`
          ] ?? NaN),
          purchased: !["plan_pack", "core_subscription"].includes(input.checkoutKind) ||
            input.metadata[`nativePurchased${index}`] === "true"
        })).filter((selection) => selection.purchased);
  if (selections.length === 0 && ["plan_pack", "core_subscription"].includes(input.checkoutKind)) return [];
  if (!selections.length || selections.length > MAX_NATIVE_WORKBOOK_CART_ITEMS || selections.some((item) =>
    !item.id || !Number.isInteger(item.priceInCents) || item.priceInCents < 0
  )) throw new Error("Native workbook checkout metadata is incomplete.");

  const expanded: Array<{ workbookId: string; versionId: string; priceInCents: number }> = [];
  for (const selection of selections) {
    if (selection.catalogKind === "workbook") {
      const [workbook] = await db.select({
        workbookId: nativeWorkbooks.id,
        versionId: nativeWorkbookVersions.id
      }).from(nativeWorkbooks)
        .innerJoin(nativeWorkbookVersions, selection.versionId
          ? and(
              eq(nativeWorkbookVersions.workbookId, nativeWorkbooks.id),
              eq(nativeWorkbookVersions.id, selection.versionId)
            )!
          : eq(nativeWorkbookVersions.id, nativeWorkbooks.activeVersionId))
        .where(eq(nativeWorkbooks.id, selection.id))
        .limit(1);
      if (!workbook) throw new Error("A purchased workbook or edition no longer exists.");
      expanded.push({ ...workbook, priceInCents: selection.priceInCents });
      continue;
    }

    const members = await db.select({
      workbookId: nativeWorkbooks.id,
      activeVersionId: nativeWorkbooks.activeVersionId,
      retailPriceInCents: nativeWorkbooks.priceInCents
    }).from(nativeWorkbookBundleItems)
      .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookBundleItems.workbookId))
      .where(eq(nativeWorkbookBundleItems.bundleId, selection.id))
      .orderBy(asc(nativeWorkbookBundleItems.sortOrder));
    if (!members.length) throw new Error("A purchased workbook bundle no longer exists.");
    const pinnedVersions = selection.versionIds?.length
      ? await db.select({
          id: nativeWorkbookVersions.id,
          workbookId: nativeWorkbookVersions.workbookId
        }).from(nativeWorkbookVersions)
          .where(inArray(nativeWorkbookVersions.id, selection.versionIds))
      : [];
    const pinnedVersionByWorkbookId = new Map(pinnedVersions.map((version) => [version.workbookId, version.id]));
    if (selection.versionIds?.length && (
      selection.versionIds.length !== members.length ||
      pinnedVersions.length !== members.length ||
      members.some((member) => !pinnedVersionByWorkbookId.has(member.workbookId))
    )) {
      throw new Error("A purchased workbook bundle edition snapshot is incomplete.");
    }
    const retailTotal = members.reduce((total, member) => total + member.retailPriceInCents, 0);
    let allocated = 0;
    members.forEach((member, index) => {
      const priceInCents = index === members.length - 1
        ? selection.priceInCents - allocated
        : retailTotal > 0
          ? Math.floor((selection.priceInCents * member.retailPriceInCents) / retailTotal)
          : Math.floor(selection.priceInCents / members.length);
      allocated += priceInCents;
      const versionId = pinnedVersionByWorkbookId.get(member.workbookId) ?? member.activeVersionId;
      if (!versionId) throw new Error("A purchased workbook edition no longer exists.");
      expanded.push({ workbookId: member.workbookId, versionId, priceInCents });
    });
  }

  const merged = new Map<string, { workbookId: string; versionId: string; priceInCents: number }>();
  for (const item of expanded) {
    const key = `${item.workbookId}:${item.versionId}`;
    const current = merged.get(key);
    merged.set(key, current
      ? { ...current, priceInCents: current.priceInCents + item.priceInCents }
      : item);
  }
  return Array.from(merged.values());
}

export async function fulfillNativeWorkbookCheckout(session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {};
  const checkoutKind = metadata.checkoutKind;
  if (!["native_workbook", "native_workbook_bundle", "native_workbook_cart", "plan_pack", "core_subscription"].includes(checkoutKind ?? "")) return { handled: false };
  if (["plan_pack", "core_subscription"].includes(checkoutKind ?? "") && Number(metadata.nativeItemCount ?? 0) === 0) {
    return { handled: false };
  }
  const checkoutItems = await expandPurchasedCatalogSelections({ checkoutKind: checkoutKind!, metadata, session });
  if (checkoutItems.length === 0) return { handled: false };
  const [existing] = await db.select({ id: nativeWorkbookPurchases.id })
    .from(nativeWorkbookPurchases)
    .where(eq(nativeWorkbookPurchases.stripeCheckoutSessionId, session.id)).limit(1);
  if (existing) return { handled: true, purchaseIds: [existing.id], duplicate: true };

  const email = normalizeText(
    session.customer_details?.email || session.customer_email || metadata.deliveryEmail,
    320
  ).toLowerCase();
  if (!email) throw new Error("The workbook purchase has no delivery email.");
  let accountId = metadata.accountId || null;
  if (!accountId) {
    const [matchingAccount] = await db.select({ accountId: profiles.accountId })
      .from(users).innerJoin(profiles, eq(profiles.userId, users.id))
      .where(and(eq(users.email, email), eq(profiles.role, "PARENT"))).limit(1);
    accountId = matchingAccount?.accountId ?? null;
  }
  const purchasedRows = await db.select({
    workbookId: nativeWorkbooks.id,
    title: nativeWorkbooks.title,
    versionId: nativeWorkbookVersions.id
  }).from(nativeWorkbooks)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.workbookId, nativeWorkbooks.id))
    .where(and(
      inArray(nativeWorkbooks.id, checkoutItems.map((item) => item.workbookId)),
      inArray(nativeWorkbookVersions.id, checkoutItems.map((item) => item.versionId))
    ));
  const purchasedByPair = new Map(purchasedRows.map((row) => [`${row.workbookId}:${row.versionId}`, row]));
  const items = checkoutItems.map((item) => ({
    ...item,
    workbook: purchasedByPair.get(`${item.workbookId}:${item.versionId}`)
  }));
  if (items.some((item) => !item.workbook)) throw new Error("A purchased workbook or edition no longer exists.");

  const listedTotal = items.reduce((sum, item) => sum + item.priceInCents, 0);
  const paidTotal = ["plan_pack", "core_subscription"].includes(checkoutKind ?? "")
    ? listedTotal
    : session.amount_total ?? listedTotal;
  let allocatedTotal = 0;
  const pricedItems = items.map((item, index) => {
    const amountInCents = index === items.length - 1
      ? paidTotal - allocatedTotal
      : listedTotal > 0
        ? Math.floor((paidTotal * item.priceInCents) / listedTotal)
        : 0;
    allocatedTotal += amountInCents;
    return { ...item, amountInCents };
  });
  const tokens = pricedItems.map(() => randomBytes(32).toString("base64url"));
  const expiresAt = new Date(Date.now() + DOWNLOAD_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  const purchases = await db.transaction(async (tx) => {
    const rows = await tx.insert(nativeWorkbookPurchases).values(pricedItems.map((item) => ({
      workbookId: item.workbookId,
      workbookVersionId: item.versionId,
      accountId,
      email,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
      amountInCents: item.amountInCents,
      currencyCode: (session.currency || "usd").toUpperCase(),
      status: "paid",
      deliveryStatus: "pending"
    }))).returning({ id: nativeWorkbookPurchases.id, workbookId: nativeWorkbookPurchases.workbookId });
    const purchaseByWorkbookId = new Map(rows.map((row) => [row.workbookId, row]));
    await tx.insert(nativeWorkbookDownloadLinks).values(pricedItems.map((item, index) => ({
      purchaseId: purchaseByWorkbookId.get(item.workbookId)!.id,
      tokenHash: downloadTokenHash(tokens[index]),
      expiresAt
    })));
    return rows;
  });
  const appUrl = (env.PUBLIC_APP_URL || "https://www.treehomeschool.com").replace(/\/$/, "");
  const deliveryItems = pricedItems.map((item, index) => ({
    workbookId: item.workbookId,
    title: item.workbook!.title,
    downloadUrl: `${appUrl}/api/workbooks/download?token=${encodeURIComponent(tokens[index])}`
  }));
  if (accountId && metadata.addToLearningYearId) {
    const [parentUser] = await db.select({ userId: profiles.userId })
      .from(profiles)
      .where(and(eq(profiles.accountId, accountId), eq(profiles.role, "PARENT")))
      .limit(1);
    if (parentUser?.userId) {
      for (const item of deliveryItems) {
        await attachNativeWorkbookToLearningYear({
          userId: parentUser.userId,
          workbookId: item.workbookId,
          learningYearId: metadata.addToLearningYearId
        }).catch((error) => {
          console.error("Could not automatically add purchased workbook to the learning year:", error);
        });
      }
    }
  }
  const purchaseIds = purchases.map((purchase) => purchase.id);
  try {
    await sendWorkbookDeliveryEmail({ email, items: deliveryItems });
    await db.update(nativeWorkbookPurchases).set({ deliveryStatus: "sent", deliveryError: null })
      .where(inArray(nativeWorkbookPurchases.id, purchaseIds));
  } catch (error) {
    await db.update(nativeWorkbookPurchases).set({
      deliveryStatus: "failed",
      deliveryError: error instanceof Error ? error.message : "Unknown email delivery error."
    }).where(inArray(nativeWorkbookPurchases.id, purchaseIds));
  }
  return { handled: true, purchaseIds, downloadUrls: deliveryItems.map((item) => item.downloadUrl) };
}

export async function fulfillNativeWorkbookPaymentIntent(intent: Stripe.PaymentIntent) {
  if (
    intent.status !== "succeeded" ||
    !["post_checkout_offer", "funnel_one_click_offer"].includes(intent.metadata.checkoutSource) ||
    intent.metadata.checkoutKind !== "native_workbook_cart"
  ) {
    return { handled: false };
  }
  const deliveryEmail = normalizeText(intent.metadata.deliveryEmail, 320).toLowerCase();
  if (!deliveryEmail) throw new Error("The post-checkout workbook purchase has no delivery email.");

  const syntheticSession = {
    id: `post_checkout:${intent.id}`,
    amount_subtotal: intent.amount,
    amount_total: intent.amount_received || intent.amount,
    currency: intent.currency,
    customer_email: deliveryEmail,
    customer_details: { email: deliveryEmail },
    payment_intent: intent.id,
    metadata: intent.metadata
  } as unknown as Stripe.Checkout.Session;

  return fulfillNativeWorkbookCheckout(syntheticSession);
}

export async function getNativeWorkbookDownloadByToken(token: string) {
  const [row] = await db.select({
    linkId: nativeWorkbookDownloadLinks.id,
    expiresAt: nativeWorkbookDownloadLinks.expiresAt,
    purchaseStatus: nativeWorkbookPurchases.status,
    title: nativeWorkbooks.title,
    originalFilename: nativeWorkbookVersions.originalFilename,
    objectPath: nativeWorkbookVersions.objectPath,
    mimeType: nativeWorkbookVersions.mimeType
  }).from(nativeWorkbookDownloadLinks)
    .innerJoin(nativeWorkbookPurchases, eq(nativeWorkbookPurchases.id, nativeWorkbookDownloadLinks.purchaseId))
    .innerJoin(nativeWorkbooks, eq(nativeWorkbooks.id, nativeWorkbookPurchases.workbookId))
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, nativeWorkbookPurchases.workbookVersionId))
    .where(eq(nativeWorkbookDownloadLinks.tokenHash, downloadTokenHash(token))).limit(1);
  if (!row || row.expiresAt <= new Date() || row.purchaseStatus !== "paid") {
    throw new Error("This workbook download link is invalid or has expired.");
  }
  await db.update(nativeWorkbookDownloadLinks).set({
    downloadCount: sql`${nativeWorkbookDownloadLinks.downloadCount} + 1`,
    lastDownloadedAt: new Date()
  }).where(eq(nativeWorkbookDownloadLinks.id, row.linkId));
  return { bytes: await downloadPrivateFile(row.objectPath), filename: row.originalFilename || `${slugify(row.title)}.pdf`, mimeType: row.mimeType };
}

export async function getPurchasedNativeWorkbookDownload(input: { userId: string; purchaseId: string }) {
  const parent = await getParentContext(input.userId);
  const [row] = await db.select({
    originalFilename: nativeWorkbookVersions.originalFilename,
    objectPath: nativeWorkbookVersions.objectPath,
    mimeType: nativeWorkbookVersions.mimeType
  }).from(nativeWorkbookPurchases)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, nativeWorkbookPurchases.workbookVersionId))
    .where(and(
      eq(nativeWorkbookPurchases.id, input.purchaseId),
      eq(nativeWorkbookPurchases.accountId, parent.accountId),
      eq(nativeWorkbookPurchases.status, "paid")
    )).limit(1);
  if (!row) throw new Error("Purchased workbook not found.");
  return { bytes: await downloadPrivateFile(row.objectPath), filename: row.originalFilename, mimeType: row.mimeType };
}

function subjectAliases(subject: string) {
  const normalized = slugify(subject);
  const aliases = new Set([normalized]);
  if (/language|english|reading|writing|grammar|spelling/.test(normalized)) {
    ["language-arts", "english", "reading", "writing", "grammar", "spelling"].forEach((value) => aliases.add(value));
  }
  if (/math/.test(normalized)) ["mathematics", "math"].forEach((value) => aliases.add(value));
  if (/social|history|geography|civics/.test(normalized)) {
    ["social-studies", "history", "geography", "civics"].forEach((value) => aliases.add(value));
  }
  if (/science/.test(normalized)) aliases.add("science");
  return aliases;
}

export async function recommendNativeWorkbooks(input: {
  userId: string;
  gradeLevel: number | null;
  concerns: Array<{ subject: string; priority: "essential" | "recommended" }>;
  excludeWorkbookIds?: string[];
}) {
  if (input.concerns.length === 0) return [];
  const catalog = await listNativeWorkbookCatalog({ userId: input.userId, grade: input.gradeLevel });
  const excludedWorkbookIds = new Set(input.excludeWorkbookIds ?? []);
  return input.concerns.map((concern) => {
    const aliases = subjectAliases(concern.subject);
    const matches = catalog.filter((workbook) => {
      if (catalogItemOverlapsAttachedWorkbooks(workbook, excludedWorkbookIds)) return false;
      const searchable = [workbook.curriculumAreaKey, workbook.subjectKey, workbook.subjectLabel, ...workbook.coverageTags].map(slugify);
      return searchable.some((value) => Array.from(aliases).some((alias) => value.includes(alias) || alias.includes(value)));
    }).sort((left, right) => {
      if (concern.priority === "essential" && left.type !== right.type) return left.type === "core" ? -1 : 1;
      if (left.accessState !== right.accessState) return left.accessState === "purchase_required" ? 1 : -1;
      if (left.catalogKind !== right.catalogKind) return left.catalogKind === "bundle" ? -1 : 1;
      return left.title.localeCompare(right.title);
    }).slice(0, 2);
    return { subject: concern.subject, workbooks: matches };
  });
}

export async function recommendNativeWorkbooksForLearningYear(input: {
  userId: string;
  learningYearId: string;
  concerns: Array<{ subject: string; priority: "essential" | "recommended" }>;
}) {
  const parent = await getParentContext(input.userId);
  const [[year], attachedWorkbooks] = await Promise.all([
    db
      .select({ gradeLevel: profiles.gradeLevel, accountId: profiles.accountId })
      .from(learningYears)
      .innerJoin(profiles, eq(profiles.id, learningYears.profileId))
      .where(eq(learningYears.id, input.learningYearId))
      .limit(1),
    db
      .select({ workbookId: nativeWorkbookVersions.workbookId })
      .from(contentDocuments)
      .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, contentDocuments.nativeWorkbookVersionId))
      .where(and(
        eq(contentDocuments.learningYearId, input.learningYearId),
        isNull(contentDocuments.removedAt)
      ))
  ]);
  if (!year || year.accountId !== parent.accountId) throw new Error("Learning year not found.");
  return recommendNativeWorkbooks({
    userId: input.userId,
    gradeLevel: year.gradeLevel,
    concerns: input.concerns,
    excludeWorkbookIds: attachedWorkbooks.map((workbook) => workbook.workbookId)
  });
}

export async function backfillNativeWorkbookCoverageProfiles(input: {
  limit?: number;
  force?: boolean;
} = {}) {
  const limit = Math.max(1, Math.min(500, Math.round(input.limit ?? 100)));
  const rows = await db.select({
    workbookId: nativeWorkbooks.id,
    versionId: nativeWorkbookVersions.id,
    title: nativeWorkbooks.title,
    subjectLabel: nativeWorkbooks.subjectLabel,
    curriculumAreaKey: nativeWorkbooks.curriculumAreaKey,
    gradeMin: nativeWorkbooks.gradeMin,
    gradeMax: nativeWorkbooks.gradeMax,
    languageCode: nativeWorkbooks.languageCode,
    analysisJson: nativeWorkbookVersions.analysisJson,
    coverageProfile: nativeWorkbookVersions.curriculumCoverageProfile,
    coverageFrameworkVersion: nativeWorkbookVersions.curriculumCoverageFrameworkVersion
  }).from(nativeWorkbooks)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.id, nativeWorkbooks.activeVersionId))
    .where(eq(nativeWorkbookVersions.analysisStatus, "ready"))
    .orderBy(asc(nativeWorkbooks.createdAt))
    .limit(limit);

  const candidates = rows.filter((row) => input.force === true
    || row.coverageFrameworkVersion !== CURRICULUM_COVERAGE_FRAMEWORK_VERSION
    || !parseCurriculumCoverageProfile(row.coverageProfile));
  const completed: string[] = [];
  const failed: Array<{ workbookId: string; title: string; error: string }> = [];
  for (const row of candidates) {
    try {
      const profile = await generateCurriculumCoverageProfile({
        title: row.title,
        subjectLabel: row.subjectLabel,
        curriculumAreaKey: row.curriculumAreaKey,
        gradeMin: row.gradeMin,
        gradeMax: row.gradeMax,
        languageCode: row.languageCode,
        analysis: row.analysisJson,
        source: "ai_backfill",
        usageContext: { nativeWorkbookVersionId: row.versionId }
      });
      await db.update(nativeWorkbookVersions).set({
        curriculumCoverageProfile: profile,
        curriculumCoverageFrameworkVersion: CURRICULUM_COVERAGE_FRAMEWORK_VERSION,
        curriculumCoverageProfiledAt: new Date()
      }).where(eq(nativeWorkbookVersions.id, row.versionId));
      completed.push(row.workbookId);
    } catch (error) {
      failed.push({
        workbookId: row.workbookId,
        title: row.title,
        error: error instanceof Error ? error.message : "Unknown curriculum coverage profiling error."
      });
    }
  }
  return { scanned: rows.length, eligible: candidates.length, completed, failed };
}

export async function removeAbandonedNativeWorkbookUploads() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const abandoned = await db.select({
    workbookId: nativeWorkbooks.id,
    objectPath: nativeWorkbookVersions.objectPath,
    thumbnailObjectPath: nativeWorkbooks.thumbnailObjectPath
  }).from(nativeWorkbooks)
    .innerJoin(nativeWorkbookVersions, eq(nativeWorkbookVersions.workbookId, nativeWorkbooks.id))
    .where(and(eq(nativeWorkbooks.status, "awaiting_upload"), lte(nativeWorkbooks.createdAt, cutoff)));
  for (const item of abandoned) {
    await db.delete(nativeWorkbooks).where(eq(nativeWorkbooks.id, item.workbookId));
    await Promise.all([
      deletePrivateFile(item.objectPath).catch(() => undefined),
      deletePrivateFile(item.thumbnailObjectPath).catch(() => undefined)
    ]);
  }
  return { deleted: abandoned.length };
}
