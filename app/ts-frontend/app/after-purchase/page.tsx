import Link from "next/link";
import { redirect } from "next/navigation";
import { bootstrapParentAccount } from "../../lib/accounts/server";
import { getCurrentUser } from "../../lib/auth/server";
import { getPublicFunnelPageByPath } from "../../lib/funnels/server";
import { getRequestDictionary } from "../../lib/i18n/server";
import { ManagedFunnelPageView } from "../../components/managed-funnel-page";
import { startCoreSubscriptionCheckoutAction } from "../billing-actions";

type AfterPurchasePageProps = {
  searchParams?: Promise<{
    lang?: string;
    checkout?: string;
  }>;
};

export default async function AfterPurchasePage(props: AfterPurchasePageProps) {
  const searchParams = await props.searchParams;
  const { dictionary } = await getRequestDictionary(searchParams?.lang);
  const { home } = dictionary;
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser.email) {
    redirect("/signin?message=Sign in to finish setting up your printable school-year plan.");
  }

  await bootstrapParentAccount({
    userId: currentUser.id,
    email: currentUser.email,
    firstName:
      currentUser.user_metadata?.first_name ??
      currentUser.user_metadata?.full_name ??
      currentUser.user_metadata?.name
  });

  const managedPage = await getPublicFunnelPageByPath("/after-purchase").catch(() => null);
  if (managedPage) return <ManagedFunnelPageView data={managedPage} />;

  return (
    <main className="min-h-screen bg-[#f8f1e4]">
      <header className="border-b border-[#e7d8c1] bg-[#fffaf2]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-0">
            <img src="/tree-icon.png" alt="treeschool tree icon" className="h-24 w-24 object-contain" />
            <p className="brand-logo text-[28px] font-semibold leading-none tracking-[-0.05em] text-ink">
              {home.brand.name}
            </p>
          </Link>

          <Link href="/p/dashboard" className="cta-button cta-button--dark cta-button--small">
            Go to your account
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="site-panel rounded-[32px] px-6 py-9 text-center sm:px-10 sm:py-12">
          <p className="label-font text-sm font-black uppercase text-earth">Purchase complete</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.05em] text-ink sm:text-6xl">
            Thank you! You&apos;re done with your purchase journey.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ink/76">
            Your order is complete. There is nothing else you need to buy or approve before continuing to your Treeschool account.
          </p>
          <Link href="/p/dashboard" className="cta-button cta-button--dark mt-7">
            Go to your account
          </Link>
        </div>

        <div className="mt-7 rounded-[28px] border border-[#d8c8ae] bg-[#fffaf2] px-6 py-7 sm:px-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#567b40]">Completely optional</p>
          <div className="mt-3 grid gap-6 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.045em] text-ink">Want planning and recordkeeping tools too?</h2>
              <p className="mt-3 text-base leading-7 text-ink/68">
                Your purchase is already finished. Membership adds weekly planning, grades, attendance, and progress tracking, but it is not required to access what you bought.
              </p>
            </div>
            <form action={startCoreSubscriptionCheckoutAction}>
              <input type="hidden" name="interval" value="monthly" />
              <input type="hidden" name="planTier" value="single" />
              <input type="hidden" name="returnPath" value="/after-purchase" />
              <input type="hidden" name="successPath" value="/p/dashboard?message=Membership%20active." />
              <button type="submit" className="cta-button cta-button--dark w-full">
                Add membership · $6 first month
              </button>
            </form>
          </div>
          <p className="mt-5 text-center text-xs leading-5 text-ink/48">No action is required. You can simply continue to your account.</p>
        </div>
      </section>
    </main>
  );
}
