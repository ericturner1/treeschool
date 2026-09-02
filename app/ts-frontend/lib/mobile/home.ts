import type { HouseholdProfile } from "../accounts/server";
import type { StudentSchoolCalendarPayload } from "../attendance/server";
import type { PaperPlan } from "../paper-plans/server";
import { shouldShowStreakWarning } from "../student-overview/streak-warning";

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

function weekday(value: string) {
  return new Date(`${value}T00:00:00.000Z`).getUTCDay();
}

export function mobileSchoolDayStatus(
  calendar: StudentSchoolCalendarPayload,
  now = new Date()
) {
  const today = dateKeyInTimeZone(now, calendar.timeZone);
  const dayOff = calendar.holidays.find((holiday) =>
    holiday.startDate <= today && holiday.endDate >= today
  );
  const isSchoolDay = !dayOff && !calendar.recurringDaysOff.includes(weekday(today));
  return {
    isSchoolDay,
    dayOffReason: isSchoolDay
      ? null
      : dayOff?.label ?? "Regular day off",
  };
}

export function buildMobileHomePayload(input: {
  students: HouseholdProfile[];
  selectedProfileId: string;
  plan: PaperPlan;
  calendar: StudentSchoolCalendarPayload;
  points: {
    settings: {
      singularName: string;
      pluralName: string;
    };
    summary: {
      totalBalance: number;
    };
  };
  now?: Date;
}) {
  const nextWeek = input.plan.weeks.find(
    (week) => week.status !== "completed" && week.status !== "skipped",
  );
  const streak = input.calendar.streak;

  return {
    students: input.students.map((student) => ({
      id: student.id,
      firstName: student.firstName,
      avatarUrl: student.avatarUrl,
      gradeLevel: student.gradeLevel,
      currentPoints: student.id === input.selectedProfileId
        ? input.points.summary.totalBalance
        : null,
      pointSingularName: student.id === input.selectedProfileId
        ? input.points.settings.singularName
        : null,
      pointPluralName: student.id === input.selectedProfileId
        ? input.points.settings.pluralName
        : null,
    })),
    selectedProfileId: input.selectedProfileId,
    schoolDay: mobileSchoolDayStatus(input.calendar, input.now),
    streak: {
      mode: streak.mode,
      currentCount: streak.currentCount,
      longestCount: streak.longestCount,
      currentPeriodPaused: streak.currentPeriodPaused,
      currentPeriodCompleted: streak.currentPeriodCompleted,
      showWarning: shouldShowStreakWarning(streak),
    },
    nextWeek: nextWeek
      ? {
          id: nextWeek.id,
          weekNumber: nextWeek.weekNumber,
          title: nextWeek.title,
          downloaded: nextWeek.downloaded,
        }
      : null,
  };
}
