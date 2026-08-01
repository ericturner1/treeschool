import Image from "next/image";
import Link from "next/link";
import type {
  ManagedFunnelAttribution,
  ManagedFunnelPagePayload
} from "../lib/funnels/server";
import { ManagedFunnelPageTracker } from "./managed-funnel-page-tracker";
import { ManagedFunnelLeadForm } from "./managed-funnel-lead-form";

const THEMES = {
  sage: {
    page: "bg-[#edf4e7]",
    glow: "bg-[#cddfba]",
    accent: "text-[#557b3f]",
    eyebrow: "border-[#abc391] bg-white/55 text-[#4d6b3a]",
    card: "border-[#b9cfa5] bg-[#fffdf8]",
    bullet: "bg-[#dcebcf] text-[#466534]",
    primary: "border-[#4f7538] bg-[#76a456] text-white shadow-[0_8px_0_#486f34] hover:bg-[#6c994e]",
    secondary: "border-[#b9cfa5] bg-white text-[#466534] shadow-[0_6px_0_#cdddbd]"
  },
  cream: {
    page: "bg-[#f8f1e4]",
    glow: "bg-[#ead3b0]",
    accent: "text-[#825d3d]",
    eyebrow: "border-[#d8bf98] bg-white/55 text-[#79583d]",
    card: "border-[#dcc8aa] bg-[#fffaf2]",
    bullet: "bg-[#f1e3cf] text-[#765337]",
    primary: "border-[#694833] bg-[#8a674d] text-white shadow-[0_8px_0_#5b3d2c] hover:bg-[#7e5c44]",
    secondary: "border-[#d7c2a3] bg-white text-[#694833] shadow-[0_6px_0_#e3d0b0]"
  },
  violet: {
    page: "bg-[#f2eef8]",
    glow: "bg-[#d6cbe9]",
    accent: "text-[#665481]",
    eyebrow: "border-[#cbbde0] bg-white/55 text-[#665481]",
    card: "border-[#d1c5e2] bg-[#fffdfd]",
    bullet: "bg-[#e5dcf1] text-[#5e4d78]",
    primary: "border-[#5d4a77] bg-[#79639a] text-white shadow-[0_8px_0_#514066] hover:bg-[#6f598f]",
    secondary: "border-[#cbbde0] bg-white text-[#5e4d78] shadow-[0_6px_0_#ded5ea]"
  },
  sky: {
    page: "bg-[#eaf4f5]",
    glow: "bg-[#bfdbdd]",
    accent: "text-[#3c6c70]",
    eyebrow: "border-[#b3d1d3] bg-white/55 text-[#3c686c]",
    card: "border-[#bdd7d9] bg-[#fffdf9]",
    bullet: "bg-[#d6eaeb] text-[#365f63]",
    primary: "border-[#35666a] bg-[#4d858a] text-white shadow-[0_8px_0_#315d60] hover:bg-[#457a7e]",
    secondary: "border-[#b3d1d3] bg-white text-[#365f63] shadow-[0_6px_0_#cce1e2]"
  }
} as const;

