import Link from "next/link";
import type { Route } from "next";
import { logoutAction } from "../../../auth/actions";
// The overview photo opens the student's existing profile editor.
import { StudentProfilePhotoTrigger } from "./student-profile-photo-trigger";

type StudentShellProfile = {
  id: string;
  firstName: string;
  birthDate?: string | null;
  gradeLevel: number | null;
  avatarUrl?: string | null;
};

type StudentShellProps = {
  brandName: string;
  dashboard: {
    studentManagement: {
      title: string;
      back: string;
      gradeUnknown: string;
      labels: {
        grade: string;
      };
      nav: {
        overview: string;
        curriculum: string;
        attendance: string;
        reports: string;
        grades: string;
        points: string;
        settings: string;
      };
    };
    actions: {
      teachers: string;
      logout: string;
    };
  };
  student: StudentShellProfile;
  title: string;
  studentRouteSegment: string;
  activeNav: "overview" | "curriculum" | "attendance" | "reports" | "grades" | "points" | "settings";
  studentIdentityInContent?: boolean;
  studentProfileSummary?: React.ReactNode;
  children: React.ReactNode;
};

const navItems = [
  { key: "overview", segment: "", labelKey: "overview" },
  { key: "curriculum", segment: "lesson-plan", labelKey: "curriculum" },
  { key: "points", segment: "points", labelKey: "points" },
  { key: "grades", segment: "grades", labelKey: "grades" },
  { key: "attendance", segment: "attendance", labelKey: "attendance" }
] as const;

