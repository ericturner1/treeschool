import { redirect } from "next/navigation";
import { ParentModeGuard } from "../../../parent-mode-guard";
import { getParentStudentPageData, studentRoutePath } from "../student-page-data";
import { StudentShell } from "../student-shell";

type ParentStudentReportsPageProps = {
  params: {
    studentId?: string;
  };
  searchParams?: {
    lang?: string;
    error?: string;
    message?: string;
  };
};

export default async function ParentStudentReportsPage({
  params,
  searchParams
}: ParentStudentReportsPageProps) {
  const { dashboard, home, student, studentRouteSegment } = await getParentStudentPageData(params.studentId, searchParams?.lang);
  if (params.studentId !== studentRouteSegment) {
    redirect(studentRoutePath(studentRouteSegment, "/reports", searchParams));
  }
  const basePath = studentRoutePath(studentRouteSegment, "/reports");
  const query = new URLSearchParams();
  if (searchParams?.lang) query.set("lang", searchParams.lang);
  if (searchParams?.message) query.set("message", searchParams.message);
  if (searchParams?.error) query.set("error", searchParams.error);
  const redirectTo = query.size > 0 ? `${basePath}?${query.toString()}` : basePath;

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <StudentShell
        brandName={home.brand.name}
        dashboard={dashboard}
        student={student}
        studentRouteSegment={studentRouteSegment}
        title={dashboard.studentManagement.nav.reports}
        activeNav="reports"
      >
        <section className="site-panel rounded-[28px] px-6 py-7">
          <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">
            {dashboard.studentManagement.placeholders.reportsTitle}
          </h2>
          <p className="mt-4 text-base leading-[1.75] text-ink/75">
            {dashboard.studentManagement.placeholders.reportsCopy}
          </p>
        </section>
      </StudentShell>
    </ParentModeGuard>
  );
}
