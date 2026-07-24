import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { LanguageSelect } from "../components/language-select";
import { SUPPORTED_LOCALES } from "../lib/i18n/config";
import { getRequestDictionary } from "../lib/i18n/server";

type HomePageProps = {
  searchParams?: {
    lang?: string;
  };
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { home } = dictionary;
  const navHref = (link: string) => {
    if (link === "Pricing" || link === home.nav.buyNow) return "/pricing";
    if (link === "Bookstore") return "/bookstore";
    if (link === "Blog") return "/blog";
    if (link === home.nav.signIn) return "/p/signin";
    return "/";
  };
  const outputWeeks = Array.from(
    { length: home.proof.outputCount },
    (_, index) => `${home.proof.outputPrefix} ${index + 1}`
  );

  return (
    <main className="min-h-screen bg-[#f7f1e7] text-ink">
      <header className="border-b border-[#ddccb2] bg-[#fffaf2]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-5 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-0">
            <Image
              src="/tree-icon.png"
              alt="Treeschool tree icon"
              width={112}
              height={112}
              className="h-14 w-14 object-contain sm:h-16 sm:w-16"
              priority
            />
            <p className="brand-logo hidden text-[28px] font-semibold leading-none text-ink sm:block">
              {home.brand.name}
            </p>
          </Link>

          <nav aria-label="Main navigation" className="flex items-center gap-4">
            <div className="flex items-center gap-6 lg:gap-7">
              <Link href="#example" className="hidden text-sm font-semibold text-ink/68 transition-colors hover:text-ink lg:inline-flex">
                {home.nav.howItWorks}
              </Link>
              <Link href="/pricing" className="hidden text-sm font-semibold text-ink/68 transition-colors hover:text-ink md:inline-flex">
                {home.nav.pricing}
              </Link>
              <Link href="/bookstore" className="hidden text-sm font-semibold text-ink/68 transition-colors hover:text-ink md:inline-flex">
                Bookstore
              </Link>
              <Link href="/blog" className="hidden text-sm font-semibold text-ink/68 transition-colors hover:text-ink lg:inline-flex">
                Blog
              </Link>
              <Link href="/p/signin" className="text-sm font-semibold text-ink/68 transition-colors hover:text-ink">
                {home.nav.signIn}
              </Link>
            </div>
            <Link href="/pricing" className="cta-button cta-button--light cta-button--small">
              {home.nav.buyNow}
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate overflow-hidden border-b border-[#d8c7ad] bg-[#e8f0e1]">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-9 px-4 pb-10 pt-5 sm:px-6 sm:pb-12 sm:pt-6 lg:min-h-[560px] lg:grid-cols-[minmax(0,1.03fr)_minmax(420px,0.97fr)] lg:gap-10 lg:px-8 lg:pb-14 lg:pt-7">
          <div className="max-w-[610px]">
            <p className="label-font inline-flex rounded-full border border-[#9eb889] bg-[#f7fbf1] px-4 py-2 text-sm font-black uppercase text-[#486338]">
              {home.hero.kicker}
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.04] text-ink sm:text-5xl lg:text-[58px]">
              {home.hero.title}
            </h1>
            <p className="mt-5 max-w-[580px] text-lg leading-8 text-ink/78 sm:text-[20px]">
              {home.hero.description}
            </p>

            <div className="mt-7">
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link href="/pricing" className="cta-button cta-button--light gap-2">
                  {home.hero.primaryCta}
                  <span aria-hidden="true" className="text-xl">→</span>
                </Link>
                <Link href="/homeschool-lesson-plan-generator" className="cta-button cta-button--outline">
                  {home.hero.secondaryCta}
                </Link>
              </div>
              <p className="mt-4 text-sm font-medium leading-6 text-ink/66 sm:text-base">
                <span className="block">{home.hero.offerCaption}</span>
                <span className="block">{home.hero.guaranteeCaption}</span>
              </p>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[590px] lg:mx-0 lg:max-w-none">
            <div className="absolute -bottom-3 -right-3 h-full w-full rounded-[30px] border border-[#a6bb93] bg-[#dce8d2]" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-[30px] border border-[#9eb889] bg-[#f7fbf1] shadow-[0_18px_42px_rgba(72,99,56,0.16)]">
              <Image
                src="/hero-paper-learning-crop.jpg"
                alt={home.hero.imageAlt}
                fill
                priority
                sizes="(min-width: 1024px) 46vw, (min-width: 640px) 80vw, calc(100vw - 32px)"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="example" className="border-b border-[#d8c7ad] bg-[#fffaf2]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-font text-sm font-black uppercase text-earth">{home.proof.eyebrow}</p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight text-ink sm:text-5xl">
              {home.proof.title}
            </h2>
            <p className="mt-5 text-lg leading-8 text-ink/76">{home.proof.copy}</p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-[0.78fr_auto_1.22fr] lg:items-stretch">
            <article className="rounded-[28px] border border-[#d7c4a6] bg-[#fffaf2] p-5 shadow-[0_12px_28px_rgba(79,54,34,0.07)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="label-font text-xs font-black uppercase tracking-[0.14em] text-earth">Input</p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">{home.proof.inputsTitle}</h3>
                </div>
                <span className="rounded-full bg-[#f2e6d3] px-3 py-1.5 text-xs font-bold text-earth">You choose</span>
              </div>
              <div className="mt-5 space-y-3">
                {home.proof.inputs.map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-[16px] border border-[#eadbc2] bg-white px-4 py-3.5 text-sm font-semibold">
                    <span aria-hidden="true" className="grid h-10 w-8 flex-none place-items-center rounded-[4px] border border-[#8f6544] bg-[#fffaf2] text-[10px] font-black text-earth shadow-[0_3px_0_#dbc5a6]">
                      PDF
                    </span>
                    <span className="min-w-0 truncate">{item}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-ink/58">One PDF per workbook or subject is enough to get started.</p>
            </article>

            <div className="flex flex-col items-center justify-center gap-2 py-2 text-[#486338] lg:px-1">
              <Image
                src="/tree-icon.png"
                alt=""
                width={64}
                height={64}
                className="h-12 w-12 object-contain"
              />
              <span className="hidden text-5xl font-semibold leading-none lg:block">→</span>
              <span className="text-5xl font-semibold leading-none lg:hidden">↓</span>
              <span className="label-font max-w-[110px] text-center text-xs font-black uppercase leading-5 tracking-[0.1em] text-[#486338]">Treeschool organizes</span>
            </div>

            <article className="rounded-[28px] border border-[#a8c5a0] bg-[#f3f8ed] p-5 shadow-[0_12px_28px_rgba(72,99,56,0.1)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="label-font text-xs font-black uppercase tracking-[0.14em] text-[#486338]">Output</p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">{home.proof.outputsTitle}</h3>
                </div>
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#486338]">Ready to print</span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {outputWeeks.map((week) => (
                  <div key={week} className="flex min-w-0 items-center gap-2 rounded-[10px] border border-[#c9dcc0] bg-white px-2.5 py-2.5 text-xs font-semibold text-[#345026]">
                    <span aria-hidden="true" className="grid h-6 w-5 flex-none place-items-center rounded-[3px] border border-[#6e9860] bg-[#f7fbf1] text-[7px] font-black text-[#486338]">
                      PDF
                    </span>
                    <span className="whitespace-nowrap">{week}</span>
                  </div>
                ))}
              </div>
              <ul className="mt-5 space-y-2.5 border-t border-[#c9dcc0] pt-4">
                {[home.proof.outputCaption, home.proof.note].map((note) => (
                  <li key={note} className="flex items-start gap-2.5 text-sm font-semibold leading-6 text-[#486338]">
                    <span aria-hidden="true" className="flex-none text-base">💡</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="border-y border-[#d8c7ad] bg-[#e8f0e1]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="label-font text-sm font-black uppercase text-[#486338]">{home.benefits.eyebrow}</p>
            <h2 className="mx-auto mt-3 max-w-4xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
              {home.benefits.title}
            </h2>
          </div>

          <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {home.benefits.cards.map((card) => (
              <article key={card.title} className="rounded-lg border border-[#bdd0aa] bg-[#f7fbf1] px-6 py-6">
                <h3 className="text-2xl font-semibold text-ink">{card.title}</h3>
                <p className="mt-4 text-base leading-7 text-ink/72">{card.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f7f1e7]">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 text-center sm:px-6 lg:px-8">
          <p className="label-font text-sm font-black uppercase text-earth">{home.cta.eyebrow}</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            {home.cta.title}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ink/76">{home.cta.description}</p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link href="/pricing" className="cta-button cta-button--light">
              {home.cta.primary}
            </Link>
            <Link href="/homeschool-lesson-plan-generator" className="cta-button cta-button--dark">
              {home.cta.secondary}
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-[#6f513e] text-[#f7eddf]">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 border-b border-white/10 pb-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <div>
              <div className="flex items-center gap-0">
                <Image
                  src="/tree-icon.png"
                  alt="Treeschool tree icon"
                  width={112}
                  height={112}
                  className="h-16 w-16 object-contain"
                />
                <p className="brand-logo text-[28px] font-semibold leading-none">{home.brand.name}</p>
              </div>
              <p className="mt-4 max-w-md text-sm leading-7 text-[#f3e7d4]/78">
                {home.footer.description}
              </p>
            </div>

            {home.footer.columns.map((column) => (
              <div key={column.title}>
                <p className="label-font text-sm font-black uppercase text-[#dcc6a6]">{column.title}</p>
                <div className="mt-4 space-y-3 text-sm text-[#f3e7d4]/78">
                  {column.links.map((link) => (
                    <Link
                      key={link}
                      href={navHref(link)}
                      className="block transition-colors hover:text-white"
                    >
                      {link}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#f3e7d4]/55">{home.footer.copyright}</p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-[#f3e7d4]/72">
              <Link href={"/privacy" as Route} className="hover:text-white">Privacy</Link>
              <Link href={"/terms" as Route} className="hover:text-white">Terms</Link>
              <Link href={"/refunds" as Route} className="hover:text-white">Refunds</Link>
              <Link href={"/support" as Route} className="hover:text-white">Support</Link>
              <Link href={"/bookstore" as Route} className="hover:text-white">Bookstore</Link>
              <Link href={"/blog" as Route} className="hover:text-white">Blog</Link>
              <LanguageSelect
                ariaLabel={home.nav.languageLabel}
                currentLocale={locale}
                options={SUPPORTED_LOCALES}
              />
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
