import Link from "next/link";
import { redirect } from "next/navigation";
import { bootstrapParentAccount } from "../../lib/accounts/server";
import { getCurrentUser } from "../../lib/auth/server";
import { getRequestDictionary } from "../../lib/i18n/server";
import { startCoreSubscriptionCheckoutAction } from "../billing-actions";

type AfterPurchasePageProps = {
  searchParams?: {
    lang?: string;
    checkout?: string;
  };
};

export default async function AfterPurchasePage({ searchParams }: AfterPurchasePageProps) {
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

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-16">
        <div className="site-panel rounded-[32px] px-6 py-8 sm:px-8">
          <p className="label-font text-sm font-black uppercase text-earth">Your printable plan is ready to set up</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.05em] text-ink sm:text-5xl">
            Wait. Your Treeschool account can do more than store PDFs.
          </h1>
          <p className="mt-5 text-lg leading-8 text-ink/76">
            Your printable school-year plan lives in your parent account, so you can return and download each teaching week whenever you need it.
          </p>
          <p className="mt-4 text-lg leading-8 text-ink/76">
            When your plan is ready, your purchase includes seven days to try live grades, attendance, progress, and up to three successful plan updates.
          </p>

          <div className="mt-7 rounded-[24px] border border-[#b8cf9f] bg-[#eef5e4] px-5 py-5 text-[#39572b]">
            <p className="text-2xl font-semibold tracking-[-0.05em]">Your 7-day tools preview is included.</p>
            <p className="mt-2 text-base leading-7">
              It starts when your generated plan is ready, so processing time never uses up your preview.
            </p>
          </div>
        </div>

        <div className="rounded-[32px] border border-[#6f513e] bg-[#fffaf2] px-6 py-8 shadow-[0_24px_70px_rgba(68,49,36,0.16)] sm:px-8">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-earth">Treeschool membership</p>
          <div className="mt-5 flex items-end gap-2">
            <span className="text-[54px] font-semibold leading-none tracking-[-0.055em] text-ink">$6</span>
            <span className="pb-2 text-base font-semibold text-ink/62">first month</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-[#4d6a39]">Up to three children. Then $20/month. Cancel anytime.</p>

          <div className="mt-7 space-y-3 text-base font-semibold text-ink/78">
            {[
              "Create one initial plan for each of up to three children",
              "Keep every generated week organized",
              "Enter grades from printed work",
              "Track subject progress as the year unfolds"
            ].map((item) => (
              <p key={item} className="flex gap-3">
                <span className="mt-2 h-2 w-2 flex-none rounded-full bg-[#4d6a39]" />
                <span>{item}</span>
              </p>
            ))}
          </div>

          <form action={startCoreSubscriptionCheckoutAction} className="mt-8">
            <input type="hidden" name="interval" value="monthly" />
            <input type="hidden" name="returnPath" value="/after-purchase" />
            <input type="hidden" name="successPath" value="/p/dashboard?message=Membership%20active." />
            <button type="submit" className="cta-button cta-button--dark w-full">
              Try Treeschool for $6
            </button>
          </form>

          <Link href="/p/dashboard" className="mt-4 inline-flex w-full justify-center text-sm font-semibold text-ink/62 hover:text-ink">
            No thanks, continue to my account
          </Link>
        </div>
      </section>
    </main>
  );
}
