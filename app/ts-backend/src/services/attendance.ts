import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  attendanceEntrySubjects,
  attendanceEntries,
  contentDocuments,
  learningActivityEvents,
  learningYears,
  teacherActivityEvents,
  weeklyPlanItems,
  weeklyPlans
} from "ts-db";
import { db } from "../db";
import {
  getAccountMemberContext,
  getManageableStudentProfile,
  requireAccountRole
} from "./accounts";
import { requirePremiumFeatureAccess } from "./entitlements";
import {
  clearWorkbookUnitProgress,
  upsertWorkbookUnitProgress
} from "./student-workbook-progress";
import { refreshStudentStreakCache } from "./school-calendar";
import {
  applyAutomaticLessonCompletionPoint,
  reverseAutomaticLessonCompletionPoint
} from "./student-points";
import {
  normalizeManualAttendanceFields,
  type ManualAttendanceFields
} from "./manual-attendance";

const DAY_MS = 86_400_000;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function safeDate(value: string | null | undefined, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function subjectKey(label: string) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
}

function planSubjectKey(subjectId: string | null, label: string) {
  return subjectId ? `system:${subjectId}` : `custom:${subjectKey(label)}`;
}

async function verifyStudent(parentUserId: string, profileId: string) {
  await requirePremiumFeatureAccess(parentUserId);
  return (await getManageableStudentProfile(parentUserId, profileId)).studentProfile;
}

