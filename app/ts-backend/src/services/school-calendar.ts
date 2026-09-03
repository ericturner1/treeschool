import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  attendanceEntries,
  learningActivityEvents,
  profiles,
  streakSettings,
  studentCalendarExceptions
} from "ts-db";
import { db } from "../db";
import { getManageableStudentProfile, requireAccountRole } from "./accounts";

const DAY_MS = 86_400_000;

type StreakMode = "daily" | "weekly";

type CalendarSettings = {
  mode: StreakMode;
  timeZone: string;
  pausedWeekdays: number[];
  pausedWeeks: string[];
};

type CalendarException = {
  id: string;
  label: string;
  exceptionKind: CalendarExceptionKind;
  startDate: string;
  endDate: string;
};

type CalendarExceptionKind = "holiday" | "school_break" | "vacation" | "personal_day" | "other";

const CALENDAR_EXCEPTION_KINDS = new Set<CalendarExceptionKind>([
  "holiday",
  "school_break",
  "vacation",
  "personal_day",
  "other"
]);

function normalizeExceptionKind(value: string | null | undefined): CalendarExceptionKind {
  return CALENDAR_EXCEPTION_KINDS.has(value as CalendarExceptionKind)
    ? value as CalendarExceptionKind
    : "other";
}

function parseDateKey(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Choose a valid calendar date.");
  }
  return parsed;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  return dateKey(new Date(parseDateKey(value).getTime() + days * DAY_MS));
}

function weekday(value: string) {
  return parseDateKey(value).getUTCDay();
}

function weekStart(value: string) {
  const day = weekday(value);
  return addDays(value, -((day + 6) % 7));
}

function validTimeZone(value: string | null | undefined) {
  const candidate = value?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

function dateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizePausedWeekdays(values: number[] | null | undefined) {
  return [...new Set((values ?? []).filter((value) =>
    Number.isInteger(value) && value >= 0 && value <= 6
  ))].sort((left, right) => left - right);
}

function normalizePausedWeeks(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  ))].sort();
}

async function ensureCalendarSettings(profileId: string): Promise<CalendarSettings> {
  // Legacy students may predate calendar setup. Give them the same sensible
  // Saturday/Sunday default as newly created students instead of silently
  // treating all seven days as required school days.
  await db.insert(streakSettings).values({ profileId, pausedWeekdays: [0, 6] }).onConflictDoNothing();
  const [row] = await db
    .select({
      mode: streakSettings.mode,
      timeZone: streakSettings.timeZone,
      pausedWeekdays: streakSettings.pausedWeekdays,
      pausedWeeks: streakSettings.pausedWeeks
    })
    .from(streakSettings)
    .where(eq(streakSettings.profileId, profileId))
    .limit(1);
  if (!row) throw new Error("The student calendar could not be loaded.");
  return {
    mode: row.mode,
    timeZone: validTimeZone(row.timeZone),
    pausedWeekdays: normalizePausedWeekdays(row.pausedWeekdays),
    pausedWeeks: normalizePausedWeeks(row.pausedWeeks)
  };
}

async function listCalendarExceptions(profileId: string) {
  const rows = await db
    .select({
      id: studentCalendarExceptions.id,
      label: studentCalendarExceptions.label,
      exceptionKind: studentCalendarExceptions.exceptionKind,
      startDate: studentCalendarExceptions.startDate,
      endDate: studentCalendarExceptions.endDate
    })
    .from(studentCalendarExceptions)
    .where(eq(studentCalendarExceptions.profileId, profileId))
    .orderBy(asc(studentCalendarExceptions.startDate), asc(studentCalendarExceptions.endDate));
  return rows.map((row): CalendarException => ({
    ...row,
    exceptionKind: normalizeExceptionKind(row.exceptionKind)
  }));
}

function isExceptionDate(value: string, exceptions: CalendarException[]) {
  return exceptions.some((exception) =>
    exception.startDate <= value && exception.endDate >= value
  );
}

function isExpectedSchoolDay(
  value: string,
  settings: CalendarSettings,
  exceptions: CalendarException[]
) {
  if (settings.pausedWeekdays.includes(weekday(value))) return false;
  if (settings.pausedWeeks.includes(weekStart(value))) return false;
  return !isExceptionDate(value, exceptions);
}

function bucketKey(value: string, mode: StreakMode) {
  return mode === "daily" ? value : weekStart(value);
}

