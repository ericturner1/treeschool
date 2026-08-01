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
import { getNativeWorkbookNavigation } from "../../../lib/native-workbooks/server";
import {
  deleteFunnelStepAction,
  duplicateFunnelStepAction,
  saveFunnelStepAction
} from "./actions";
import { FunnelStepRail } from "./funnel-step-rail";
import { FunnelPageEditor } from "./funnel-page-editor";
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
  checkout: "Checkout",
  order_bump: "Order bump",
  upsell: "Upsell",
  downsell: "Downsell",
  thank_you: "Thank-you page",
  redirect: "Redirect",
  fulfillment: "Fulfillment"
};

const STEP_TYPE_STYLES: Record<AdminFunnelStepType, string> = {
  landing: "border-[#b9cfa5] bg-[#eef5e7] text-[#4f6f3c]",
  sales: "border-[#b9cfa5] bg-[#eef5e7] text-[#4f6f3c]",
  checkout: "border-[#dfcfb7] bg-[#faf3e8] text-[#795a3e]",
  order_bump: "border-[#d8bf94] bg-[#fbf1db] text-[#76552f]",
  upsell: "border-[#c9c2df] bg-[#f2eef8] text-[#65577e]",
  downsell: "border-[#c9c2df] bg-[#f2eef8] text-[#65577e]",
  thank_you: "border-[#b8d2cd] bg-[#eaf5f2] text-[#3e6d65]",
  redirect: "border-[#ccd2dc] bg-[#f0f2f5] text-[#586270]",
  fulfillment: "border-[#b8d2cd] bg-[#eaf5f2] text-[#3e6d65]"
};