export async function getStudentAttendance(input: {
  parentUserId: string;
  profileId: string;
  yearId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const student = await verifyStudent(input.parentUserId, input.profileId);
  const years = await db.select().from(learningYears)
    .where(eq(learningYears.profileId, input.profileId))
    .orderBy(desc(learningYears.startDate), desc(learningYears.createdAt));
  const selectedYear = years.find((year) => year.id === input.yearId) ?? years[0] ?? null;
  const today = new Date();
  const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const defaultFrom = selectedYear?.startDate ?? new Date(defaultTo.getTime() - 364 * DAY_MS);
  const from = safeDate(input.dateFrom, defaultFrom);
  const to = safeDate(input.dateTo, defaultTo);
  const dateFrom = isoDate(from <= to ? from : to);
  const dateTo = isoDate(from <= to ? to : from);

  const rows = await db.select().from(attendanceEntries)
    .where(and(
      eq(attendanceEntries.profileId, input.profileId),
      gte(attendanceEntries.attendanceDate, dateFrom),
      lte(attendanceEntries.attendanceDate, dateTo)
    ))
    .orderBy(desc(attendanceEntries.attendanceDate), desc(attendanceEntries.createdAt));
  const entrySubjects = rows.length === 0 ? [] : await db.select().from(attendanceEntrySubjects)
    .where(inArray(attendanceEntrySubjects.attendanceEntryId, rows.map((row) => row.id)));
  const subjectsByEntryId = new Map<string, typeof entrySubjects>();
  for (const subject of entrySubjects) {
    const current = subjectsByEntryId.get(subject.attendanceEntryId) ?? [];
    current.push(subject);
    subjectsByEntryId.set(subject.attendanceEntryId, current);
  }

  const dailyMap = new Map<string, { count: number; minutes: number }>();
  const subjectMap = new Map<string, { subjectKey: string; subjectLabel: string; days: Set<string>; activities: number }>();
  for (const row of rows) {
    const day = dailyMap.get(row.attendanceDate) ?? { count: 0, minutes: 0 };
    day.count += 1;
    day.minutes += row.minutes ?? 0;
    dailyMap.set(row.attendanceDate, day);
    const rowSubjects = subjectsByEntryId.get(row.id) ?? (row.subjectLabel ? [{
      subjectKey: row.subjectKey ?? subjectKey(row.subjectLabel),
      subjectLabel: row.subjectLabel
    }] : []);
    for (const rowSubject of rowSubjects) {
      const key = rowSubject.subjectKey;
      const subject = subjectMap.get(key) ?? { subjectKey: key, subjectLabel: rowSubject.subjectLabel, days: new Set(), activities: 0 };
      subject.days.add(row.attendanceDate);
      subject.activities += 1;
      subjectMap.set(key, subject);
    }
  }

  const days = [];
  for (let at = new Date(`${dateFrom}T00:00:00.000Z`); at <= new Date(`${dateTo}T00:00:00.000Z`); at = new Date(at.getTime() + DAY_MS)) {
    const date = isoDate(at);
    days.push({ date, count: dailyMap.get(date)?.count ?? 0, minutes: dailyMap.get(date)?.minutes ?? 0 });
  }

  return {
    student: { id: student.id, firstName: student.firstName },
    years: years.map((year) => ({
      id: year.id,
      title: year.title,
      startDate: year.startDate ? isoDate(year.startDate) : null,
      status: year.status
    })),
    selectedYearId: selectedYear?.id ?? null,
    dateFrom,
    dateTo,
    summary: {
      learningDays: dailyMap.size,
      activities: rows.length,
      minutes: rows.reduce((sum, row) => sum + (row.minutes ?? 0), 0)
    },
    days,
    subjects: Array.from(subjectMap.values()).map((subject) => ({
      subjectKey: subject.subjectKey,
      subjectLabel: subject.subjectLabel,
      learningDays: subject.days.size,
      activities: subject.activities
    })).sort((a, b) => b.activities - a.activities),
    entries: rows.slice(0, 50).map((row) => ({
      id: row.id,
      date: row.attendanceDate,
      entryKind: row.entryKind,
      activityType: row.activityType,
      subjectLabel: row.subjectLabel,
      subjectLabels: (subjectsByEntryId.get(row.id) ?? []).map((subject) => subject.subjectLabel),
      weeklyPlanDayNumber: row.weeklyPlanDayNumber,
      title: row.title,
      notes: row.notes,
      minutes: row.minutes
    }))
  };
}

async function synchronizeWeekStatusFromAttendance(weeklyPlanId: string) {
  const scheduledRows = await db.select({
    dayNumber: weeklyPlanItems.dayNumber,
    subjectId: contentDocuments.subjectId,
    subjectLabel: contentDocuments.subjectLabel,
    documentLabel: contentDocuments.label,
    nativeWorkbookVersionId: contentDocuments.nativeWorkbookVersionId,
    sourceUnitId: weeklyPlanItems.sourceUnitId
  })
    .from(weeklyPlanItems)
    .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
    .where(and(
      eq(weeklyPlanItems.weeklyPlanId, weeklyPlanId),
      eq(weeklyPlanItems.includedInPacket, true)
    ));
  const scheduledSubjectsByDay = new Map<number, Set<string>>();
  for (const row of scheduledRows) {
    if (row.dayNumber == null) continue;
    const label = row.subjectLabel?.trim() || row.documentLabel;
    const subjects = scheduledSubjectsByDay.get(row.dayNumber) ?? new Set<string>();
    subjects.add(planSubjectKey(row.subjectId, label));
    scheduledSubjectsByDay.set(row.dayNumber, subjects);
  }
  if (scheduledSubjectsByDay.size === 0) return;
  const attendanceRows = await db.select({
    id: attendanceEntries.id,
    dayNumber: attendanceEntries.weeklyPlanDayNumber
  })
    .from(attendanceEntries)
    .where(and(
      eq(attendanceEntries.weeklyPlanId, weeklyPlanId),
      eq(attendanceEntries.entryKind, "plan_day")
    ));
  const attendanceSubjects = attendanceRows.length === 0 ? [] : await db.select().from(attendanceEntrySubjects)
    .where(inArray(attendanceEntrySubjects.attendanceEntryId, attendanceRows.map((row) => row.id)));
  const attendanceSubjectsByEntry = new Map<string, Set<string>>();
  for (const subject of attendanceSubjects) {
    const subjects = attendanceSubjectsByEntry.get(subject.attendanceEntryId) ?? new Set<string>();
    subjects.add(subject.subjectKey);
    attendanceSubjectsByEntry.set(subject.attendanceEntryId, subjects);
  }
  const recordedSubjectsByDay = new Map<number, Set<string>>();
  let hasAttendance = false;
  for (const attendance of attendanceRows) {
    if (attendance.dayNumber == null) continue;
    const scheduledSubjects = scheduledSubjectsByDay.get(attendance.dayNumber);
    if (!scheduledSubjects) continue;
    const recordedSubjects = attendanceSubjectsByEntry.get(attendance.id) ?? new Set<string>();
    if (recordedSubjects.size > 0) hasAttendance = true;
    const daySubjects = recordedSubjectsByDay.get(attendance.dayNumber) ?? new Set<string>();
    for (const subjectKey of recordedSubjects) daySubjects.add(subjectKey);
    recordedSubjectsByDay.set(attendance.dayNumber, daySubjects);
  }
  const completedDays = new Set(
    Array.from(scheduledSubjectsByDay.entries())
      .filter(([dayNumber, scheduledSubjects]) => {
        const recordedSubjects = recordedSubjectsByDay.get(dayNumber) ?? new Set<string>();
        return Array.from(scheduledSubjects).every((subjectKey) => recordedSubjects.has(subjectKey));
      })
      .map(([dayNumber]) => dayNumber)
  );
  const status = !hasAttendance
    ? "planned"
    : completedDays.size >= scheduledSubjectsByDay.size
      ? "completed"
      : "in_progress";
  await db.update(weeklyPlans).set({
    status,
    completedAt: status === "completed" ? new Date() : null,
    updatedAt: new Date()
  }).where(eq(weeklyPlans.id, weeklyPlanId));
}

export async function recordPlanDayAttendance(input: {
  parentUserId: string;
  profileId: string;
  weeklyPlanId: string;
  dayNumber: number;
  attendanceDate?: string | null;
  subjectKeys?: string[];
}) {
  await verifyStudent(input.parentUserId, input.profileId);
  if (!Number.isInteger(input.dayNumber) || input.dayNumber < 1 || input.dayNumber > 7) {
    throw new Error("Choose a valid planned day.");
  }
  const rows = await db.select({
    itemId: weeklyPlanItems.id,
    weekNumber: weeklyPlans.weekNumber,
    learningYearId: learningYears.id,
    profileId: learningYears.profileId,
    subjectId: contentDocuments.subjectId,
    subjectLabel: contentDocuments.subjectLabel,
    documentLabel: contentDocuments.label,
    nativeWorkbookVersionId: contentDocuments.nativeWorkbookVersionId,
    sourceUnitId: weeklyPlanItems.sourceUnitId
  }).from(weeklyPlanItems)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanItems.weeklyPlanId))
    .innerJoin(learningYears, eq(learningYears.id, weeklyPlans.learningYearId))
    .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
    .where(and(
      eq(weeklyPlanItems.weeklyPlanId, input.weeklyPlanId),
      eq(weeklyPlanItems.dayNumber, input.dayNumber),
      eq(weeklyPlanItems.includedInPacket, true)
    ));
  if (rows.length === 0 || rows[0]?.profileId !== input.profileId) {
    throw new Error("Planned school day not found.");
  }
  const availableSubjects = new Map<string, string>();
  for (const row of rows) {
    const label = row.subjectLabel?.trim() || row.documentLabel;
    availableSubjects.set(planSubjectKey(row.subjectId, label), label);
  }
  const requestedKeys = Array.from(new Set(input.subjectKeys ?? [])).filter((key) => availableSubjects.has(key));
  const selectedKeys = input.subjectKeys == null ? Array.from(availableSubjects.keys()) : requestedKeys;
  if (selectedKeys.length === 0) throw new Error("Select at least one subject taught that day.");
  const date = isoDate(safeDate(input.attendanceDate, new Date()));
  let savedEntry: typeof attendanceEntries.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    [savedEntry] = await tx.insert(attendanceEntries).values({
      profileId: input.profileId,
      learningYearId: rows[0]!.learningYearId,
      weeklyPlanId: input.weeklyPlanId,
      weeklyPlanDayNumber: input.dayNumber,
      attendanceDate: date,
      entryKind: "plan_day",
      activityType: "lesson",
      title: `Week ${rows[0]!.weekNumber} · Day ${input.dayNumber}`,
      createdByUserId: input.parentUserId
    }).onConflictDoUpdate({
      target: [
        attendanceEntries.profileId,
        attendanceEntries.weeklyPlanId,
        attendanceEntries.weeklyPlanDayNumber,
        attendanceEntries.attendanceDate
      ],
      set: {
        title: `Week ${rows[0]!.weekNumber} · Day ${input.dayNumber}`,
        createdByUserId: input.parentUserId
      }
    }).returning();
    await tx.insert(attendanceEntrySubjects).values(selectedKeys.map((key) => ({
      attendanceEntryId: savedEntry!.id,
      subjectKey: key,
      subjectLabel: availableSubjects.get(key)!
    }))).onConflictDoNothing();
  });
  const completedNativeUnits = rows.filter((row) => {
    const label = row.subjectLabel?.trim() || row.documentLabel;
    return selectedKeys.includes(planSubjectKey(row.subjectId, label)) &&
      Boolean(row.nativeWorkbookVersionId && row.sourceUnitId);
  });
  const completedByVersion = new Map<string, string[]>();
  for (const row of completedNativeUnits) {
    const versionId = row.nativeWorkbookVersionId!;
    completedByVersion.set(versionId, [
      ...(completedByVersion.get(versionId) ?? []),
      row.sourceUnitId!
    ]);
  }
  for (const [nativeWorkbookVersionId, sourceUnitIds] of completedByVersion) {
    await upsertWorkbookUnitProgress({
      profileId: input.profileId,
      nativeWorkbookVersionId,
      sourceUnitIds,
      status: "completed",
      sourceLearningYearId: rows[0]!.learningYearId,
      sourceWeeklyPlanId: input.weeklyPlanId,
      selectedByUserId: input.parentUserId
    });
  }
  for (const selectedKey of selectedKeys) {
    await applyAutomaticLessonCompletionPoint({
      profileId: input.profileId,
      actorUserId: input.parentUserId,
      weeklyPlanId: input.weeklyPlanId,
      weekNumber: rows[0]!.weekNumber,
      dayNumber: input.dayNumber,
      subjectKey: selectedKey,
      subjectLabel: availableSubjects.get(selectedKey)!
    });
  }
  await synchronizeWeekStatusFromAttendance(input.weeklyPlanId);
  await db.insert(learningActivityEvents).values({ profileId: input.profileId, source: "attendance_plan_day" });
  await refreshStudentStreakCache(input.profileId);
  return savedEntry!;
}

