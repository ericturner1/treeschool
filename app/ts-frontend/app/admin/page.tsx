import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "../../lib/auth/server";
import { getAdminDashboardMetrics, type AdminDashboardMetrics } from "../../lib/admin/server";
import { getNativeWorkbookNavigation } from "../../lib/native-workbooks/server";

function money(currency: string, cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2
  }).format(cents / 100);
}

function orderLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function MetricCard({
  label,
  value,
  detail,
  visualization
}: {
  label: string;
  value: string;
  detail: string;
  visualization?: ReactNode;
}) {
  return (
    <article className="flex min-h-48 flex-col rounded-[24px] border border-[#ddd2c1] bg-white p-5 shadow-[0_10px_28px_rgba(78,61,43,.045)]">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/48">{label}</p>
      <p className="mt-4 text-4xl font-semibold tracking-[-0.055em] text-ink">{value}</p>
      <p className="mt-3 text-sm leading-5 text-ink/58">{detail}</p>
      {visualization ? <div className="mt-auto pt-5">{visualization}</div> : null}
    </article>
  );
}

function BarChart({ values, label }: { values: number[]; label: string }) {
  const chartValues = values.length ? values : [0, 0, 0, 0, 0];
  const maximum = Math.max(...chartValues, 1);
  return (
    <div className="flex h-12 items-end gap-1.5" role="img" aria-label={label}>
      {chartValues.map((value, index) => (
        <span
          key={`${index}-${value}`}
          className="flex-1 rounded-t-[5px] bg-[#82a862]"
          style={{ height: `${value ? Math.max(8, Math.round((value / maximum) * 100)) : 0}%` }}
        />
      ))}
    </div>
  );
}

function MetricTrack({ value, label }: { value: number; label: string }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div role="img" aria-label={`${label}: ${width.toFixed(1)}%`}>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#eee9e0]">
        <div className="h-full rounded-full bg-[#82a862]" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-2 text-[11px] font-semibold text-ink/45">{label}</p>
    </div>
  );
}

function SubscriptionChart({ active, trialing, canceling }: { active: number; trialing: number; canceling: number }) {
  const values = [active, trialing, canceling];
  const maximum = Math.max(...values, 1);
  const labels = ["Active", "Trialing", "Canceling"];
  return (
    <div className="grid grid-cols-3 gap-3" role="img" aria-label={`${active} active, ${trialing} trialing, ${canceling} canceling subscriptions`}>
      {values.map((value, index) => (
        <div key={labels[index]}>
          <div className="flex h-9 items-end rounded-[7px] bg-[#f2eee7] px-1.5">
            <span className="w-full rounded-t-[4px] bg-[#82a862]" style={{ height: `${value ? Math.max(6, Math.round((value / maximum) * 100)) : 0}%` }} />
          </div>
          <p className="mt-1.5 text-center text-[10px] font-semibold text-ink/45">{labels[index]}</p>
        </div>
      ))}
    </div>
  );
}

function ConversionFunnel({ visitors, leads, customers }: { visitors: number; leads: number; customers: number }) {
  const rows = [
    ["Visitors", visitors],
    ["Leads", leads],
    ["Customers", customers]
  ] as const;
  const maximum = Math.max(visitors, leads, customers, 1);
  return (
    <div className="space-y-2" role="img" aria-label={`${visitors} visitors, ${leads} leads, ${customers} customers`}>
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[68px_1fr_30px] items-center gap-2">
          <span className="text-[10px] font-semibold text-ink/45">{label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-[#eee9e0]">
            <span className="block h-full rounded-full bg-[#82a862]" style={{ width: `${Math.max(value ? 5 : 0, Math.round((value / maximum) * 100))}%` }} />
          </span>
          <span className="text-right text-[10px] font-bold text-ink/55">{value}</span>
        </div>
      ))}
    </div>
  );
}

