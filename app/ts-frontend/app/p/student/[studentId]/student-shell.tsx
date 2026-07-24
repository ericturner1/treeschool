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
        settings: string;
      };
    };
    actions: {
      logout: string;
    };
  };
  student: StudentShellProfile;
  title: string;
  studentRouteSegment: string;
  activeNav: "overview" | "curriculum" | "attendance" | "reports" | "grades" | "settings";
  studentIdentityInContent?: boolean;
  studentProfileSummary?: React.ReactNode;
  children: React.ReactNode;
};

const navItems = [
  { key: "overview", segment: "", labelKey: "overview" },
  { key: "curriculum", segment: "lesson-plan", labelKey: "curriculum" },
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
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-10 sm:px-6 lg:px-8">
      <div className={`mx-auto grid max-w-[1400px] gap-6 ${
        studentIdentityInContent
          ? "lg:grid-cols-[240px_minmax(0,1fr)]"
          : "lg:grid-cols-[280px_minmax(0,1fr)]"
      } lg:items-start`}>
        <aside className="rounded-[24px] border border-[#dec9a9] bg-[#fffaf2] px-4 py-4 lg:sticky lg:top-4 lg:flex lg:min-h-[calc(100vh-5rem)] lg:flex-col">
          <Link
            href="/"
            className="flex w-full flex-col items-center justify-center text-center text-[28px] font-semibold tracking-[-0.05em] text-ink"
          >
            <img src="/tree-icon.png" alt="treeschool tree icon" className="h-24 w-24 object-contain" />
            <span className="brand-logo">{brandName}</span>
          </Link>

          {!studentIdentityInContent ? (
            <div className="mt-6 rounded-[20px] bg-[#f8f1e4] px-4 py-4 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-ink/58">
                {dashboard.studentManagement.title}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-ink">{student.firstName}</p>
              <p className="mt-2 text-sm text-ink/68">{gradeLabel}</p>
            </div>
          ) : null}

          <div className={studentIdentityInContent ? "mt-6" : "mt-4"}>
            <Link
              href="/p/dashboard"
              className="cta-button cta-button--outline cta-button--small w-full"
            >
              {dashboard.studentManagement.back}
            </Link>
          </div>

          <nav className="mt-4 space-y-2">
            {navItems.map((item) => {
              const href = item.segment
                ? `/p/student/${studentRouteSegment}/${item.segment}`
                : `/p/student/${studentRouteSegment}`;
              const isActive = activeNav === item.key;

              return (
                <Link
                  key={item.key}
                  href={href as Route}
                  className={`block rounded-[16px] px-4 py-3 text-sm font-semibold transition-colors ${
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

          <div className="mt-auto pt-6">
            <form action={logoutAction}>
              <button type="submit" className="cta-button cta-button--dark cta-button--small w-full">
                {dashboard.actions.logout}
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0">
          {studentIdentityInContent ? (
            <header className={`relative rounded-[28px] px-5 py-2 sm:px-6 sm:py-2 ${activeNav === "curriculum" ? "mb-2" : "mb-6 border border-[#dec9a9] bg-[#fffaf2] shadow-[0_7px_0_#ead8bd]"}`}>
              <div className={`${studentProfileSummary
                ? "grid gap-5 lg:grid-cols-[minmax(250px,0.6fr)_minmax(480px,1.4fr)] lg:items-center lg:gap-5"
                : "flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
              }`}>
                <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                  {activeNav === "overview" ? (
                    <StudentProfilePhotoTrigger profileId={student.id} studentName={student.firstName}>
                      {studentPhoto}
                    </StudentProfilePhotoTrigger>
                  ) : activeNav === "curriculum" ? null : studentPhoto}
                  <div className="min-w-0">
                    <p className="break-words text-[36px] font-semibold leading-none tracking-[-0.06em] text-ink sm:text-[44px]">
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
                  <div className="rounded-[20px] px-4 py-3.5 sm:px-5">
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
            <div className="pb-3">
              <p className="text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">{title}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    </main>
  );
}