export async function setPlanDaySubjectCompletion(input: {
  parentUserId: string;
  profileId: string;
  weeklyPlanId: string;
  dayNumber: number;
  subjectKey: string;
  completed: boolean;
  attendanceDate?: string | null;
}) {
  if (input.completed) {
    return recordPlanDayAttendance({
      parentUserId: input.parentUserId,
      profileId: input.profileId,
      weeklyPlanId: input.weeklyPlanId,
      dayNumber: input.dayNumber,
      attendanceDate: input.attendanceDate,
      subjectKeys: [input.subjectKey]
    });
  }

  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);

  await verifyStudent(input.parentUserId, input.profileId);
  if (!Number.isInteger(input.dayNumber) || input.dayNumber < 1 || input.dayNumber > 7) {
    throw new Error("Choose a valid planned day.");
  }
  const rows = await db.select({
    profileId: learningYears.profileId,
    subjectId: contentDocuments.subjectId,
    subjectLabel: contentDocuments.subjectLabel,
    documentLabel: contentDocuments.label,
    nativeWorkbookVersionId: contentDocuments.nativeWorkbookVersionId,
    sourceUnitId: weeklyPlanItems.sourceUnitId
  }).from(weeklyPlanItems)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanItems.weeklyPlanId))
    .innerJoin(learningYears, eq(learningYears.id, weeklyPlans.learningYearId))
    .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
    .where(and(
      eq(weeklyPlanItems.weeklyPlanId, input.weeklyPlanId),
      eq(weeklyPlanItems.dayNumber, input.dayNumber),
      eq(weeklyPlanItems.includedInPacket, true)
    ));
  if (rows.length === 0 || rows[0]?.profileId !== input.profileId) {
    throw new Error("Planned school day not found.");
  }
  const availableSubjectKeys = new Set(rows.map((row) => {
    const label = row.subjectLabel?.trim() || row.documentLabel;
    return planSubjectKey(row.subjectId, label);
  }));
  if (!availableSubjectKeys.has(input.subjectKey)) {
    throw new Error("Planned lesson not found.");
  }

  await db.transaction(async (tx) => {
    const entries = await tx.select({ id: attendanceEntries.id })
      .from(attendanceEntries)
      .where(and(
        eq(attendanceEntries.profileId, input.profileId),
        eq(attendanceEntries.weeklyPlanId, input.weeklyPlanId),
        eq(attendanceEntries.weeklyPlanDayNumber, input.dayNumber),
        eq(attendanceEntries.entryKind, "plan_day")
      ));
    if (entries.length === 0) return;
    const entryIds = entries.map((entry) => entry.id);
    await tx.delete(attendanceEntrySubjects).where(and(
      inArray(attendanceEntrySubjects.attendanceEntryId, entryIds),
      eq(attendanceEntrySubjects.subjectKey, input.subjectKey)
    ));
    const remainingSubjects = await tx.select({ entryId: attendanceEntrySubjects.attendanceEntryId })
      .from(attendanceEntrySubjects)
      .where(inArray(attendanceEntrySubjects.attendanceEntryId, entryIds));
    const occupiedEntryIds = new Set(remainingSubjects.map((subject) => subject.entryId));
    const emptyEntryIds = entryIds.filter((entryId) => !occupiedEntryIds.has(entryId));
    if (emptyEntryIds.length > 0) {
      await tx.delete(attendanceEntries).where(inArray(attendanceEntries.id, emptyEntryIds));
    }
  });
  const undoneByVersion = new Map<string, string[]>();
  for (const row of rows) {
    const label = row.subjectLabel?.trim() || row.documentLabel;
    if (
      planSubjectKey(row.subjectId, label) !== input.subjectKey ||
      !row.nativeWorkbookVersionId ||
      !row.sourceUnitId
    ) continue;
    undoneByVersion.set(row.nativeWorkbookVersionId, [
      ...(undoneByVersion.get(row.nativeWorkbookVersionId) ?? []),
      row.sourceUnitId
    ]);
  }
  for (const [nativeWorkbookVersionId, sourceUnitIds] of undoneByVersion) {
    await clearWorkbookUnitProgress({
      profileId: input.profileId,
      nativeWorkbookVersionId,
      sourceUnitIds,
      statuses: ["completed"]
    });
  }
  await reverseAutomaticLessonCompletionPoint({
    profileId: input.profileId,
    actorUserId: input.parentUserId,
    weeklyPlanId: input.weeklyPlanId,
    dayNumber: input.dayNumber,
    subjectKey: input.subjectKey
  });
  await synchronizeWeekStatusFromAttendance(input.weeklyPlanId);
  await refreshStudentStreakCache(input.profileId);
  return { completed: false };
}

