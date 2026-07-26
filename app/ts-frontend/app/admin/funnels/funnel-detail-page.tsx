import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import { getNativeWorkbookNavigation } from "../../../lib/native-workbooks/server";
import { getFunnel, type FunnelStep } from "./funnel-definitions";

const STEP_STYLES: Record<NonNullable<FunnelStep["kind"]>, string> = {
  landing: "border-[#b9cfa5] bg-[#eef5e7] text-[#4f6f3c]",
  checkout: "border-[#dfcfb7] bg-[#faf3e8] text-[#795a3e]",
  offer: "border-[#c9c2df] bg-[#f2eef8] text-[#65577e]",
  fulfillment: "border-[#b8d2cd] bg-[#eaf5f2] text-[#3e6d65]"
};

export async function AdminFunnelDetailPage({ funnelId }: { funnelId: string }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin?next=/admin/funnels/${encodeURIComponent(funnelId)}`);
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();
  const funnel = getFunnel(funnelId);
  if (!funnel) notFound();

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-5">
          <Link href="/" className="flex items-center">
            <Image src="/tree-icon.png" alt="Treeschool tree icon" width={72} height={72} className="h-16 w-16 object-contain" />
            <span className="brand-logo text-[28px] font-semibold">treeschool</span>
          </Link>
          <Link href="/admin/funnels" className="cta-button cta-button--outline cta-button--small">All funnels</Link>
        </header>

        <article className="mt-10 rounded-[30px] border border-[#dcc8aa] bg-[#fffaf2] p-5 shadow-[0_14px_36px_rgba(79,54,34,.07)] sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full bg-[#e7f0df] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#4d6a39]">
                {funnel.status}
              </span>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">{funnel.name}</h1>
              <dl className="mt-6 grid gap-5 text-sm leading-6 sm:grid-cols-2">
                <div>
                  <dt className="font-black uppercase tracking-[0.08em] text-ink/42">Audience</dt>
                  <dd className="mt-1 text-ink/68">{funnel.audience}</dd>
                </div>
                <div>
                  <dt className="font-black uppercase tracking-[0.08em] text-ink/42">Objective</dt>
                  <dd className="mt-1 text-ink/68">{funnel.objective}</dd>
                </div>
              </dl>
            </div>
            <a href={funnel.landingHref} className="cta-button cta-button--outline cta-button--small shrink-0">
              Open top of funnel ↗
            </a>
          </div>

          <div className="mt-8 rounded-[20px] border border-[#c5d7b5] bg-[#edf5e7] px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#567b40]">Top of funnel</p>
            <a href={funnel.landingHref} className="mt-1 inline-block text-lg font-semibold text-[#416032] underline decoration-[#8daa75] underline-offset-4">
              {funnel.landingLabel} ↗
            </a>
            <p className="mt-1 break-all text-xs text-ink/48">{funnel.landingHref}</p>
          </div>

          <h2 className="mt-8 text-2xl font-semibold tracking-[-0.04em]">Complete journey</h2>
          <ol className="mt-4 grid gap-3">
            {funnel.steps.map((step, index) => (
              <li key={`${funnel.id}-${step.name}`} className="grid gap-3 rounded-[18px] border border-[#e3d5c0] bg-white px-4 py-4 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center">
                <span className={`grid h-10 w-10 place-items-center rounded-full border text-sm font-black ${STEP_STYLES[step.kind ?? "checkout"]}`}>
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold">{step.name}</p>
                  <p className="mt-1 text-sm leading-6 text-ink/58">{step.description}</p>
                </div>
                {step.href ? (
                  <a href={step.href} className="text-sm font-semibold text-[#567b40] underline underline-offset-4">
                    {step.linkLabel ?? "Open step"} ↗
                  </a>
                ) : (
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/35">Runtime step</span>
                )}
              </li>
            ))}
          </ol>
        </article>
      </div>
    </main>
  );
}
