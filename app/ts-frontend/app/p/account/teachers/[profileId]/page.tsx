import { redirect } from "next/navigation";
import { ActivitySquareGrid } from "../../../../../components/activity-square-grid";
import { getActiveProfileCookie } from "../../../../../lib/accounts/active-profile";
import {
  bootstrapParentAccount,
  getAccountTeacherActivity,
  listHouseholdProfiles
} from "../../../../../lib/accounts/server";
import { getCurrentUser } from "../../../../../lib/auth/server";
import { getRequestDictionary } from "../../../../../lib/i18n/server";
import { ParentModeGuard } from "../../../parent-mode-guard";
import { ParentShell } from "../../../parent-shell";
import { updateAccountRoleAction } from "../../actions";
import { AccountSubmitButton } from "../../account-submit-button";

type Props = {
  params: { profileId: string };
  searchParams?: { lang?: string; error?: string; message?: string };
};

function roleLabel(role: "OWNER" | "ADMIN" | "TEACHER") {
  if (role === "OWNER") return "Account owner";
  if (role === "ADMIN") return "Admin";
  return "Teacher";
}

function eventDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export default async function TeacherProfilePage({ params, searchParams }: Props) {
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { dashboard, home } = dictionary;
  const user = await getCurrentUser();
  if (!user?.id || !user.email) {
    redirect(`/p/signin?lang=${locale}&message=${encodeURIComponent(dashboard.unauthenticated)}`);
  }

  await bootstrapParentAccount({
    userId: user.id,
    email: user.email,
    firstName: user.user_metadata?.first_name ?? user.user_metadata?.name
  });
  const [householdProfiles, activity] = await Promise.all([
    listHouseholdProfiles(user.id),
    getAccountTeacherActivity({ userId: user.id, profileId: params.profileId })
  ]);
  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");
  const studentProfiles = householdProfiles.filter((profile) => profile.role === "STUDENT");
  const activeProfileCookie = getActiveProfileCookie();
  const activeProfile = householdProfiles.find((profile) => profile.id === activeProfileCookie?.id) ?? parentProfile;
  const basePath = `/p/account/teachers/${activity.teacher.profileId}`;

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={basePath}>
      <ParentShell
        brandName={home.brand.name}
        dashboard={dashboard}
        currentUserEmail={user.email}
        activeProfile={activeProfile}
        parentProfile={parentProfile}
        studentProfiles={studentProfiles}
        title={activity.teacher.name}
        activeNav="account"
        sidebarLinks={[{ href: "/p/account", label: "Back to account", tone: "outline" }]}
      >
        <div className="space-y-6">
          {searchParams?.message ? (
            <div className="rounded-[20px] border border-[#b8cf9f] bg-[#eef5e4] px-5 py-4 text-sm font-semibold text-[#4d6a39]">{searchParams.message}</div>
          ) : null}
          {searchParams?.error ? (
            <div role="alert" className="rounded-[20px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">{searchParams.error}</div>
          ) : null}

          <section className="site-panel rounded-[28px] px-6 py-7 sm:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-center gap-5">
                <div className="flex h-20 w-20 flex-none items-center justify-center rounded-full bg-[#dceacd] text-3xl font-semibold text-[#4d6a39]">
                  {activity.teacher.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">Teacher profile</p>
                  <h2 className="mt-1 text-[34px] font-semibold tracking-[-0.055em] text-ink">{activity.teacher.name}</h2>
                  <p className="mt-1 break-all text-sm text-ink/58">{activity.teacher.email}</p>
                  <span className="mt-3 inline-flex rounded-full bg-[#f5eddf] px-3 py-1.5 text-xs font-bold text-earth">{roleLabel(activity.teacher.role)}</span>
                </div>
              </div>

              {activity.canManageRole ? (
                <form action={updateAccountRoleAction} className="w-full rounded-[20px] border border-[#e2d2b8] bg-[#fffaf2] p-4 lg:max-w-sm">
                  <input type="hidden" name="lang" value={searchParams?.lang ?? ""} />
                  <input type="hidden" name="profileId" value={activity.teacher.profileId} />
                  <input type="hidden" name="returnPath" value={basePath} />
                  <label className="text-sm font-semibold text-ink">
                    Account role
                    <select name="role" defaultValue={activity.teacher.role} className="mt-2 min-h-12 w-full rounded-[14px] border border-[#dcc8aa] bg-white px-3 pr-10 text-sm text-ink">
                      <option value="TEACHER">Teacher</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </label>
                  <p className="mt-2 text-xs leading-5 text-ink/55">Teachers can teach, grade, and record progress. Admins can also manage account settings and teachers.</p>
                  <div className="mt-3"><AccountSubmitButton idleLabel="Save role" pendingLabel="Saving…" /></div>
                </form>
              ) : null}
            </div>
          </section>

          <section className="site-panel rounded-[28px] px-6 py-7 sm:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">Activity</p>
              <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-ink">Grading activity</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/62">A record of grades saved or removed by {activity.teacher.name} during the last year.</p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <div className="rounded-[18px] bg-[#f8f1e4] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-earth">Actions</p><p className="mt-1 text-3xl font-semibold text-ink">{activity.summary.gradingActions}</p></div>
              <div className="rounded-[18px] bg-[#f8f1e4] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-earth">Grades saved</p><p className="mt-1 text-3xl font-semibold text-ink">{activity.summary.gradesSaved}</p></div>
              <div className="rounded-[18px] bg-[#f8f1e4] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-earth">Grades removed</p><p className="mt-1 text-3xl font-semibold text-ink">{activity.summary.gradesRemoved}</p></div>
              <div className="rounded-[18px] bg-[#f8f1e4] px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-earth">Active days</p><p className="mt-1 text-3xl font-semibold text-ink">{activity.summary.activeDays}</p></div>
            </div>
            <div className="mt-6 rounded-[20px] border border-[#e4d5bd] bg-white px-4 py-5">
              <ActivitySquareGrid
                days={activity.days}
                dateFrom={activity.dateFrom}
                dateTo={activity.dateTo}
                noun="grading action"
                explanation="Lighter squares show quieter grading days; darker squares show more grading activity."
              />
            </div>
          </section>

          <section className="site-panel rounded-[28px] px-6 py-7 sm:px-8">
            <h2 className="text-[26px] font-semibold tracking-[-0.045em] text-ink">Recent activity</h2>
            <div className="mt-5 space-y-3">
              {activity.events.length === 0 ? (
                <p className="rounded-[18px] bg-[#fffaf2] px-5 py-7 text-sm text-ink/60">No grading activity has been recorded for this teacher yet.</p>
              ) : activity.events.map((event) => {
                const context = [
                  event.studentName,
                  event.weekNumber == null ? null : `Week ${event.weekNumber}`,
                  event.dayNumber == null ? null : `Day ${event.dayNumber}`
                ].filter(Boolean).join(" · ");
                return (
                  <article key={event.id} className="rounded-[18px] border border-[#e2d2b8] bg-white px-5 py-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div>
                        <p className="font-semibold text-ink">
                          {event.eventType === "grade_removed"
                            ? `Removed the grade for ${event.subjectLabel ?? "a lesson"}`
                            : `Saved ${event.score}% for ${event.subjectLabel ?? "a lesson"}`}
                        </p>
                        {context ? <p className="mt-1 text-sm text-ink/58">{context}</p> : null}
                      </div>
                      <time dateTime={event.occurredAt} className="flex-none text-xs font-semibold text-ink/45">{eventDate(event.occurredAt)}</time>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </ParentShell>
    </ParentModeGuard>
  );
}
