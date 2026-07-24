import { redirect } from "next/navigation";
import { getActiveProfileCookie } from "../../../lib/accounts/active-profile";
import { bootstrapParentAccount, listHouseholdProfiles } from "../../../lib/accounts/server";
import { getCurrentUser } from "../../../lib/auth/server";
import { listParentElectives } from "../../../lib/billing/server";
import { getRequestDictionary } from "../../../lib/i18n/server";
import { ParentModeGuard } from "../parent-mode-guard";
import { ParentShell } from "../parent-shell";

type ParentElectivesPageProps = {
  searchParams?: {
    lang?: string;
  };
};

function formatMoney(input: { amountInCents: number; currencyCode: string; locale: string }) {
  return new Intl.NumberFormat(input.locale, {
    style: "currency",
    currency: input.currencyCode
  }).format(input.amountInCents / 100);
}

export default async function ParentElectivesPage({ searchParams }: ParentElectivesPageProps) {
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

  const [householdProfiles, electives] = await Promise.all([
    listHouseholdProfiles(currentUser.id),
    listParentElectives({ userId: currentUser.id })
  ]);

  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");
  const studentProfiles = householdProfiles.filter((profile) => profile.role === "STUDENT");
  const activeProfileCookie = getActiveProfileCookie();
  const activeProfile =
    householdProfiles.find((profile) => profile.id === activeProfileCookie?.id) ?? parentProfile;
  const redirectTo = searchParams?.lang ? `/p/electives?lang=${searchParams.lang}` : "/p/electives";

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <ParentShell
        brandName={home.brand.name}
        dashboard={dashboard}
        currentUserEmail={currentUser.email}
        activeProfile={activeProfile}
        parentProfile={parentProfile}
        studentProfiles={studentProfiles}
        title={dashboard.electives.title}
        activeNav="electives"
      >
        {electives.length === 0 ? (
          <section className="site-panel rounded-[28px] px-6 py-7">
            <p className="text-base leading-[1.75] text-ink/75">{dashboard.electives.noElectives}</p>
          </section>
        ) : (
          <section className="grid gap-5 md:grid-cols-2">
            {electives.map((elective) => (
              <article key={elective.id} className="site-panel rounded-[28px] px-6 py-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">
                      {elective.name}
                    </h2>
                    {elective.description ? (
                      <p className="mt-3 text-base leading-[1.75] text-ink/75">
                        {elective.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-[999px] bg-[#f8f1e4] px-3 py-2 text-sm font-semibold text-earth">
                    {formatMoney({
                      amountInCents: elective.priceInCents,
                      currencyCode: elective.currencyCode,
                      locale
                    })}
                  </span>
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <span
                    className={`rounded-[999px] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                      elective.owned ? "bg-[#e4f0d7] text-[#36511f]" : "bg-[#f8f1e4] text-earth"
                    }`}
                  >
                    {elective.owned ? dashboard.electives.owned : dashboard.electives.buy}
                  </span>
                  {elective.owned ? null : elective.checkoutUrl ? (
                    <a href={elective.checkoutUrl} className="cta-button cta-button--light cta-button--small">
                      {dashboard.electives.buy}
                    </a>
                  ) : (
                    <span className="cta-button cta-button--outline cta-button--small pointer-events-none opacity-60">
                      {dashboard.electives.comingSoon}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </ParentShell>
    </ParentModeGuard>
  );
}
