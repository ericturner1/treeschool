import { getCurrentUser } from "../lib/auth/server";
import {
  listPublicFunnelProducts,
  type ManagedFunnelPagePayload
} from "../lib/funnels/server";
import {
  listNativeWorkbookCatalog,
  type NativeWorkbookCatalogItem
} from "../lib/native-workbooks/server";
import { CurriculumCheckoutOptions } from "../app/first-grade-homeschool-curriculum/curriculum-checkout-choice";

function orderFormSettings(step: ManagedFunnelPagePayload["step"]) {
  const raw = step.settings.orderForm;
  const settings = raw && typeof raw === "object"
    ? raw as Record<string, unknown>
    : {};
  return {
    primaryProductId: typeof settings.primaryProductId === "string"
      ? settings.primaryProductId
      : null,
    orderBumpProductIds: Array.isArray(settings.orderBumpProductIds)
      ? settings.orderBumpProductIds.filter((id): id is string => typeof id === "string")
      : [],
    submitLabel: typeof settings.submitLabel === "string" && settings.submitLabel.trim()
      ? settings.submitLabel.trim()
      : "Continue to secure checkout"
  };
}

function price(item: { currencyCode: string; priceInCents: number }) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: item.currencyCode
  }).format(item.priceInCents / 100);
}

export async function ManagedFunnelOrderForm({
  data,
  visitorId
}: {
  data: ManagedFunnelPagePayload;
  visitorId?: string | null;
}) {
  if (data.step.stepType !== "order_form") return null;

  const settings = orderFormSettings(data.step);
  const user = await getCurrentUser().catch(() => null);
  const [{ workbooks }, funnelProducts] = await Promise.all([
    listNativeWorkbookCatalog({
      userId: user?.id,
      grade: null,
      subject: null
    }).catch(() => ({ workbooks: [] as NativeWorkbookCatalogItem[] })),
    listPublicFunnelProducts().catch(() => ({ subscriptions: [] }))
  ]);
  const primaryWorkbook = settings.primaryProductId
    ? workbooks.find((item) => item.id === settings.primaryProductId) ?? null
    : null;
  const primarySubscription = settings.primaryProductId
    ? funnelProducts.subscriptions.find((item) => item.id === settings.primaryProductId) ?? null
    : null;
  const primary = primaryWorkbook ?? primarySubscription;
  const orderBumps = settings.orderBumpProductIds
    .map((id) => workbooks.find((item) => item.id === id) ?? null)
    .filter((item): item is NativeWorkbookCatalogItem => Boolean(
      item &&
      item.id !== primary?.id &&
      (!primarySubscription || item.type === "elective")
    ));
  const subscriptionStartPrice = primarySubscription?.introductoryPriceInCents ?? primarySubscription?.priceInCents;
  const primaryPriceInCents = primaryWorkbook?.priceInCents ?? subscriptionStartPrice ?? 0;
  const primaryPrice = primarySubscription?.introductoryPriceInCents != null
    ? `${price({ ...primarySubscription, priceInCents: primarySubscription.introductoryPriceInCents })} first month`
    : primary ? price(primary) : "";
  const primaryBillingNote = primarySubscription
    ? primarySubscription.billingInterval === "yearly"
      ? "Billed annually"
      : `Then ${price(primarySubscription)}/month`
    : "One time";

  return (
    <section className="mx-auto mb-12 w-full max-w-[1120px] rounded-[30px] border border-[#d8c7ad] bg-[#fffaf2] p-6 shadow-[0_18px_50px_rgba(79,54,34,.09)] sm:p-9">
      {primary ? (
        <CurriculumCheckoutOptions
          bundleId={primary.id}
          bundleSlug={primaryWorkbook?.slug ?? primary.id}
          bundleTitle={primary.title}
          bundleDescription={primary.description}
          bundlePrice={primaryPrice}
          bundlePriceInCents={primaryPriceInCents}
          currencyCode={primary.currencyCode}
          primaryProductKind={primarySubscription ? "subscription" : "bookstore"}
          primaryBillingNote={primaryBillingNote}
          orderBumps={orderBumps.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            priceInCents: item.priceInCents,
            currencyCode: item.currencyCode
          }))}
          submitLabel={settings.submitLabel}
          userEmail={user?.email ?? null}
          returnPath={data.page.publicPath}
          funnelKey={data.funnel.slug}
          funnelVisitorId={visitorId}
          previewMode={data.page.preview}
          successPath={data.page.nextHref ?? undefined}
        />
      ) : (
        <div className="grid gap-4 text-center">
          <p className="text-base font-semibold text-ink/65">
            Checkout is temporarily unavailable because this order form does not have a published product configured.
          </p>
          <button type="button" disabled className="cta-button cta-button--light w-full cursor-not-allowed justify-center opacity-50">
            {settings.submitLabel}
          </button>
        </div>
      )}
    </section>
  );
}
