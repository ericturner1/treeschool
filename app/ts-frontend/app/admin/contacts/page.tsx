import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import { listAdminFunnelContacts } from "../../../lib/funnels/server";
import { getNativeWorkbookNavigation } from "../../../lib/native-workbooks/server";

function money(currency: string, cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default async function ContactsPage(props: { searchParams?: Promise<{ q?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/contacts");
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();
  const query = String(searchParams?.q ?? "").trim();
  const { contacts } = await listAdminFunnelContacts(user.id, query);

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-7 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/admin" className="flex items-center gap-1">
            <Image src="/tree-icon.png" alt="Treeschool" width={52} height={52} className="h-11 w-11 object-contain" />
            <span className="brand-logo text-[24px] font-semibold">treeschool</span>
          </Link>
          <Link href="/admin" className="cta-button cta-button--outline cta-button--small">Admin</Link>
        </header>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">Audience</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Contacts</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">A single view of people captured through lead forms, funnel checkout, and completed purchases.</p>
          </div>
          <form className="flex w-full max-w-md gap-2" action="/admin/contacts">
            <input name="q" defaultValue={query} placeholder="Search email, name, or tag" className="min-h-12 min-w-0 flex-1 rounded-[14px] border border-[#d8c5a8] bg-white px-4 outline-none focus:border-[#739655] focus:ring-4 focus:ring-[#739655]/15" />
            <button className="cta-button cta-button--dark cta-button--small" type="submit">Search</button>
          </form>
        </div>

        <section className="mt-6 overflow-hidden rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2]">
          <div className="flex items-center justify-between border-b border-[#eadcc7] px-5 py-4">
            <p className="font-semibold">{contacts.length} contact{contacts.length === 1 ? "" : "s"}</p>
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink/45">Newest activity first</span>
          </div>
          {contacts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                <thead className="bg-[#f3eadc] text-xs uppercase tracking-[0.08em] text-ink/55">
                  <tr><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Source funnels</th><th className="px-5 py-3">Tags</th><th className="px-5 py-3">Purchases</th><th className="px-5 py-3">Last activity</th></tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="border-t border-[#eadcc7] hover:bg-[#f7f1e8]">
                      <td className="px-5 py-4"><Link className="font-semibold text-[#54753e] underline-offset-4 hover:underline" href={`/admin/contacts/${contact.id}`}>{contact.firstName || contact.email}</Link>{contact.firstName ? <span className="mt-1 block text-xs text-ink/50">{contact.email}</span> : null}</td>
                      <td className="px-5 py-4"><span className="rounded-full bg-[#e9f1df] px-3 py-1 text-xs font-bold capitalize text-[#51703c]">{contact.status}</span></td>
                      <td className="max-w-64 px-5 py-4 text-ink/65">{contact.funnelNames.join(", ") || "—"}</td>
                      <td className="px-5 py-4 text-ink/60">{contact.tags.slice(0, 3).join(", ") || "—"}</td>
                      <td className="px-5 py-4"><span className="font-semibold">{contact.purchases}</span>{contact.revenue.length ? <span className="ml-2 text-xs text-ink/50">{contact.revenue.map((entry) => money(entry.currency, entry.amountCents)).join(" · ")}</span> : null}</td>
                      <td className="px-5 py-4 text-ink/60">{new Date(contact.lastSeenAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="px-6 py-14 text-center text-ink/55">No contacts match this search yet.</p>}
        </section>
      </div>
    </main>
  );
}
