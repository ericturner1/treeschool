import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import {
  getAdminFunnel,
  getAdminFunnelOperations,
  getAdminFunnelPage,
  type AdminFunnelOptions,
  type AdminFunnelStep,
  type AdminFunnelStepType
} from "../../../lib/funnels/server";
import {
  buildFunnelStepHierarchy,
  funnelExperimentContainerForStep
} from "../../../lib/funnels/step-hierarchy";
import { canImportLegacyFunnelPage } from "../../../lib/funnels/legacy-page-imports";
import {
  getNativeWorkbookNavigation,
  listNativeWorkbookCatalog,
  type NativeWorkbookCatalogItem
} from "../../../lib/native-workbooks/server";
import {
  saveFunnelStepAction
} from "./actions";
import { FunnelStepRail } from "./funnel-step-rail";
import { FunnelStepUrlField } from "./funnel-step-url-field";
import { FunnelExperimentPanel } from "./funnel-experiment-panel";
import { FunnelSettingsDialog } from "./funnel-settings-dialog";
import { FunnelSubmitButton } from "./funnel-submit-button";
import { FunnelTabWorkspace } from "./funnel-tab-workspace";
import {
  FunnelOperationsPanel,
  type FunnelOperationsTab
} from "./funnel-operations-panel";

type FunnelAdminTab = "configuration" | "experiment" | "leads" | "stats" | "sales";

function normalizeTab(value?: string): FunnelAdminTab {
  return ["configuration", "experiment", "leads", "stats", "sales"].includes(value ?? "")
    ? value as FunnelAdminTab
    : "configuration";
}

const STEP_TYPE_LABELS: Record<AdminFunnelStepType, string> = {
  landing: "Landing page",
  sales: "Sales page",
  order_form: "Order form",
  upsell: "Upsell",
  downsell: "Downsell",
  thank_you: "Thank-you page",
  redirect: "Redirect",
  fulfillment: "Fulfillment"
};

const STEP_TYPE_STYLES: Record<AdminFunnelStepType, string> = {
  landing: "border-[#b9cfa5] bg-[#eef5e7] text-[#4f6f3c]",
  sales: "border-[#b9cfa5] bg-[#eef5e7] text-[#4f6f3c]",
  order_form: "border-[#d8bf94] bg-[#fbf1db] text-[#76552f]",
  upsell: "border-[#c9c2df] bg-[#f2eef8] text-[#65577e]",
  downsell: "border-[#c9c2df] bg-[#f2eef8] text-[#65577e]",
  thank_you: "border-[#b8d2cd] bg-[#eaf5f2] text-[#3e6d65]",
  redirect: "border-[#ccd2dc] bg-[#f0f2f5] text-[#586270]",
  fulfillment: "border-[#b8d2cd] bg-[#eaf5f2] text-[#3e6d65]"
};

const STEP_FIELD_CLASS = "min-h-12 w-full rounded-[14px] border border-[#d8c5a8] bg-white px-4 py-3 text-base font-normal text-ink shadow-[inset_0_1px_1px_rgba(79,53,36,0.04)] outline-none transition placeholder:text-ink/35 hover:border-[#b79570] focus:border-[#739655] focus:ring-4 focus:ring-[#739655]/15 disabled:cursor-not-allowed disabled:border-[#ded5c7] disabled:bg-[#f3eee6] disabled:text-ink/45";
const STEP_SELECT_CLASS = `${STEP_FIELD_CLASS} pr-12`;

