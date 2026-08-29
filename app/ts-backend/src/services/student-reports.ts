import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  attendanceEntries,
  attendanceEntrySubjects,
  contentDocuments,
  learningYears,
  nativeWorkbookVersions,
  studentWorkbookUnitProgress,
  weeklyPlanItems,
  weeklyPlans,
} from "ts-db";
import { db } from "../db";
import { getManageableStudentProfile } from "./accounts";
import { requirePremiumFeatureAccess } from "./entitlements";
import { getStudentGrades } from "./grades";
import {
  estimatePlanItemMinutes,
  learningUnitMinuteEstimates,
  logicalPlanItemKey,
} from "./learning-time-estimates";
import { planSubjectKey } from "./plan-subject-key";
import {
  buildAttendanceReportPdf,
  buildReportCardPdf,
  type AttendanceReportDay,
  type AttendanceReportWorkbook,
} from "./student-report-pdfs";

type ReportLearningUnit = {
  id: string;
  title: string;
  sequenceOrder: number;
};

export function reportLearningUnits(analysisJson: unknown): ReportLearningUnit[] {
  if (!analysisJson || typeof analysisJson !== "object") return [];
  const candidates = (analysisJson as { learningUnits?: unknown }).learningUnits;
  if (!Array.isArray(candidates)) return [];
  const units = candidates.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const id = String(record.id ?? "").trim();
    if (!id) return [];
    const title = String(record.title ?? "Lesson").trim() || "Lesson";
    const rawSequence = Number(record.sequenceOrder);
    return [{
      id,
      title,
      sequenceOrder: Number.isFinite(rawSequence) ? rawSequence : index,
    }];
  });
  return Array.from(new Map(units.map((unit) => [unit.id, unit])).values())
    .sort((left, right) => left.sequenceOrder - right.sequenceOrder);
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function effectiveEndDate(year: typeof learningYears.$inferSelect, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const configuredEnd = isoDate(year.endDate);
  if (year.status === "completed") return configuredEnd ?? today;
  return configuredEnd && configuredEnd < today ? configuredEnd : today;
}

function reportFilename(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 70) || "student";
}

async function getReportContext(input: {
  parentUserId: string;
  profileId: string;
  yearId?: string | null;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  const { studentProfile } = await getManageableStudentProfile(input.parentUserId, input.profileId);
  const years = await db.select().from(learningYears)
    .where(eq(learningYears.profileId, input.profileId))
    .orderBy(desc(learningYears.startDate), desc(learningYears.createdAt));
  const year = input.yearId
    ? years.find((candidate) => candidate.id === input.yearId)
    : years[0];
  if (!year) throw new Error("Learning year not found.");
  return { student: studentProfile, year };
}

type AttendanceEntryRow = typeof attendanceEntries.$inferSelect;
type PlanItemRow = {
  id: string;
  weeklyPlanId: string;
  documentId: string;
  dayNumber: number | null;
  label: string;
  sourceUnitId: string | null;
  firstPageIndex: number;
  lastPageIndex: number;
  includedInPacket: boolean;
  sortOrder: number;
};

function groupAttendanceDays(input: {
  entries: AttendanceEntryRow[];
  subjectsByEntryId: Map<string, Array<{ subjectKey: string; subjectLabel: string }>>;
  itemsByEntryId: Map<string, PlanItemRow[]>;
  documentsById: Map<string, typeof contentDocuments.$inferSelect>;
  estimatedMinutesByItemId: Map<string, number>;
}) {
  const days = new Map<string, {
    date: string;
    subjectLabels: Set<string>;
    lessonsCompleted: Set<string>;
    otherActivities: Set<string>;
    minutes: number;
  }>();
  const countedLessonKeys = new Set<string>();
  for (const entry of input.entries) {
    const day = days.get(entry.attendanceDate) ?? {
      date: entry.attendanceDate,
      subjectLabels: new Set<string>(),
      lessonsCompleted: new Set<string>(),
      otherActivities: new Set<string>(),
      minutes: 0,
    };
    const entrySubjects = input.subjectsByEntryId.get(entry.id) ?? [];
    for (const subject of entrySubjects) day.subjectLabels.add(subject.subjectLabel);
    if (entry.subjectLabel) day.subjectLabels.add(entry.subjectLabel);
    if (entry.entryKind === "manual") {
      day.otherActivities.add(entry.title);
    } else {
      for (const item of input.itemsByEntryId.get(entry.id) ?? []) {
        day.lessonsCompleted.add(item.label);
        const document = input.documentsById.get(item.documentId);
        if (document?.subjectLabel) day.subjectLabels.add(document.subjectLabel);
        const lessonKey = logicalPlanItemKey(item);
        if (!countedLessonKeys.has(lessonKey)) {
          countedLessonKeys.add(lessonKey);
          day.minutes += input.estimatedMinutesByItemId.get(item.id) ?? 0;
        }
      }
    }
    day.minutes += entry.minutes ?? 0;
    days.set(entry.attendanceDate, day);
  }
  return Array.from(days.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day): AttendanceReportDay => ({
      date: day.date,
      subjectLabels: Array.from(day.subjectLabels).sort(),
      lessonsCompleted: Array.from(day.lessonsCompleted),
      otherActivities: Array.from(day.otherActivities),
      minutes: day.minutes,
    }));
}

