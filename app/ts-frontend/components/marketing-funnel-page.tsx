import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { startPricingSubscriptionCheckoutAction } from "../app/billing-actions";
import { getCurrentUser } from "../lib/auth/server";
import { SUPPORT_EMAIL } from "../lib/site";

type FunnelCta =
  | {
      kind: "subscription";
      label: string;
      planTier: "single" | "standard";
    }
  | {
      kind: "link";
      label: string;
      href: string;
    }
  | {
      kind: "email";
      label: string;
      subject: string;
    };

type FunnelItem = {
  title: string;
  copy: string;
};

export type MarketingFunnelConfig = {
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  caption: string;
  primaryCta: FunnelCta;
  secondaryCta: FunnelCta;
  heroCard: {
    eyebrow: string;
    title: string;
    items: string[];
    footer: string;
  };
  quickFacts: Array<{
    value: string;
    label: string;
  }>;
  fit: {
    eyebrow: string;
    title: string;
    copy: string;
    items: FunnelItem[];
  };
  steps: {
    eyebrow: string;
    title: string;
    copy: string;
    items: FunnelItem[];
  };
  benefits: {
    eyebrow: string;
    title: string;
    items: FunnelItem[];
  };
  offer: {
    eyebrow: string;
    title: string;
    copy: string;
    points: string[];
    note?: string;
  };
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  finalCta: {
    eyebrow: string;
    title: string;
    copy: string;
  };
};

