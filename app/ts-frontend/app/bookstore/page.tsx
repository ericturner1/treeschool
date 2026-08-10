import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/server";
import { listNativeWorkbookCatalog } from "../../lib/native-workbooks/server";
import { formatNativeWorkbookGradeRange } from "../../lib/native-workbooks/grades";
import { BookstoreCatalog } from "./bookstore-catalog";

export const metadata: Metadata = {
  title: "Printable Elementary Homeschool Workbooks for Grades K–4 | Treeschool",
  description: "Browse printable elementary homeschool workbooks for grades K–4 by grade and subject, designed for Treeschool's paper-first homeschooling program."
};

type Props = { searchParams?: Promise<{ grade?: string; subject?: string; checkout?: string; error?: string }> };

export default async function BookstorePage(props: Props) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const rawGrade = searchParams?.grade;
  const grade = rawGrade == null || rawGrade === "" ? null : Number(rawGrade);
  const { workbooks } = await listNativeWorkbookCatalog({ userId: user?.id, grade, subject: searchParams?.subject });
  const all = await listNativeWorkbookCatalog({ userId: user?.id, grade: null, subject: null });
  const subjects = Array.from(new Set(all.workbooks.map((workbook) => workbook.subjectLabel))).sort();
  const grades = Array.from(new Set(all.workbooks.flatMap((workbook) =>
    Array.from(
      { length: workbook.gradeMax - workbook.gradeMin + 1 },
      (_, index) => workbook.gradeMin + index
    )
  ))).sort((a, b) => a - b);

  return (
    <main className="min-h-screen bg-[#f8f1e4] text-ink">
      <header className="border-b border-[#e4d4bb] bg-[#fffaf2]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3"><Image src="/tree-icon.png" alt="" width={64} height={64} className="h-14 w-14 object-contain" /><span className="brand-logo text-[26px] font-semibold leading-none">treeschool</span></Link>
          <nav id="bookstore-header-actions" className="flex items-center gap-3"><Link href="/pricing" className="hidden text-sm font-semibold text-ink/65 transition-colors hover:text-ink md:inline">Get our entire core curriculum for $20/month!</Link><Link href={user ? "/p/dashboard" : "/p/signin"} className="cta-button cta-button--light cta-button--small">{user ? "My dashboard" : "Sign in"}</Link></nav>
        </div>
      </header>

      <section className="border-b border-[#cbd9bd] bg-[#e8f0e1]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#567b40]">Grades K–4 · Treeschool Bookstore</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Printable elementary homeschool workbooks, ready to plan.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/68">Browse by grade or subject. Purchased books are emailed as PDFs and stay in your Treeschool account. Core books can be added directly with an active Treeschool membership.</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <form className="grid gap-3 rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-2 text-sm font-semibold">Grade<select name="grade" defaultValue={rawGrade ?? ""} className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12"><option value="">All grades</option>{grades.map((availableGrade) => <option key={availableGrade} value={availableGrade}>{formatNativeWorkbookGradeRange(availableGrade, availableGrade)}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-semibold">Subject<select name="subject" defaultValue={searchParams?.subject ?? ""} className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12"><option value="">All subjects</option>{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label>
          <button className="cta-button cta-button--dark cta-button--small">Browse</button>
        </form>

        {searchParams?.checkout === "canceled" ? <p className="mt-5 rounded-[14px] bg-[#f2e6d3] px-4 py-3 text-sm font-semibold text-earth">Checkout was canceled. Your cart is still here when you’re ready.</p> : null}
        {searchParams?.error ? <p role="alert" className="mt-5 rounded-[14px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">{searchParams.error}</p> : null}

        <BookstoreCatalog
          visibleWorkbooks={workbooks.map((workbook) => ({
            id: workbook.id,
            catalogKind: workbook.catalogKind,
            memberCount: workbook.memberCount,
            slug: workbook.slug,
            title: workbook.title,
            thumbnailUrl: workbook.thumbnailUrl,
            priceInCents: workbook.priceInCents,
            currencyCode: workbook.currencyCode,
            accessState: workbook.accessState
          }))}
          catalogWorkbooks={all.workbooks.map((workbook) => ({
            id: workbook.id,
            catalogKind: workbook.catalogKind,
            memberCount: workbook.memberCount,
            slug: workbook.slug,
            title: workbook.title,
            thumbnailUrl: workbook.thumbnailUrl,
            priceInCents: workbook.priceInCents,
            currencyCode: workbook.currencyCode,
            accessState: workbook.accessState
          }))}
          userEmail={user?.email ?? null}
        />
      </div>
    </main>
  );
}
