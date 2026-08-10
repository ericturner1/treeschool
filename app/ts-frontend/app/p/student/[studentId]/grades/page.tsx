import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { ParentModeGuard } from "../../../parent-mode-guard";
import { PremiumFeatureLock } from "../../../../../components/premium-feature-lock";
import { getParentBillingOverview } from "../../../../../lib/billing/server";
import { getStudentGrades } from "../../../../../lib/grades/server";
import { getParentStudentPageData, studentRoutePath } from "../student-page-data";
import { StudentShell } from "../student-shell";

type Props = {
  params: Promise<{ studentId?: string }>;
  searchParams?: Promise<{ lang?: string; yearId?: string; subjectKey?: string }>;
};

const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
}).format(new Date(value));

export default async function GradesPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { dashboard, home, currentUser, student, studentRouteSegment } = await getParentStudentPageData(params.studentId, searchParams?.lang);
  if (params.studentId !== studentRouteSegment) {
    redirect(studentRoutePath(studentRouteSegment, "/grades", searchParams));
  }
  const basePath = studentRoutePath(studentRouteSegment, "/grades");
  const billing = await getParentBillingOverview({ userId: currentUser.id });
  const grades = billing.featureAccess.allowed ? await getStudentGrades({
    parentUserId: currentUser.id,
    profileId: student.id,
    yearId: searchParams?.yearId,
    subjectKey: searchParams?.subjectKey
  }) : null;

  const yearHref = (yearId: string) => `${basePath}?${new URLSearchParams({
    ...(searchParams?.lang ? { lang: searchParams.lang } : {}), yearId
  })}` as Route;
  const subjectHref = (subjectKey?: string) => {
    const query = new URLSearchParams();
    if (searchParams?.lang) query.set("lang", searchParams.lang);
    if (grades?.selectedYear) query.set("yearId", grades.selectedYear.id);
    if (subjectKey) query.set("subjectKey", subjectKey);
    return `${basePath}?${query}` as Route;
  };

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={basePath}>
      <StudentShell brandName={home.brand.name} dashboard={dashboard} student={student} studentRouteSegment={studentRouteSegment} title="Grades" activeNav="grades">
        {!grades ? (
          <PremiumFeatureLock
            title="Keep a clear grade record as the year unfolds."
            description={`View ${student.firstName}’s optional grades across school years, compare subjects, and drill down to each recorded assessment.`}
            returnPath={basePath}
            trialEnded={billing.featureAccess.downloadOnly}
          />
        ) : (
          <div className="space-y-6">
            <section className="site-panel rounded-[28px] px-6 py-7 sm:px-8">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-earth">Grade book</p>
                  <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.055em] text-ink">{grades.selectedYear?.title ?? "No learning year yet"}</h2>
                  <p className="mt-2 text-sm text-ink/62">{grades.gradingScheme.name} · only grades you choose to record are averaged.</p>
                </div>
                {grades.years.length > 0 ? (
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-[14px] border border-[#d8c4a6] bg-[#fffaf2] px-4 py-3 text-sm font-semibold text-ink">
                      Change school year ▾
                    </summary>
                    <div className="absolute right-0 z-20 mt-2 min-w-[240px] overflow-hidden rounded-[16px] border border-[#dcc8aa] bg-white p-2 shadow-xl">
                      {grades.years.map((year) => <Link key={year.id} href={yearHref(year.id)} className={`block rounded-[10px] px-3 py-2 text-sm ${year.id === grades.selectedYear?.id ? "bg-[#eef5e4] font-semibold" : "hover:bg-[#fffaf2]"}`}>{year.title}</Link>)}
                    </div>
                  </details>
                ) : null}
              </div>
              {grades.selectedYear ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[18px] bg-[#f8f1e4] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-earth">Overall</p><p className="mt-1 text-3xl font-semibold text-ink">{grades.selectedYear.grade ?? "—"}</p></div>
                  <div className="rounded-[18px] bg-[#f8f1e4] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-earth">Average</p><p className="mt-1 text-3xl font-semibold text-ink">{grades.selectedYear.overallAverage == null ? "—" : `${grades.selectedYear.overallAverage}%`}</p></div>
                  <div className="rounded-[18px] bg-[#f8f1e4] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-earth">Grades recorded</p><p className="mt-1 text-3xl font-semibold text-ink">{grades.selectedYear.gradedEntries}</p></div>
                </div>
              ) : null}
            </section>

            <section className="site-panel rounded-[28px] px-6 py-7 sm:px-8">
              <div className="flex items-center justify-between gap-4">
                <div><h2 className="text-[26px] font-semibold tracking-[-0.05em] text-ink">Subjects</h2><p className="mt-1 text-sm text-ink/60">Choose a subject to see its grade history.</p></div>
                {grades.selectedSubject ? <Link href={subjectHref()} className="text-sm font-semibold text-[#52753f] underline underline-offset-4">Show all</Link> : null}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {grades.subjects.length === 0 ? <p className="text-sm text-ink/60">Optional grades will appear after you grade a subject inside a planned day.</p> : grades.subjects.map((subject) => (
                  <Link key={subject.subjectKey} href={subjectHref(subject.subjectKey)} className={`rounded-[20px] border px-5 py-5 transition ${grades.selectedSubject?.subjectKey === subject.subjectKey ? "border-[#8eb173] bg-[#eef5e4] shadow-[0_4px_0_#c8dbb8]" : "border-[#dcc8aa] bg-[#fffaf2] hover:-translate-y-0.5"}`}>
                    <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold text-ink">{subject.subjectLabel}</h3><p className="mt-1 text-sm text-ink/58">{subject.gradedEntries} graded {subject.gradedEntries === 1 ? "entry" : "entries"}</p></div><div className="text-right"><p className="text-3xl font-semibold text-ink">{subject.grade ?? "—"}</p><p className="text-sm text-ink/58">{subject.averageScore == null ? "Not graded" : `${subject.averageScore}%`}</p></div></div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="site-panel rounded-[28px] px-6 py-7 sm:px-8">
              <h2 className="text-[26px] font-semibold tracking-[-0.05em] text-ink">{grades.selectedSubject ? `${grades.selectedSubject.subjectLabel} history` : "Grade history"}</h2>
              <div className="mt-5 overflow-hidden rounded-[20px] border border-[#e2d2b8]">
                {grades.entries.length === 0 ? <p className="bg-[#fffaf2] px-5 py-8 text-sm text-ink/60">No grade entries for this view yet.</p> : grades.entries.map((entry) => (
                  <div key={entry.entryId ?? `${entry.weeklyPlanId}-${entry.dayNumber ?? "legacy"}-${entry.subjectKey}`} className="flex flex-col gap-3 border-b border-[#eadfcd] bg-white px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                    <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{entry.isExtraCredit ? "Other work" : `Week ${entry.weekNumber}${entry.dayNumber ? ` · Day ${entry.dayNumber}` : ""}`}{grades.selectedSubject ? "" : ` · ${entry.subjectLabel}`}</p>{entry.assessmentRecommended ? <span className="rounded-full bg-[#f3e6c8] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#765632]">Assessment</span> : null}{entry.isExtraCredit ? <span className="rounded-full bg-[#f3e6c8] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#765632]">Extra credit</span> : null}</div><p className="mt-1 text-sm text-ink/58">{entry.planTitle ?? "Subject work"} · updated {formatDate(entry.updatedAt)}</p></div>
                    <div className="flex items-center gap-3"><span className="text-lg font-semibold text-ink">{entry.isExtraCredit ? `+${entry.extraCreditPoints ?? 0} pts` : entry.score == null ? "Not graded" : `${entry.score}%`}</span>{entry.grade ? <span className="rounded-full bg-[#e5efd9] px-3 py-1 text-sm font-semibold text-[#486a38]">{entry.grade}</span> : null}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </StudentShell>
    </ParentModeGuard>
  );
}