function FunnelAction({
  cta,
  returnPath,
  variant
}: {
  cta: FunnelCta;
  returnPath: string;
  variant: "primary" | "secondary";
}) {
  const className = `cta-button ${
    variant === "primary" ? "cta-button--light" : "cta-button--outline"
  }`;

  if (cta.kind === "subscription") {
    return (
      <form
        action={startPricingSubscriptionCheckoutAction}
        data-revenue-path={`funnel-${returnPath.slice(1)}-${cta.planTier}-monthly`}
      >
        <input type="hidden" name="interval" value="monthly" />
        <input type="hidden" name="planTier" value={cta.planTier} />
        <input type="hidden" name="returnPath" value={returnPath} />
        <button type="submit" className={className}>
          {cta.label}
        </button>
      </form>
    );
  }

  if (cta.kind === "email") {
    const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(cta.subject)}`;
    return <a href={href} className={className}>{cta.label}</a>;
  }

  return <Link href={cta.href as Route} className={className}>{cta.label}</Link>;
}

function CheckMark() {
  return (
    <span
      aria-hidden="true"
      className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[#dceacd] text-sm font-black text-[#486338]"
    >
      ✓
    </span>
  );
}

export async function MarketingFunnelPage({ config }: { config: MarketingFunnelConfig }) {
  const currentUser = await getCurrentUser();
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: config.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer
      }
    }))
  };
  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: config.title,
    description: config.description,
    url: `https://www.treehomeschool.com${config.path}`,
    isPartOf: {
      "@type": "WebSite",
      name: "Treeschool",
      url: "https://www.treehomeschool.com"
    },
    audience: {
      "@type": "Audience",
      audienceType: "Homeschool parents"
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f1e7] text-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }}
      />

      <header className="border-b border-[#ddccb2] bg-[#fffaf2]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/tree-icon.png"
              alt="Treeschool tree icon"
              width={72}
              height={72}
              className="h-14 w-14 object-contain sm:h-16 sm:w-16"
              priority
            />
            <span className="brand-logo hidden text-[27px] font-semibold leading-none text-ink sm:block">
              treeschool
            </span>
          </Link>

          <nav aria-label="Main navigation" className="flex items-center gap-4 text-sm font-semibold text-ink/65 sm:gap-6">
            <Link href="/bookstore" className="hidden transition-colors hover:text-ink sm:inline">Bookstore</Link>
            <Link href="/blog" className="hidden transition-colors hover:text-ink md:inline">Blog</Link>
            <Link href="/pricing" className="transition-colors hover:text-ink">Pricing</Link>
            <Link
              href={currentUser ? "/p/dashboard" : "/p/signin"}
              className="cta-button cta-button--dark cta-button--small"
            >
              {currentUser ? "Dashboard" : "Parent sign in"}
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#cbd9bd] bg-[#e8f0e1]">
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full border-[52px] border-white/25" />
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(400px,.98fr)] lg:px-8 lg:py-16">
          <div className="max-w-[650px]">
            <p className="label-font inline-flex rounded-full border border-[#9eb889] bg-[#f7fbf1] px-4 py-2 text-sm font-black uppercase text-[#486338]">
              {config.eyebrow}
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.03] tracking-[-0.055em] text-ink sm:text-5xl lg:text-[60px]">
              {config.title}
            </h1>
            <p className="mt-5 max-w-[620px] text-lg leading-8 text-ink/76 sm:text-[20px]">
              {config.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <FunnelAction cta={config.primaryCta} returnPath={config.path} variant="primary" />
              <FunnelAction cta={config.secondaryCta} returnPath={config.path} variant="secondary" />
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-ink/58">{config.caption}</p>
          </div>

          <div className="relative mx-auto w-full max-w-[560px] lg:mx-0">
            <div className="absolute -bottom-3 -right-3 h-full w-full rounded-[30px] bg-[#bdd0aa]" />
            <div className="relative overflow-hidden rounded-[30px] border border-[#9eb889] bg-[#fffaf2] shadow-[0_18px_42px_rgba(72,99,56,0.16)]">
              <div className="relative aspect-[16/9]">
                <Image
                  src="/hero-paper-learning-crop.jpg"
                  alt="Children completing paper-based homeschool lessons at a table"
                  fill
                  priority
                  sizes="(min-width: 1024px) 44vw, calc(100vw - 32px)"
                  className="object-cover"
                />
              </div>
              <div className="p-5 sm:p-6">
                <p className="label-font text-xs font-black uppercase tracking-[0.13em] text-[#486338]">
                  {config.heroCard.eyebrow}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-ink">
                  {config.heroCard.title}
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {config.heroCard.items.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm font-semibold leading-6 text-ink/70">
                      <CheckMark />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-[#eadbc2] pt-4 text-sm font-semibold text-[#486338]">
                  {config.heroCard.footer}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#e2d4bf] bg-[#fffaf2]">
        <div className="mx-auto grid w-full max-w-6xl gap-px bg-[#e2d4bf] sm:grid-cols-3">
          {config.quickFacts.map((fact) => (
            <div key={fact.label} className="bg-[#fffaf2] px-6 py-6 text-center">
              <p className="text-2xl font-semibold tracking-[-0.04em] text-[#486338]">{fact.value}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-ink/58">{fact.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#f7f1e7]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-earth">{config.fit.eyebrow}</p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] text-ink sm:text-5xl">{config.fit.title}</h2>
            <p className="mt-5 text-lg leading-8 text-ink/68">{config.fit.copy}</p>
          </div>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {config.fit.items.map((item) => (
              <article key={item.title} className="rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] p-6 shadow-[0_10px_24px_rgba(68,49,36,0.06)]">
                <CheckMark />
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink/66">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-[#cbd9bd] bg-[#e8f0e1] scroll-mt-8">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <div className="max-w-3xl">
            <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-[#486338]">{config.steps.eyebrow}</p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] text-ink sm:text-5xl">{config.steps.title}</h2>
            <p className="mt-5 text-lg leading-8 text-ink/68">{config.steps.copy}</p>
          </div>
          <ol className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {config.steps.items.map((item, index) => (
              <li key={item.title} className="rounded-[24px] border border-[#b8cba7] bg-[#f7fbf1] p-6">
                <span className="label-font grid h-10 w-10 place-items-center rounded-full bg-[#6f984e] text-sm font-black text-white">
                  {index + 1}
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink/66">{item.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-[#fffaf2]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-earth">{config.benefits.eyebrow}</p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] text-ink sm:text-5xl">{config.benefits.title}</h2>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-2">
            {config.benefits.items.map((item) => (
              <article key={item.title} className="flex gap-4 rounded-[22px] border border-[#eadbc2] bg-white px-5 py-5">
                <CheckMark />
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.025em] text-ink">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-ink/64">{item.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f7f1e7] px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 rounded-[32px] border border-[#9eb889] bg-[#eef5e4] p-6 shadow-[0_16px_38px_rgba(72,99,56,0.11)] sm:p-9 lg:grid-cols-[1fr_.85fr] lg:p-11">
          <div>
            <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-[#486338]">{config.offer.eyebrow}</p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] text-ink">{config.offer.title}</h2>
            <p className="mt-5 text-lg leading-8 text-ink/68">{config.offer.copy}</p>
            {config.offer.note ? (
              <p className="mt-5 rounded-[18px] border border-[#b8cba7] bg-[#f7fbf1] px-4 py-3 text-sm font-semibold leading-6 text-[#486338]">
                {config.offer.note}
              </p>
            ) : null}
          </div>
          <div className="rounded-[24px] border border-[#b8cba7] bg-[#fffaf2] p-6">
            <ul className="space-y-4">
              {config.offer.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm font-semibold leading-6 text-ink/70">
                  <CheckMark />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-3">
              <FunnelAction cta={config.primaryCta} returnPath={config.path} variant="primary" />
              <FunnelAction cta={config.secondaryCta} returnPath={config.path} variant="secondary" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#e2d4bf] bg-[#fffaf2]">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <p className="label-font text-center text-sm font-black uppercase tracking-[0.12em] text-earth">Questions parents ask</p>
          <h2 className="mt-3 text-center text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">The practical details.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {config.faqs.map((faq) => (
              <details key={faq.question} className="group rounded-[22px] border border-[#dcc8aa] bg-[#fdf8ef] p-5">
                <summary className="cursor-pointer list-none pr-8 text-lg font-semibold marker:content-none">
                  {faq.question}
                  <span aria-hidden="true" className="float-right text-[#567b40] transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-4 text-sm leading-7 text-ink/66">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#e8f0e1] px-4 py-14 text-center sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-[#486338]">{config.finalCta.eyebrow}</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] text-ink sm:text-5xl">{config.finalCta.title}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ink/68">{config.finalCta.copy}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <FunnelAction cta={config.primaryCta} returnPath={config.path} variant="primary" />
            <FunnelAction cta={config.secondaryCta} returnPath={config.path} variant="secondary" />
          </div>
        </div>
      </section>

      <footer className="bg-[#6f513e] text-[#f7eddf]">
        <div className="mx-auto grid w-full max-w-7xl gap-9 px-4 py-11 sm:px-6 md:grid-cols-[1.2fr_.8fr_.8fr] lg:px-8">
          <div>
            <div className="flex items-center">
              <Image src="/tree-icon.png" alt="" width={64} height={64} className="h-14 w-14 object-contain" />
              <span className="brand-logo text-[27px] font-semibold">treeschool</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-7 text-[#f3e7d4]/76">
              A paper-first elementary homeschool program for families who want children learning from printed lessons, books, projects, and real life—not another screen.
            </p>
          </div>
          <div>
            <p className="label-font text-sm font-black uppercase text-[#dcc6a6]">Find your path</p>
            <div className="mt-4 space-y-3 text-sm text-[#f3e7d4]/78">
              <Link href={"/first-grade-homeschool" as Route} className="block hover:text-white">Starting first grade</Link>
              <Link href={"/switch-to-paper-based-homeschool" as Route} className="block hover:text-white">Switching programs</Link>
              <Link href={"/homeschool-without-a-subscription" as Route} className="block hover:text-white">No-subscription homeschooling</Link>
            </div>
          </div>
          <div>
            <p className="label-font text-sm font-black uppercase text-[#dcc6a6]">Explore</p>
            <div className="mt-4 space-y-3 text-sm text-[#f3e7d4]/78">
              <Link href="/pricing" className="block hover:text-white">Pricing</Link>
              <Link href="/bookstore" className="block hover:text-white">Bookstore</Link>
              <Link href="/blog" className="block hover:text-white">Blog</Link>
              <Link href="/support" className="block hover:text-white">Support</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-[#f3e7d4]/54">
          Copyright © 2026 Treeschool. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
