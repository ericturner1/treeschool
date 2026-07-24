import { redirect } from "next/navigation";
import { getActiveProfileCookie } from "../../../lib/accounts/active-profile";
import {
  bootstrapParentAccount,
  getParentAccountPreferences,
  listHouseholdProfiles
} from "../../../lib/accounts/server";
import { getCurrentUser } from "../../../lib/auth/server";
import { getRequestDictionary } from "../../../lib/i18n/server";
import { ParentModeGuard } from "../parent-mode-guard";
import { ParentShell } from "../parent-shell";
import { PRINT_PAGE_SIZE_OPTIONS } from "../../../lib/print-page-sizes";
import { updatePreferencesAction } from "./actions";

type ParentSettingsPageProps = {
  searchParams?: {
    lang?: string;
    message?: string;
    error?: string;
  };
};

export default async function ParentSettingsPage({
  searchParams
}: ParentSettingsPageProps) {
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { dashboard, home } = dictionary;
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser.email) {
    redirect(`/p/signin?lang=${locale}`);
  }

  const parentFirstName =
    currentUser.user_metadata?.first_name ??
    currentUser.user_metadata?.name ??
    currentUser.user_metadata?.full_name?.split(" ")[0];

  await bootstrapParentAccount({
    userId: currentUser.id,
    email: currentUser.email,
    firstName: parentFirstName
  });

  const [householdProfiles, preferences] = await Promise.all([
    listHouseholdProfiles(currentUser.id),
    getParentAccountPreferences(currentUser.id)
  ]);
  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");
  const studentProfiles = householdProfiles.filter((profile) => profile.role === "STUDENT");
  const activeProfileCookie = getActiveProfileCookie();
  const activeProfile =
    householdProfiles.find((profile) => profile.id === activeProfileCookie?.id) ?? parentProfile;
  const redirectTo = searchParams?.lang ? `/p/settings?lang=${searchParams.lang}` : "/p/settings";

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <ParentShell
        brandName={home.brand.name}
        dashboard={dashboard}
        currentUserEmail={currentUser.email}
        activeProfile={activeProfile}
        parentProfile={parentProfile}
        studentProfiles={studentProfiles}
        title={dashboard.settings.title}
        activeNav="settings"
        sidebarLinks={[
          {
            href: "/p/dashboard",
            label: dashboard.actions.dashboard,
            tone: "outline"
          }
        ]}
      >
        <section className="mt-4">
          {searchParams?.message ? (
            <div className="mb-4 rounded-[20px] border border-[#b8cf9f] bg-[#eef5e4] px-5 py-4 text-sm font-semibold text-[#4d6a39]">
              {searchParams.message}
            </div>
          ) : null}
          {searchParams?.error ? (
            <div className="mb-4 rounded-[20px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">
              {searchParams.error}
            </div>
          ) : null}
          <div className="site-panel rounded-[28px] px-6 py-7">
            <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">
              Printing
            </h2>
            <p className="mt-4 text-base leading-[1.75] text-ink/75">
              Choose the page size Treeschool should use for newly created weekly plans. Existing
              PDFs keep the size they were created with.
            </p>
            <form action={updatePreferencesAction} className="mt-6 max-w-xl">
              <label htmlFor="preferredPrintPageSize" className="block text-sm font-semibold text-ink">
                Preferred Print Page Size
              </label>
              <select
                id="preferredPrintPageSize"
                name="preferredPrintPageSize"
                defaultValue={preferences.preferredPrintPageSize ?? ""}
                required
                className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
              >
                <option value="" disabled>Choose a page size</option>
                {PRINT_PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button type="submit" className="cta-button cta-button--dark mt-5">
                Save preferences
              </button>
            </form>
          </div>
        </section>
      </ParentShell>
    </ParentModeGuard>
  );
}