function StepFields({
  funnelId,
  funnelSlug,
  options,
  existingSteps,
  step,
  catalog
}: {
  funnelId: string;
  funnelSlug: string;
  options: AdminFunnelOptions;
  existingSteps: AdminFunnelStep[];
  step?: AdminFunnelStep;
  catalog: NativeWorkbookCatalogItem[];
}) {
  const rawOrderForm = step?.settings.orderForm;
  const orderForm = rawOrderForm && typeof rawOrderForm === "object"
    ? rawOrderForm as Record<string, unknown>
    : {};
  const primaryProductId = typeof orderForm.primaryProductId === "string"
    ? orderForm.primaryProductId
    : "";
  const bumpIds = new Set(
    Array.isArray(orderForm.orderBumpProductIds)
      ? orderForm.orderBumpProductIds.filter((id): id is string => typeof id === "string")
      : []
  );
  const submitLabel = typeof orderForm.submitLabel === "string"
    ? orderForm.submitLabel
    : "Continue to secure checkout";
  const rawOneClickOffer = step?.settings.oneClickOffer;
  const oneClickOffer = rawOneClickOffer && typeof rawOneClickOffer === "object"
    ? rawOneClickOffer as Record<string, unknown>
    : {};
  const oneClickProductId = typeof oneClickOffer.productId === "string" ? oneClickOffer.productId : "";
  const money = (item: NativeWorkbookCatalogItem) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: item.currencyCode
  }).format(item.priceInCents / 100);

  return (
    <>
      <input type="hidden" name="id" value={step?.id ?? ""} />
      <input type="hidden" name="funnelId" value={funnelId} />
      <input type="hidden" name="funnelSlug" value={funnelSlug} />
      <input type="hidden" name="sourceType" value={step?.sourceType ?? "generated"} />
      <input type="hidden" name="sourceRef" value={step?.sourceRef ?? ""} />
      <input type="hidden" name="slug" value={step?.slug ?? ""} />
      <input type="hidden" name="publicPath" value={step?.publicPath ?? ""} />
      <input type="hidden" name="previewPath" value={step?.previewPath ?? ""} />
      <input type="hidden" name="linkLabel" value={step?.linkLabel ?? ""} />
      <input type="hidden" name="status" value={step?.status ?? "draft"} />
      {step?.isTopOfFunnel ? <input type="hidden" name="isTopOfFunnel" value="true" /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-ink/82 sm:col-span-2">
          Name
          <input name="name" required defaultValue={step?.name ?? ""} placeholder="Sales page" className={STEP_FIELD_CLASS} />
        </label>
        <FunnelStepUrlField
          funnelSlug={funnelSlug}
          defaultValue={step?.routePath ?? ""}
          currentStepId={step?.id}
          existingSteps={existingSteps}
          inputClassName={STEP_FIELD_CLASS}
        />
        <label className="grid gap-2 text-sm font-semibold text-ink/82 sm:col-span-2">
          Type
          <select name="stepType" defaultValue={step?.stepType ?? "landing"} className={STEP_SELECT_CLASS}>
            {options.stepTypes.map((type) => (
              <option key={type} value={type}>{STEP_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </label>
        {(step?.stepType ?? "landing") === "order_form" ? (
          <section className="grid gap-5 rounded-[18px] border border-[#d8c5a8] bg-[#fffdf8] p-4 sm:col-span-2 sm:p-5">
            <div>
              <p className="text-base font-semibold">Products and order bumps</p>
              <p className="mt-1 text-sm leading-6 text-ink/55">
                Choose the main bookstore item sold on this page. Optional additions appear as checkboxes before the customer continues to Stripe.
              </p>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-ink/82">
              Primary digital product
              <select name="orderPrimaryProductId" required defaultValue={primaryProductId} className={STEP_SELECT_CLASS}>
                <option value="">Select a bookstore product…</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {money(item)}{item.catalogKind === "bundle" ? " · bundle" : ""}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-ink/82">Optional order bumps</legend>
              <div className="grid max-h-64 gap-2 overflow-y-auto rounded-[14px] border border-[#e4d5c0] bg-white p-3">
                {catalog.length ? catalog.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-[11px] px-2 py-2 text-sm transition hover:bg-[#f5efe5]">
                    <input
                      type="checkbox"
                      name="orderBumpProductId"
                      value={item.id}
                      defaultChecked={bumpIds.has(item.id)}
                      disabled={item.id === primaryProductId}
                      className="h-5 w-5 rounded border-[#bca88a] accent-[#739655]"
                    />
                    <span className="min-w-0 flex-1 font-semibold">{item.title}</span>
                    <span className="shrink-0 text-ink/50">{money(item)}</span>
                  </label>
                )) : (
                  <p className="px-2 py-3 text-sm text-ink/55">Publish a bookstore product before configuring this order form.</p>
                )}
              </div>
            </fieldset>
            <label className="grid gap-2 text-sm font-semibold text-ink/82">
              Checkout button label
              <input name="orderSubmitLabel" defaultValue={submitLabel} className={STEP_FIELD_CLASS} />
            </label>
          </section>
        ) : null}
        {["upsell", "downsell"].includes(step?.stepType ?? "") ? (
          <section className="grid gap-5 rounded-[18px] border border-[#d8c5a8] bg-[#fffdf8] p-4 sm:col-span-2 sm:p-5">
            <div>
              <p className="text-base font-semibold">One-click offer</p>
              <p className="mt-1 text-sm leading-6 text-ink/55">
                Choose the bookstore item offered here. After the initial checkout, Treeschool charges the customer&apos;s saved payment method with one click; Stripe only reopens if the bank requires confirmation.
              </p>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-ink/82">
              Product
              <select name="oneClickProductId" required defaultValue={oneClickProductId} className={STEP_SELECT_CLASS}>
                <option value="">Select a bookstore product…</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>{item.title} · {money(item)}{item.catalogKind === "bundle" ? " · bundle" : ""}</option>
                ))}
              </select>
            </label>
            <p className="text-sm leading-6 text-ink/55">
              Edit the page itself to control the accept button and decline-link copy.
            </p>
            <p className="rounded-[14px] border border-[#d9cfea] bg-[#f7f3fb] px-4 py-3 text-sm leading-6 text-[#5f5275]">
              {step?.stepType === "downsell"
                ? "A downsell must immediately follow an active upsell. It appears only when that upsell is declined; either downsell choice then continues to the following step."
                : "If this upsell is accepted, Treeschool skips the immediately following downsell. If it is declined, the customer sees that downsell next."}
            </p>
          </section>
        ) : null}
        <label className="grid gap-2 text-sm font-semibold text-ink/82 sm:col-span-2">
          Description
          <textarea name="description" rows={3} defaultValue={step?.description ?? ""} placeholder="What happens at this step?" className={`${STEP_FIELD_CLASS} min-h-28 resize-y leading-6`} />
        </label>
      </div>
    </>
  );
}

