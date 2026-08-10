import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/server";
import { getAdminFunnelContact } from "../../../../lib/funnels/server";
import { getNativeWorkbookNavigation } from "../../../../lib/native-workbooks/server";
import { saveContactAction } from "../actions";

function money(currency: string, cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

const FIELD = "min-h-12 w-full rounded-[14px] border border-[#d8c5a8] bg-white px-4 py-3 outline-none focus:border-[#739655] focus:ring-4 focus:ring-[#739655]/15";

export default async function ContactDetailPage(
  props: { params: Promise<{ contactId: string }>; searchParams?: Promise<{ message?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin?next=/admin/contacts/${encodeURIComponent(params.contactId)}`);
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();
  const { contact } = await getAdminFunnelContact(user.id, params.contactId).catch(() => notFound());

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-7 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/admin" className="flex items-center gap-1"><Image src="/tree-icon.png" alt="Treeschool" width={52} height={52} className="h-11 w-11 object-contain" /><span className="brand-logo text-[24px] font-semibold">treeschool</span></Link>
          <Link href="/admin/contacts" className="cta-button cta-button--outline cta-button--small">All contacts</Link>
        </header>
        <div className="mt-8">
          <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">Contact</p>
          <h1 className="mt-1 break-all text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">{contact.firstName || contact.email}</h1>
          {contact.firstName ? <p className="mt-2 text-ink/55">{contact.email}</p> : null}
        </div>
        {searchParams?.message ? <p className="mt-5 rounded-[14px] border border-[#b9d19f] bg-[#edf5e5] px-4 py-3 text-sm font-semibold text-[#4e6e39]">{searchParams.message}</p> : null}
        {searchParams?.error ? <p className="mt-5 rounded-[14px] border border-[#dfad9f] bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#8d4537]">{searchParams.error}</p> : null}

        <form action={saveContactAction} className="mt-6 grid gap-5 rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:grid-cols-2 sm:p-7">
          <input type="hidden" name="contactId" value={contact.id} />
          <label className="grid gap-2 text-sm font-semibold">Email<input value={contact.email} readOnly className={`${FIELD} bg-[#f1ece4] text-ink/55`} /></label>
          <label className="grid gap-2 text-sm font-semibold">First name<input name="firstName" defaultValue={contact.firstName ?? ""} className={FIELD} /></label>
          <label className="grid gap-2 text-sm font-semibold">Status<select name="status" defaultValue={contact.status} className={FIELD}><option value="lead">Lead</option><option value="customer">Customer</option><option value="unsubscribed">Unsubscribed</option></select></label>
          <label className="grid gap-2 text-sm font-semibold">Tags <span className="font-normal text-ink/45">comma separated</span><input name="tags" defaultValue={contact.tags.join(", ")} className={FIELD} /></label>
          <div className="flex flex-wrap gap-5 text-sm text-ink/55 sm:col-span-2"><span>First seen <strong className="text-ink">{new Date(contact.firstSeenAt).toLocaleString()}</strong></span><span>Last active <strong className="text-ink">{new Date(contact.lastSeenAt).toLocaleString()}</strong></span></div>
          <div className="sm:col-span-2"><button className="cta-button cta-button--light" type="submit">Save contact</button></div>
        </form>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:p-6"><h2 className="text-2xl font-semibold tracking-[-0.035em]">Sources</h2><div className="mt-4 grid gap-3">{contact.sources.map((source) => <article key={source.id} className="rounded-[16px] border border-[#e4d5c0] bg-white p-4"><div className="flex justify-between gap-3"><strong>{source.funnelName}</strong><span className="text-xs capitalize text-ink/50">{source.status}</span></div><p className="mt-2 text-sm text-ink/55">{source.firstStepName || "Funnel entry"} → {source.lastStepName || "Latest activity"}</p><p className="mt-2 text-xs text-ink/40">Last seen {new Date(source.lastSeenAt).toLocaleString()}</p></article>)}</div></section>
          <section className="rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:p-6"><h2 className="text-2xl font-semibold tracking-[-0.035em]">Payments</h2><div className="mt-4 grid gap-3">{contact.sales.length ? contact.sales.map((sale) => <article key={sale.id} className="rounded-[16px] border border-[#e4d5c0] bg-white p-4"><div className="flex justify-between gap-3"><strong>{money(sale.currency, sale.amountTotalCents)}</strong><span className="text-xs capitalize text-ink/50">{sale.status}</span></div><p className="mt-2 text-sm text-ink/60">{sale.funnelName} · {sale.stepName || sale.orderKind}</p><p className="mt-2 text-xs text-ink/40">{new Date(sale.purchasedAt).toLocaleString()}{sale.test ? " · test" : ""}</p></article>) : <p className="py-10 text-center text-ink/50">No purchases yet.</p>}</div></section>
        </div>
      </div>
    </main>
  );
}
