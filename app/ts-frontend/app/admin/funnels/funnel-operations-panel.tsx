import type { AdminFunnelOperations } from "../../../lib/funnels/server";
import {
  createFunnelTestSaleAction,
  deleteFunnelAutomationAction,
  saveFunnelAutomationAction
} from "./actions";
import { FunnelSubmitButton } from "./funnel-submit-button";

export type FunnelOperationsTab = "automation" | "stats" | "leads" | "sales";

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function FunnelOperationsPanel({
  tab,
  funnelId,
  funnelSlug,
  data
}: {
  tab: FunnelOperationsTab;
  funnelId: string;
  funnelSlug: string;
  data: AdminFunnelOperations;
}) {
  if (tab === "automation") {
    return (
      <section className="p-5 sm:p-7">
        <h3 className="text-2xl font-semibold tracking-[-0.04em]">Automation rules</h3>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          Start with dependable tagging rules. Tags appear on leads and customers without sending messages or changing purchases.
        </p>
        <div className="mt-6 grid gap-3">
          {data.automations.map((rule) => (
            <div key={rule.id} className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#ded3c3] bg-white p-4">
              <div>
                <p className="font-semibold">{rule.name}</p>
                <p className="mt-1 text-sm text-ink/52">
                  When {rule.triggerEvent === "purchase" ? "a purchase completes" : "a lead is captured"}, add “{rule.tag}”.
                </p>
              </div>
              <form action={deleteFunnelAutomationAction}>
                <input type="hidden" name="funnelId" value={funnelId} />
                <input type="hidden" name="funnelSlug" value={funnelSlug} />
                <input type="hidden" name="ruleId" value={rule.id} />
                <FunnelSubmitButton label="Delete" pendingLabel="Deleting…" tone="danger" confirmMessage={`Delete “${rule.name}”?`} />
              </form>
            </div>
          ))}
          {data.automations.length === 0 ? (
            <p className="rounded-[18px] border border-dashed border-[#cdbfa9] bg-white p-5 text-sm text-ink/52">No automation rules yet.</p>
          ) : null}
        </div>
        <form action={saveFunnelAutomationAction} className="mt-6 grid gap-4 rounded-[20px] border border-[#b9cfa5] bg-[#f1f7eb] p-5 sm:grid-cols-2">
          <input type="hidden" name="funnelId" value={funnelId} />
          <input type="hidden" name="funnelSlug" value={funnelSlug} />
          <label className="grid gap-2 text-sm font-semibold">
            Rule name
            <input name="name" required placeholder="Tag new curriculum leads" className="ts-input bg-white" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            When
            <select name="triggerEvent" defaultValue="lead_captured" className="ts-input bg-white">
              <option value="lead_captured">A lead is captured</option>
              <option value="purchase">A purchase completes</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Add tag
            <input name="tag" required placeholder="first-grade-lead" className="ts-input bg-white" />
          </label>
          <label className="flex items-center gap-3 self-end rounded-[14px] border border-[#cfddc1] bg-white px-4 py-3 text-sm font-semibold">
            <input type="checkbox" name="active" defaultChecked className="h-5 w-5 accent-[#6f994f]" />
            Active
          </label>
          <div className="sm:col-span-2"><FunnelSubmitButton label="Add automation" pendingLabel="Saving…" /></div>
        </form>
      </section>
    );
  }

  if (tab === "stats") {
    const maxViews = Math.max(1, ...data.daily.map((day) => day.pageViews));
    const cards = [
      ["Visitors", data.overview.visitors],
      ["Leads", data.overview.leads],
      ["Customers", data.overview.customers],
      ["Revenue", money(data.overview.revenueCents)],
      ["Visitor → lead", `${data.overview.visitorToLeadRate}%`],
      ["Visitor → customer", `${data.overview.visitorToCustomerRate}%`]
    ];
    return (
      <section className="p-5 sm:p-7">
        <div className="grid gap-3 sm:grid-cols-3">
          {cards.map(([label, value]) => (
            <div key={String(label)} className="rounded-[18px] border border-[#ded3c3] bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[.1em] text-ink/38">{label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-.04em]">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-[20px] border border-[#ded3c3] bg-white p-5">
          <h3 className="font-semibold">Last 30 days</h3>
          <div className="mt-5 flex h-36 items-end gap-1" aria-label="Daily page views over the last 30 days">
            {data.daily.map((day) => (
              <div key={day.date} className="group relative flex min-w-0 flex-1 items-end">
                <span
                  className="block w-full rounded-t bg-[#79a35b]"
                  style={{ height: `${Math.max(3, (day.pageViews / maxViews) * 100)}%` }}
                  title={`${day.date}: ${day.pageViews} page views, ${day.purchases} purchases`}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 overflow-x-auto rounded-[20px] border border-[#ded3c3] bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#f5efe6] text-xs uppercase tracking-[.08em] text-ink/45">
              <tr><th className="p-4">Step</th><th>Visitors</th><th>Views</th><th>Leads</th><th>Checkout</th><th>Sales</th><th>Conversion</th></tr>
            </thead>
            <tbody>
              {data.stepStats.map((step) => (
                <tr key={step.id} className="border-t border-[#eee2d1]">
                  <td className="p-4 font-semibold">{step.name}</td>
                  <td>{step.visitors}</td><td>{step.pageViews}</td><td>{step.leads}</td>
                  <td>{step.checkoutStarts}</td><td>{step.purchases}</td><td>{step.conversionRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (tab === "leads") {
    return (
      <section className="p-5 sm:p-7">
        <h3 className="text-2xl font-semibold tracking-[-0.04em]">Leads</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/52">
          {data.leads.length} recent contacts, newest first. Managed opt-in forms
          capture leads here, and funnel-attributed purchasers appear as customers.
        </p>
        <div className="mt-5 overflow-x-auto rounded-[20px] border border-[#ded3c3] bg-white">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-[#f5efe6] text-xs uppercase tracking-[.08em] text-ink/45">
              <tr><th className="p-4">Contact</th><th>Status</th><th>Tags</th><th>First step</th><th>Last activity</th></tr>
            </thead>
            <tbody>
              {data.leads.map((lead) => (
                <tr key={lead.id} className="border-t border-[#eee2d1]">
                  <td className="p-4"><strong className="block">{lead.firstName || "—"}</strong><span className="text-ink/55">{lead.email}</span></td>
                  <td className="capitalize">{lead.status}</td>
                  <td>{lead.tags.length ? lead.tags.join(", ") : "—"}</td>
                  <td>{lead.firstStepName ?? "—"}</td>
                  <td>{date(lead.lastSeenAt)}</td>
                </tr>
              ))}
              {data.leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-ink/45">
                    No contacts captured yet. A sales page without an email opt-in will
                    add someone here only after an attributed purchase.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-[-0.04em]">Sales</h3>
          <p className="mt-2 text-sm text-ink/52">{data.overview.purchases} orders · {money(data.overview.revenueCents)} revenue</p>
        </div>
        {data.testSalesEnabled ? (
          <form action={createFunnelTestSaleAction} className="flex items-end gap-2 rounded-[16px] border border-[#c9c2df] bg-[#f4eff9] p-3">
            <input type="hidden" name="funnelId" value={funnelId} />
            <input type="hidden" name="funnelSlug" value={funnelSlug} />
            <label className="grid gap-1 text-xs font-semibold">Test amount ($)<input name="amount" type="number" min="0" step=".01" defaultValue="27" className="ts-input !w-28 !px-3 !py-2" /></label>
            <FunnelSubmitButton label="Record local test sale" pendingLabel="Recording…" tone="outline" />
          </form>
        ) : null}
      </div>
      <div className="mt-5 overflow-x-auto rounded-[20px] border border-[#ded3c3] bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-[#f5efe6] text-xs uppercase tracking-[.08em] text-ink/45">
            <tr><th className="p-4">Date</th><th>Customer</th><th>Step</th><th>Order</th><th>Amount</th><th>Stripe session</th></tr>
          </thead>
          <tbody>
            {data.sales.map((sale) => (
              <tr key={sale.id} className="border-t border-[#eee2d1]">
                <td className="p-4">{date(sale.purchasedAt)}</td>
                <td>{sale.email ?? "—"}</td><td>{sale.stepName ?? "—"}</td>
                <td>{sale.test ? "Local test" : sale.orderKind}</td>
                <td className="font-semibold">{money(sale.amountTotalCents, sale.currency)}</td>
                <td className="max-w-48 truncate font-mono text-xs text-ink/50">{sale.checkoutSessionId}</td>
              </tr>
            ))}
            {data.sales.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-ink/45">No attributed sales yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