export async function AdminFunnelDetailPage({
  funnelId,
  selectedStepId,
  selectedPageId,
  selectedTab,
  error
}: {
  funnelId: string;
  selectedStepId?: string;
  selectedPageId?: string;
  selectedTab?: string;
  message?: string;
  error?: string;
}) {
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin?next=/admin/funnels/${encodeURIComponent(funnelId)}`);
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();

  const data = await getAdminFunnel(user.id, funnelId);
  const { funnel } = data;
  const tab = normalizeTab(selectedTab);
  const selectedStep = funnel.steps.find((step) => step.id === selectedStepId) ?? funnel.steps[0] ?? null;
  const stepHierarchy = buildFunnelStepHierarchy(funnel.steps);
  const experimentStep = selectedStep
    ? funnelExperimentContainerForStep(funnel.steps, selectedStep)
    : null;
  const experimentVariants = experimentStep
    ? stepHierarchy.find(({ step }) => step.id === experimentStep.id)?.children ?? []
    : [];
  const selectedStepChildren = selectedStep
    ? stepHierarchy.find(({ step }) => step.id === selectedStep.id)?.children ?? []
    : [];
  const selectedStepIsExperimentContainer = selectedStepChildren.length > 0;
  const workspaceTab = selectedStepIsExperimentContainer && tab === "configuration"
    ? "experiment"
    : tab;
  const configurationPagePromise = selectedStep && selectedStepChildren.length === 0
    ? getAdminFunnelPage(user.id, funnel.id, selectedStep.id, selectedPageId)
    : Promise.resolve(null);
  const experimentPagePromise = experimentStep
    ? getAdminFunnelPage(
      user.id,
      funnel.id,
      experimentStep.id,
      experimentStep.id === selectedStep?.id ? selectedPageId : undefined
    )
    : Promise.resolve(null);
  const [configurationPageData, experimentPageData, operations, catalogData] = await Promise.all([
    configurationPagePromise,
    experimentPagePromise,
    getAdminFunnelOperations(user.id, funnel.id),
    listNativeWorkbookCatalog({ userId: user.id }).catch(() => ({ workbooks: [] }))
  ]);
  const catalog = catalogData.workbooks;
  const topStep = funnel.steps.find((step) => step.isTopOfFunnel);
  const funnelPublicPath = topStep?.routePath ?? topStep?.publicPath ?? funnel.publicPath;
  const selectedStepHasManagedEditor = Boolean(
    selectedStep &&
    selectedStepChildren.length === 0 &&
    (
      configurationPageData?.page ||
      selectedStep.stepType === "order_form" ||
      selectedStep.sourceType === "generated" ||
      canImportLegacyFunnelPage(selectedStep)
    )
  );
  const selectedStepEditorHref = selectedStep && selectedStepHasManagedEditor
    ? (
      `/admin/funnels/${encodeURIComponent(funnel.slug)}/pages/${encodeURIComponent(selectedStep.id)}/edit` +
      (configurationPageData?.page ? `?page=${encodeURIComponent(configurationPageData.page.id)}` : "")
    )
    : null;
  const selectedStepPreviewHref = selectedStep && !selectedStepIsExperimentContainer
    ? selectedStep.previewPath ?? selectedStep.routePath ?? selectedStep.publicPath ?? null
    : null;

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-2 text-ink sm:px-6 sm:py-3 lg:px-8">
      <div className="mx-auto max-w-[1380px]">
        <header className="flex min-h-10 flex-wrap items-center justify-between gap-x-5 gap-y-2">
          <nav className="flex min-w-0 items-center gap-2 text-sm" aria-label="Breadcrumb">
            <Link
              href="/admin/funnels"
              className="shrink-0 font-semibold text-ink/48 transition hover:text-[#567b40]"
            >
              Funnels
            </Link>
            <span aria-hidden="true" className="text-ink/25">/</span>
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-[-0.025em] sm:text-xl">
              {funnel.name}
            </h1>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {funnelPublicPath ? (
              <a
                href={funnelPublicPath}
                className="inline-flex h-10 items-center justify-center rounded-[12px] border border-[#d8c7ae] bg-[#fffaf2] px-4 text-sm font-semibold text-[#74573e] transition hover:border-[#9a795c] hover:bg-white hover:text-[#4f3524]"
              >
                Open funnel ↗
              </a>
            ) : null}
            <FunnelSettingsDialog funnel={funnel} statuses={data.statuses} />
          </div>
        </header>

        {error ? (
          <p className="mt-5 rounded-[16px] border border-[#e0ac9f] bg-[#fff0eb] px-5 py-4 font-semibold text-[#8c4536]" role="alert">{error}</p>
        ) : null}

        <section className="mt-2 grid gap-5 lg:grid-cols-[350px_minmax(0,1fr)]">
          <aside className="rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-4 shadow-[0_8px_24px_rgba(79,54,34,.05)]">
            <h2 className="mb-4 text-2xl font-semibold tracking-[-0.04em]">Funnel steps</h2>

            <FunnelStepRail
              funnelId={funnel.id}
              funnelSlug={funnel.slug}
              initialSteps={funnel.steps}
              selectedStepId={selectedStep?.id ?? null}
            />

            <details className="mt-5 rounded-[18px] border border-dashed border-[#9f7c5e] bg-white">
              <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold marker:hidden">
                + Add step
              </summary>
              <form action={saveFunnelStepAction} className="border-t border-[#eadbc5] p-4">
                <StepFields funnelId={funnel.id} funnelSlug={funnel.slug} options={data} existingSteps={funnel.steps} catalog={catalog} />
                <div className="mt-5">
                  <FunnelSubmitButton label="Add draft step" pendingLabel="Adding…" />
                </div>
              </form>
            </details>
          </aside>

          <article className="min-w-0 overflow-hidden rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] shadow-[0_8px_24px_rgba(79,54,34,.05)]">
            {selectedStep ? (
              <>
                <header className="border-b border-[#eadbc5] px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-10 w-10 place-items-center rounded-[12px] border text-sm font-black ${STEP_TYPE_STYLES[selectedStep.stepType]}`}>
                        {funnel.steps.findIndex((step) => step.id === selectedStep.id) + 1}
                      </span>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-ink/42">{STEP_TYPE_LABELS[selectedStep.stepType]}</p>
                        <h2 className="mt-0.5 text-xl font-semibold tracking-[-0.035em] sm:text-[1.35rem]">{selectedStep.name}</h2>
                      </div>
                    </div>
                    {selectedStepPreviewHref ? (
                      <a
                        href={selectedStepPreviewHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cta-button cta-button--outline cta-button--small !min-h-10 !w-auto !rounded-[12px] !px-4 !py-2 text-sm"
                      >
                        Preview
                      </a>
                    ) : null}
                  </div>
                </header>

                <FunnelTabWorkspace
                  initialTab={workspaceTab}
                  selectedStepId={selectedStep.id}
                  experimentStepId={experimentStep?.id ?? selectedStep.id}
                  availableTabs={selectedStepIsExperimentContainer
                    ? ["experiment", "leads", "stats", "sales"]
                    : undefined}
                  panels={{
                    configuration: selectedStepIsExperimentContainer ? null : (
                      <>
                        <div className="p-5 sm:p-7">
                          <form
                            key={selectedStep.id}
                            action={saveFunnelStepAction}
                            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_196px]"
                          >
                            <div>
                              <StepFields funnelId={funnel.id} funnelSlug={funnel.slug} options={data} existingSteps={funnel.steps} step={selectedStep} catalog={catalog} />
                            </div>
                            <aside className="flex flex-wrap items-start gap-3 border-t border-[#eadbc5] pt-4 lg:flex-col lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                              <FunnelSubmitButton
                                label="Save"
                                pendingLabel="Saving…"
                                className="cta-button--small w-full justify-center"
                              />
                              {selectedStepEditorHref ? (
                                <>
                                  <a
                                    href={selectedStepEditorHref}
                                    className="cta-button cta-button--outline cta-button--small w-full justify-center"
                                  >
                                    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
                                      <path d="M4 14.8V17h2.2L15.6 7.6l-2.2-2.2L4 14.8Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                                      <path d="m12.3 6.5 2.2 2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                                    </svg>
                                    {selectedStep.stepType === "order_form"
                                      ? "Edit page"
                                      : configurationPageData?.page
                                      ? "Edit page"
                                      : canImportLegacyFunnelPage(selectedStep)
                                        ? "Import & edit"
                                        : "Create page"}
                                  </a>
                                  {selectedStep.stepType === "order_form" ? (
                                    <p className="w-full pt-1 text-center text-[11px] leading-4 text-ink/48">
                                      Edit the surrounding copy and layout. The product, order bumps, and secure checkout block stay protected.
                                    </p>
                                  ) : null}
                                  {configurationPageData?.page ? (
                                    <p className="w-full pt-1 text-center text-[11px] leading-4 text-ink/42">
                                      {configurationPageData.page.status === "published" ? "Published" : "Draft"} · revision {configurationPageData.page.latestRevisionNumber}
                                    </p>
                                  ) : null}
                                </>
                              ) : null}
                            </aside>
                          </form>
                          {!selectedStepEditorHref ? (
                            <p className="mt-5 text-sm leading-6 text-ink/52">
                              {configurationPageData
                                ? selectedStep.sourceType === "external"
                                  ? "This checkout destination is managed by the connected provider."
                                  : selectedStep.sourceType === "runtime"
                                    ? "This application screen depends on live customer or order data and is managed in the product."
                                    : "This is an application-owned interaction rather than a standalone content page."
                                : "This step routes visitors between its A/B variants. Edit the actual pages nested beneath it."}
                            </p>
                          ) : null}
                        </div>
                      </>
                    ),
                    experiment: experimentPageData ? (
                      <FunnelExperimentPanel
                        funnelId={funnel.id}
                        funnelSlug={funnel.slug}
                        stepId={experimentStep?.id ?? selectedStep.id}
                        data={experimentPageData}
                        codeBackedVariants={experimentVariants}
                        operations={operations}
                      />
                    ) : null,
                    leads: (
                      <FunnelOperationsPanel tab={"leads" as FunnelOperationsTab} funnelId={funnel.id} funnelSlug={funnel.slug} data={operations} />
                    ),
                    stats: (
                      <FunnelOperationsPanel tab={"stats" as FunnelOperationsTab} funnelId={funnel.id} funnelSlug={funnel.slug} data={operations} />
                    ),
                    sales: (
                      <FunnelOperationsPanel tab={"sales" as FunnelOperationsTab} funnelId={funnel.id} funnelSlug={funnel.slug} data={operations} />
                    )
                  }}
                />
              </>
            ) : (
              <div className="grid min-h-[420px] place-items-center p-8 text-center">
                <div>
                  <p className="text-2xl font-semibold">This funnel has no steps yet.</p>
                  <p className="mt-2 text-sm text-ink/55">Use “Add step” to build the customer journey.</p>
                </div>
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
