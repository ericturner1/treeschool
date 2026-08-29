import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { ParentModeGuard } from "../../../parent-mode-guard";
import { ActivitySquareGrid } from "../../../../../components/activity-square-grid";
import { PremiumFeatureLock } from "../../../../../components/premium-feature-lock";
import { getStudentAttendance } from "../../../../../lib/attendance/server";
import { getParentBillingOverview } from "../../../../../lib/billing/server";
import { getParentStudentPageData, studentRoutePath } from "../student-page-data";
import { ReportDownloadButton } from "../report-download-button";
import { StudentShell } from "../student-shell";
import {
  addManualAttendanceAction,
  deleteAttendanceAction,
  updateManualAttendanceAction
} from "./actions";

type Props = {
  params: Promise<{ studentId?: string }>;
  searchParams?: Promise<{ lang?: string; yearId?: string; dateFrom?: string; dateTo?: string; error?: string; message?: string }>;
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function activityLabel(value: string, entryKind?: string) {
  if (entryKind === "plan_day") return "Planned school day";
  return ({ lesson: "Plan activity", field_trip: "Field trip", co_op: "Co-op", library: "Library", sport: "Physical education", project: "Project", subject: "Subject study", other: "Other learning" } as Record<string, string>)[value] ?? value;
}

export default async function AttendancePage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { dashboard, home, currentUser, parentProfile, student, studentRouteSegment } = await getParentStudentPageData(params.studentId, searchParams?.lang);
  if (params.studentId !== studentRouteSegment) {
    redirect(studentRoutePath(studentRouteSegment, "/attendance", searchParams));
  }
  const canDeleteAttendance = parentProfile?.accountRole !== "TEACHER";
  const basePath = studentRoutePath(studentRouteSegment, "/attendance");
  const billing = await getParentBillingOverview({ userId: currentUser.id });
  const attendance = billing.featureAccess.allowed ? await getStudentAttendance({
    parentUserId: currentUser.id, profileId: student.id, yearId: searchParams?.yearId,
    dateFrom: searchParams?.dateFrom, dateTo: searchParams?.dateTo
  }) : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={basePath}>
      <StudentShell brandName={home.brand.name} dashboard={dashboard} student={student} studentRouteSegment={studentRouteSegment} title="Attendance" activeNav="attendance">
        {!attendance ? (
          <PremiumFeatureLock
            title="See the rhythm of learning—not just a roll call."
            description={`Track ${student.firstName}’s planned work alongside field trips, co-ops, projects, library days, and other real learning.`}
            returnPath={basePath}
            trialEnded={billing.featureAccess.downloadOnly}
          />
        ) : (
          <div className="space-y-6">
            {searchParams?.error ? <div className="rounded-[18px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">{searchParams.error}</div> : null}
            <section className="site-panel rounded-[28px] px-6 py-7 sm:px-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-earth">Learning activity</p><h2 className="mt-2 text-[32px] font-semibold tracking-[-0.055em] text-ink">Attendance at a glance</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/62">Planned school days and learning beyond the plan belong in one honest record. Plan progress is based on the scheduled subjects logged here.</p></div>
                <div className="flex flex-wrap items-end gap-2">
                  {attendance.years.length > 0 ? <form method="GET" className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-semibold text-ink/65">School year<select name="yearId" defaultValue={attendance.selectedYearId ?? ""} className="mt-1 block rounded-[12px] border border-[#dcc8aa] bg-white px-3 py-2 text-sm text-ink">{attendance.years.map((year) => <option key={year.id} value={year.id}>{year.title}</option>)}</select></label>
                    <button className="cta-button cta-button--small" type="submit">View</button>
                  </form> : null}
                  <Link
                    href={studentRoutePath(studentRouteSegment, "/attendance/calendar") as Route}
                    className="cta-button cta-button--outline cta-button--small"
                  >
                    School calendar &amp; streak
                  </Link>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] bg-[#f8f1e4] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-earth">Learning days</p><p className="mt-1 text-3xl font-semibold text-ink">{attendance.summary.learningDays}</p></div>
                <div className="rounded-[18px] bg-[#f8f1e4] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-earth">Activities</p><p className="mt-1 text-3xl font-semibold text-ink">{attendance.summary.activities}</p></div>
                <div className="rounded-[18px] bg-[#f8f1e4] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-earth">Optional time logged</p><p className="mt-1 text-3xl font-semibold text-ink">{attendance.summary.minutes ? `${Math.floor(attendance.summary.minutes / 60)}h ${attendance.summary.minutes % 60}m` : "—"}</p></div>
              </div>
              {attendance.selectedYearId ? (
                <div className="mt-5 flex flex-col gap-4 rounded-[20px] border border-[#cbdcb9] bg-[#f4f8ee] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#456434]">Annual attendance report</p>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/62">
                      Download a printable PDF with learning-day totals, progress through every workbook, the last lesson completed, and the full attendance log.
                    </p>
                  </div>
                  <ReportDownloadButton
                    href={`/api/student-reports/attendance?${new URLSearchParams({ profileId: student.id, yearId: attendance.selectedYearId }).toString()}`}
                    label="Download attendance PDF"
                    fallbackFilename={`${student.firstName.toLowerCase()}-attendance-report.pdf`}
                  />
                </div>
              ) : null}
              <div className="mt-7 rounded-[20px] border border-[#e4d5bd] bg-white px-4 py-5">
                <ActivitySquareGrid
                  days={attendance.days}
                  noun="learning activity"
                  explanation="Lighter squares are quieter days; darker squares have more recorded learning."
                />
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
              <div className="site-panel rounded-[28px] px-6 py-7">
                <h2 className="text-[25px] font-semibold tracking-[-0.05em] text-ink">Record other learning</h2>
                <p className="mt-2 text-sm leading-6 text-ink/62">Use this for field trips, co-ops, projects, or subjects outside the Treeschool plan.</p>
                <form action={addManualAttendanceAction} className="mt-5 grid gap-4">
                  <input type="hidden" name="profileId" value={student.id} /><input type="hidden" name="learningYearId" value={attendance.selectedYearId ?? ""} />
                  <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-ink">Date<input required type="date" name="attendanceDate" defaultValue={today} className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /></label><label className="text-sm font-semibold text-ink">Type<select name="activityType" className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5"><option value="field_trip">Field trip</option><option value="co_op">Co-op</option><option value="project">Project</option><option value="library">Library</option><option value="sport">Physical education</option><option value="subject">Subject study</option><option value="other">Other learning</option></select></label></div>
                  <label className="text-sm font-semibold text-ink">What did you do?<input required name="title" placeholder="Example: Natural history museum visit" className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /></label>
                  <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-ink">Subject <span className="font-normal text-ink/45">(optional)</span><input name="subjectLabel" placeholder="Science" className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /></label><label className="text-sm font-semibold text-ink">Minutes <span className="font-normal text-ink/45">(optional)</span><input name="minutes" type="number" min="1" max="1440" placeholder="90" className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /></label></div>
                  <label className="text-sm font-semibold text-ink">Extra credit points <span className="font-normal text-ink/45">(optional)</span><input name="extraCreditPoints" type="number" min="1" max="100" step="1" placeholder="5" className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /><span className="mt-1.5 block text-xs font-normal leading-5 text-ink/50">Adds bonus points to this subject’s grade average. A subject is required when extra credit is entered.</span></label>
                  <label className="text-sm font-semibold text-ink">Notes <span className="font-normal text-ink/45">(optional)</span><textarea name="notes" rows={3} className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /></label>
                  <button type="submit" className="cta-button cta-button--light justify-self-start">Record learning day</button>
                </form>
              </div>

              <div className="site-panel rounded-[28px] px-6 py-7">
                <h2 className="text-[25px] font-semibold tracking-[-0.05em] text-ink">Recent attendance</h2>
                <div className="mt-5 space-y-3">
                  {attendance.entries.length === 0 ? <p className="rounded-[18px] bg-[#fffaf2] px-5 py-7 text-sm text-ink/60">No learning days recorded yet. Log a plan activity or add other learning here.</p> : attendance.entries.map((entry) => (
                    <article key={entry.id} className="rounded-[18px] border border-[#e2d2b8] bg-[#fffaf2] px-5 py-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-ink">{entry.title}</p>
                          <p className="mt-1 text-sm text-ink/58">{displayDate(entry.date)} · {activityLabel(entry.activityType, entry.entryKind)}{entry.subjectLabels.length > 0 ? ` · ${entry.subjectLabels.join(", ")}` : entry.subjectLabel ? ` · ${entry.subjectLabel}` : ""}{entry.minutes ? ` · ${entry.minutes} min` : ""}</p>
                          {entry.extraCreditPoints ? <span className="mt-2 inline-flex rounded-full bg-[#f3e6c8] px-2.5 py-1 text-xs font-bold text-[#765632]">+{entry.extraCreditPoints} extra credit {entry.extraCreditPoints === 1 ? "point" : "points"}</span> : null}
                          {entry.notes ? <p className="mt-2 text-sm leading-6 text-ink/65">{entry.notes}</p> : null}
                        </div>
                        <div className="flex flex-wrap items-start gap-3">
                          {canDeleteAttendance ? <form action={deleteAttendanceAction}><input type="hidden" name="profileId" value={student.id} /><input type="hidden" name="entryId" value={entry.id} /><button className="text-xs font-semibold text-[#8b3e2f] underline underline-offset-4">Remove</button></form> : null}
                        </div>
                      </div>
                      {entry.entryKind === "manual" ? (
                        <details className="group mt-4 border-t border-[#e2d2b8] pt-4">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-[#4d6a39] underline underline-offset-4 marker:hidden">
                            Edit learning record
                          </summary>
                          <form action={updateManualAttendanceAction} className="mt-4 grid gap-4 rounded-[16px] border border-[#d8c8ae] bg-white p-4">
                            <input type="hidden" name="profileId" value={student.id} />
                            <input type="hidden" name="entryId" value={entry.id} />
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="text-sm font-semibold text-ink">Date<input required type="date" name="attendanceDate" defaultValue={entry.date} className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /></label>
                              <label className="text-sm font-semibold text-ink">Type<select name="activityType" defaultValue={entry.activityType} className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5"><option value="field_trip">Field trip</option><option value="co_op">Co-op</option><option value="project">Project</option><option value="library">Library</option><option value="sport">Physical education</option><option value="subject">Subject study</option><option value="other">Other learning</option></select></label>
                            </div>
                            <label className="text-sm font-semibold text-ink">What did you do?<input required name="title" defaultValue={entry.title} className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /></label>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="text-sm font-semibold text-ink">Subject <span className="font-normal text-ink/45">(optional)</span><input name="subjectLabel" defaultValue={entry.subjectLabel ?? ""} placeholder="Science" className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /></label>
                              <label className="text-sm font-semibold text-ink">Minutes <span className="font-normal text-ink/45">(optional)</span><input name="minutes" type="number" min="1" max="1440" defaultValue={entry.minutes ?? ""} placeholder="90" className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /></label>
                            </div>
                            <label className="text-sm font-semibold text-ink">Extra credit points <span className="font-normal text-ink/45">(optional)</span><input name="extraCreditPoints" type="number" min="1" max="100" step="1" defaultValue={entry.extraCreditPoints ?? ""} placeholder="5" className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /><span className="mt-1.5 block text-xs font-normal leading-5 text-ink/50">Adds bonus points to this subject’s grade average.</span></label>
                            <label className="text-sm font-semibold text-ink">Notes <span className="font-normal text-ink/45">(optional)</span><textarea name="notes" rows={3} defaultValue={entry.notes ?? ""} className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" /></label>
                            <button type="submit" className="cta-button cta-button--light cta-button--small justify-self-start">Save changes</button>
                          </form>
                        </details>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </StudentShell>
    </ParentModeGuard>
  );
}