export async function recordPlanItemAttendance(input: {
  parentUserId: string;
  profileId: string;
  weeklyPlanItemId: string;
  attendanceDate?: string | null;
}) {
  await verifyStudent(input.parentUserId, input.profileId);
  const [item] = await db.select({
    itemId: weeklyPlanItems.id,
    weeklyPlanId: weeklyPlans.id,
    learningYearId: learningYears.id,
    profileId: learningYears.profileId,
    itemLabel: weeklyPlanItems.label,
    subjectId: contentDocuments.subjectId,
    subjectLabel: contentDocuments.subjectLabel,
    documentLabel: contentDocuments.label,
    nativeWorkbookVersionId: contentDocuments.nativeWorkbookVersionId,
    sourceUnitId: weeklyPlanItems.sourceUnitId
  }).from(weeklyPlanItems)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanItems.weeklyPlanId))
    .innerJoin(learningYears, eq(learningYears.id, weeklyPlans.learningYearId))
    .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
    .where(eq(weeklyPlanItems.id, input.weeklyPlanItemId)).limit(1);
  if (!item || item.profileId !== input.profileId) throw new Error("Plan activity not found.");
  const date = isoDate(safeDate(input.attendanceDate, new Date()));
  const label = item.subjectLabel ?? item.documentLabel;
  const [entry] = await db.insert(attendanceEntries).values({
    profileId: input.profileId,
    learningYearId: item.learningYearId,
    weeklyPlanId: item.weeklyPlanId,
    weeklyPlanItemId: item.itemId,
    attendanceDate: date,
    entryKind: "plan_item",
    activityType: "lesson",
    subjectKey: item.subjectId ?? subjectKey(label),
    subjectLabel: label,
    title: item.itemLabel,
    createdByUserId: input.parentUserId
  }).onConflictDoUpdate({
    target: [attendanceEntries.profileId, attendanceEntries.weeklyPlanItemId, attendanceEntries.attendanceDate],
    set: { title: item.itemLabel, subjectLabel: label }
  }).returning();
  if (item.nativeWorkbookVersionId && item.sourceUnitId) {
    await upsertWorkbookUnitProgress({
      profileId: input.profileId,
      nativeWorkbookVersionId: item.nativeWorkbookVersionId,
      sourceUnitIds: [item.sourceUnitId],
      status: "completed",
      sourceLearningYearId: item.learningYearId,
      sourceWeeklyPlanId: item.weeklyPlanId,
      selectedByUserId: input.parentUserId
    });
  }
  await db.insert(learningActivityEvents).values({ profileId: input.profileId, source: "attendance_plan_item" });
  await refreshStudentStreakCache(input.profileId);
  return entry;
}

