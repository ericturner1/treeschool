import Link from "next/link";
import { SUPPORT_EMAIL } from "../lib/site";

export function LegalLayout({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-8 sm:px-6 lg:px-8">
      <article className="site-panel mx-auto max-w-3xl rounded-[32px] px-6 py-9 sm:px-10">
        <Link href="/" className="brand-logo text-2xl font-semibold text-ink">treeschool</Link>
        <h1 className="mt-7 text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">{title}</h1>
        <p className="mt-4 text-lg leading-8 text-ink/72">{intro}</p>
        <p className="mt-3 text-sm font-semibold text-earth">Effective July 12, 2026</p>
        <div className="legal-copy mt-8 space-y-7 text-base leading-8 text-ink/76">{children}</div>
        <div className="mt-10 border-t border-[#dcc8aa] pt-6 text-sm text-ink/65">
          Questions? Email <a className="font-semibold text-earth underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </div>
      </article>
    </main>
  );
}
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{title}</h2><div className="mt-2 space-y-3">{children}</div></section>;
}