function ageFromBirthDate(value: string | null | undefined) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export function StudentShell({
  brandName,
  dashboard,
  student,
  title,
  studentRouteSegment,
  activeNav,
  studentIdentityInContent = false,
  studentProfileSummary,
  children
}: StudentShellProps) {
  const gradeLabel = student.gradeLevel != null
    ? student.gradeLevel === 0
      ? `${dashboard.studentManagement.labels.grade} K`
      : `${dashboard.studentManagement.labels.grade} ${student.gradeLevel}`
    : dashboard.studentManagement.gradeUnknown;
  const studentAge = ageFromBirthDate(student.birthDate);
  const studentPhoto = (
    <div
      role="img"
      aria-label={student.avatarUrl ? `${student.firstName}'s private profile photo` : `${student.firstName}'s profile photo placeholder`}
      className="grid h-20 w-20 place-items-center overflow-hidden rounded-[22px] border border-[#bfd2aa] bg-[#eef5e4] bg-cover bg-center sm:h-24 sm:w-24"
      style={student.avatarUrl ? { backgroundImage: `url(${JSON.stringify(student.avatarUrl)})` } : undefined}
    >
      {student.avatarUrl ? null : (
        <span className="text-4xl font-semibold tracking-[-0.06em] text-[#587443]" aria-hidden="true">
          {student.firstName.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-10">
      <div className={`mx-auto grid max-w-[1400px] gap-4 lg:gap-6 ${
        studentIdentityInContent
          ? "lg:grid-cols-[240px_minmax(0,1fr)]"
          : "lg:grid-cols-[280px_minmax(0,1fr)]"
      } lg:items-start`}>
        <aside className="min-w-0 rounded-[22px] border border-[#dec9a9] bg-[#fffaf2] px-3 py-3 sm:px-4 lg:sticky lg:top-4 lg:flex lg:min-h-[calc(100vh-5rem)] lg:flex-col lg:py-4">
          <Link
            href="/"
            className="flex min-w-0 items-center text-left text-[20px] font-semibold tracking-[-0.05em] text-ink lg:w-full lg:flex-col lg:justify-center lg:text-center lg:text-[28px]"
          >
            <img src="/tree-icon.png" alt="treeschool tree icon" className="h-11 w-11 flex-none object-contain lg:h-24 lg:w-24" />
            <span className="brand-logo">{brandName}</span>
          </Link>

          {!studentIdentityInContent ? (
            <div className="mt-2 flex min-w-0 items-center justify-between gap-3 rounded-[14px] bg-[#f8f1e4] px-3 py-2 text-left lg:mt-6 lg:block lg:rounded-[20px] lg:px-4 lg:py-4 lg:text-center">
              <p className="hidden text-sm font-semibold uppercase tracking-[0.12em] text-ink/58 lg:block">
                {dashboard.studentManagement.title}
              </p>
              <p className="min-w-0 truncate text-lg font-semibold tracking-[-0.04em] text-ink lg:mt-2 lg:text-2xl lg:tracking-[-0.05em]">{student.firstName}</p>
              <p className="shrink-0 text-xs font-semibold text-ink/58 lg:mt-2 lg:text-sm lg:font-normal lg:text-ink/68">{gradeLabel}</p>
            </div>
          ) : null}

          <div className={studentIdentityInContent ? "mt-2 lg:mt-6" : "mt-2 lg:mt-4"}>
            <Link
              href="/p/dashboard"
              className="cta-button cta-button--outline cta-button--small w-full lg:w-full"
            >
              {dashboard.studentManagement.back}
            </Link>
          </div>

          <nav className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-2 lg:mt-4 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
            {navItems.map((item) => {
              const href = item.segment
                ? `/p/student/${studentRouteSegment}/${item.segment}`
                : `/p/student/${studentRouteSegment}`;
              const isActive = activeNav === item.key;

              return (
                <Link
                  key={item.key}
                  href={href as Route}
                  className={`block shrink-0 whitespace-nowrap rounded-[14px] px-3.5 py-2.5 text-sm font-semibold transition-colors lg:w-full lg:rounded-[16px] lg:px-4 lg:py-3 ${
                    isActive
                      ? "bg-[#eef5e4] text-[#4d6a39]"
                      : "border border-[#dcc8aa] bg-white text-ink hover:border-[#c8af8b] hover:bg-[#f8f1e4]"
                  }`}
                >
                  {item.key === "overview"
                    ? `${student.firstName}’s Overview`
                    : dashboard.studentManagement.nav[item.labelKey]}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-wrap gap-2 border-t border-[#eadbc2] pt-3 lg:mt-auto lg:block lg:space-y-3 lg:border-0 lg:pt-6">
            <Link
              href={"/p/account#teachers" as Route}
              className="cta-button cta-button--outline cta-button--small min-w-0 flex-1 lg:w-full"
            >
              {dashboard.actions.teachers}
            </Link>
            <form action={logoutAction} className="min-w-0 flex-1 lg:w-full">
              <button type="submit" className="cta-button cta-button--dark cta-button--small w-full">
                {dashboard.actions.logout}
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0">
          {studentIdentityInContent ? (
            <header className={`relative rounded-[22px] px-3 py-2 sm:rounded-[28px] sm:px-6 ${activeNav === "curriculum" ? "mb-2" : "mb-4 border border-[#dec9a9] bg-[#fffaf2] shadow-[0_5px_0_#ead8bd] sm:mb-6 sm:shadow-[0_7px_0_#ead8bd]"}`}>
              <div className={`${studentProfileSummary
                ? "grid gap-5 lg:grid-cols-[minmax(250px,0.6fr)_minmax(480px,1.4fr)] lg:items-center lg:gap-5"
                : "flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
              }`}>
                <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                  {activeNav === "overview" ? (
                    <StudentProfilePhotoTrigger profileId={student.id} studentName={student.firstName}>
                      {studentPhoto}
                    </StudentProfilePhotoTrigger>
                  ) : activeNav === "curriculum" ? null : studentPhoto}
                  <div className="min-w-0">
                    <p className="break-words text-[29px] font-semibold leading-[1.02] tracking-[-0.055em] text-ink sm:text-[44px] sm:leading-none sm:tracking-[-0.06em]">
                      {activeNav === "curriculum" ? `${student.firstName}'s Lesson Plan` : student.firstName}
                    </p>
                    {activeNav === "curriculum" ? null : (
                      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 text-sm font-semibold text-ink/55">
                        <span>{gradeLabel}</span>
                        {studentAge != null ? (
                          <>
                            <span aria-hidden="true" className="text-ink/25">•</span>
                            <span>Age {studentAge}</span>
                          </>
                        ) : null}
                      </p>
                    )}
                  </div>
                </div>
                {studentProfileSummary ? (
                  <div className="min-w-0 rounded-[18px] px-2 py-2.5 sm:rounded-[20px] sm:px-5 sm:py-3.5">
                    {studentProfileSummary}
                  </div>
                ) : activeNav === "overview" || activeNav === "curriculum" ? null : (
                  <div className="border-t border-[#eadbc2] pt-4 sm:border-l sm:border-t-0 sm:py-2 sm:pl-7 sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">Current section</p>
                    <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.055em] text-ink sm:text-[36px]">{title}</h1>
                  </div>
                )}
              </div>
            </header>
          ) : (
            <div className="pb-2 lg:pb-3">
              <p className="break-words text-[32px] font-semibold leading-tight tracking-[-0.05em] text-ink sm:text-5xl">{title}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    </main>
  );
}
