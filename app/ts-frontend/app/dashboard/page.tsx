import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfileCookie } from "../../lib/accounts/active-profile";
import {
  bootstrapParentAccount,
  listHouseholdProfiles
} from "../../lib/accounts/server";
import { getCurrentUser } from "../../lib/auth/server";
import { getRequestDictionary } from "../../lib/i18n/server";
import { returnToParentAction } from "./actions";
import { ParentShell } from "../p/parent-shell";

type DashboardPageProps = {
  searchParams?: {
    lang?: string;
    error?: string;
    message?: string;
  };
};

function ageFromBirthDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - year;
  const birthdayHasPassed = today.getUTCMonth() + 1 > month
    || (today.getUTCMonth() + 1 === month && today.getUTCDate() >= day);
  if (!birthdayHasPassed) age -= 1;
  return age >= 0 ? age : null;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { dashboard, home } = dictionary;
  const user = await getCurrentUser();

  if (!user?.email || !user.id) {
    redirect(`/signin?lang=${locale}&message=${encodeURIComponent(dashboard.unauthenticated)}`);
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
  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");
  const studentProfiles = householdProfiles.filter((profile) => profile.role === "STUDENT");
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
            <div className="site-panel rounded-[28px] px-6 py-7">
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
                  <div className="overflow-x-auto rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2]">
                    <div className="grid min-w-[650px] grid-cols-[minmax(160px,1.6fr)_80px_120px_180px] gap-4 border-b border-[#e4d5bd] bg-[#f6ecdc] px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-ink/62">
                      <span>{dashboard.profileManagement.columns.name}</span>
                      <span>{dashboard.profileManagement.columns.age}</span>
                      <span>{dashboard.profileManagement.columns.grade}</span>
                      <span className="text-right">{dashboard.profileManagement.columns.actions}</span>
                    </div>

                    {studentProfiles.map((profile, index) => (
                      <div
                        key={profile.id}
                        className={`grid min-w-[650px] grid-cols-[minmax(160px,1.6fr)_80px_120px_180px] gap-4 px-5 py-4 ${
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
                          {ageFromBirthDate(profile.birthDate) ?? "—"}
                        </div>

                        <div className="flex items-center text-sm font-semibold text-ink/78">
                          {profile.gradeLevel != null
                            ? profile.gradeLevel === 0
                              ? `${dashboard.profileManagement.columns.grade} K`
                              : `${dashboard.profileManagement.columns.grade} ${profile.gradeLevel}`
                            : dashboard.profileManagement.noGrade}
                        </div>

                        <div className="flex items-center justify-end">
                          <Link
                            href={`/p/student/${profile.slug ?? profile.id}`}
                            className="cta-button cta-button--outline cta-button--small"
                          >
                            {`${dashboard.profileManagement.manageLabel} ${profile.firstName}`}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
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