export async function createManualAttendanceEntry(input: {
  parentUserId: string;
  profileId: string;
  learningYearId?: string | null;
} & ManualAttendanceFields) {
  const student = await verifyStudent(input.parentUserId, input.profileId);
  const actor = await getAccountMemberContext(input.parentUserId);
  const fields = normalizeManualAttendanceFields(input);
  const label = fields.subjectLabel;
  const entry = await db.transaction(async (tx) => {
    const [savedEntry] = await tx.insert(attendanceEntries).values({
      profileId: input.profileId,
      learningYearId: input.learningYearId || null,
      attendanceDate: fields.attendanceDate,
      entryKind: "manual",
      activityType: fields.activityType,
      subjectKey: label ? subjectKey(label) : null,
      subjectLabel: label,
      title: fields.title,
      notes: fields.notes,
      minutes: fields.minutes,
      createdByUserId: input.parentUserId
    }).returning();
    if (!savedEntry) throw new Error("The learning activity could not be recorded.");
    await tx.insert(learningActivityEvents).values({
      profileId: input.profileId,
      source: "attendance_manual"
    });
    await tx.insert(teacherActivityEvents).values({
      accountId: student.accountId,
      actorUserId: input.parentUserId,
      actorProfileId: actor.profileId,
      studentProfileId: input.profileId,
      eventType: "attendance_manual",
      subjectKey: savedEntry.subjectKey,
      subjectLabel: label,
      metadata: {
        attendanceEntryId: savedEntry.id,
        attendanceDate: fields.attendanceDate,
        activityType: fields.activityType,
        activityTitle: fields.title,
        minutes: fields.minutes
      }
    }).onConflictDoNothing();
    return savedEntry;
  });
  await refreshStudentStreakCache(input.profileId);
  return entry;
}

