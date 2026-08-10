import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { PlanPackIntakeForm } from "./plan-pack-intake-form";
import { getCurrentUser } from "../../lib/auth/server";
import { getParentAccountPreferences } from "../../lib/accounts/server";
import { inferPrintPageSizeFromHeaders } from "../../lib/print-page-size-inference";
import { getParentBillingOverview } from "../../lib/billing/server";
import { listNativeWorkbookCatalog } from "../../lib/native-workbooks/server";
import { getPlanPackPricing } from "../../lib/plan-pack/server";

export type GeneratorFunnelPageProps = {
  searchParams?: Promise<{
    checkout?: string;
    error?: string;
    message?: string;
  }>;
};

function decodeParam(value?: string) {
  return value ? decodeURIComponent(value) : null;
}

export default async function GeneratorFunnelPage(props: GeneratorFunnelPageProps) {
  const searchParams = await props.searchParams;
  const error = decodeParam(searchParams?.error);
  const currentUser = await getCurrentUser();
  const [preferences, billing, catalogResult, pricing] = await Promise.all([
    currentUser?.id
      ? getParentAccountPreferences(currentUser.id).catch(() => null)
      : Promise.resolve(null),
    currentUser?.id
      ? getParentBillingOverview({ userId: currentUser.id }).catch(() => null)
      : Promise.resolve(null),
    listNativeWorkbookCatalog({ userId: currentUser?.id ?? null }).catch(() => ({ workbooks: [] })),
    getPlanPackPricing()
  ]);

  if (billing?.featureAccess.isSubscriber) {
    redirect("/p/dashboard");
  }

  const requestHeaders = await headers();
  const suggestedPrintPageSize = preferences?.preferredPrintPageSize
    ? null
    : inferPrintPageSizeFromHeaders(requestHeaders);

  return (
    <main className="min-h-screen bg-[#f8f1e4]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-1.5 text-ink/70 transition-colors hover:text-ink">
          <img src="/tree-icon.png" alt="Treeschool tree icon" className="h-8 w-8 object-contain" />
          <p className="brand-logo text-[17px] font-semibold leading-none tracking-[-0.05em]">treeschool</p>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/support" className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink/62 transition-colors hover:text-ink">Support</Link>
          <Link href={currentUser ? "/p/dashboard" : "/p/signin"} className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink/62 transition-colors hover:text-ink">
            {currentUser ? "Parent dashboard" : "Parent sign in"}
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
        <section>
          <div className="mb-5 text-center sm:mb-6">
            <p className="label-font text-xs font-black uppercase tracking-[0.13em] text-earth">Elementary homeschool planning · Grades K–4</p>
            <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.05em] text-ink sm:text-[40px]">
              Homeschool Lesson Plan Generator
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-[15px] leading-6 text-ink/65 sm:text-base">
              Set up your K–4 school year, add your curriculum or Treeschool workbooks, and review everything before starting Single for {new Intl.NumberFormat("en-US", { style: "currency", currency: pricing.currencyCode, minimumFractionDigits: 0 }).format(pricing.subscriptionIntroPriceInCents / 100)}.
            </p>
          </div>

          {searchParams?.checkout === "canceled" ? (
            <div className="mb-6 rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-4 text-sm font-semibold text-earth">
              Checkout was canceled. Your setup has not been charged.
            </div>
          ) : null}
          {error ? (
            <div className="mb-6 rounded-[22px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">{error}</div>
          ) : null}

          <div className="site-panel rounded-[32px] px-6 py-8 sm:px-8">
            <PlanPackIntakeForm
              initialPreferredPrintPageSize={preferences?.preferredPrintPageSize ?? null}
              suggestedPreferredPrintPageSize={suggestedPrintPageSize}
              nativeWorkbookCatalog={catalogResult.workbooks}
              pricing={pricing}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
