import { redirect } from "next/navigation";
import { ParentModeGuard } from "../../../parent-mode-guard";
import { getStudentStreakSettings } from "../../../../../lib/accounts/server";
import {
  updateGradingSchemeAction,
  updateStreakSettingsAction
} from "../../../../dashboard/students/[profileId]/actions";
import { StreakSettingsForm } from "../../../../dashboard/students/[profileId]/streak-settings-form";
import { getParentStudentPageData, studentRoutePath } from "../student-page-data";
import { StudentShell } from "../student-shell";

type ParentStudentSettingsPageProps = {
  params: {
    studentId?: string;
  };
  searchParams?: {
    lang?: string;
    error?: string;
    message?: string;
  };
};

export default async function ParentStudentSettingsPage({
  params,
  searchParams
}: ParentStudentSettingsPageProps) {
  const { dashboard, home, currentUser, student, studentRouteSegment } = await getParentStudentPageData(
    params.studentId,
    searchParams?.lang
  );
  if (params.studentId !== studentRouteSegment) {
    redirect(studentRoutePath(studentRouteSegment, "/settings", searchParams));
  }
  const streakSettings = await getStudentStreakSettings({
    parentUserId: currentUser.id,
    profileId: student.id
  });

  const basePath = studentRoutePath(studentRouteSegment, "/settings");
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
        title={dashboard.studentManagement.nav.settings}
        activeNav="settings"
      >
        <section className="site-panel rounded-[28px] px-6 py-7">
          <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">
            {dashboard.studentManagement.gradingSchemeTitle}
          </h2>
          <p className="mt-4 text-base leading-[1.75] text-ink/75">
            {dashboard.studentManagement.gradingSchemeCopy}
          </p>
          <form action={updateGradingSchemeAction} className="mt-6 space-y-4">
            <input type="hidden" name="profileId" value={student.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              {(["us", "jp"] as const).map((schemeId) => {
                const isSelected = student.gradingScheme === schemeId;

                return (
                  <label
                    key={schemeId}
                    className={`block cursor-pointer rounded-[18px] border px-4 py-4 transition ${
                      isSelected
                        ? "border-[#8eb35f] bg-[#eef6e4]"
                        : "border-[#dcc8aa] bg-[#fffaf2]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="gradingScheme"
                      value={schemeId}
                      defaultChecked={isSelected}
                      className="sr-only"
                    />
                    <p className="text-base font-semibold text-ink">
                      {schemeId === "us"
                        ? dashboard.studentManagement.gradingSchemes.us.title
                        : dashboard.studentManagement.gradingSchemes.jp.title}
                    </p>
                    <p className="mt-1 text-sm leading-[1.6] text-ink/70">
                      {schemeId === "us"
                        ? dashboard.studentManagement.gradingSchemes.us.copy
                        : dashboard.studentManagement.gradingSchemes.jp.copy}
                    </p>
                  </label>
                );
              })}
            </div>
            <button type="submit" className="cta-button cta-button--light cta-button--small">
              {dashboard.studentManagement.gradingSchemeSave}
            </button>
          </form>
        </section>

        <section className="site-panel mt-6 rounded-[28px] px-6 py-7">
          <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">
            {dashboard.studentManagement.streakTitle}
          </h2>
          <p className="mt-4 text-base leading-[1.75] text-ink/75">
            {dashboard.studentManagement.streakCopy}
          </p>
          <div className="mt-4 rounded-[18px] bg-[#fffaf2] px-4 py-4 text-sm text-ink/72">
            {dashboard.studentManagement.currentStreakPrefix}: {" "}
            <span className="font-semibold text-ink">
              {streakSettings.currentCount}{" "}
              {streakSettings.mode === "daily"
                ? dashboard.studentManagement.daysLabel
                : dashboard.studentManagement.weeksLabel}
            </span>
            {" • "}
            {streakSettings.currentPeriodPaused
              ? `${streakSettings.currentPeriodLabel} ${dashboard.studentManagement.currentPeriodPausedSuffix}`
              : streakSettings.currentPeriodCompleted
                ? `${streakSettings.currentPeriodLabel} ${dashboard.studentManagement.currentPeriodCompleteSuffix}`
                : `${streakSettings.currentPeriodLabel} ${dashboard.studentManagement.currentPeriodOpenSuffix}`}
          </div>
          <StreakSettingsForm
            action={updateStreakSettingsAction}
            profileId={student.id}
            initialMode={streakSettings.mode}
            initialPausedWeekdays={streakSettings.pausedWeekdays}
            initialPausedWeeks={streakSettings.pausedWeeks}
            initialTimeZone={streakSettings.timeZone}
          />
        </section>
      </StudentShell>
    </ParentModeGuard>
  );
}