function bucketStep(mode: StreakMode) {
  return mode === "daily" ? 1 : 7;
}

function isActiveBucket(
  value: string,
  settings: CalendarSettings,
  exceptions: CalendarException[]
) {
  if (settings.mode === "daily") {
    return isExpectedSchoolDay(value, settings, exceptions);
  }
  if (settings.pausedWeeks.includes(weekStart(value))) return false;
  return Array.from({ length: 7 }, (_, index) => addDays(value, index))
    .some((day) => isExpectedSchoolDay(day, settings, exceptions));
}

async function getActivityDates(profileId: string, timeZone: string) {
  const [attendanceRows, legacyRows] = await Promise.all([
    db
      .select({ date: attendanceEntries.attendanceDate })
      .from(attendanceEntries)
      .where(eq(attendanceEntries.profileId, profileId)),
    db
      .select({ occurredAt: learningActivityEvents.occurredAt })
      .from(learningActivityEvents)
      .where(and(
        eq(learningActivityEvents.profileId, profileId),
        eq(learningActivityEvents.source, "lesson")
      ))
  ]);
  return new Set([
    ...attendanceRows.map((row) => row.date),
    ...legacyRows.map((row) => dateKeyInTimeZone(row.occurredAt, timeZone))
  ]);
}

function calculateStreak(input: {
  settings: CalendarSettings;
  exceptions: CalendarException[];
  activityDates: Set<string>;
  today: string;
}) {
  const { settings, exceptions, activityDates, today } = input;
  const activityBuckets = new Set(
    Array.from(activityDates)
      .filter((value) => value <= today)
      .map((value) => bucketKey(value, settings.mode))
  );
  const currentBucket = bucketKey(today, settings.mode);
  const step = bucketStep(settings.mode);
  let cursor = currentBucket;
  const currentPeriodCompleted = activityBuckets.has(currentBucket);

  if (!isActiveBucket(cursor, settings, exceptions) || !currentPeriodCompleted) {
    cursor = addDays(cursor, -step);
  }
  let skippedInactiveBuckets = 0;
  while (isActiveBucket(cursor, settings, exceptions) === false && skippedInactiveBuckets < 550) {
    cursor = addDays(cursor, -step);
    skippedInactiveBuckets += 1;
  }

  let currentCount = 0;
  while (skippedInactiveBuckets < 550 && activityBuckets.has(cursor)) {
    currentCount += 1;
    cursor = addDays(cursor, -step);
    while (isActiveBucket(cursor, settings, exceptions) === false && skippedInactiveBuckets < 550) {
      cursor = addDays(cursor, -step);
      skippedInactiveBuckets += 1;
    }
  }

  const sortedActivityBuckets = Array.from(activityBuckets).sort();
  let longestCount = 0;
  let runningCount = 0;
  if (sortedActivityBuckets.length > 0) {
    for (
      let candidate = sortedActivityBuckets[0]!;
      candidate <= currentBucket;
      candidate = addDays(candidate, step)
    ) {
      if (!isActiveBucket(candidate, settings, exceptions)) continue;
      if (activityBuckets.has(candidate)) {
        runningCount += 1;
        longestCount = Math.max(longestCount, runningCount);
      } else {
        runningCount = 0;
      }
    }
  }

  return {
    currentCount,
    longestCount,
    currentPeriodCompleted,
    currentPeriodPaused: !isActiveBucket(currentBucket, settings, exceptions),
    lastActivityDate: Array.from(activityDates).filter((value) => value <= today).sort().at(-1) ?? null
  };
}

export async function getCalculatedStreakStatus(profileId: string, now = new Date()) {
  const settings = await ensureCalendarSettings(profileId);
  const [exceptions, activityDates] = await Promise.all([
    listCalendarExceptions(profileId),
    getActivityDates(profileId, settings.timeZone)
  ]);
  const today = dateKeyInTimeZone(now, settings.timeZone);
  const calculated = calculateStreak({
    settings,
    exceptions,
    activityDates,
    today
  });
  return {
    mode: settings.mode,
    timeZone: settings.timeZone,
    currentCount: calculated.currentCount,
    longestCount: calculated.longestCount,
    lastActiveAt: calculated.lastActivityDate,
    currentPeriodLabel: settings.mode === "daily" ? today : `Week of ${weekStart(today)}`,
    currentPeriodPaused: calculated.currentPeriodPaused,
    currentPeriodCompleted: calculated.currentPeriodCompleted,
    isSchoolDayToday: isExpectedSchoolDay(today, settings, exceptions),
    schoolworkCompletedToday: activityDates.has(today),
    pausedWeekdays: settings.pausedWeekdays,
    pausedWeeks: settings.pausedWeeks
  };
}

