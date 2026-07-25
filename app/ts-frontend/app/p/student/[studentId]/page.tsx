import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  getStudentSchoolCalendar,
  type StudentSchoolCalendarPayload
} from "../../../../lib/attendance/server";
import { PointIcon } from "../../../../components/point-icon";
import { getStudentPoints } from "../../../../lib/points/server";
import { getStudentOverviewMetrics } from "../../../../lib/student-overview/server";
import { ParentModeGuard } from "../../parent-mode-guard";
import { getParentStudentPageData, studentRoutePath } from "./student-page-data";
import { StudentShell } from "./student-shell";
import { StudentLearningProfileCard, StudentLearningProfileSummary } from "./student-learning-profile-card";
import { StudentSchoolYearSettingsTrigger } from "./student-profile-photo-trigger";

type ParentStudentOverviewPageProps = {
  params: {
    studentId?: string;
  };
  searchParams?: {
    lang?: string;
    error?: string;
    message?: string;
  };
};

function formatSchoolYearDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
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

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(value: string) {
  return new Date(`${value}T00:00:00.000Z`).getUTCDay();
}

function dayDistance(first: string, second: string) {
  return Math.round(
    (
      new Date(`${second}T00:00:00.000Z`).getTime() -
      new Date(`${first}T00:00:00.000Z`).getTime()
    ) / 86_400_000
  );
}

function displayCalendarDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function calendarExceptionOn(
  value: string,
  holidays: StudentSchoolCalendarPayload["holidays"]
) {
  return holidays.find((holiday) =>
    holiday.startDate <= value && holiday.endDate >= value
  ) ?? null;
}

function getDashboardCalendarStatus(calendar: StudentSchoolCalendarPayload) {
  const today = dateKeyInTimeZone(new Date(), calendar.timeZone);
  const currentException = calendarExceptionOn(today, calendar.holidays);
  const todayIsDayOff = Boolean(
    currentException || calendar.recurringDaysOff.includes(weekday(today))
  );

  if (todayIsDayOff) {
    let nextSchoolDay: string | null = null;
    for (let offset = 1; offset <= 370; offset += 1) {
      const candidate = shiftDate(today, offset);
      if (
        !calendar.recurringDaysOff.includes(weekday(candidate)) &&
        !calendarExceptionOn(candidate, calendar.holidays)
      ) {
        nextSchoolDay = candidate;
        break;
      }
    }
    return {
      isDayOffToday: true,
      eyebrow: currentException ? currentException.label : "Today is a regular day off",
      headline: "Next school day",
      date: nextSchoolDay,
      description: nextSchoolDay
        ? `School resumes in ${dayDistance(today, nextSchoolDay)} ${
            dayDistance(today, nextSchoolDay) === 1 ? "day" : "days"
          }.`
        : "No upcoming school day is currently scheduled."
    };
  }

  const nextPlannedBreak = [...calendar.holidays]
    .filter((holiday) => holiday.startDate > today)
    .sort((left, right) => left.startDate.localeCompare(right.startDate))[0] ?? null;
  let nextRegularDayOff: string | null = null;
  if (!nextPlannedBreak) {
    for (let offset = 1; offset <= 14; offset += 1) {
      const candidate = shiftDate(today, offset);
      if (calendar.recurringDaysOff.includes(weekday(candidate))) {
        nextRegularDayOff = candidate;
        break;
      }
    }
  }
  const nextDate = nextPlannedBreak?.startDate ?? nextRegularDayOff;
  return {
    isDayOffToday: false,
    eyebrow: nextPlannedBreak?.exceptionKind === "holiday" ? "Next holiday" : "Next break",
    headline: nextPlannedBreak?.label ?? (nextRegularDayOff ? "Regular day off" : "No break scheduled"),
    date: nextDate,
    description: nextDate
      ? `Starts in ${dayDistance(today, nextDate)} ${
          dayDistance(today, nextDate) === 1 ? "day" : "days"
        }.`
      : "Add holidays and days off to the school calendar."
  };
}

