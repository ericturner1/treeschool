import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getStudentSchoolCalendar } from "../../../../../../lib/attendance/server";
import { ParentModeGuard } from "../../../../parent-mode-guard";
import { getParentStudentPageData, studentRoutePath } from "../../student-page-data";
import { StudentShell } from "../../student-shell";
import {
  addHolidayAction,
  removeHolidayAction,
  updateSchoolWeekAction
} from "./actions";
import { InteractiveCalendar } from "./interactive-calendar";
import { TimeZoneInput } from "./time-zone-input";

type Props = {
  params: { studentId?: string };
  searchParams?: {
    lang?: string;
    month?: string;
    error?: string;
    message?: string;
  };
};

const weekdayLabels = [
  { value: 0, short: "Sun", long: "Sunday" },
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" }
] as const;

const exceptionKindLabels = {
  holiday: "Holiday",
  school_break: "School break",
  vacation: "Vacation",
  personal_day: "Personal day",
  other: "Other day off"
} as const;

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
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

function normalizeMonth(value: string | undefined) {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return dateKey(new Date(Date.UTC(year!, monthNumber! - 1 + amount, 1))).slice(0, 7);
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year!, monthNumber! - 1, 1));
  const last = new Date(Date.UTC(year!, monthNumber!, 0));
  return { first, last, dateFrom: dateKey(first), dateTo: dateKey(last) };
}

