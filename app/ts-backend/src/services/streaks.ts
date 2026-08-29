import { and, eq } from "drizzle-orm";
import { learningActivityEvents, profiles, streakModeEnum, streakSettings } from "ts-db";
import { db } from "../db";
import {
  getCalculatedStreakStatus,
  refreshStudentStreakCache
} from "./school-calendar";

type StreakMode = (typeof streakModeEnum.enumValues)[number];

type StreakSettingsRow = {
  profileId: string;
  mode: StreakMode;
  timeZone: string;
  pausedWeekdays: number[];
  pausedWeeks: string[];
};

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return startOfUtcDay(next);
}

function getUtcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcWeek(date: Date) {
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  return addUtcDays(startOfUtcDay(date), -diff);
}

function clampPausedWeekdays(pausedWeekdays: number[]) {
  return [...new Set(pausedWeekdays.filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))].sort(
    (left, right) => left - right
  );
}

function normalizePausedWeeks(pausedWeeks: string[]) {
  return [...new Set(pausedWeeks.filter(Boolean))]
    .map((value) => {
      const [yearString, weekString] = value.split("-W");

      if (yearString && weekString) {
        const year = Number(yearString);
        const isoWeek = Number(weekString);

        if (Number.isInteger(year) && Number.isInteger(isoWeek) && isoWeek >= 1 && isoWeek <= 53) {
          const jan4 = new Date(Date.UTC(year, 0, 4));
          const weekStart = startOfUtcWeek(jan4);
          return getUtcDateKey(addUtcDays(weekStart, (isoWeek - 1) * 7));
        }
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }

      return getUtcDateKey(startOfUtcWeek(parsed));
    })
    .filter((value): value is string => Boolean(value))
    .sort();
}

function convertStreakCount(input: {
  currentCount: number;
  fromMode: StreakMode;
  toMode: StreakMode;
  lastActiveAt: Date | null;
  now: Date;
}) {
  const { currentCount, fromMode, toMode, lastActiveAt, now } = input;

  if (currentCount <= 0 || fromMode === toMode) {
    return currentCount;
  }

  if (fromMode === "daily" && toMode === "weekly") {
    return Math.max(1, Math.ceil(currentCount / 7));
  }

  if (fromMode === "weekly" && toMode === "daily") {
    const currentWeekStart = startOfUtcWeek(now);
    const lastActiveInCurrentWeek =
      lastActiveAt != null && startOfUtcWeek(lastActiveAt).getTime() === currentWeekStart.getTime();
    const elapsedDayCountInCurrentWeek = lastActiveInCurrentWeek
      ? ((startOfUtcDay(now).getTime() - currentWeekStart.getTime()) / 86400000) + 1
      : 0;

    return Math.max(1, (currentCount - 1) * 7 + elapsedDayCountInCurrentWeek);
  }

  return currentCount;
}

function isPausedBucket(settings: StreakSettingsRow, bucketStart: Date) {
  if (settings.mode === "daily") {
    return settings.pausedWeekdays.includes(bucketStart.getUTCDay());
  }

  return settings.pausedWeeks.includes(getUtcDateKey(startOfUtcWeek(bucketStart)));
}

function getBucketStart(settings: StreakSettingsRow, date: Date) {
  return settings.mode === "daily" ? startOfUtcDay(date) : startOfUtcWeek(date);
}

function getNextBucket(settings: StreakSettingsRow, bucketStart: Date) {
  return settings.mode === "daily" ? addUtcDays(bucketStart, 1) : addUtcDays(bucketStart, 7);
}

function getNextActiveBucket(settings: StreakSettingsRow, bucketStart: Date) {
  let candidate = getNextBucket(settings, bucketStart);

  while (isPausedBucket(settings, candidate)) {
    candidate = getNextBucket(settings, candidate);
  }

  return candidate;
}

function describeCurrentPeriod(settings: StreakSettingsRow, now: Date) {
  if (settings.mode === "daily") {
    return getUtcDateKey(startOfUtcDay(now));
  }

  return `Week of ${getUtcDateKey(startOfUtcWeek(now))}`;
}

