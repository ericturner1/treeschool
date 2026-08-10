import { redirect } from "next/navigation";
import Link from "next/link";
import { ActivitySquareGrid } from "../../../components/activity-square-grid";
import { getActiveProfileCookie } from "../../../lib/accounts/active-profile";
import {
  bootstrapParentAccount,
  listAccountPeople,
  listHouseholdProfiles
} from "../../../lib/accounts/server";
import { getCurrentUser } from "../../../lib/auth/server";
import { getRequestDictionary } from "../../../lib/i18n/server";
import { ParentModeGuard } from "../parent-mode-guard";
import { ParentShell } from "../parent-shell";
import {
  requestEmailChangeAction,
  updateAccountNameAction
} from "./actions";
import { AccountSubmitButton } from "./account-submit-button";
import { EmailChangeSubmitButton } from "./email-change-submit-button";
import { InviteTeacherForm } from "./invite-teacher-form";

type ParentAccountPageProps = {
  searchParams?: Promise<{
    lang?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function ParentAccountPage(props: ParentAccountPageProps) {
  const searchParams = await props.searchParams;
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { dashboard, home } = dictionary;
  const user = await getCurrentUser();

  if (!user?.email || !user.id) {
    redirect(`/p/signin?lang=${locale}&message=${encodeURIComponent(dashboard.unauthenticated)}`);
  }

  const parentFirstName =
    user.user_metadata?.first_name ??
    user.user_metadata?.name ??
    user.user_metadata?.full_name?.split(" ")[0];

  await bootstrapParentAccount({
    userId: user.id,
    email: user.email,
    firstName: parentFirstName
  });

  const householdProfiles = await listHouseholdProfiles(user.id);
  const people = await listAccountPeople(user.id);
  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");
  const studentProfiles = householdProfiles.filter((profile) => profile.role === "STUDENT");
  const activeProfileCookie = getActiveProfileCookie();
  const activeProfile =
    householdProfiles.find((profile) => profile.id === activeProfileCookie?.id) ?? parentProfile;
  const currentMember = people.members.find((member) => member.userId === user.id);

  const query = new URLSearchParams();
  if (searchParams?.lang) query.set("lang", searchParams.lang);
  if (searchParams?.message) query.set("message", searchParams.message);
  if (searchParams?.error) query.set("error", searchParams.error);
  const basePath = "/p/account";
  const redirectTo = query.size > 0 ? `${basePath}?${query.toString()}` : basePath;

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <ParentShell
        brandName={home.brand.name}
        dashboard={dashboard}
        currentUserEmail={user.email}
        activeProfile={activeProfile}
        parentProfile={parentProfile}
        studentProfiles={studentProfiles}
        title={dashboard.account.title}
        activeNav="account"
        sidebarLinks={[
          {
            href: "/p/dashboard",
            label: dashboard.actions.dashboard,
            tone: "outline"
          }
        ]}
      >
        <div className="space-y-5">
          {searchParams?.error ? (
            <div role="alert" className="rounded-[20px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">
              {searchParams.error}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <section className="site-panel rounded-[28px] px-6 py-7">
              <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">Account identity</p>
              <div className="mt-5 flex items-center gap-4">
                <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-[#dceacd] text-2xl font-semibold text-[#4d6a39]">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink/50">Current sign-in email</p>
                  <p className="mt-1 break-all text-lg font-semibold text-ink">{user.email}</p>
                </div>
              </div>
              <form action={updateAccountNameAction} className="mt-6">
                <input type="hidden" name="lang" value={searchParams?.lang ?? ""} />
                <label className="text-sm font-semibold text-ink">
                  Your name
                  <input
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    maxLength={100}
                    defaultValue={currentMember?.name ?? parentProfile?.firstName ?? ""}
                    className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
                  />
                </label>
                <div className="mt-4">
                  <AccountSubmitButton idleLabel="Save name" pendingLabel="Saving…" />
                </div>
              </form>
              {user.new_email ? (
                <div className="mt-6 rounded-[18px] border border-[#dcc8aa] bg-[#fffaf2] px-4 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.11em] text-earth">Pending change</p>
                  <p className="mt-2 break-all font-semibold text-ink">{user.new_email}</p>
                  <p className="mt-2 text-sm leading-6 text-ink/62">
                    Confirm the messages in both inboxes to finish the change.
                  </p>
                </div>
              ) : (
                <p className="mt-6 text-sm leading-6 text-ink/60">
                  Treeschool uses this address for passwordless sign-in and important account messages.
                </p>
              )}
            </section>

            <section className="site-panel rounded-[28px] px-6 py-7">
              <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">Change email address</h2>
              <p className="mt-3 text-base leading-7 text-ink/68">
                Enter the address you want to use for future Treeschool sign-ins.
              </p>
              <form action={requestEmailChangeAction} className="mt-6">
                <input type="hidden" name="lang" value={searchParams?.lang ?? ""} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-ink">
                    New email
                    <input
                      name="newEmail"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="new@example.com"
                      className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
                    />
                  </label>
                  <label className="text-sm font-semibold text-ink">
                    Confirm new email
                    <input
                      name="confirmEmail"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="new@example.com"
                      className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
                    />
                  </label>
                </div>
                <p className="mt-4 rounded-[18px] bg-[#eef5e4] px-4 py-3 text-sm leading-6 text-[#4d6a39]">
                  For security, Treeschool will send confirmation messages to both your current and new addresses. Your sign-in email changes only after both are approved.
                </p>
                <EmailChangeSubmitButton />
              </form>
            </section>
          </div>

          <section id="teachers" className="site-panel scroll-mt-6 rounded-[28px] px-6 py-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">Account access</p>
                <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-ink">Parents and teachers</h2>
                <p className="mt-2 max-w-2xl text-base leading-7 text-ink/68">
                  Teachers can view lesson plans, record attendance, add grades, and mark lessons done. They cannot delete account or lesson-plan data.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <span className="rounded-full bg-[#eef5e4] px-4 py-2 text-sm font-bold text-[#4d6a39]">
                  Your role: {people.currentRole === "OWNER" ? "Account owner" : people.currentRole.toLowerCase()}
                </span>
                <span className="rounded-full bg-[#f5eddf] px-4 py-2 text-sm font-bold text-earth">
                  Teacher users: {people.teacherUsersUsed} of {people.teacherUserLimit}
                </span>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {people.members.map((member) => (
                <Link
                  key={member.profileId}
                  href={`/p/account/teachers/${member.profileId}${searchParams?.lang ? `?lang=${encodeURIComponent(searchParams.lang)}` : ""}`}
                  className="group rounded-[22px] border border-[#e3cfad] bg-white px-5 py-4 transition hover:-translate-y-0.5 hover:border-[#9fbb86] hover:shadow-[0_6px_0_#d8c29e]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{member.name}{member.userId === user.id ? " (you)" : ""}</p>
                      <p className="mt-1 truncate text-sm text-ink/58">{member.email}</p>
                    </div>
                    <span className="rounded-full bg-[#f5eddf] px-3 py-1 text-xs font-bold text-earth">
                      {member.role === "OWNER" ? "Owner" : member.role === "ADMIN" ? "Admin" : "Teacher"}
                    </span>
                  </div>
                  <div className="mt-4 border-t border-[#eee2cf] pt-3">
                    <ActivitySquareGrid
                      days={member.activityDays}
                      dateFrom={member.activityDateFrom}
                      dateTo={member.activityDateTo}
                      noun="grading action"
                      explanation={`${member.activityDays.reduce((total, day) => total + day.count, 0)} grading actions in the last 13 weeks`}
                      compact
                    />
                  </div>
                  <p className="mt-3 text-xs font-semibold text-[#52753f] group-hover:underline group-hover:underline-offset-4">View profile and activity →</p>
                </Link>
              ))}
              {people.invitations.map((invitation) => (
                <div key={invitation.id} className="rounded-[22px] border border-dashed border-[#d5b98f] bg-[#fffaf2] px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{invitation.name}</p>
                      <p className="mt-1 truncate text-sm text-ink/58">{invitation.email}</p>
                    </div>
                    <span className="rounded-full bg-[#f5eddf] px-3 py-1 text-xs font-bold text-earth">
                      {new Date(invitation.expiresAt).getTime() <= Date.now() ? "Invite expired" : "Invite pending"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {people.canInvite && !people.teacherLimitReached ? (
              <InviteTeacherForm lang={searchParams?.lang} />
            ) : people.canInvite ? (
              <div className="mt-7 rounded-[24px] border border-[#d5b98f] bg-[#fffaf2] px-5 py-5">
                <h3 className="text-xl font-semibold text-ink">All Teacher users are in use</h3>
                <p className="mt-2 text-sm leading-6 text-ink/65">
                  Your plan includes up to {people.teacherUserLimit} Teacher users. Change an existing Teacher’s access level, or wait for a pending invitation to expire before inviting someone else.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </ParentShell>
    </ParentModeGuard>
  );
}
