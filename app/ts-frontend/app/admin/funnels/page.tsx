import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import { getNativeWorkbookNavigation } from "../../../lib/native-workbooks/server";
import { FUNNELS } from "./funnel-definitions";

export default async function AdminFunnelsPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/funnels");
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();

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
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#567b40]">Customer journeys</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Funnels</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-ink/65">
            Compare the active customer journeys, then open a funnel to inspect every page, decision, offer, and fulfillment step.
          </p>
        </section>

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
                  <th className="px-5 py-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eadbc5]">
                {FUNNELS.map((funnel) => (
                  <tr key={funnel.id} className="align-top transition hover:bg-[#fbf6ed]">
                    <td className="px-5 py-5">
                      <p className="font-semibold">{funnel.name}</p>
                      <p className="mt-1 max-w-xs text-xs leading-5 text-ink/48">{funnel.objective}</p>
                    </td>
                    <td className="max-w-[260px] px-5 py-5 text-sm leading-6 text-ink/62">{funnel.audience}</td>
                    <td className="px-5 py-5">
                      <a href={funnel.landingHref} className="text-sm font-semibold text-[#567b40] underline underline-offset-4">
                        {funnel.landingLabel} ↗
                      </a>
                      <p className="mt-1 max-w-[230px] truncate text-xs text-ink/40">{funnel.landingHref}</p>
                    </td>
                    <td className="px-5 py-5 text-center text-lg font-semibold">{funnel.steps.length}</td>
                    <td className="px-5 py-5">
                      <span className="inline-flex whitespace-nowrap rounded-full bg-[#e7f0df] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#4d6a39]">
                        {funnel.status}
                      </span>
                    </td>
                    <td className="px-5 py-5 text-right">
                      <a href={`/admin/funnels/${funnel.id}`} className="cta-button cta-button--outline cta-button--small whitespace-nowrap">
                        View funnel
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
