import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfileCookie } from "../../../lib/accounts/active-profile";
import { bootstrapParentAccount, listHouseholdProfiles } from "../../../lib/accounts/server";
import { getCurrentUser } from "../../../lib/auth/server";
import { getParentBillingOverview } from "../../../lib/billing/server";
import { getRequestDictionary } from "../../../lib/i18n/server";
import { ParentModeGuard } from "../parent-mode-guard";
import { ParentShell } from "../parent-shell";
import {
  openBillingPortalAction,
  startCoreSubscriptionCheckoutAction
} from "../../billing-actions";

type ParentBillingPageProps = {
  searchParams?: {
    lang?: string;
    checkout?: string;
    error?: string;
  };
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(value));
}

export default async function ParentBillingPage({ searchParams }: ParentBillingPageProps) {
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

  const [householdProfiles, billing] = await Promise.all([
    listHouseholdProfiles(currentUser.id),
    getParentBillingOverview({ userId: currentUser.id })
  ]);

  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");
  const studentProfiles = householdProfiles.filter((profile) => profile.role === "STUDENT");
  const activeProfileCookie = getActiveProfileCookie();
  const activeProfile =
    householdProfiles.find((profile) => profile.id === activeProfileCookie?.id) ?? parentProfile;
  const redirectTo = searchParams?.lang ? `/p/billing?lang=${searchParams.lang}` : "/p/billing";
  const hasCurrentSubscription = Boolean(
    billing.subscription && ["trialing", "active", "past_due"].includes(billing.subscription.status)
  );

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <ParentShell
        brandName={home.brand.name}
        dashboard={dashboard}
        currentUserEmail={currentUser.email}
        activeProfile={activeProfile}
        parentProfile={parentProfile}
        studentProfiles={studentProfiles}
        title={dashboard.billing.title}
        activeNav="billing"
        sidebarLinks={[
          {
            href: "/p/dashboard",
            label: dashboard.actions.dashboard,
            tone: "outline"
          }
        ]}
      >
        <div className="space-y-6">
          {searchParams?.checkout === "success" ? (
            <section className="rounded-[24px] border border-[#b8cf9f] bg-[#eef5e4] px-6 py-5 text-sm font-semibold text-[#4d6a39]">
              Stripe checkout completed. Your access will update as soon as Stripe confirms the subscription.
            </section>
          ) : null}
          {searchParams?.error ? (
            <section className="rounded-[24px] border border-[#d9afa2] bg-[#fff1ec] px-6 py-5 text-sm font-semibold text-[#8b3e2f]">
              {searchParams.error}
            </section>
          ) : null}
          {billing.accessRestricted ? (
            <section className="rounded-[24px] border border-[#d79b91] bg-[#f7e2dd] px-6 py-5">
              <h2 className="text-[26px] font-semibold tracking-[-0.05em] text-[#7f4339]">
                {dashboard.billing.accessRestrictedTitle}
              </h2>
              <p className="mt-2 text-base leading-[1.75] text-[#7f4339]/85">
                {dashboard.billing.accessRestrictedCopy}
              </p>
              {billing.dataDeletionAt ? (
                <p className="mt-3 text-sm font-semibold text-[#7f4339]">
                  {dashboard.billing.deletionNotice} {formatDate(billing.dataDeletionAt, locale)}
                </p>
              ) : null}
            </section>
          ) : null}

          <section>
            <div className="site-panel rounded-[28px] px-6 py-7">
              <div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-earth/80">
                    {dashboard.billing.currentPlan}
                  </p>
                  <h2 className="mt-2 text-[32px] font-semibold tracking-[-0.05em] text-ink">
                    {billing.displayStatus === "trialing"
                      ? dashboard.billing.freeTrialPlan
                      : billing.currentPlan === "premium"
                      ? dashboard.billing.premiumPlan
                      : dashboard.billing.freePlan}
                  </h2>
                  <p className="mt-3 text-base leading-[1.75] text-ink/75">
                    {billing.displayStatus === "active_canceling"
                      ? dashboard.billing.cancelAtPeriodEnd
                      : billing.subscription?.introductoryMonth && billing.subscription.currentPeriodEnd
                        ? `$6 introductory month. Your regular Family Plan begins ${formatDate(billing.subscription.currentPeriodEnd, locale)}.`
                      : billing.trial.active && billing.trial.endAt
                        ? `${dashboard.billing.trialEnds}: ${formatDate(billing.trial.endAt, locale)}`
                        : dashboard.billing.checkoutUnavailable}
                  </p>
                </div>
              </div>

              {!hasCurrentSubscription ? <div className="mt-6">
                <form action={startCoreSubscriptionCheckoutAction}>
                  <input type="hidden" name="interval" value="monthly" />
                  <input type="hidden" name="returnPath" value="/p/billing" />
                  <button type="submit" className="cta-button cta-button--light w-full">
                    {dashboard.billing.upgradeMonthly}
                  </button>
                </form>
              </div> : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <form action={openBillingPortalAction}>
                  <button type="submit" className="cta-button cta-button--outline cta-button--small">
                    {dashboard.billing.manageBilling}
                  </button>
                </form>
              </div>

              <div className="mt-8 rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-5">
                <h2 className="text-[26px] font-semibold tracking-[-0.05em] text-ink">
                  {billing.trial.active ? dashboard.billing.trialStatus : dashboard.billing.billingStatus}
                </h2>
                <dl className="mt-5 space-y-4 text-sm text-ink/78">
                {billing.trial.endAt ? (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <dt>{dashboard.billing.trialEnds}</dt>
                      <dd className="font-semibold text-ink">{formatDate(billing.trial.endAt, locale)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt>{dashboard.billing.trialDaysLeft}</dt>
                      <dd className="font-semibold text-ink">{billing.trial.daysRemaining}</dd>
                    </div>
                  </>
                ) : null}
                {billing.subscription?.currentPeriodEnd ? (
                  <div className="flex items-center justify-between gap-4">
                    <dt>{dashboard.billing.activeUntil}</dt>
                    <dd className="font-semibold text-ink">
                      {formatDate(billing.subscription.currentPeriodEnd, locale)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-4">
                  <dt>Student seats</dt>
                  <dd className="font-semibold text-ink">
                    {billing.studentSeats.active} active · {billing.studentSeats.included} included
                    {billing.studentSeats.additional > 0 ? ` · ${billing.studentSeats.additional} additional` : ""}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt>Family pricing</dt>
                  <dd className="max-w-sm text-right font-semibold text-ink">
                    $20/month for up to three students, then $5/month for each additional student
                  </dd>
                </div>
                {billing.subscription?.introductoryMonth ? (
                  <div className="flex items-start justify-between gap-4">
                    <dt>Introductory allowance</dt>
                    <dd className="max-w-sm text-right font-semibold text-ink">
                      One initial lesson plan per paid student seat; plan updates unlock after renewal
                    </dd>
                  </div>
                ) : null}
                </dl>

                {!billing.billingGuardEnabled ? (
                  <p className="mt-6 rounded-[18px] bg-[#f8f1e4] px-4 py-4 text-sm leading-[1.7] text-ink/72">
                    {dashboard.billing.guardDisabled}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </ParentShell>
    </ParentModeGuard>
  );
}