async function ensureStreakSettings(profileId: string) {
  // Match the student-creation default for legacy profiles that do not yet
  // have calendar settings of their own.
  await db.insert(streakSettings).values({ profileId, pausedWeekdays: [0, 6] }).onConflictDoNothing();

  const [settings] = await db
    .select({
      profileId: streakSettings.profileId,
      mode: streakSettings.mode,
      timeZone: streakSettings.timeZone,
      pausedWeekdays: streakSettings.pausedWeekdays,
      pausedWeeks: streakSettings.pausedWeeks
    })
    .from(streakSettings)
    .where(eq(streakSettings.profileId, profileId))
    .limit(1);

  if (!settings) {
    throw new Error(`Streak settings for profile ${profileId} could not be created.`);
  }

  return {
    profileId: settings.profileId,
    mode: settings.mode,
    timeZone: settings.timeZone,
    pausedWeekdays: clampPausedWeekdays(settings.pausedWeekdays ?? []),
    pausedWeeks: normalizePausedWeeks(Array.isArray(settings.pausedWeeks) ? settings.pausedWeeks : [])
  } satisfies StreakSettingsRow;
}

async function getManageableStudentProfile(parentUserId: string, profileId: string) {
  const [parentProfile] = await db
    .select({
      id: profiles.id,
      accountId: profiles.accountId
    })
    .from(profiles)
    .where(and(eq(profiles.userId, parentUserId), eq(profiles.role, "PARENT")))
    .limit(1);

  if (!parentProfile) {
    throw new Error("Only parent profiles can manage student streak settings.");
  }

  const [studentProfile] = await db
    .select({
      id: profiles.id,
      accountId: profiles.accountId,
      firstName: profiles.firstName
    })
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.role, "STUDENT")))
    .limit(1);

  if (!studentProfile || studentProfile.accountId !== parentProfile.accountId) {
    throw new Error("Student profile is not available to this parent.");
  }

  return studentProfile;
}

export async function getStreakStatus(profileId: string) {
  return getCalculatedStreakStatus(profileId);
}

export async function getStudentStreakSettings(parentUserId: string, profileId: string) {
  await getManageableStudentProfile(parentUserId, profileId);
  const settings = await ensureStreakSettings(profileId);
  const status = await getStreakStatus(profileId);

  return {
    ...settings,
    currentCount: status.currentCount,
    longestCount: status.longestCount,
    currentPeriodLabel: status.currentPeriodLabel,
    currentPeriodPaused: status.currentPeriodPaused,
    currentPeriodCompleted: status.currentPeriodCompleted
  };
}

export async function updateStudentStreakSettings(input: {
  parentUserId: string;
  profileId: string;
  mode: StreakMode;
  timeZone?: string;
  pausedWeekdays?: number[];
  pausedWeeks?: string[];
}) {
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  const existing = await ensureStreakSettings(input.profileId);

  // Keep both calendar preferences when the streak mode changes. Previously,
  // switching to a weekly streak erased regular days off, so switching back to
  // daily could unexpectedly make Saturdays and Sundays count as school days.
  // An explicitly supplied empty array still clears that particular setting.
  const nextPausedWeekdays = input.pausedWeekdays === undefined
    ? existing.pausedWeekdays
    : clampPausedWeekdays(input.pausedWeekdays);
  const nextPausedWeeks = input.pausedWeeks === undefined
    ? existing.pausedWeeks
    : normalizePausedWeeks(input.pausedWeeks);
  const nextTimeZone = input.timeZone?.trim() || existing.timeZone || "UTC";
  const modeChanged = existing.mode !== input.mode;
  const now = new Date();

  const [profile] = await db
    .select({
      id: profiles.id,
      streakCount: profiles.streakCount,
      lastActiveAt: profiles.lastActiveAt
    })
    .from(profiles)
    .where(eq(profiles.id, input.profileId))
    .limit(1);

  if (!profile) {
    throw new Error("Profile not found.");
  }

  await db
    .update(streakSettings)
    .set({
      mode: input.mode,
      timeZone: nextTimeZone,
      pausedWeekdays: nextPausedWeekdays,
      pausedWeeks: nextPausedWeeks,
      updatedAt: new Date()
    })
    .where(eq(streakSettings.profileId, input.profileId));

  if (modeChanged) {
    await db
      .update(profiles)
      .set({
        streakCount: convertStreakCount({
          currentCount: profile.streakCount,
          fromMode: existing.mode,
          toMode: input.mode,
          lastActiveAt: profile.lastActiveAt,
          now
        }),
        lastActiveAt: profile.lastActiveAt
      })
      .where(eq(profiles.id, input.profileId));
  }

  return getStudentStreakSettings(input.parentUserId, input.profileId);
}

export async function recordActivity(profileId: string) {
  await db.insert(learningActivityEvents).values({
    profileId,
    occurredAt: new Date(),
    source: "lesson"
  });
  const status = await refreshStudentStreakCache(profileId);
  return {
    counted: true,
    reason: status.currentPeriodPaused ? "paused" : "recorded",
    ...status
  };
}
