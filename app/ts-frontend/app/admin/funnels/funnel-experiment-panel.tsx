import type {
  AdminFunnelOperations,
  AdminFunnelStep,
  AdminManagedFunnelPagePayload,
  FunnelExperimentGoal
} from "../../../lib/funnels/server";
import {
  completeFunnelExperimentAction,
  promoteFunnelExperimentWinnerAction,
  startFunnelExperimentAction,
  updateCodeFunnelExperimentAction
} from "./actions";
import { FunnelSubmitButton } from "./funnel-submit-button";

const GOAL_LABELS: Record<FunnelExperimentGoal, string> = {
  primary_cta_click: "Primary button click",
  secondary_cta_click: "Secondary button click",
  checkout_started: "Checkout started",
  purchase: "Purchase",
  thank_you_view: "Thank-you page reached"
};

function defaultWeights(count: number) {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(cents / 100);
}

export function FunnelExperimentPanel({
  funnelId,
  funnelSlug,
  stepId,
  data,
  codeBackedVariants = [],
  operations
}: {
  funnelId: string;
  funnelSlug: string;
  stepId: string;
  data: AdminManagedFunnelPagePayload;
  codeBackedVariants?: AdminFunnelStep[];
  operations: AdminFunnelOperations;
}) {
  const publishedPages = data.pages.filter(
    (page) => page.status === "published" && page.publishedRevisionNumber
  );
  const weights = defaultWeights(publishedPages.length);
  const experiment = data.experiment;
  const hasCodeBackedExperiment = !experiment && codeBackedVariants.length >= 2;
  const rawCodeSettings = data.step.settings.codeExperiment;
  const codeSettings = rawCodeSettings && typeof rawCodeSettings === "object"
    ? rawCodeSettings as Record<string, unknown>
    : {};
  const codeExperimentStatus = codeSettings.status === "paused" || codeSettings.status === "completed"
    ? codeSettings.status
    : "running";
  const codeWinnerStepId = typeof codeSettings.winnerStepId === "string"
    ? codeSettings.winnerStepId
    : null;
  const isRunning = experiment?.status === "running"
    || (hasCodeBackedExperiment && codeExperimentStatus === "running");
  const hasExistingExperiment = Boolean(experiment || hasCodeBackedExperiment);
  const codeBackedWeights = defaultWeights(codeBackedVariants.length);
  const stepStatsById = new Map(operations.stepStats.map((step) => [step.id, step]));
  const codeVariantStats = codeBackedVariants.map((variant, index) => ({
    variant,
    allocation: codeBackedWeights[index] ?? 0,
    stats: stepStatsById.get(variant.id) ?? {
      visitors: 0,
      pageViews: 0,
      primaryCtaClicks: 0,
      checkoutStarts: 0,
      purchases: 0,
      conversionRate: 0
    }
  }));
  const codeTotals = codeVariantStats.reduce((totals, { stats }) => ({
    visitors: totals.visitors + stats.visitors,
    ctaClicks: totals.ctaClicks + stats.primaryCtaClicks,
    checkoutStarts: totals.checkoutStarts + stats.checkoutStarts,
    purchases: totals.purchases + stats.purchases
  }), { visitors: 0, ctaClicks: 0, checkoutStarts: 0, purchases: 0 });

  return (
    <section className="border-t border-[#eadbc5] bg-white px-5 py-6 sm:px-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#665481]">
            Experiment
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
            A/B testing
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/58">
            Compare published page variants. Each visitor keeps the same variant,
            and the winning page can become the new control without losing history.
          </p>
        </div>
        {hasExistingExperiment ? (
          <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${
            isRunning
              ? "bg-[#e4f0d7] text-[#466534]"
              : "bg-[#eee7dc] text-ink/55"
          }`}>
            {experiment
              ? isRunning ? "Test running" : "Last test completed"
              : codeExperimentStatus === "running"
                ? "Test running"
                : codeExperimentStatus === "paused"
                  ? "Test paused"
                  : "Test completed"}
          </span>
        ) : null}
      </div>

      {experiment ? (
        <div className="mt-6 rounded-[20px] border border-[#d7cce5] bg-[#f7f4fb] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{experiment.name}</p>
              <p className="mt-1 text-sm text-ink/55">
                Goal: {GOAL_LABELS[experiment.goalEvent]} · {experiment.totals.visitors} visitors
              </p>
            </div>
            <div className="flex gap-4 text-sm">
              <span><strong>{experiment.totals.conversions}</strong> conversions</span>
              <span><strong>{experiment.totals.purchases}</strong> purchases</span>
              <span><strong>{formatMoney(experiment.totals.revenueCents)}</strong> revenue</span>
            </div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {experiment.variants.map((variant) => (
              <div key={variant.id} className="rounded-[16px] border border-[#d7cce5] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {variant.pageName}
                      {variant.isControl ? (
                        <span className="ml-2 rounded-full bg-[#eee7dc] px-2 py-1 text-[10px] uppercase tracking-wide text-ink/55">
                          Control
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">{variant.weight}% traffic</p>
                  </div>
                  <p className="text-2xl font-semibold text-[#665481]">{variant.conversionRate}%</p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <span className="rounded-xl bg-[#f6f2ec] px-2 py-2">
                    <strong className="block text-base">{variant.visitors}</strong>Visitors
                  </span>
                  <span className="rounded-xl bg-[#f6f2ec] px-2 py-2">
                    <strong className="block text-base">{variant.conversions}</strong>Conversions
                  </span>
                  <span className="rounded-xl bg-[#f6f2ec] px-2 py-2">
                    <strong className="block text-base">{variant.primaryCtaClicks}</strong>CTA clicks
                  </span>
                </div>
                {!isRunning ? (
                  <form action={promoteFunnelExperimentWinnerAction} className="mt-4">
                    <input type="hidden" name="funnelId" value={funnelId} />
                    <input type="hidden" name="funnelSlug" value={funnelSlug} />
                    <input type="hidden" name="stepId" value={stepId} />
                    <input type="hidden" name="experimentId" value={experiment.id} />
                    <input type="hidden" name="pageId" value={variant.pageId} />
                    <FunnelSubmitButton
                      label={variant.isPrimary ? "Current control" : "Promote to control"}
                      pendingLabel="Promoting…"
                      tone="outline"
                      disabled={variant.isPrimary}
                      confirmMessage={
                        variant.isPrimary
                          ? undefined
                          : `Make “${variant.pageName}” the control page?`
                      }
                    />
                  </form>
                ) : null}
              </div>
            ))}
          </div>
          {isRunning ? (
            <form action={completeFunnelExperimentAction} className="mt-5">
              <input type="hidden" name="funnelId" value={funnelId} />
              <input type="hidden" name="funnelSlug" value={funnelSlug} />
              <input type="hidden" name="stepId" value={stepId} />
              <input type="hidden" name="experimentId" value={experiment.id} />
              <FunnelSubmitButton
                label="Finish test and keep control"
                pendingLabel="Finishing…"
                tone="outline"
                confirmMessage="Finish this A/B test? Visitor assignments and results will be preserved."
              />
            </form>
          ) : null}
        </div>
      ) : null}

      {hasCodeBackedExperiment ? (
        <div className="mt-6 overflow-hidden rounded-[22px] border border-[#d7cce5] bg-[#f8f6fb]">
          <div className="border-b border-[#ded5e8] bg-white px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold">{data.step.name}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.08em] ${
                    codeExperimentStatus === "running"
                      ? "bg-[#e4f0d7] text-[#466534]"
                      : codeExperimentStatus === "paused"
                        ? "bg-[#fff0cf] text-[#805d22]"
                        : "bg-[#eee8f5] text-[#65577e]"
                  }`}>
                    {codeExperimentStatus}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-ink/55">
                  Goal: CTA selection · stable visitor assignment · 50/50 traffic split
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.step.publicPath ? (
                  <a href={data.step.publicPath} className="cta-button cta-button--outline cta-button--small">
                    Open live test ↗
                  </a>
                ) : null}
                {codeExperimentStatus === "running" ? (
                  <form action={updateCodeFunnelExperimentAction}>
                    <input type="hidden" name="funnelId" value={funnelId} />
                    <input type="hidden" name="funnelSlug" value={funnelSlug} />
                    <input type="hidden" name="stepId" value={stepId} />
                    <input type="hidden" name="experimentAction" value="pause" />
                    <FunnelSubmitButton
                      label="Pause test"
                      pendingLabel="Pausing…"
                      tone="outline"
                      confirmMessage="Pause the split test and send all visitors to the control page?"
                    />
                  </form>
                ) : codeExperimentStatus === "paused" ? (
                  <form action={updateCodeFunnelExperimentAction}>
                    <input type="hidden" name="funnelId" value={funnelId} />
                    <input type="hidden" name="funnelSlug" value={funnelSlug} />
                    <input type="hidden" name="stepId" value={stepId} />
                    <input type="hidden" name="experimentAction" value="resume" />
                    <FunnelSubmitButton label="Resume test" pendingLabel="Resuming…" tone="outline" />
                  </form>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-[#ded5e8] sm:grid-cols-4">
            {[
              ["Visitors", codeTotals.visitors],
              ["CTA clicks", codeTotals.ctaClicks],
              ["Checkout starts", codeTotals.checkoutStarts],
              ["Sales", codeTotals.purchases]
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-[#f8f6fb] px-5 py-4">
                <p className="text-[11px] font-black uppercase tracking-[.1em] text-ink/38">{label}</p>
                <p className="mt-1 text-3xl font-semibold tracking-[-.04em]">{value}</p>
              </div>
            ))}
          </div>

          <div className="p-5">
            <div className="overflow-x-auto rounded-[17px] border border-[#d7cce5] bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#f2eef7] text-[11px] font-black uppercase tracking-[.08em] text-ink/42">
                  <tr>
                    <th className="px-4 py-3">Variant</th>
                    <th>Traffic</th>
                    <th>Visitors</th>
                    <th>CTA clicks</th>
                    <th>CTA rate</th>
                    <th>Checkout</th>
                    <th>Sales</th>
                    <th className="pr-4 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {codeVariantStats.map(({ variant, allocation, stats }, index) => {
                    const ctaRate = stats.visitors > 0
                      ? Math.round((stats.primaryCtaClicks / stats.visitors) * 1000) / 10
                      : 0;
                    const isWinner = codeExperimentStatus === "completed" && codeWinnerStepId === variant.id;
                    return (
                      <tr key={variant.id} className="border-t border-[#eee7f3]">
                        <td className="px-4 py-4">
                          <strong className="block">{variant.name}</strong>
                          <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink/48">
                            {index === 0 ? "Control" : `Variant ${index + 1}`}
                            {isWinner ? (
                              <span className="rounded-full bg-[#e4f0d7] px-2 py-0.5 font-semibold text-[#466534]">Winner</span>
                            ) : null}
                          </span>
                        </td>
                        <td>{allocation}%</td>
                        <td>{stats.visitors}</td>
                        <td>{stats.primaryCtaClicks}</td>
                        <td className="font-semibold text-[#65577e]">{ctaRate}%</td>
                        <td>{stats.checkoutStarts}</td>
                        <td>{stats.purchases}</td>
                        <td className="pr-4">
                          <div className="flex justify-end gap-3">
                            {variant.previewPath || variant.publicPath ? (
                              <a
                                href={variant.previewPath ?? variant.publicPath ?? "#"}
                                className="font-semibold text-[#567b40] underline decoration-[#8cad75] underline-offset-4"
                              >
                                Preview ↗
                              </a>
                            ) : null}
                            {codeExperimentStatus !== "completed" ? (
                              <form action={updateCodeFunnelExperimentAction}>
                                <input type="hidden" name="funnelId" value={funnelId} />
                                <input type="hidden" name="funnelSlug" value={funnelSlug} />
                                <input type="hidden" name="stepId" value={stepId} />
                                <input type="hidden" name="experimentAction" value="complete" />
                                <input type="hidden" name="winnerStepId" value={variant.id} />
                                <FunnelSubmitButton
                                  label="Choose winner"
                                  pendingLabel="Finishing…"
                                  tone="outline"
                                  confirmMessage={`End the test and send all visitors to “${variant.name}”?`}
                                />
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {codeTotals.visitors === 0 ? (
              <p className="mt-4 rounded-[14px] border border-[#ded3e8] bg-white px-4 py-3 text-sm leading-6 text-ink/52">
                No in-app funnel results have been recorded yet. The test is live;
                historical page and CTA events for this original code-backed test remain
                available in Google Analytics.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!hasExistingExperiment ? (
        <details className="mt-6 rounded-[20px] border border-[#ded3c3] bg-[#fbf7f0]">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold marker:hidden">
            Start a new A/B test
          </summary>
          <form action={startFunnelExperimentAction} className="grid gap-5 border-t border-[#eadbc5] p-5">
            <input type="hidden" name="funnelId" value={funnelId} />
            <input type="hidden" name="funnelSlug" value={funnelSlug} />
            <input type="hidden" name="stepId" value={stepId} />
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                Test name
                <input
                  name="name"
                  required
                  defaultValue={`${data.step.name} test`}
                  className="ts-input"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Conversion goal
                <select name="goalEvent" defaultValue="primary_cta_click" className="ts-input">
                  {data.goals.map((goal) => (
                    <option key={goal} value={goal}>{GOAL_LABELS[goal]}</option>
                  ))}
                </select>
              </label>
            </div>

            {publishedPages.length >= 2 ? (
              <div className="grid gap-3">
                {publishedPages.map((page, index) => (
                  <label
                    key={page.id}
                    className="grid grid-cols-[auto_1fr_100px] items-center gap-3 rounded-[15px] border border-[#ded3c3] bg-white px-4 py-3"
                  >
                    <input
                      type="checkbox"
                      name="variantPageId"
                      value={page.id}
                      defaultChecked
                      className="h-5 w-5 accent-[#6f994f]"
                    />
                    <span className="text-sm font-semibold">
                      {page.name}
                      {page.isPrimary ? " · Control" : ""}
                    </span>
                    <span className="flex items-center gap-2 text-sm">
                      <input
                        type="number"
                        name={`weight-${page.id}`}
                        min={1}
                        max={100}
                        defaultValue={weights[index]}
                        className="ts-input !px-3 !py-2"
                      />
                      %
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-[15px] border border-[#dfcfb7] bg-white px-4 py-3 text-sm leading-6 text-ink/58">
                Publish at least two page variants before starting a test. Use the
                AI assistant or “Duplicate as variant” above to create one.
              </p>
            )}

            <div>
              <FunnelSubmitButton
                label="Start A/B test"
                pendingLabel="Starting test…"
                disabled={publishedPages.length < 2}
                confirmMessage="Start sending live visitors to these page variants?"
              />
              <p className="mt-3 text-xs leading-5 text-ink/48">
                Selected traffic percentages must total exactly 100%.
              </p>
            </div>
          </form>
        </details>
      ) : null}
    </section>
  );
}
