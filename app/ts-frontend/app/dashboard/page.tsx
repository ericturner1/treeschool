import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfileCookie } from "../../lib/accounts/active-profile";
import {
  bootstrapParentAccount,
  getStudentStreakSettings,
  listHouseholdProfiles
} from "../../lib/accounts/server";
import { getCurrentUser } from "../../lib/auth/server";
import { getRequestDictionary } from "../../lib/i18n/server";
import { getStudentPoints, type StudentPointsPayload } from "../../lib/points/server";
import { returnToParentAction } from "./actions";
import { QuickAddPoints } from "./quick-add-points";
import { ParentShell } from "../p/parent-shell";

type DashboardPageProps = {
  searchParams?: {
    lang?: string;
    error?: string;
    message?: string;
  };
};

function frequentAwardReasons(points: StudentPointsPayload) {
  const counts = new Map<string, number>();
  for (const transaction of points.transactions) {
    if (transaction.kind !== "award" || transaction.reversed || transaction.amount <= 0) continue;
    counts.set(transaction.reason, (counts.get(transaction.reason) ?? 0) + 1);
  }
  return Array.from(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([reason]) => reason);
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { dashboard, home } = dictionary;
  const user = await getCurrentUser();

  if (!user?.email || !user.id) {
    redirect(`/signin?lang=${locale}&message=${encodeURIComponent(dashboard.unauthenticated)}`);
  }
  const userId = user.id;

  const parentFirstName =
    user.user_metadata?.first_name ??
    user.user_metadata?.name ??
    user.user_metadata?.full_name?.split(" ")[0];

  await bootstrapParentAccount({
    userId,
    email: user.email,
    firstName: parentFirstName
  });

  const householdProfiles = await listHouseholdProfiles(userId);
  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");
  const studentProfiles = householdProfiles.filter((profile) => profile.role === "STUDENT");
  const studentStatus = new Map(
    await Promise.all(studentProfiles.map(async (profile) => {
      const [streak, points] = await Promise.all([
        getStudentStreakSettings({
          parentUserId: userId,
          profileId: profile.id
        }),
        getStudentPoints({
          parentUserId: userId,
          profileId: profile.id,
          historyLimit: 100
        }).catch(() => null)
      ]);
      return [profile.id, { streak, points }] as const;
    }))
  );
  const activeProfileCookie = getActiveProfileCookie();
  const activeProfile =
    householdProfiles.find((profile) => profile.id === activeProfileCookie?.id) ?? parentProfile;
  const isParentView = activeProfile?.role !== "STUDENT";

  return (
    <ParentShell
      brandName={home.brand.name}
      dashboard={dashboard}
      currentUserEmail={user.email}
      activeProfile={activeProfile}
      parentProfile={parentProfile}
      studentProfiles={studentProfiles}
      title={dashboard.title}
      activeNav={null}
    >
      <section className={`mt-4 grid gap-6 ${isParentView ? "" : "lg:grid-cols-[1fr_3fr]"}`}>
            <div className="site-panel min-w-0 overflow-hidden rounded-[24px] px-4 py-5 sm:rounded-[28px] sm:px-6 sm:py-7">
              <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">
                {dashboard.profileManagement.title}
              </h2>
              <p className="mt-4 text-base leading-[1.75] text-ink/75">
                {dashboard.profileManagement.subtitle}
              </p>

              <div className="mt-6">
                {studentProfiles.length === 0 ? (
                  <p className="text-sm text-ink/65">{dashboard.profileManagement.empty}</p>
                ) : (
                  <>
                    <div className="grid gap-3 md:hidden">
                      {studentProfiles.map((profile) => {
                        const grade = profile.gradeLevel != null
                          ? profile.gradeLevel === 0
                            ? `${dashboard.profileManagement.columns.grade} K`
                            : `${dashboard.profileManagement.columns.grade} ${profile.gradeLevel}`
                          : dashboard.profileManagement.noGrade;
                        const status = studentStatus.get(profile.id);
                        const streakCount = status?.streak.currentCount ?? 0;
                        const points = status?.points ?? null;

                        return (
                          <article key={profile.id} className="rounded-[20px] border border-[#dcc8aa] bg-white p-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                role="img"
                                aria-label={profile.avatarUrl ? `${profile.firstName}'s private profile photo` : `${profile.firstName}'s profile photo placeholder`}
                                className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-full border-2 border-[#c9d9b7] bg-[#e7efdc] bg-cover bg-center text-lg font-semibold text-[#4f703c]"
                                style={profile.avatarUrl ? { backgroundImage: `url(${JSON.stringify(profile.avatarUrl)})` } : undefined}
                              >
                                {!profile.avatarUrl ? profile.firstName.trim().slice(0, 1).toUpperCase() : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-xl font-semibold tracking-[-0.04em] text-ink">{profile.firstName}</h3>
                                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/58">
                                  <span>{grade}</span>
                                  <span className="rounded-full bg-[#e7efdc] px-2.5 py-1 text-[#4f703c]">
                                    {streakCount} {streakCount === 1 ? "day" : "days"} streak
                                  </span>
                                </p>
                              </div>
                            </div>
                            {isParentView && points?.canTransact ? (
                              <div className="mt-4 border-t border-[#eadfcd] pt-4">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/52">
                                  Points
                                </p>
                                <QuickAddPoints
                                  profileId={profile.id}
                                  studentName={profile.firstName}
                                  initialBalance={points.summary.balance}
                                  singularName={points.settings.singularName}
                                  pluralName={points.settings.pluralName}
                                  frequentReasons={frequentAwardReasons(points)}
                                />
                              </div>
                            ) : null}
                            <Link
                              href={`/p/student/${profile.slug ?? profile.id}`}
                              data-pending-size="compact"
                              className="cta-button cta-button--outline cta-button--small mt-4 w-full"
                            >
                              {dashboard.profileManagement.manageLabel}
                            </Link>
                          </article>
                        );
                      })}
                    </div>

                    <div className="hidden max-w-full overflow-x-auto rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] md:block">
                      <div className="grid min-w-[820px] grid-cols-[minmax(170px,1.5fr)_110px_105px_minmax(190px,1fr)_120px] gap-4 border-b border-[#e4d5bd] bg-[#f6ecdc] px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-ink/62">
                        <span>{dashboard.profileManagement.columns.name}</span>
                        <span>{dashboard.profileManagement.columns.grade}</span>
                        <span>Streak</span>
                        <span>Points</span>
                        <span className="text-right">{dashboard.profileManagement.columns.actions}</span>
                      </div>

                      {studentProfiles.map((profile, index) => {
                        const status = studentStatus.get(profile.id);
                        const streakCount = status?.streak.currentCount ?? 0;
                        const points = status?.points ?? null;

                        return (
                          <div
                            key={profile.id}
                            className={`grid min-w-[820px] grid-cols-[minmax(170px,1.5fr)_110px_105px_minmax(190px,1fr)_120px] gap-4 px-5 py-4 ${
                              index === studentProfiles.length - 1 ? "" : "border-b border-[#eadfcd]"
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                role="img"
                                aria-label={profile.avatarUrl ? `${profile.firstName}'s private profile photo` : `${profile.firstName}'s profile photo placeholder`}
                                className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full border-2 border-[#c9d9b7] bg-[#e7efdc] bg-cover bg-center text-lg font-semibold text-[#4f703c]"
                                style={profile.avatarUrl ? { backgroundImage: `url(${JSON.stringify(profile.avatarUrl)})` } : undefined}
                              >
                                {!profile.avatarUrl ? profile.firstName.trim().slice(0, 1).toUpperCase() : null}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-lg font-semibold tracking-[-0.04em] text-ink">
                                  {profile.firstName}
                                </p>
                                <p className="mt-1 text-sm text-ink/62">{dashboard.studentRole}</p>
                              </div>
                            </div>

                            <div className="flex items-center text-sm font-semibold text-ink/78">
                              {profile.gradeLevel != null
                                ? profile.gradeLevel === 0
                                  ? `${dashboard.profileManagement.columns.grade} K`
                                  : `${dashboard.profileManagement.columns.grade} ${profile.gradeLevel}`
                                : dashboard.profileManagement.noGrade}
                            </div>

                            <div className="flex items-center">
                              <span className="rounded-full bg-[#e7efdc] px-3 py-1.5 text-sm font-semibold text-[#4f703c]">
                                {streakCount} {streakCount === 1 ? "day" : "days"}
                              </span>
                            </div>

                            <div className="flex items-center">
                              {isParentView && points?.canTransact ? (
                                <QuickAddPoints
                                  profileId={profile.id}
                                  studentName={profile.firstName}
                                  initialBalance={points.summary.balance}
                                  singularName={points.settings.singularName}
                                  pluralName={points.settings.pluralName}
                                  frequentReasons={frequentAwardReasons(points)}
                                />
                              ) : (
                                <span className="text-sm text-ink/42">—</span>
                              )}
                            </div>

                            <div className="flex items-center justify-end">
                              <Link
                                href={`/p/student/${profile.slug ?? profile.id}`}
                                data-pending-size="compact"
                                className="cta-button cta-button--outline cta-button--small"
                              >
                                {dashboard.profileManagement.manageLabel}
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {!isParentView ? (
              <div className="site-panel rounded-[28px] px-6 py-7">
                <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">
                  Return to parent
                </h2>
                <p className="mt-4 text-base leading-[1.75] text-ink/75">
                  Re-enter the parent password to return to the admin view.
                </p>
                <form action={returnToParentAction} className="mt-6 space-y-5">
                  <div>
                    <label htmlFor="password" className="text-sm font-semibold text-ink">
                      Parent password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base text-ink outline-none transition-colors focus:border-[#8f6544]"
                    />
                  </div>
                  <button type="submit" className="cta-button cta-button--dark w-full">
                    Return to parent
                  </button>
                </form>
              </div>
            ) : null}
      </section>
    </ParentShell>
  );
}
