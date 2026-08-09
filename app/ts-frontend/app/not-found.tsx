import Image from "next/image";
import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#e8f0e1] px-5 py-12 text-ink">
      <div
        className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#cddfba] opacity-55 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-[#ead3b0] opacity-45 blur-3xl"
        aria-hidden="true"
      />

      <section className="relative w-full max-w-2xl rounded-[30px] border border-[#b9cfa5] bg-[#fffdf8] px-6 py-10 text-center shadow-[0_20px_55px_rgba(51,43,33,.10)] sm:px-10 sm:py-14">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Treeschool home">
          <Image
            src="/tree-icon.png"
            alt=""
            width={72}
            height={72}
            className="h-16 w-16 object-contain"
            priority
          />
          <span className="brand-logo text-[30px] font-semibold leading-none">treeschool</span>
        </Link>

        <p className="label-font mt-8 text-sm font-black uppercase tracking-[0.12em] text-[#557b3f]">
          404 · Page not found
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          This page has wandered off the path.
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-ink/65 sm:text-lg sm:leading-8">
          The address may be incorrect, or the page may no longer be available. Head back to Treeschool to keep exploring.
        </p>

        <Link href="/" className="cta-button cta-button--light mt-8">
          Back to Treeschool
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