export async function refreshStudentStreakCache(profileId: string) {
  const status = await getCalculatedStreakStatus(profileId);
  await db
    .update(profiles)
    .set({
      streakCount: status.currentCount,
      lastActiveAt: status.lastActiveAt
        ? new Date(`${status.lastActiveAt}T12:00:00.000Z`)
        : null
    })
    .where(eq(profiles.id, profileId));
  return status;
}

export async function getStudentSchoolCalendar(input: {
  parentUserId: string;
  profileId: string;
  dateFrom: string;
  dateTo: string;
}) {
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  const dateFrom = dateKey(parseDateKey(input.dateFrom));
  const dateTo = dateKey(parseDateKey(input.dateTo));
  if (dateFrom > dateTo) throw new Error("The calendar date range is invalid.");
  const [settings, exceptions, activityRows, streak] = await Promise.all([
    ensureCalendarSettings(input.profileId),
    listCalendarExceptions(input.profileId),
    db
      .select({ date: attendanceEntries.attendanceDate })
      .from(attendanceEntries)
      .where(and(
        eq(attendanceEntries.profileId, input.profileId),
        gte(attendanceEntries.attendanceDate, dateFrom),
        lte(attendanceEntries.attendanceDate, dateTo)
      )),
    getCalculatedStreakStatus(input.profileId)
  ]);
  return {
    timeZone: settings.timeZone,
    recurringDaysOff: settings.pausedWeekdays,
    holidays: exceptions,
    activityDates: [...new Set(activityRows.map((row) => row.date))].sort(),
    streak
  };
}

export async function updateStudentCalendarSchedule(input: {
  parentUserId: string;
  profileId: string;
  timeZone?: string;
  recurringDaysOff: number[];
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  await ensureCalendarSettings(input.profileId);
  const recurringDaysOff = normalizePausedWeekdays(input.recurringDaysOff);
  if (recurringDaysOff.length >= 7) {
    throw new Error("Leave at least one regular school day in the week.");
  }
  await db
    .update(streakSettings)
    .set({
      mode: "daily",
      timeZone: validTimeZone(input.timeZone),
      pausedWeekdays: recurringDaysOff,
      updatedAt: new Date()
    })
    .where(eq(streakSettings.profileId, input.profileId));
  return refreshStudentStreakCache(input.profileId);
}

export async function createStudentCalendarException(input: {
  parentUserId: string;
  profileId: string;
  label: string;
  exceptionKind?: CalendarExceptionKind;
  startDate: string;
  endDate: string;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  const label = input.label.trim();
  if (!label) throw new Error("Give this holiday or day off a name.");
  const startDate = dateKey(parseDateKey(input.startDate));
  const endDate = dateKey(parseDateKey(input.endDate));
  if (endDate < startDate) throw new Error("The end date must be on or after the start date.");
  if ((parseDateKey(endDate).getTime() - parseDateKey(startDate).getTime()) / DAY_MS > 370) {
    throw new Error("A planned break cannot be longer than one year.");
  }
  const [saved] = await db
    .insert(studentCalendarExceptions)
    .values({
      profileId: input.profileId,
      label,
      exceptionKind: normalizeExceptionKind(input.exceptionKind),
      startDate,
      endDate,
      createdByUserId: input.parentUserId
    })
    .returning();
  await refreshStudentStreakCache(input.profileId);
  return saved!;
}

export async function deleteStudentCalendarException(input: {
  parentUserId: string;
  profileId: string;
  exceptionId: string;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  const [removed] = await db
    .delete(studentCalendarExceptions)
    .where(and(
      eq(studentCalendarExceptions.id, input.exceptionId),
      eq(studentCalendarExceptions.profileId, input.profileId)
    ))
    .returning({ id: studentCalendarExceptions.id });
  if (!removed) throw new Error("That calendar entry was not found.");
  await refreshStudentStreakCache(input.profileId);
  return removed;
}