function StepFields({
  funnelId,
  funnelSlug,
  options,
  step
}: {
  funnelId: string;
  funnelSlug: string;
  options: AdminFunnelOptions;
  step?: AdminFunnelStep;
}) {
  return (
    <>
      <input type="hidden" name="id" value={step?.id ?? ""} />
      <input type="hidden" name="funnelId" value={funnelId} />
      <input type="hidden" name="funnelSlug" value={funnelSlug} />
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Step name
          <input name="name" required defaultValue={step?.name ?? ""} placeholder="Sales page" className="ts-input" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Step slug
          <input name="slug" required defaultValue={step?.slug ?? ""} placeholder="sales-page" className="ts-input" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Step type
          <select name="stepType" defaultValue={step?.stepType ?? "landing"} className="ts-input">
            {options.stepTypes.map((type) => (
              <option key={type} value={type}>{STEP_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Status
          <select name="status" defaultValue={step?.status ?? "draft"} className="ts-input">
            {options.stepStatuses.map((status) => (
              <option key={status} value={status}>{status[0]?.toUpperCase()}{status.slice(1)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Page source
          <select name="sourceType" defaultValue={step?.sourceType ?? "code"} className="ts-input">
            {options.sourceTypes.map((source) => (
              <option key={source} value={source}>{source[0]?.toUpperCase()}{source.slice(1)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Source reference
          <input name="sourceRef" defaultValue={step?.sourceRef ?? ""} placeholder="Route, component, or external checkout ID" className="ts-input" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Public URL or path
          <input name="publicPath" defaultValue={step?.publicPath ?? ""} placeholder="/f/example or https://…" className="ts-input" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Admin preview URL or path
          <input name="previewPath" defaultValue={step?.previewPath ?? ""} placeholder="/admin/funnels/…/preview" className="ts-input" />
        </label>
        <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
          Description
          <textarea name="description" rows={3} defaultValue={step?.description ?? ""} placeholder="What happens at this step?" className="ts-input resize-y" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Link label
          <input name="linkLabel" defaultValue={step?.linkLabel ?? ""} placeholder="Open page" className="ts-input" />
        </label>
        <label className="flex items-center gap-3 self-end rounded-[15px] border border-[#d9cebd] bg-[#fbf7f0] px-4 py-3 text-sm font-semibold">
          <input type="checkbox" name="isTopOfFunnel" defaultChecked={step?.isTopOfFunnel ?? false} className="h-5 w-5 accent-[#6f994f]" />
          Make this the top of funnel
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
  message,
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
  const configurationPagePromise = selectedStep
    ? getAdminFunnelPage(user.id, funnel.id, selectedStep.id, selectedPageId)
    : Promise.resolve(null);
  const experimentPagePromise = experimentStep
    ? experimentStep.id === selectedStep?.id
      ? configurationPagePromise
      : getAdminFunnelPage(user.id, funnel.id, experimentStep.id)
    : Promise.resolve(null);
  const [configurationPageData, experimentPageData, operations] = await Promise.all([
    configurationPagePromise,
    experimentPagePromise,
    getAdminFunnelOperations(user.id, funnel.id)
  ]);
  const variantCount = funnel.steps.length - stepHierarchy.length;

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
            {funnel.publicPath ? (
              <a
                href={funnel.publicPath}
                className="inline-flex h-10 items-center justify-center rounded-[12px] border border-[#d8c7ae] bg-[#fffaf2] px-4 text-sm font-semibold text-[#74573e] transition hover:border-[#9a795c] hover:bg-white hover:text-[#4f3524]"
              >
                Open funnel ↗
              </a>
            ) : null}
            <FunnelSettingsDialog funnel={funnel} statuses={data.statuses} />
          </div>
        </header>

        {message ? (
          <p className="mt-5 rounded-[16px] border border-[#b8cf9f] bg-[#edf5e7] px-5 py-4 font-semibold text-[#4d6a39]" role="status">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-[16px] border border-[#e0ac9f] bg-[#fff0eb] px-5 py-4 font-semibold text-[#8c4536]" role="alert">{error}</p>
        ) : null}

        <section className="mt-2 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] p-4 shadow-[0_12px_32px_rgba(79,54,34,.06)] sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#567b40]">Journey</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">Funnel steps</h2>
              </div>
              <span className="rounded-full bg-[#efe7d9] px-3 py-1 text-xs font-semibold text-ink/55">
                {stepHierarchy.length} steps{variantCount > 0 ? ` · ${variantCount} variants` : ""}
              </span>
            </div>

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
                <StepFields funnelId={funnel.id} funnelSlug={funnel.slug} options={data} />
                <div className="mt-5">
                  <FunnelSubmitButton label="Add draft step" pendingLabel="Adding…" />
                </div>
              </form>
            </details>
          </aside>

          <article className="min-w-0 rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] shadow-[0_12px_32px_rgba(79,54,34,.06)]">
            {selectedStep ? (
              <>
                <header className="border-b border-[#eadbc5] px-5 py-5 sm:px-7">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-11 w-11 place-items-center rounded-[14px] border text-sm font-black ${STEP_TYPE_STYLES[selectedStep.stepType]}`}>
                        {funnel.steps.findIndex((step) => step.id === selectedStep.id) + 1}
                      </span>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.1em] text-ink/40">{STEP_TYPE_LABELS[selectedStep.stepType]}</p>
                        <h2 className="mt-0.5 text-2xl font-semibold tracking-[-0.04em]">{selectedStep.name}</h2>
                      </div>
                    </div>
                    {selectedStep.previewPath || selectedStep.publicPath ? (
                      <a href={selectedStep.previewPath ?? selectedStep.publicPath ?? "#"} className="cta-button cta-button--outline cta-button--small">
                        Preview step ↗
                      </a>
                    ) : null}
                  </div>
                </header>

                <FunnelTabWorkspace
                  initialTab={tab}
                  selectedStepId={selectedStep.id}
                  experimentStepId={experimentStep?.id ?? selectedStep.id}
                  selectedPageId={selectedPageId}
                  panels={{
                    configuration: (
                      <>
                        <form action={saveFunnelStepAction} className="p-5 sm:p-7">
                          <StepFields funnelId={funnel.id} funnelSlug={funnel.slug} options={data} step={selectedStep} />
                          <div className="mt-6 flex flex-wrap items-center gap-3">
                            <FunnelSubmitButton label="Save step" />
                          </div>
                        </form>
                        {configurationPageData ? (
                          <FunnelPageEditor
                            funnelId={funnel.id}
                            funnelSlug={funnel.slug}
                            step={selectedStep}
                            data={configurationPageData}
                          />
                        ) : null}
                        <footer className="flex flex-wrap gap-3 border-t border-[#eadbc5] bg-[#fbf6ed] px-5 py-5 sm:px-7">
                          <form action={duplicateFunnelStepAction}>
                            <input type="hidden" name="funnelId" value={funnel.id} />
                            <input type="hidden" name="funnelSlug" value={funnel.slug} />
                            <input type="hidden" name="stepId" value={selectedStep.id} />
                            <FunnelSubmitButton label="Duplicate as draft" pendingLabel="Duplicating…" tone="outline" />
                          </form>
                          <form action={deleteFunnelStepAction}>
                            <input type="hidden" name="funnelId" value={funnel.id} />
                            <input type="hidden" name="funnelSlug" value={funnel.slug} />
                            <input type="hidden" name="stepId" value={selectedStep.id} />
                            <FunnelSubmitButton
                              label="Delete step"
                              pendingLabel="Deleting…"
                              tone="danger"
                              confirmMessage={`Delete “${selectedStep.name}”? This cannot be undone.`}
                            />
                          </form>
                        </footer>
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