export default async function ParentStudentOverviewPage({
  params,
  searchParams
}: ParentStudentOverviewPageProps) {
  const { currentUser, dashboard, home, student, studentRouteSegment } = await getParentStudentPageData(params.studentId, searchParams?.lang);
  if (params.studentId !== studentRouteSegment) {
    redirect(studentRoutePath(studentRouteSegment, "", searchParams));
  }
  const calendarDateFrom = new Date().toISOString().slice(0, 10);
  const [metrics, calendar, points] = await Promise.all([
    getStudentOverviewMetrics({
      parentUserId: currentUser.id,
      profileId: student.id
    }),
    getStudentSchoolCalendar({
      parentUserId: currentUser.id,
      profileId: student.id,
      dateFrom: calendarDateFrom,
      dateTo: shiftDate(calendarDateFrom, 370)
    }),
    getStudentPoints({
      parentUserId: currentUser.id,
      profileId: student.id
    }).catch(() => null)
  ]);
  const streak = calendar.streak;
  const calendarStatus = getDashboardCalendarStatus(calendar);
  const basePath = studentRoutePath(studentRouteSegment);
  const query = new URLSearchParams();

  if (searchParams?.lang) query.set("lang", searchParams.lang);
  if (searchParams?.message) query.set("message", searchParams.message);
  if (searchParams?.error) query.set("error", searchParams.error);

  const redirectTo = query.size > 0 ? `${basePath}?${query.toString()}` : basePath;

  const lastAttendanceLabel = metrics.lastAttendance
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${metrics.lastAttendance.date}T00:00:00.000Z`))
    : null;
  const pace = metrics.pacing;
  const hasSchoolYearPeriod = Boolean(metrics.learningYear?.startDate && metrics.learningYear?.endDate);
  const paceHeadline = pace?.status === "behind"
    ? pace.behindWeeks >= 1
      ? `${pace.behindWeeks} ${pace.behindWeeks === 1 ? "week" : "weeks"} behind`
      : `${pace.behindTeachingDays} teaching ${pace.behindTeachingDays === 1 ? "day" : "days"} behind`
    : pace?.status === "ahead"
      ? `${pace.aheadTeachingDays} teaching ${pace.aheadTeachingDays === 1 ? "day" : "days"} ahead`
      : pace?.status === "before_start"
        ? "Not started"
        : pace?.status === "complete"
          ? "Complete"
          : pace ? "On track" : null;
  const completedPacePercent = pace
    ? Math.min(100, Math.round((pace.completedTeachingDays / Math.max(1, pace.scheduledTeachingDays)) * 100))
    : 0;
  const expectedPacePercent = pace
    ? Math.max(1, Math.min(99, Math.round((pace.expectedTeachingDays / Math.max(1, pace.scheduledTeachingDays)) * 100)))
    : 0;

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <StudentShell
        brandName={home.brand.name}
        dashboard={dashboard}
        student={student}
        studentRouteSegment={studentRouteSegment}
        title={dashboard.studentManagement.overviewTitle}
        activeNav="overview"
        studentIdentityInContent
        studentProfileSummary={(
          <StudentLearningProfileSummary
            profileId={student.id}
            studentName={student.firstName}
            subjectStrengths={metrics.learningProfile.subjectStrengths}
          />
        )}
      >
        <section>
          <div className="site-panel rounded-[24px] px-4 py-5 sm:rounded-[28px] sm:px-6 sm:py-7">
            <div className="flex flex-col gap-4 rounded-[20px] border border-[#b9cf9f] bg-[#eef5e4] px-4 py-4 shadow-[0_5px_0_#cfdfbf] sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:rounded-[24px] sm:px-6 sm:py-5 sm:shadow-[0_6px_0_#cfdfbf]">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#587443]">Next up</p>
                <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.045em] text-ink">
                  {metrics.nextAction.label}
                </h3>
                <p className="mt-1.5 max-w-2xl text-sm leading-[1.65] text-ink/68">
                  {metrics.nextAction.description}
                </p>
              </div>
              <Link
                href={metrics.nextAction.href as Route}
                className="cta-button cta-button--dark cta-button--small flex-none justify-center gap-2 sm:min-w-[180px]"
              >
                Continue
                <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {metrics.hasLessonPlan && metrics.premiumAccess ? (
                <article className="rounded-[22px] border border-[#c9d9b7] bg-[#f1f7e8] px-5 py-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#587443]">Year plan progress</p>
                  <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.06em] text-ink">
                    {metrics.planProgressPercent ?? 0}%
                  </p>
                  <div
                    className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#dce7d0]"
                    role="progressbar"
                    aria-label="Year plan progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={metrics.planProgressPercent ?? 0}
                  >
                    <div
                      className="h-full rounded-full bg-[#7fa35f]"
                      style={{ width: `${metrics.planProgressPercent ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-3 text-sm leading-[1.55] text-ink/65">Based on completed lesson-day activity.</p>
                </article>
              ) : null}

              {points ? (
                <Link
                  href={studentRoutePath(studentRouteSegment, "/points") as Route}
                  className="group rounded-[22px] border border-[#c9d9b7] bg-[#f1f7e8] px-5 py-5 transition hover:-translate-y-0.5 hover:border-[#9dbb82]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#587443]">
                      Current {points.settings.pluralName}
                    </p>
                    <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#dceacd] text-[#55763f]">
                      <PointIcon
                        iconKey={points.settings.iconKey}
                        customIconUrl={points.settings.customIconUrl}
                        className="text-xl"
                      />
                    </span>
                  </div>
                  <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.06em] text-ink">
                    {points.summary.balance}
                  </p>
                  <p className="mt-3 text-sm leading-[1.55] text-ink/65">
                    {points.summary.lifetimeEarned} earned over time. Award, use, and customize {points.settings.pluralName.toLowerCase()}.
                  </p>
                  <span className="mt-3 inline-flex text-sm font-semibold text-[#4f703c] underline decoration-[#99b782] underline-offset-4">
                    Open {points.settings.pluralName.toLowerCase()}
                  </span>
                </Link>
              ) : null}

              {pace && paceHeadline ? (
                <article className={`rounded-[22px] border px-5 py-5 ${
                  pace.status === "behind"
                    ? "border-[#dfbc76] bg-[#fff7e3]"
                    : "border-[#c9d9b7] bg-[#f1f7e8]"
                }`}>
                  <p className={`text-sm font-semibold uppercase tracking-[0.08em] ${
                    pace.status === "behind" ? "text-[#805c22]" : "text-[#587443]"
                  }`}>School-year pace</p>
                  <p className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-[-0.05em] text-ink">
                    {paceHeadline}
                  </p>
                  <div className="mt-5">
                    <div
                      className="relative h-3 rounded-full bg-[#e5dfd3]"
                      role="progressbar"
                      aria-label="Completed teaching days compared with today's planned pace"
                      aria-valuemin={0}
                      aria-valuemax={pace.scheduledTeachingDays}
                      aria-valuenow={pace.completedTeachingDays}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] ${
                          pace.status === "behind" ? "bg-[#d4a24b]" : "bg-[#7fa35f]"
                        }`}
                        style={{ width: `${completedPacePercent}%` }}
                      />
                      <span
                        className="absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_0_3px_#fffaf2]"
                        style={{ left: `${expectedPacePercent}%` }}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="mt-2 flex items-start justify-between gap-3 text-[11px] font-semibold leading-4 text-ink/55">
                      <span>{pace.completedTeachingDays} completed</span>
                      <span className="text-right">{pace.expectedTeachingDays} expected by today</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-[1.55] text-ink/65">
                    {pace.status === "behind"
                      ? `${pace.behindTeachingDays} teaching ${pace.behindTeachingDays === 1 ? "day" : "days"} behind the planned pace.`
                      : pace.status === "before_start"
                        ? `Begins ${formatSchoolYearDate(pace.startDate)}.`
                        : `${pace.completedTeachingDays} of ${pace.scheduledTeachingDays} teaching days complete.`}
                  </p>
                  <p className="mt-2 text-xs text-ink/45">
                    {formatSchoolYearDate(pace.startDate)}–{formatSchoolYearDate(pace.endDate)}
                  </p>
                </article>
              ) : !hasSchoolYearPeriod ? (
                <article className="rounded-[22px] border border-[#b9cf9f] bg-[#f1f7e8] px-5 py-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#587443]">School year</p>
                  <p className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-[-0.05em] text-ink">
                    Not set yet
                  </p>
                  <p className="mt-3 text-sm leading-[1.55] text-ink/65">
                    Add the start and end dates so Treeschool can show whether the lesson plan is ahead, on schedule, or behind.
                  </p>
                  <StudentSchoolYearSettingsTrigger profileId={student.id} studentName={student.firstName} />
                </article>
              ) : (
                <article className="rounded-[22px] border border-[#c9d9b7] bg-[#f1f7e8] px-5 py-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#587443]">School year</p>
                  <p className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.04em] text-ink">Calendar set</p>
                  <p className="mt-3 text-sm leading-[1.6] text-ink/65">
                    {formatSchoolYearDate(metrics.learningYear!.startDate!)}–{formatSchoolYearDate(metrics.learningYear!.endDate!)}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-ink/45">Pace appears after lesson days are planned.</p>
                </article>
              )}

              <article className="rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-5">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-ink/55">Overall grade</p>
                {metrics.premiumAccess && metrics.overallGrade?.average != null ? (
                  <div className="mt-3 flex items-baseline gap-3">
                    <p className="text-[36px] font-semibold leading-none tracking-[-0.06em] text-ink">
                      {metrics.overallGrade.average}%
                    </p>
                    <span className="rounded-full bg-[#e5efd9] px-3 py-1 text-base font-semibold text-[#486a38]">
                      {metrics.overallGrade.letter}
                    </span>
                  </div>
                ) : (
                  <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.06em] text-ink/35">—</p>
                )}
                <p className="mt-3 text-sm leading-[1.55] text-ink/65">
                  {!metrics.premiumAccess
                    ? "Available with the Family Plan."
                    : metrics.overallGrade?.average == null
                      ? "No grades recorded yet."
                      : `Across ${metrics.overallGrade.gradedEntries} graded ${metrics.overallGrade.gradedEntries === 1 ? "item" : "items"}.`}
                </p>
              </article>

              <article className="rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-5">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-ink/55">Days since last attendance</p>
                {metrics.premiumAccess && metrics.lastAttendance ? (
                  <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.06em] text-ink">
                    {metrics.lastAttendance.daysSince}
                  </p>
                ) : (
                  <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.06em] text-ink/35">—</p>
                )}
                <p className="mt-3 text-sm leading-[1.55] text-ink/65">
                  {!metrics.premiumAccess
                    ? "Available with the Family Plan."
                    : lastAttendanceLabel
                      ? `Last recorded ${lastAttendanceLabel}.`
                      : "No attendance recorded yet."}
                </p>
              </article>

              <article className="rounded-[22px] border border-[#c9d9b7] bg-[#f1f7e8] px-5 py-5">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#587443]">Learning streak</p>
                <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.06em] text-ink">
                  {streak.currentCount}
                </p>
                <p className="mt-3 text-sm leading-[1.55] text-ink/65">
                  {streak.currentCount === 1 ? "School day in a row." : "School days in a row."}
                  {streak.longestCount > 0 ? ` Best: ${streak.longestCount}.` : ""}
                </p>
                <Link
                  href={studentRoutePath(studentRouteSegment, "/attendance/calendar") as Route}
                  className="mt-3 inline-flex text-sm font-semibold text-[#4f703c] underline decoration-[#99b782] underline-offset-4"
                >
                  Open school calendar
                </Link>
              </article>

              <article className={`rounded-[22px] border px-5 py-5 ${
                calendarStatus.isDayOffToday
                  ? "border-[#c9b1df] bg-[#f5effb] shadow-[0_6px_0_#e1d3ec]"
                  : "border-[#dfc47f] bg-[#fff8e5]"
              }`}>
                <p className={`text-sm font-semibold uppercase tracking-[0.08em] ${
                  calendarStatus.isDayOffToday ? "text-[#76528f]" : "text-[#805c22]"
                }`}>
                  {calendarStatus.eyebrow}
                </p>
                <p className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-[-0.05em] text-ink">
                  {calendarStatus.headline}
                </p>
                {calendarStatus.date ? (
                  <p className="mt-3 text-base font-semibold leading-6 text-ink/75">
                    {displayCalendarDate(calendarStatus.date)}
                  </p>
                ) : null}
                <p className="mt-2 text-sm leading-[1.55] text-ink/65">
                  {calendarStatus.description}
                </p>
                <Link
                  href={studentRoutePath(studentRouteSegment, "/attendance/calendar") as Route}
                  className={`mt-3 inline-flex text-sm font-semibold underline underline-offset-4 ${
                    calendarStatus.isDayOffToday
                      ? "text-[#76528f] decoration-[#c2a7d8]"
                      : "text-[#805c22] decoration-[#d8bd76]"
                  }`}
                >
                  Open school calendar
                </Link>
              </article>
            </div>
            <StudentLearningProfileCard
              profileId={student.id}
              studentName={student.firstName}
              avatarUrl={student.avatarUrl}
              notes={metrics.learningProfile.notes}
              subjectStrengths={metrics.learningProfile.subjectStrengths}
              schoolYearStartDate={metrics.learningYear?.startDate ?? null}
              schoolYearEndDate={metrics.learningYear?.endDate ?? null}
              showSummary={false}
            />
          </div>
        </section>
      </StudentShell>
    </ParentModeGuard>
  );
}