function BusinessSnapshot({ metrics }: { metrics: AdminDashboardMetrics }) {
  const windowLabel = `${metrics.windowDays} days`;
  const recentSaleAmounts = metrics.sales.recent
    .filter((sale) => sale.currency === metrics.sales.currency)
    .slice(0, 6)
    .reverse()
    .map((sale) => sale.amountTotalCents);
  const newUserShare = metrics.users.total > 0
    ? (metrics.users.newInWindow / metrics.users.total) * 100
    : 0;
  return (
    <section className="mt-8" aria-label="Business metrics">
      <p className="mb-3 text-right text-xs text-ink/45">Live data · trailing {windowLabel}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Monthly recurring revenue"
          value={money(metrics.mrr.currency, metrics.mrr.amountCents)}
          detail="Current monthly equivalent of active memberships, including additional student seats."
        />
        <MetricCard
          label={`Sales · ${windowLabel}`}
          value={money(metrics.sales.currency, metrics.sales.revenueCents)}
          detail={`${metrics.sales.count.toLocaleString()} paid ${metrics.sales.count === 1 ? "order" : "orders"} · ${money(metrics.sales.currency, metrics.sales.averageOrderValueCents)} average order value`}
          visualization={<BarChart values={recentSaleAmounts} label="Amounts of the six most recent sales" />}
        />
        <MetricCard
          label="Active subscriptions"
          value={metrics.subscriptions.active.toLocaleString()}
          detail={`${metrics.subscriptions.trialing.toLocaleString()} trialing · ${metrics.subscriptions.canceling.toLocaleString()} set to cancel`}
          visualization={<SubscriptionChart {...metrics.subscriptions} />}
        />
        <MetricCard
          label={`Churn · ${windowLabel}`}
          value={metrics.churn.rate == null ? "—" : `${metrics.churn.rate.toFixed(1)}%`}
          detail={metrics.churn.rate == null
            ? "No subscriber base yet, so churn cannot be calculated."
            : `${metrics.churn.canceled.toLocaleString()} ${metrics.churn.canceled === 1 ? "subscription" : "subscriptions"} canceled during the period.`}
          visualization={<MetricTrack value={metrics.churn.rate ?? 0} label="Share of subscriber base canceled" />}
        />
        <MetricCard
          label="Registered users"
          value={metrics.users.total.toLocaleString()}
          detail={`${metrics.users.newInWindow.toLocaleString()} new in ${windowLabel} · ${metrics.users.accounts.toLocaleString()} family accounts`}
          visualization={<MetricTrack value={newUserShare} label="Share of users added this period" />}
        />
        <MetricCard
          label={`Funnel conversion · ${windowLabel}`}
          value={metrics.funnelConversion.rate == null ? "—" : `${metrics.funnelConversion.rate.toFixed(1)}%`}
          detail={`${metrics.funnelConversion.customers.toLocaleString()} customers from ${metrics.funnelConversion.visitors.toLocaleString()} unique landing-page visitors · ${metrics.leads.newInWindow.toLocaleString()} new leads`}
          visualization={<ConversionFunnel visitors={metrics.funnelConversion.visitors} leads={metrics.leads.newInWindow} customers={metrics.funnelConversion.customers} />}
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eadcc7] px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-lg font-semibold tracking-[-0.025em]">Recent sales</h3>
            <p className="mt-0.5 text-xs text-ink/48">Latest paid checkouts, excluding test and refunded orders.</p>
          </div>
          <Link href="/admin/funnels" className="text-sm font-semibold text-[#567b40] hover:underline">View funnel sales →</Link>
        </div>
        {metrics.sales.recent.length ? (
          <div className="divide-y divide-[#eadcc7]">
            {metrics.sales.recent.map((sale) => (
              <div key={sale.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{sale.email || "Customer email unavailable"}</p>
                  <p className="mt-1 text-xs text-ink/48">{orderLabel(sale.orderKind)}</p>
                </div>
                <p className="text-sm font-semibold">{money(sale.currency, sale.amountTotalCents)}</p>
                <time className="text-xs text-ink/45" dateTime={sale.purchasedAt}>
                  {new Date(sale.purchasedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-6 py-8 text-sm text-ink/50">No paid sales have been recorded in the last {windowLabel}.</p>
        )}
      </div>
    </section>
  );
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin");
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();
  const metrics = await getAdminDashboardMetrics(user.id).catch(() => null);

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header><p className="text-xs font-black uppercase tracking-[0.14em] text-[#567b40]">Treeschool administration</p><h1 className="mt-2 text-[36px] font-semibold tracking-[-0.055em]">Business dashboard</h1></header>

        {metrics ? <BusinessSnapshot metrics={metrics} /> : (
          <section className="mt-8 rounded-[22px] border border-[#e5c2b7] bg-[#fff3ee] px-5 py-4 text-sm text-[#8e4436]">
            Business metrics are temporarily unavailable. Administration tools remain available below.
          </section>
        )}
      </div>
    </main>
  );
}
