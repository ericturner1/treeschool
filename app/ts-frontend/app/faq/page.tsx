import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  FAQ_CATEGORY_LABELS,
  listPublishedSalesFaqs,
  type SalesFaq
} from "../../lib/faqs/server";

const SITE_URL = "https://www.treehomeschool.com";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Treeschool FAQ | Paper-First Homeschooling Questions Answered",
  description: "Straight answers about printing costs, screen time, curriculum choice, flexible schedules, grading, teachers, and using Treeschool for a parent-directed K–4 homeschool.",
  alternates: { canonical: `${SITE_URL}/faq` },
  openGraph: {
    title: "Treeschool FAQ: Is paper-first homeschooling practical?",
    description: "Printing costs, screen time, curriculum flexibility, falling behind, grading, and other honest answers for homeschool parents.",
    url: `${SITE_URL}/faq`,
    type: "website"
  }
};

function answerParagraphs(answer: string) {
  return answer.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function sourceLabel(url: string, index: number) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname === "pubmed.ncbi.nlm.nih.gov") return `Handwriting research ${index + 1} · PubMed`;
    return `Supporting source ${index + 1} · ${hostname}`;
  } catch {
    return `Supporting source ${index + 1}`;
  }
}

function FaqAnswer({ faq }: { faq: SalesFaq }) {
  return (
    <div className="mt-4 border-t border-[#e8d9bd] pt-4">
      <div className="space-y-4 text-[15px] leading-7 text-ink/68 sm:text-base">
        {answerParagraphs(faq.answer).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
      {faq.sourceLinks.length ? (
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Supporting evidence">
          {faq.sourceLinks.map((url, index) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[#c7d8b6] bg-[#f2f7ed] px-3 py-1.5 text-xs font-semibold text-[#4d6a39] transition hover:bg-[#e4efd9]"
            >
              {sourceLabel(url, index)} ↗
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default async function FaqPage() {
  const { faqs } = await listPublishedSalesFaqs().catch(() => ({ faqs: [] as SalesFaq[] }));
  const grouped = Array.from(new Set(faqs.map((faq) => faq.category))).map((category) => ({
    category,
    faqs: faqs.filter((faq) => faq.category === category)
  }));
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer.replace(/\n+/g, " ")
      }
    }))
  };

  return (
    <main className="min-h-screen bg-[#f8f1e4] text-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <header className="border-b border-[#ddccb2] bg-[#fffaf2]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center">
            <Image src="/tree-icon.png" alt="Treeschool tree icon" width={64} height={64} className="h-14 w-14 object-contain" />
            <span className="brand-logo text-[27px] font-semibold">treeschool</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm font-semibold text-ink/65" aria-label="Main navigation">
            <Link href="/bookstore" className="hidden hover:text-ink sm:inline">Bookstore</Link>
            <Link href="/pricing" className="cta-button cta-button--light cta-button--small">View plans</Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-[#c7d8b6] bg-[#e8f0e1] px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-[#567b40]">Straight answers for homeschool parents</p>
          <h1 className="mx-auto mt-4 max-w-4xl text-5xl font-semibold leading-[1.04] tracking-[-0.06em] sm:text-7xl">Practical questions deserve honest answers.</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-ink/68 sm:text-xl">
            Printing, screens, schedules, curriculum freedom, and the weeks when life does not go to plan—here is how Treeschool actually works.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {grouped.length ? (
          <div className="space-y-12">
            {grouped.map(({ category, faqs: categoryFaqs }) => (
              <section key={category} aria-labelledby={`faq-category-${category}`}>
                <div className="flex items-end justify-between gap-4">
                  <h2 id={`faq-category-${category}`} className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{FAQ_CATEGORY_LABELS[category] ?? "Questions"}</h2>
                  <span className="text-sm text-ink/42">{categoryFaqs.length} {categoryFaqs.length === 1 ? "answer" : "answers"}</span>
                </div>
                <div className="mt-5 space-y-4">
                  {categoryFaqs.map((faq, index) => (
                    <details
                      key={faq.id}
                      id={faq.slug}
                      open={index === 0 && category === grouped[0]?.category}
                      className="group scroll-mt-6 rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-5 shadow-[0_8px_20px_rgba(75,55,39,0.04)] sm:px-7"
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-5 text-xl font-semibold leading-7 tracking-[-0.025em] marker:content-none sm:text-2xl">
                        <span>{faq.question}</span>
                        <span aria-hidden="true" className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full bg-[#eef5e4] text-[#567b40] transition group-open:rotate-45">＋</span>
                      </summary>
                      <FaqAnswer faq={faq} />
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] px-6 py-14 text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.04em]">The answers are being prepared.</h2>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-ink/60">If you have a question now, contact us and we will answer it directly.</p>
            <Link href="/support" className="cta-button cta-button--light mt-6">Ask Treeschool</Link>
          </section>
        )}

        <section className="mt-14 rounded-[30px] bg-[#5d7f48] px-6 py-9 text-white sm:flex sm:items-center sm:justify-between sm:gap-8 sm:px-9">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-white/68">Still weighing it up?</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">See exactly what each Treeschool plan includes.</h2>
          </div>
          <Link href="/pricing" className="cta-button cta-button--light mt-6 flex-none sm:mt-0">Compare plans</Link>
        </section>
      </div>

      <footer className="bg-[#6f513e] text-[#f7eddf]">
        <div className="mx-auto grid w-full max-w-7xl gap-9 px-4 py-11 sm:px-6 md:grid-cols-[1.2fr_.8fr_.8fr] lg:px-8">
          <div>
            <div className="flex items-center">
              <Image src="/tree-icon.png" alt="" width={64} height={64} className="h-14 w-14 object-contain" />
              <span className="brand-logo text-[27px] font-semibold">treeschool</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-7 text-[#f3e7d4]/76">
              A paper-first elementary homeschool program for parents who want useful structure without putting childhood behind another screen.
            </p>
          </div>
          <div>
            <p className="label-font text-sm font-black uppercase text-[#dcc6a6]">Explore</p>
            <div className="mt-4 space-y-3 text-sm text-[#f3e7d4]/78">
              <Link href="/pricing" className="block hover:text-white">Pricing</Link>
              <Link href="/bookstore" className="block hover:text-white">Bookstore</Link>
              <Link href="/blog" className="block hover:text-white">Blog</Link>
              <Link href="/faq" className="block text-white">FAQ</Link>
            </div>
          </div>
          <div>
            <p className="label-font text-sm font-black uppercase text-[#dcc6a6]">Help</p>
            <div className="mt-4 space-y-3 text-sm text-[#f3e7d4]/78">
              <Link href="/support" className="block hover:text-white">Support</Link>
              <Link href="/privacy" className="block hover:text-white">Privacy</Link>
              <Link href="/terms" className="block hover:text-white">Terms</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-[#f3e7d4]/54">Copyright © 2026 Treeschool. All rights reserved.</div>
      </footer>
    </main>
  );
}
