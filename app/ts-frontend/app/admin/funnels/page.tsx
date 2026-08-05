import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import { listAdminFunnels } from "../../../lib/funnels/server";
import { getNativeWorkbookNavigation } from "../../../lib/native-workbooks/server";
import { saveFunnelAction } from "./actions";
import { FunnelSubmitButton } from "./funnel-submit-button";

export default async function AdminFunnelsPage({
  searchParams
}: {
  searchParams?: { error?: string; message?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/funnels");
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();
  const data = await listAdminFunnels(user.id);

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-5">
          <Link href="/" className="flex items-center">
            <Image src="/tree-icon.png" alt="Treeschool tree icon" width={72} height={72} className="h-16 w-16 object-contain" />
            <span className="brand-logo text-[28px] font-semibold">treeschool</span>
          </Link>
          <Link href="/admin" className="cta-button cta-button--outline cta-button--small">Back to Admin</Link>
        </header>

        <section className="mt-10 rounded-[32px] border border-[#b8cf9f] bg-[#e8f0e1] px-6 py-8 sm:px-9 sm:py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#567b40]">Customer journeys</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Funnels</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-ink/65">
                Build and sequence each journey from its first public page through checkout, offers, and fulfillment.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white/75 px-4 py-2 text-xs font-semibold text-[#4d6a39]">
              {data.funnels.length} {data.funnels.length === 1 ? "funnel" : "funnels"}
            </span>
          </div>
        </section>

        {searchParams?.error ? (
          <p className="mt-6 rounded-[18px] border border-[#e0ac9f] bg-[#fff0eb] px-5 py-4 font-semibold text-[#8c4536]" role="alert">
            {searchParams.error}
          </p>
        ) : null}

        <details className="mt-8 rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] shadow-[0_10px_28px_rgba(79,54,34,.06)]">
          <summary className="cursor-pointer list-none px-6 py-5 text-lg font-semibold marker:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e7f0df] text-[#567b40]" aria-hidden="true">+</span>
              Create a funnel
            </span>
          </summary>
          <form action={saveFunnelAction} className="grid gap-5 border-t border-[#eadbc5] px-6 py-6 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Funnel name
              <input name="name" required placeholder="Japanese beginner course" className="ts-input" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Admin URL slug
              <input name="slug" required placeholder="japanese-beginner-course" className="ts-input" />
            </label>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
              Audience
              <textarea name="audience" rows={2} placeholder="Who this funnel is designed for" className="ts-input resize-y" />
            </label>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
              Objective
              <textarea name="objective" rows={2} placeholder="What successful customers should do" className="ts-input resize-y" />
            </label>
            <input type="hidden" name="status" value="draft" />
            <div className="sm:col-span-2">
              <FunnelSubmitButton label="Create draft funnel" pendingLabel="Creating…" />
            </div>
          </form>
        </details>

        <section className="mt-8 overflow-hidden rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] shadow-[0_14px_36px_rgba(79,54,34,.07)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left">
              <thead className="bg-[#efe6d7] text-[10px] font-black uppercase tracking-[0.11em] text-ink/48">
                <tr>
                  <th className="px-5 py-4">Funnel</th>
                  <th className="px-5 py-4">Audience</th>
                  <th className="px-5 py-4">Top of funnel</th>
                  <th className="px-5 py-4 text-center">Steps</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eadbc5]">
                {data.funnels.map((funnel) => {
                  const topStep = funnel.steps.find((step) => step.isTopOfFunnel);
                  const topPath = topStep?.routePath ?? topStep?.publicPath ?? funnel.publicPath;
                  return (
                    <tr key={funnel.id} className="align-top transition hover:bg-[#fbf6ed]">
                      <td className="px-5 py-5">
                        <p className="font-semibold">{funnel.name}</p>
                        <p className="mt-1 max-w-xs text-xs leading-5 text-ink/48">{funnel.objective || "No objective entered yet."}</p>
                      </td>
                      <td className="max-w-[260px] px-5 py-5 text-sm leading-6 text-ink/62">
                        {funnel.audience || "Not specified"}
                      </td>
                      <td className="px-5 py-5">
                        {topPath ? (
                          <>
                            <a href={topPath} className="text-sm font-semibold text-[#567b40] underline underline-offset-4">
                              {topStep?.name ?? "Open landing page"} ↗
                            </a>
                            <p className="mt-1 max-w-[230px] truncate text-xs text-ink/40">{topPath}</p>
                          </>
                        ) : (
                          <span className="text-sm text-ink/40">Not assigned</span>
                        )}
                      </td>
                      <td className="px-5 py-5 text-center text-lg font-semibold">{funnel.steps.length}</td>
                      <td className="px-5 py-5">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] ${
                          funnel.status === "live"
                            ? "bg-[#e7f0df] text-[#4d6a39]"
                            : "bg-[#eee7dc] text-ink/52"
                        }`}>
                          {funnel.status}
                        </span>
                      </td>
                      <td className="px-5 py-5 text-right">
                        <Link href={`/admin/funnels/${encodeURIComponent(funnel.slug)}`} className="cta-button cta-button--outline cta-button--small whitespace-nowrap">
                          Manage funnel
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