function paragraphs(body: string) {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function FunnelButton({
  href,
  originalHref,
  label,
  primary,
  className
}: {
  href: string;
  originalHref: string;
  label: string;
  primary: boolean;
  className: string;
}) {
  const classes = `inline-flex min-h-14 items-center justify-center rounded-[18px] border-2 px-7 py-4 text-center text-lg font-semibold transition duration-200 hover:-translate-y-0.5 ${className}`;
  const content = <>{label}<span className="ml-2" aria-hidden="true">→</span></>;

  return (
    <a
      href={href}
      data-funnel-target={originalHref}
      className={classes}
      data-funnel-cta={primary ? "primary" : "secondary"}
    >
      {content}
    </a>
  );
}

export function ManagedFunnelPageView({
  data,
  adminBackHref,
  visitorId
}: {
  data: ManagedFunnelPagePayload;
  adminBackHref?: string;
  visitorId?: string | null;
}) {
  const { funnel, step, page } = data;
  const content = page.content;
  const theme = THEMES[content.theme];
  const primaryHref = content.primaryCtaHref ?? page.nextHref;
  const attribution: ManagedFunnelAttribution | null = visitorId && !page.preview
    ? {
        funnelId: funnel.id,
        funnelSlug: funnel.slug,
        stepId: step.id,
        pageId: page.id,
        revisionNumber: page.latestRevisionNumber,
        visitorId,
        experimentId: page.experiment?.id ?? null,
        experimentVariantId: page.experiment?.variantId ?? null
      }
    : null;
  const trackedHref = (target: string) => {
    if (!attribution) return target;
    const query = new URLSearchParams({
      target,
      attribution: JSON.stringify(attribution)
    });
    return `/api/funnels/click?${query}`;
  };
  const bodyParagraphs = paragraphs(content.body);
  const isCompact = content.template === "upsell" || content.template === "downsell";
  const isCentered = content.template === "thank_you";

  return (
    <main className={`relative min-h-screen overflow-hidden text-ink ${theme.page}`}>
      <ManagedFunnelPageTracker
        funnelId={funnel.id}
        funnelSlug={funnel.slug}
        stepId={step.id}
        stepSlug={step.slug}
        stepName={step.name}
        pageId={page.id}
        revisionNumber={page.latestRevisionNumber}
        visitorId={visitorId}
        experiment={page.experiment}
        isThankYou={content.template === "thank_you"}
        preview={page.preview}
      />
      <div
        className={`pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full opacity-45 blur-3xl ${theme.glow}`}
        aria-hidden="true"
      />
      <div
        className={`pointer-events-none absolute -bottom-32 -left-28 h-72 w-72 rounded-full opacity-35 blur-3xl ${theme.glow}`}
        aria-hidden="true"
      />

      <div className={`relative mx-auto flex min-h-screen w-full flex-col px-5 py-6 sm:px-8 ${
        isCompact ? "max-w-[1050px]" : "max-w-[1220px]"
      }`}>
        <header className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Treeschool home">
            <Image
              src="/tree-icon.png"
              alt=""
              width={54}
              height={54}
              className="h-12 w-12 object-contain"
              priority
            />
            <span className="brand-logo text-[25px] font-semibold leading-none">treeschool</span>
          </Link>
          {page.preview ? (
            <span className="rounded-full border border-ink/15 bg-white/65 px-3 py-1.5 text-xs font-semibold text-ink/55">
              Draft preview · Revision {page.latestRevisionNumber}
            </span>
          ) : null}
        </header>

        <section className={`my-auto py-10 sm:py-14 ${isCentered ? "text-center" : ""}`}>
          <div className={`rounded-[30px] border p-6 shadow-[0_22px_60px_rgba(51,43,33,.10)] sm:p-10 lg:p-12 ${theme.card}`}>
            <div className={content.bullets.length > 0 && !isCentered
              ? "grid gap-9 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)] lg:items-center"
              : ""}>
              <div className={isCentered ? "mx-auto max-w-4xl" : ""}>
                {content.eyebrow ? (
                  <p className={`label-font inline-flex rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.1em] sm:text-sm ${theme.eyebrow}`}>
                    {content.eyebrow}
                  </p>
                ) : null}
                <h1 className={`text-[42px] font-semibold leading-[1.03] tracking-[-0.058em] sm:text-6xl ${
                  content.eyebrow ? "mt-5" : ""
                } ${isCompact ? "lg:text-[66px]" : "lg:text-[72px]"}`}>
                  {content.headline}
                </h1>
                {content.subheadline ? (
                  <p className={`mt-6 text-xl leading-8 text-ink/72 sm:text-2xl sm:leading-9 ${
                    isCentered ? "mx-auto max-w-3xl" : "max-w-4xl"
                  }`}>
                    {content.subheadline}
                  </p>
                ) : null}
                {bodyParagraphs.length > 0 ? (
                  <div className={`mt-7 space-y-4 text-base leading-7 text-ink/68 sm:text-lg sm:leading-8 ${
                    isCentered ? "mx-auto max-w-3xl" : "max-w-3xl"
                  }`}>
                    {bodyParagraphs.map((paragraph, index) => (
                      <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>
                    ))}
                  </div>
                ) : null}
              </div>

              {content.bullets.length > 0 ? (
                <ul className={`grid gap-3 ${isCentered ? "mx-auto mt-8 max-w-2xl text-left" : ""}`}>
                  {content.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 rounded-[18px] border border-ink/8 bg-white/68 px-4 py-3.5 text-base leading-6 text-ink/76">
                      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-black ${theme.bullet}`} aria-hidden="true">
                        ✓
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {content.leadCapture.enabled && primaryHref && attribution ? (
              <ManagedFunnelLeadForm
                attribution={attribution}
                heading={content.leadCapture.heading}
                collectFirstName={content.leadCapture.collectFirstName}
                firstNameLabel={content.leadCapture.firstNameLabel}
                emailLabel={content.leadCapture.emailLabel}
                submitLabel={content.leadCapture.submitLabel}
                destination={trackedHref(primaryHref)}
                className={theme.primary}
              />
            ) : (primaryHref || (content.secondaryCtaLabel && content.secondaryCtaHref)) ? (
              <div className={`mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap ${
                isCentered ? "sm:justify-center" : ""
              }`}>
                {primaryHref ? (
                  <FunnelButton
                    href={trackedHref(primaryHref)}
                    originalHref={primaryHref}
                    label={content.primaryCtaLabel}
                    primary
                    className={theme.primary}
                  />
                ) : null}
                {content.secondaryCtaLabel && content.secondaryCtaHref ? (
                  <FunnelButton
                    href={trackedHref(content.secondaryCtaHref)}
                    originalHref={content.secondaryCtaHref}
                    label={content.secondaryCtaLabel}
                    primary={false}
                    className={theme.secondary}
                  />
                ) : null}
              </div>
            ) : null}
            {content.reassurance ? (
              <p className={`mt-5 text-sm leading-6 text-ink/52 ${isCentered ? "text-center" : ""}`}>
                {content.reassurance}
              </p>
            ) : null}
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-ink/10 py-5 text-center text-xs text-ink/46 sm:flex-row sm:text-left">
          <p>© {new Date().getFullYear()} Treeschool · Paper-first homeschooling for grades K–4.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </div>
        </footer>
        {adminBackHref ? (
          <a
            href={adminBackHref}
            className="mx-auto mb-2 mt-4 text-xs text-ink/35 underline underline-offset-4 hover:text-ink/60"
          >
            Back to funnel administration
          </a>
        ) : null}
      </div>
    </main>
  );
}
