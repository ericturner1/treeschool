const DAY_MS = 86_400_000;

export type SchoolYearPacing = {
  status: "before_start" | "on_track" | "ahead" | "behind" | "complete";
  startDate: string;
  endDate: string;
  scheduledTeachingDays: number;
  completedTeachingDays: number;
  expectedTeachingDays: number;
  behindTeachingDays: number;
  behindWeeks: number;
  aheadTeachingDays: number;
};

function utcDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date.getTime();
}

export function calculateSchoolYearPacing(input: {
  startDate: string | null;
  endDate: string | null;
  scheduledTeachingDays: number;
  completedTeachingDays: number;
  teachingDaysPerWeek: number;
  today?: string;
}): SchoolYearPacing | null {
  if (!input.startDate || !input.endDate || input.scheduledTeachingDays <= 0) return null;
  const start = utcDateValue(input.startDate);
  const end = utcDateValue(input.endDate);
  const todayValue = utcDateValue(input.today ?? new Date().toISOString().slice(0, 10));
  if (start == null || end == null || todayValue == null || end <= start) return null;

  const scheduledTeachingDays = Math.max(0, Math.round(input.scheduledTeachingDays));
  const completedTeachingDays = Math.min(
    scheduledTeachingDays,
    Math.max(0, Math.round(input.completedTeachingDays))
  );
  const calendarSpan = Math.max(1, Math.round((end - start) / DAY_MS));
  const elapsedCalendarDays = Math.max(0, Math.min(calendarSpan, Math.floor((todayValue - start) / DAY_MS)));
  const expectedTeachingDays = todayValue < start
    ? 0
    : Math.min(scheduledTeachingDays, Math.round(
        scheduledTeachingDays * (elapsedCalendarDays / calendarSpan)
      ));
  const behindTeachingDays = Math.max(0, expectedTeachingDays - completedTeachingDays);
  const aheadTeachingDays = Math.max(0, completedTeachingDays - expectedTeachingDays);
  const teachingDaysPerWeek = Math.max(1, Math.min(7, Math.round(input.teachingDaysPerWeek || 5)));

  const status = completedTeachingDays >= scheduledTeachingDays
    ? "complete" as const
    : todayValue < start
      ? "before_start" as const
      : behindTeachingDays > 0
        ? "behind" as const
        : aheadTeachingDays > 0
          ? "ahead" as const
          : "on_track" as const;

  return {
    status,
    startDate: input.startDate,
    endDate: input.endDate,
    scheduledTeachingDays,
    completedTeachingDays,
    expectedTeachingDays,
    behindTeachingDays,
    behindWeeks: Math.round((behindTeachingDays / teachingDaysPerWeek) * 10) / 10,
    aheadTeachingDays
  };
}