export async function buildStudentAttendanceReport(input: {
  parentUserId: string;
  profileId: string;
  yearId?: string | null;
}) {
  const { student, year } = await getReportContext(input);
  const [documents, planRows, entries] = await Promise.all([
    db.select().from(contentDocuments).where(and(
      eq(contentDocuments.learningYearId, year.id),
      eq(contentDocuments.documentRole, "student"),
      isNull(contentDocuments.removedAt),
    )).orderBy(asc(contentDocuments.sortOrder), asc(contentDocuments.createdAt)),
    db.select({
      id: weeklyPlanItems.id,
      weeklyPlanId: weeklyPlanItems.weeklyPlanId,
      documentId: weeklyPlanItems.documentId,
      dayNumber: weeklyPlanItems.dayNumber,
      label: weeklyPlanItems.label,
      sourceUnitId: weeklyPlanItems.sourceUnitId,
      firstPageIndex: weeklyPlanItems.firstPageIndex,
      lastPageIndex: weeklyPlanItems.lastPageIndex,
      includedInPacket: weeklyPlanItems.includedInPacket,
      sortOrder: weeklyPlanItems.sortOrder,
    }).from(weeklyPlanItems)
      .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanItems.weeklyPlanId))
      .where(eq(weeklyPlans.learningYearId, year.id))
      .orderBy(asc(weeklyPlans.weekNumber), asc(weeklyPlanItems.dayNumber), asc(weeklyPlanItems.sortOrder)),
    db.select().from(attendanceEntries).where(and(
      eq(attendanceEntries.profileId, input.profileId),
      eq(attendanceEntries.learningYearId, year.id),
    )).orderBy(asc(attendanceEntries.attendanceDate), asc(attendanceEntries.createdAt)),
  ]);

  const entrySubjects = entries.length === 0
    ? []
    : await db.select().from(attendanceEntrySubjects)
      .where(inArray(attendanceEntrySubjects.attendanceEntryId, entries.map((entry) => entry.id)));
  const subjectsByEntryId = new Map<string, Array<{ subjectKey: string; subjectLabel: string }>>();
  for (const subject of entrySubjects) {
    const current = subjectsByEntryId.get(subject.attendanceEntryId) ?? [];
    current.push({ subjectKey: subject.subjectKey, subjectLabel: subject.subjectLabel });
    subjectsByEntryId.set(subject.attendanceEntryId, current);
  }

  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const items = planRows.filter((item) => item.includedInPacket && documentsById.has(item.documentId));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const itemsByWeekAndDay = new Map<string, PlanItemRow[]>();
  for (const item of items) {
    if (item.dayNumber == null) continue;
    const key = `${item.weeklyPlanId}:${item.dayNumber}`;
    const current = itemsByWeekAndDay.get(key) ?? [];
    current.push(item);
    itemsByWeekAndDay.set(key, current);
  }

  const itemsByEntryId = new Map<string, PlanItemRow[]>();
  const attendedItemIds = new Set<string>();
  const completedUnitsByDocument = new Map<string, Set<string>>();
  const latestItemLabelByDocument = new Map<string, { date: string; label: string }>();
  const recordCompletedItem = (entry: AttendanceEntryRow, item: PlanItemRow) => {
    attendedItemIds.add(item.id);
    if (item.sourceUnitId) {
      const current = completedUnitsByDocument.get(item.documentId) ?? new Set<string>();
      current.add(item.sourceUnitId);
      completedUnitsByDocument.set(item.documentId, current);
    }
    const latest = latestItemLabelByDocument.get(item.documentId);
    if (!latest || latest.date <= entry.attendanceDate) {
      latestItemLabelByDocument.set(item.documentId, { date: entry.attendanceDate, label: item.label });
    }
  };

  for (const entry of entries) {
    let completedItems: PlanItemRow[] = [];
    if (entry.weeklyPlanItemId) {
      const item = itemById.get(entry.weeklyPlanItemId);
      if (item) completedItems = [item];
    } else if (entry.weeklyPlanId && entry.weeklyPlanDayNumber != null) {
      const scheduled = itemsByWeekAndDay.get(`${entry.weeklyPlanId}:${entry.weeklyPlanDayNumber}`) ?? [];
      const selectedKeys = new Set((subjectsByEntryId.get(entry.id) ?? []).map((subject) => subject.subjectKey));
      completedItems = selectedKeys.size === 0
        ? scheduled
        : scheduled.filter((item) => {
            const document = documentsById.get(item.documentId);
            if (!document) return false;
            return selectedKeys.has(planSubjectKey({
              subjectId: document.subjectId,
              subjectLabel: document.subjectLabel ?? document.label,
            }));
          });
    }
    itemsByEntryId.set(entry.id, completedItems);
    for (const item of completedItems) recordCompletedItem(entry, item);
  }

  const nativeVersionIds = Array.from(new Set(documents.flatMap((document) =>
    document.nativeWorkbookVersionId ? [document.nativeWorkbookVersionId] : []
  )));
  const [nativeVersions, durableProgress] = nativeVersionIds.length === 0
    ? [[], []]
    : await Promise.all([
        db.select({
          id: nativeWorkbookVersions.id,
          analysisJson: nativeWorkbookVersions.analysisJson,
        }).from(nativeWorkbookVersions).where(inArray(nativeWorkbookVersions.id, nativeVersionIds)),
        db.select().from(studentWorkbookUnitProgress).where(and(
          eq(studentWorkbookUnitProgress.profileId, input.profileId),
          inArray(studentWorkbookUnitProgress.nativeWorkbookVersionId, nativeVersionIds),
          inArray(studentWorkbookUnitProgress.status, ["completed", "mastered"]),
        )),
      ]);
  const nativeVersionById = new Map(nativeVersions.map((version) => [version.id, version]));
  const durableByVersionId = new Map<string, Set<string>>();
  for (const progress of durableProgress) {
    const current = durableByVersionId.get(progress.nativeWorkbookVersionId) ?? new Set<string>();
    current.add(progress.sourceUnitId);
    durableByVersionId.set(progress.nativeWorkbookVersionId, current);
  }

  const estimatesByDocumentId = new Map<string, Map<string, number>>();
  for (const document of documents) {
    const analysisJson = document.nativeWorkbookVersionId
      ? nativeVersionById.get(document.nativeWorkbookVersionId)?.analysisJson ?? document.analysisJson
      : document.analysisJson;
    estimatesByDocumentId.set(document.id, learningUnitMinuteEstimates(analysisJson));
  }
  const estimatedMinutesByItemId = new Map(items.map((item) => [
    item.id,
    estimatePlanItemMinutes(item, estimatesByDocumentId.get(item.documentId) ?? new Map()),
  ]));

  const workbooks: AttendanceReportWorkbook[] = documents.map((document) => {
    const analysisJson = document.nativeWorkbookVersionId
      ? nativeVersionById.get(document.nativeWorkbookVersionId)?.analysisJson ?? document.analysisJson
      : document.analysisJson;
    const units = reportLearningUnits(analysisJson);
    const completedUnitIds = new Set(completedUnitsByDocument.get(document.id) ?? []);
    if (document.nativeWorkbookVersionId) {
      for (const id of durableByVersionId.get(document.nativeWorkbookVersionId) ?? []) completedUnitIds.add(id);
    }
    const plannedUnitIds = Array.from(new Set(items
      .filter((item) => item.documentId === document.id && item.sourceUnitId)
      .map((item) => item.sourceUnitId!)));
    const totalLessons = units.length > 0 ? units.length : plannedUnitIds.length;
    const canonicalIds = new Set(units.length > 0 ? units.map((unit) => unit.id) : plannedUnitIds);
    const completedLessons = Array.from(completedUnitIds).filter((id) => canonicalIds.has(id)).length;
    const lastUnit = units.filter((unit) => completedUnitIds.has(unit.id)).at(-1);
    return {
      courseLabel: document.subjectLabel?.trim() || "Other",
      workbookTitle: document.label,
      completedLessons,
      totalLessons,
      progressPercent: totalLessons > 0 ? Math.round(completedLessons / totalLessons * 100) : null,
      lastLessonCompleted: lastUnit?.title ?? latestItemLabelByDocument.get(document.id)?.label ?? null,
    };
  });

  const days = groupAttendanceDays({
    entries,
    subjectsByEntryId,
    itemsByEntryId,
    documentsById,
    estimatedMinutesByItemId,
  });
  const otherActivities = entries.filter((entry) => entry.entryKind === "manual").length;
  const bytes = await buildAttendanceReportPdf({
    studentName: student.firstName,
    yearTitle: year.title,
    yearStatus: year.status,
    dateFrom: isoDate(year.startDate),
    dateTo: effectiveEndDate(year),
    printPageSize: year.printPageSize,
    generatedAt: new Date().toISOString(),
    summary: {
      learningDays: days.length,
      lessonsCompleted: attendedItemIds.size,
      otherActivities,
      minutes: days.reduce((total, day) => total + day.minutes, 0),
    },
    workbooks,
    days,
  });
  return {
    bytes,
    filename: `${reportFilename(student.firstName)}-${reportFilename(year.title)}-attendance-report.pdf`,
  };
}

