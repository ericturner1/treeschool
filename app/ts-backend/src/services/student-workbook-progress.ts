import { and, eq, inArray } from "drizzle-orm";
import {
  nativeWorkbookVersions,
  studentWorkbookUnitProgress
} from "ts-db";
import { db } from "../db";

export type WorkbookUnitProgressStatus = "completed" | "mastered" | "deferred";

export type NativeWorkbookProgressSummary = {
  total: number;
  completed: number;
  mastered: number;
  deferred: number;
  notStarted: number;
};

function canonicalUnitIds(analysisJson: unknown) {
  if (!analysisJson || typeof analysisJson !== "object") return [];
  const units = (analysisJson as { learningUnits?: unknown }).learningUnits;
  if (!Array.isArray(units)) return [];
  return Array.from(new Set(units.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const id = String((candidate as { id?: unknown }).id ?? "").trim();
    return id ? [id] : [];
  })));
}

export async function loadWorkbookUnitProgress(input: {
  profileId: string;
  nativeWorkbookVersionIds: string[];
}) {
  const versionIds = Array.from(new Set(input.nativeWorkbookVersionIds.filter(Boolean)));
  if (versionIds.length === 0) return [];
  return db.select().from(studentWorkbookUnitProgress).where(and(
    eq(studentWorkbookUnitProgress.profileId, input.profileId),
    inArray(studentWorkbookUnitProgress.nativeWorkbookVersionId, versionIds)
  ));
}

export async function loadWorkbookProgressByDocument(input: {
  profileId: string;
  documents: Array<{ id: string; nativeWorkbookVersionId: string | null }>;
}) {
  const rows = await loadWorkbookUnitProgress({
    profileId: input.profileId,
    nativeWorkbookVersionIds: input.documents.flatMap((document) =>
      document.nativeWorkbookVersionId ? [document.nativeWorkbookVersionId] : []
    )
  });
  const rowsByVersionId = new Map<string, typeof rows>();
  for (const row of rows) {
    const current = rowsByVersionId.get(row.nativeWorkbookVersionId) ?? [];
    current.push(row);
    rowsByVersionId.set(row.nativeWorkbookVersionId, current);
  }
  return new Map(input.documents.map((document) => [
    document.id,
    document.nativeWorkbookVersionId
      ? rowsByVersionId.get(document.nativeWorkbookVersionId) ?? []
      : []
  ]));
}

export async function summarizeWorkbookProgress(input: {
  profileId: string;
  nativeWorkbookVersionIds: string[];
}) {
  const versionIds = Array.from(new Set(input.nativeWorkbookVersionIds.filter(Boolean)));
  if (versionIds.length === 0) return new Map<string, NativeWorkbookProgressSummary>();
  const [versions, progressRows] = await Promise.all([
    db.select({
      id: nativeWorkbookVersions.id,
      analysisJson: nativeWorkbookVersions.analysisJson
    }).from(nativeWorkbookVersions).where(inArray(nativeWorkbookVersions.id, versionIds)),
    loadWorkbookUnitProgress(input)
  ]);
  const progressByVersionId = new Map<string, typeof progressRows>();
  for (const row of progressRows) {
    const current = progressByVersionId.get(row.nativeWorkbookVersionId) ?? [];
    current.push(row);
    progressByVersionId.set(row.nativeWorkbookVersionId, current);
  }
  return new Map(versions.map((version) => {
    const unitIds = new Set(canonicalUnitIds(version.analysisJson));
    const rows = (progressByVersionId.get(version.id) ?? []).filter((row) => unitIds.has(row.sourceUnitId));
    const counts = {
      completed: rows.filter((row) => row.status === "completed").length,
      mastered: rows.filter((row) => row.status === "mastered").length,
      deferred: rows.filter((row) => row.status === "deferred").length
    };
    return [version.id, {
      total: unitIds.size,
      ...counts,
      notStarted: Math.max(0, unitIds.size - counts.completed - counts.mastered - counts.deferred)
    }] as const;
  }));
}

export async function upsertWorkbookUnitProgress(input: {
  profileId: string;
  nativeWorkbookVersionId: string;
  sourceUnitIds: string[];
  status: WorkbookUnitProgressStatus;
  sourceLearningYearId?: string | null;
  sourceWeeklyPlanId?: string | null;
  selectedByUserId?: string | null;
}) {
  const sourceUnitIds = Array.from(new Set(input.sourceUnitIds.map((id) => id.trim()).filter(Boolean)));
  if (sourceUnitIds.length === 0) return { updated: 0 };
  const now = new Date();
  await db.insert(studentWorkbookUnitProgress).values(sourceUnitIds.map((sourceUnitId) => ({
    profileId: input.profileId,
    nativeWorkbookVersionId: input.nativeWorkbookVersionId,
    sourceUnitId,
    status: input.status,
    sourceLearningYearId: input.sourceLearningYearId ?? null,
    sourceWeeklyPlanId: input.sourceWeeklyPlanId ?? null,
    selectedByUserId: input.selectedByUserId ?? null,
    recordedAt: now,
    updatedAt: now
  }))).onConflictDoUpdate({
    target: [
      studentWorkbookUnitProgress.profileId,
      studentWorkbookUnitProgress.nativeWorkbookVersionId,
      studentWorkbookUnitProgress.sourceUnitId
    ],
    set: {
      status: input.status,
      sourceLearningYearId: input.sourceLearningYearId ?? null,
      sourceWeeklyPlanId: input.sourceWeeklyPlanId ?? null,
      selectedByUserId: input.selectedByUserId ?? null,
      recordedAt: now,
      updatedAt: now
    }
  });
  return { updated: sourceUnitIds.length };
}

export async function clearWorkbookUnitProgress(input: {
  profileId: string;
  nativeWorkbookVersionId: string;
  sourceUnitIds: string[];
  statuses: WorkbookUnitProgressStatus[];
}) {
  const sourceUnitIds = Array.from(new Set(input.sourceUnitIds.map((id) => id.trim()).filter(Boolean)));
  if (sourceUnitIds.length === 0 || input.statuses.length === 0) return { deleted: 0 };
  const deleted = await db.delete(studentWorkbookUnitProgress).where(and(
    eq(studentWorkbookUnitProgress.profileId, input.profileId),
    eq(studentWorkbookUnitProgress.nativeWorkbookVersionId, input.nativeWorkbookVersionId),
    inArray(studentWorkbookUnitProgress.sourceUnitId, sourceUnitIds),
    inArray(studentWorkbookUnitProgress.status, input.statuses)
  )).returning({ id: studentWorkbookUnitProgress.id });
  return { deleted: deleted.length };
}
