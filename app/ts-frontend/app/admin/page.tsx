import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/server";
import { getNativeWorkbookNavigation } from "../../lib/native-workbooks/server";

const ADMIN_SECTIONS = [
  {
    href: "/admin/blog" as const,
    title: "Blog",
    description: "Write, review, optimize, and publish search-focused Treeschool articles.",
    status: "Available"
  },
  {
    href: "/admin/workbooks" as const,
    title: "Workbooks",
    description: "Upload, pre-index, publish, and manage Treeschool-native workbooks.",
    status: "Available"
  }
];

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin");
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
          <Link href="/p/dashboard" className="cta-button cta-button--outline cta-button--small">Parent dashboard</Link>
        </header>

        <section className="mt-10 rounded-[32px] border border-[#b8cf9f] bg-[#e8f0e1] px-6 py-8 sm:px-9 sm:py-10">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#567b40]">System administration</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Admin</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink/65">Manage Treeschool’s catalog and future operational tools from one private workspace.</p>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">Administration areas</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ADMIN_SECTIONS.map((section) => (
              <Link key={section.href} href={section.href} className="group flex min-h-56 flex-col rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] p-6 transition hover:-translate-y-1 hover:border-[#9eb889] hover:shadow-[0_18px_42px_rgba(72,99,56,0.12)]">
                <span className="self-start rounded-full bg-[#eef5e4] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.11em] text-[#4d6a39]">{section.status}</span>
                <h3 className="mt-5 text-2xl font-semibold leading-tight tracking-[-0.035em]">{section.title}</h3>
                <p className="mt-3 text-sm leading-6 text-ink/60">{section.description}</p>
                <span className="mt-auto pt-6 text-sm font-semibold text-[#567b40] group-hover:underline">Open section →</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
