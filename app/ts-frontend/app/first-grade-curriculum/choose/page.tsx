import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "../../../lib/auth/server";
import {
  formatCurriculumPrice,
  selectFirstGradeBundle
} from "../../../lib/first-grade-curriculum/catalog";
import {
  normalizeFirstGradeCurriculumVariant,
  normalizeFunnelVisitorId
} from "../../../lib/first-grade-curriculum/experiment";
import {
  listNativeWorkbookCatalog,
  type NativeWorkbookCatalogItem
} from "../../../lib/native-workbooks/server";
import { getPublicFunnelOrderForm, listPublicFunnelProducts } from "../../../lib/funnels/server";
import { CurriculumCheckoutOptions } from "../../first-grade-homeschool-curriculum/curriculum-checkout-choice";

const PAGE_PATH = "/first-grade-curriculum/choose";

export const metadata: Metadata = {
  title: "Choose Your First-Grade Curriculum Option | Treeschool",
  description: "Choose printable first-grade curriculum by itself or add Treeschool planning and recordkeeping.",
  robots: { index: false, follow: false }
};

type SearchParams = {
  checkout?: string;
  error?: string;
  landingVariant?: string;
  preview?: string;
  return?: string;
  visitor?: string;
};

function safeReturnPath(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/first-grade-curriculum";
}

export default async function FirstGradeCurriculumChoicePage(
  props: {
    searchParams?: Promise<SearchParams>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const { workbooks } = await listNativeWorkbookCatalog({
    userId: user?.id,
    grade: 1,
    subject: null
  }).catch(() => ({ workbooks: [] as NativeWorkbookCatalogItem[] }));
  const [configuredOrderForm, funnelProducts] = await Promise.all([
    getPublicFunnelOrderForm(PAGE_PATH).catch(() => null),
    listPublicFunnelProducts().catch(() => ({ subscriptions: [] }))
  ]);
  const configuredPrimaryWorkbook = configuredOrderForm?.orderForm.primaryProductId
    ? workbooks.find((item) => item.id === configuredOrderForm.orderForm.primaryProductId) ?? null
    : null;
  const configuredPrimarySubscription = configuredOrderForm?.orderForm.primaryProductId
    ? funnelProducts.subscriptions.find((item) => item.id === configuredOrderForm.orderForm.primaryProductId) ?? null
    : null;
  const fallbackBundle = selectFirstGradeBundle(workbooks);
  const primary = configuredPrimarySubscription ?? configuredPrimaryWorkbook ?? fallbackBundle;
  const orderBumps = configuredOrderForm
    ? configuredOrderForm.orderForm.orderBumpProductIds
      .map((id) => workbooks.find((item) => item.id === id) ?? null)
      .filter((item): item is NativeWorkbookCatalogItem => Boolean(
        item &&
        item.id !== primary?.id &&
        (!configuredPrimarySubscription || item.type === "elective")
      ))
    : [];
  const primaryStartPriceInCents = configuredPrimarySubscription?.introductoryPriceInCents
    ?? primary?.priceInCents
    ?? null;
  const primaryPrice = primary && primaryStartPriceInCents != null
    ? `${formatCurriculumPrice(primaryStartPriceInCents, primary.currencyCode)}${configuredPrimarySubscription?.introductoryPriceInCents != null ? " first month" : ""}`
    : null;
  const primaryBillingNote = configuredPrimarySubscription
    ? configuredPrimarySubscription.billingInterval === "yearly"
      ? "Billed annually"
      : `Then ${formatCurriculumPrice(configuredPrimarySubscription.priceInCents, configuredPrimarySubscription.currencyCode)}/month`
    : "One time";
  const landingVariant = normalizeFirstGradeCurriculumVariant(searchParams?.landingVariant);
  const funnelVisitorId = normalizeFunnelVisitorId(searchParams?.visitor);
  const previewMode = searchParams?.preview === "1";
  const returnPath = safeReturnPath(searchParams?.return);
  const message = searchParams?.checkout === "canceled"
    ? "Checkout was canceled. Nothing was charged."
    : searchParams?.error ?? null;

  return (
    <main className="min-h-screen bg-[#f8f2e8] px-4 py-6 text-ink sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-1">
            <Image src="/tree-icon.png" alt="Treeschool" width={52} height={52} className="h-11 w-11 object-contain" priority />
            <span className="brand-logo text-[24px] font-semibold leading-none">treeschool</span>
          </Link>
          <Link href={returnPath as Route} className="text-sm font-semibold text-[#55753f] underline underline-offset-4">
            ← Back
          </Link>
        </header>

        <section className="mt-6 rounded-[30px] border border-[#d8c7ad] bg-[#fffaf2] p-5 shadow-[0_20px_55px_rgba(79,54,34,.10)] sm:p-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
              Review your order
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">
              Your first-grade curriculum is ready
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-ink/66 sm:text-lg">
              Confirm the curriculum below, add any optional workbooks you want, then continue to Stripe’s secure hosted checkout.
            </p>
          </div>

          {previewMode ? (
            <p className="mx-auto mt-5 max-w-xl rounded-[14px] border border-[#c8d9b8] bg-[#edf5e5] px-4 py-3 text-center text-sm font-semibold text-[#4f6d3c]">
              Admin preview. Checkout attribution will not be recorded.
            </p>
          ) : null}
          {message ? (
            <p className="mt-5 rounded-[14px] border border-[#dfad9f] bg-[#fff0eb] px-4 py-3 text-center text-sm font-semibold text-[#8d4537]">
              {message}
            </p>
          ) : null}

          <div className="mt-7">
            {primary && primaryPrice && primaryStartPriceInCents != null ? (
              <CurriculumCheckoutOptions
                bundleId={primary.id}
                bundleSlug={configuredPrimarySubscription ? primary.id : configuredPrimaryWorkbook?.slug ?? fallbackBundle?.slug ?? primary.id}
                bundleTitle={primary.title}
                bundleDescription={primary.description}
                bundlePrice={primaryPrice}
                bundlePriceInCents={primaryStartPriceInCents}
                currencyCode={primary.currencyCode}
                primaryProductKind={configuredPrimarySubscription ? "subscription" : "bookstore"}
                primaryBillingNote={primaryBillingNote}
                orderBumps={orderBumps.map((item) => ({
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  priceInCents: item.priceInCents,
                  currencyCode: item.currencyCode
                }))}
                submitLabel={configuredOrderForm?.orderForm.submitLabel ?? "Continue to secure checkout"}
                userEmail={user?.email ?? null}
                returnPath={PAGE_PATH}
                landingVariant={landingVariant}
                funnelVisitorId={funnelVisitorId}
                previewMode={previewMode}
              />
            ) : (
              <p className="rounded-[18px] border border-[#d8c7ad] bg-[#f8f2e8] px-5 py-6 text-center font-semibold text-ink/65">
                Curriculum checkout is temporarily unavailable. Please return to the curriculum page and try again shortly.
              </p>
            )}
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-ink/48">
            Optional items are never added unless you select them. Payment is completed securely on Stripe.
          </p>
        </section>
      </div>
    </main>
  );
}