export async function buildStudentReportCard(input: {
  parentUserId: string;
  profileId: string;
  yearId?: string | null;
}) {
  const { student, year } = await getReportContext(input);
  const [grades, weeks, attendanceRows] = await Promise.all([
    getStudentGrades({
      parentUserId: input.parentUserId,
      profileId: input.profileId,
      yearId: year.id,
    }),
    db.select({ status: weeklyPlans.status }).from(weeklyPlans)
      .where(eq(weeklyPlans.learningYearId, year.id)),
    db.select({ attendanceDate: attendanceEntries.attendanceDate }).from(attendanceEntries)
      .where(and(
        eq(attendanceEntries.profileId, input.profileId),
        eq(attendanceEntries.learningYearId, year.id),
      )),
  ]);
  if (!grades.selectedYear || grades.selectedYear.id !== year.id) {
    throw new Error("Grade records for this learning year were not found.");
  }
  const bytes = await buildReportCardPdf({
    studentName: student.firstName,
    yearTitle: year.title,
    yearStatus: year.status,
    dateFrom: isoDate(year.startDate),
    dateTo: effectiveEndDate(year),
    printPageSize: year.printPageSize,
    generatedAt: new Date().toISOString(),
    gradingSchemeName: grades.gradingScheme.name,
    overallAverage: grades.selectedYear.overallAverage,
    overallGrade: grades.selectedYear.grade,
    gradedEntries: grades.selectedYear.gradedEntries,
    completedWeeks: weeks.filter((week) => week.status === "completed").length,
    totalWeeks: year.totalWeeks,
    learningDays: new Set(attendanceRows.map((row) => row.attendanceDate)).size,
    subjects: grades.subjects,
  });
  const reportKind = year.status === "completed" ? "report-card" : "progress-report";
  return {
    bytes,
    filename: `${reportFilename(student.firstName)}-${reportFilename(year.title)}-${reportKind}.pdf`,
  };
}