function monthDays(month: string) {
  const { first, last } = monthBounds(month);
  const cells: Array<{ date: string; inMonth: boolean }> = [];
  for (let offset = 0; offset < first.getUTCDay(); offset += 1) {
    const date = new Date(first);
    date.setUTCDate(date.getUTCDate() - (first.getUTCDay() - offset));
    cells.push({ date: dateKey(date), inMonth: false });
  }
  for (let day = 1; day <= last.getUTCDate(); day += 1) {
    cells.push({ date: `${month}-${String(day).padStart(2, "0")}`, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const date = new Date(`${cells.at(-1)!.date}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    cells.push({ date: dateKey(date), inMonth: false });
  }
  return cells;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export default async function StudentSchoolCalendarPage({ params, searchParams }: Props) {
  const {
    dashboard,
    home,
    currentUser,
    parentProfile,
    student,
    studentRouteSegment
  } = await getParentStudentPageData(params.studentId, searchParams?.lang);
  const month = normalizeMonth(searchParams?.month);
  if (params.studentId !== studentRouteSegment) {
    redirect(studentRoutePath(studentRouteSegment, "/attendance/calendar", { ...searchParams, month }));
  }
  const bounds = monthBounds(month);
  const calendar = await getStudentSchoolCalendar({
    parentUserId: currentUser.id,
    profileId: student.id,
    dateFrom: bounds.dateFrom,
    dateTo: bounds.dateTo
  });
  const canManage = parentProfile?.accountRole !== "TEACHER";
  const basePath = studentRoutePath(studentRouteSegment, "/attendance/calendar");
  const returnQuery = new URLSearchParams({ month });
  if (searchParams?.lang) returnQuery.set("lang", searchParams.lang);
  const returnPath = `${basePath}?${returnQuery}`;
  const cells = monthDays(month);
  const today = dateKeyInTimeZone(new Date(), calendar.timeZone);
  const selectedMonthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(bounds.first);

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={returnPath}>
      <StudentShell
        brandName={home.brand.name}
        dashboard={dashboard}
        student={student}
        studentRouteSegment={studentRouteSegment}
        title="School calendar"
        activeNav="attendance"
      >
        <div className="space-y-6">
          {searchParams?.message ? (
            <div className="rounded-[18px] border border-[#b8cf9f] bg-[#eef5e4] px-5 py-4 text-sm font-semibold text-[#4d6a39]">
              {searchParams.message}
            </div>
          ) : null}
          {searchParams?.error ? (
            <div className="rounded-[18px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">
              {searchParams.error}
            </div>
          ) : null}

          <section className="site-panel rounded-[28px] px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <Link
                  href={studentRoutePath(studentRouteSegment, "/attendance") as Route}
                  className="text-sm font-semibold text-earth underline decoration-[#c8af8b] underline-offset-4"
                >
                  ← Back to attendance
                </Link>
                <h1 className="mt-4 text-[36px] font-semibold tracking-[-0.06em] text-ink">
                  {student.firstName}&apos;s school calendar
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
                  Regular days off and planned holidays are skipped automatically, so a well-earned break never ends a learning streak.
                </p>
              </div>
              <div className="grid min-w-[260px] grid-cols-2 gap-3">
                <div className="rounded-[18px] bg-[#eef5e4] px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#587443]">Current streak</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-ink">
                    {calendar.streak.currentCount}
                  </p>
                  <p className="text-sm text-ink/58">{calendar.streak.currentCount === 1 ? "school day" : "school days"}</p>
                </div>
                <div className="rounded-[18px] bg-[#f8f1e4] px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-earth">Best streak</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-ink">
                    {calendar.streak.longestCount}
                  </p>
                  <p className="text-sm text-ink/58">{calendar.streak.longestCount === 1 ? "school day" : "school days"}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`${basePath}?month=${shiftMonth(month, -1)}${searchParams?.lang ? `&lang=${encodeURIComponent(searchParams.lang)}` : ""}` as Route}
                className="cta-button cta-button--outline cta-button--small"
              >
                ← Previous
              </Link>
              <h2 className="text-[26px] font-semibold tracking-[-0.045em] text-ink">{selectedMonthLabel}</h2>
              <Link
                href={`${basePath}?month=${shiftMonth(month, 1)}${searchParams?.lang ? `&lang=${encodeURIComponent(searchParams.lang)}` : ""}` as Route}
                className="cta-button cta-button--outline cta-button--small"
              >
                Next →
              </Link>
            </div>

            <div className="mt-5">
              <InteractiveCalendar
                cells={cells}
                holidays={calendar.holidays}
                recurringDaysOff={calendar.recurringDaysOff}
                activityDates={calendar.activityDates}
                today={today}
                canManage={canManage}
                profileId={student.id}
                studentName={student.firstName}
                returnPath={returnPath}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-ink/55">
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#6f9853]" /> Learning recorded</span>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-[#f0e7d8]" /> Planned day off</span>
              <span>Calendar time zone: {calendar.timeZone}</span>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <div className="site-panel rounded-[28px] px-6 py-7">
              <h2 className="text-[26px] font-semibold tracking-[-0.05em] text-ink">Regular school week</h2>
              <p className="mt-2 text-sm leading-6 text-ink/62">
                Select the weekdays your family normally takes off. They will never count against the streak.
              </p>
              {canManage ? (
                <form action={updateSchoolWeekAction} className="mt-5">
                  <input type="hidden" name="profileId" value={student.id} />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <TimeZoneInput initialValue={calendar.timeZone} />
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {weekdayLabels.map((day) => (
                      <label
                        key={day.value}
                        className="cursor-pointer rounded-[15px] border border-[#dcc8aa] bg-white px-2 py-3 text-center text-sm font-semibold text-ink has-[:checked]:border-[#b88a73] has-[:checked]:bg-[#f5e3da] has-[:checked]:text-[#7f4437]"
                      >
                        <input
                          type="checkbox"
                          name="recurringDaysOff"
                          value={day.value}
                          defaultChecked={calendar.recurringDaysOff.includes(day.value)}
                          className="sr-only"
                        />
                        {day.short}
                      </label>
                    ))}
                  </div>
                  <button type="submit" className="cta-button cta-button--small mt-5">Save regular week</button>
                </form>
              ) : (
                <p className="mt-5 rounded-[16px] bg-[#f8f1e4] px-4 py-4 text-sm text-ink/62">
                  An account owner or admin can change the regular school week.
                </p>
              )}
            </div>

            <div className="site-panel rounded-[28px] px-6 py-7">
              <h2 className="text-[26px] font-semibold tracking-[-0.05em] text-ink">Add a planned break</h2>
              <p className="mt-2 text-sm leading-6 text-ink/62">
                Add a holiday, vacation, or single day off. Date ranges are inclusive.
              </p>
              {canManage ? (
                <form action={addHolidayAction} className="mt-5 grid gap-4">
                  <input type="hidden" name="profileId" value={student.id} />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <label className="text-sm font-semibold text-ink">
                    Type
                    <select
                      name="exceptionKind"
                      defaultValue="school_break"
                      className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white py-2.5 pl-3 pr-10"
                    >
                      {Object.entries(exceptionKindLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold text-ink">
                    Name
                    <input required name="label" placeholder="Winter holiday" className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-ink">
                      Starts
                      <input required type="date" name="startDate" defaultValue={today} className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" />
                    </label>
                    <label className="text-sm font-semibold text-ink">
                      Ends
                      <input required type="date" name="endDate" defaultValue={today} className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" />
                    </label>
                  </div>
                  <button type="submit" className="cta-button cta-button--small justify-self-start">Add planned break</button>
                </form>
              ) : (
                <p className="mt-5 rounded-[16px] bg-[#f8f1e4] px-4 py-4 text-sm text-ink/62">
                  An account owner or admin can add planned breaks.
                </p>
              )}
            </div>
          </section>

          <section className="site-panel rounded-[28px] px-6 py-7 sm:px-8">
            <h2 className="text-[26px] font-semibold tracking-[-0.05em] text-ink">Planned holidays and days off</h2>
            <div className="mt-5 space-y-3">
              {calendar.holidays.length === 0 ? (
                <p className="rounded-[18px] bg-[#fffaf2] px-5 py-6 text-sm text-ink/60">No planned breaks yet.</p>
              ) : calendar.holidays.map((holiday) => (
                <article key={holiday.id} className="flex flex-col gap-3 rounded-[18px] border border-[#e2d2b8] bg-[#fffaf2] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{holiday.label}</p>
                      <span className="rounded-full bg-[#eee6da] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink/55">
                        {exceptionKindLabels[holiday.exceptionKind]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink/58">
                      {displayDate(holiday.startDate)}
                      {holiday.endDate !== holiday.startDate ? `–${displayDate(holiday.endDate)}` : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <form action={removeHolidayAction}>
                      <input type="hidden" name="profileId" value={student.id} />
                      <input type="hidden" name="exceptionId" value={holiday.id} />
                      <input type="hidden" name="returnPath" value={returnPath} />
                      <button type="submit" className="text-sm font-semibold text-[#8b3e2f] underline underline-offset-4">Remove</button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      </StudentShell>
    </ParentModeGuard>
  );
}