export async function updateManualAttendanceEntry(input: {
  parentUserId: string;
  profileId: string;
  entryId: string;
} & ManualAttendanceFields) {
  await verifyStudent(input.parentUserId, input.profileId);
  const fields = normalizeManualAttendanceFields(input);
  const label = fields.subjectLabel;
  const updatedEntry = await db.transaction(async (tx) => {
    const [existing] = await tx.select({
      id: attendanceEntries.id,
      entryKind: attendanceEntries.entryKind
    }).from(attendanceEntries)
      .where(and(
        eq(attendanceEntries.id, input.entryId),
        eq(attendanceEntries.profileId, input.profileId)
      ))
      .limit(1);
    if (!existing) throw new Error("Attendance entry not found.");
    if (existing.entryKind !== "manual") {
      throw new Error("Only other learning records can be edited.");
    }

    const [saved] = await tx.update(attendanceEntries)
      .set({
        attendanceDate: fields.attendanceDate,
        activityType: fields.activityType,
        subjectKey: label ? subjectKey(label) : null,
        subjectLabel: label,
        title: fields.title,
        notes: fields.notes,
        minutes: fields.minutes
      })
      .where(eq(attendanceEntries.id, existing.id))
      .returning();
    if (!saved) throw new Error("The learning activity could not be updated.");

    const activityEvents = await tx.select({
      id: teacherActivityEvents.id,
      metadata: teacherActivityEvents.metadata
    }).from(teacherActivityEvents)
      .where(and(
        eq(teacherActivityEvents.studentProfileId, input.profileId),
        eq(teacherActivityEvents.eventType, "attendance_manual")
      ));
    for (const event of activityEvents) {
      if (event.metadata?.attendanceEntryId !== existing.id) continue;
      await tx.update(teacherActivityEvents)
        .set({
          subjectKey: saved.subjectKey,
          subjectLabel: saved.subjectLabel,
          metadata: {
            ...event.metadata,
            attendanceDate: fields.attendanceDate,
            activityType: fields.activityType,
            activityTitle: fields.title,
            minutes: fields.minutes
          }
        })
        .where(eq(teacherActivityEvents.id, event.id));
    }
    return saved;
  });
  await refreshStudentStreakCache(input.profileId);
  return updatedEntry;
}

export async function deleteAttendanceEntry(input: { parentUserId: string; profileId: string; entryId: string }) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await verifyStudent(input.parentUserId, input.profileId);
  const [existing] = await db.select({
    weeklyPlanId: attendanceEntries.weeklyPlanId,
    entryKind: attendanceEntries.entryKind
  }).from(attendanceEntries)
    .where(and(eq(attendanceEntries.id, input.entryId), eq(attendanceEntries.profileId, input.profileId)))
    .limit(1);
  const [entry] = await db.delete(attendanceEntries)
    .where(and(eq(attendanceEntries.id, input.entryId), eq(attendanceEntries.profileId, input.profileId)))
    .returning({ id: attendanceEntries.id });
  if (!entry) throw new Error("Attendance entry not found.");
  if (existing?.entryKind === "plan_day" && existing.weeklyPlanId) {
    await synchronizeWeekStatusFromAttendance(existing.weeklyPlanId);
  }
  await refreshStudentStreakCache(input.profileId);
  return entry;
}
