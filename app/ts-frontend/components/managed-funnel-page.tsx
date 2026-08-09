import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  FunnelAction,
  FunnelPageElement,
  FunnelPageSection,
  FunnelPageStyles
} from "../lib/funnels/page-document";
import type {
  ManagedFunnelAttribution,
  ManagedFunnelPagePayload
} from "../lib/funnels/server";
import {
  funnelButtonBoxStyle,
  funnelButtonDefaultTextColor,
  funnelButtonSubtextStyle,
  funnelButtonTextStyle,
  type FunnelButtonPalette
} from "../lib/funnels/button-style";
import {
  funnelListContainerStyle,
  funnelListItemStyle,
  funnelListMarker,
  funnelListMarkerStyle,
  funnelListTextStyle,
  isCustomizedFunnelList
} from "../lib/funnels/list-style";
import { ManagedFunnelLeadForm } from "./managed-funnel-lead-form";
import { ManagedFunnelOneClickButton } from "./managed-funnel-one-click-button";
import { ManagedFunnelOrderForm } from "./managed-funnel-order-form";
import { ManagedFunnelPageTracker } from "./managed-funnel-page-tracker";
import { FunnelCountdown } from "./funnel-countdown";

const THEMES = {
  sage: {
    page: "bg-[#edf4e7]",
    glow: "bg-[#cddfba]",
    accent: "text-[#557b3f]",
    eyebrow: "border-[#abc391] bg-white/60 text-[#4d6b3a]",
    card: "border-[#b9cfa5] bg-[#fffdf8]",
    muted: "border-[#cbdabd] bg-[#f5f9f0]",
    dark: "border-[#4d6b3a] bg-[#4d6b3a] text-white",
    bullet: "bg-[#dcebcf] text-[#466534]",
    primary: "border-[#4f7538] bg-[#76a456] text-white shadow-[0_8px_0_#486f34] hover:bg-[#6c994e]",
    secondary: "border-[#b9cfa5] bg-white text-[#466534] shadow-[0_6px_0_#cdddbd]",
    buttonPalette: { primary: "#76a456", secondary: "#ffffff", primaryText: "#ffffff", secondaryText: "#466534", primaryShadow: "#486f34", secondaryShadow: "#cdddbd" }
  },
  cream: {
    page: "bg-[#f8f1e4]",
    glow: "bg-[#ead3b0]",
    accent: "text-[#825d3d]",
    eyebrow: "border-[#d8bf98] bg-white/60 text-[#79583d]",
    card: "border-[#dcc8aa] bg-[#fffaf2]",
    muted: "border-[#e2d2b9] bg-[#fbf4e8]",
    dark: "border-[#694833] bg-[#694833] text-white",
    bullet: "bg-[#f1e3cf] text-[#765337]",
    primary: "border-[#694833] bg-[#8a674d] text-white shadow-[0_8px_0_#5b3d2c] hover:bg-[#7e5c44]",
    secondary: "border-[#d7c2a3] bg-white text-[#694833] shadow-[0_6px_0_#e3d0b0]",
    buttonPalette: { primary: "#8a674d", secondary: "#ffffff", primaryText: "#ffffff", secondaryText: "#694833", primaryShadow: "#5b3d2c", secondaryShadow: "#e3d0b0" }
  },
  violet: {
    page: "bg-[#f2eef8]",
    glow: "bg-[#d6cbe9]",
    accent: "text-[#665481]",
    eyebrow: "border-[#cbbde0] bg-white/60 text-[#665481]",
    card: "border-[#d1c5e2] bg-[#fffdfd]",
    muted: "border-[#d9d0e6] bg-[#f8f5fb]",
    dark: "border-[#5d4a77] bg-[#5d4a77] text-white",
    bullet: "bg-[#e5dcf1] text-[#5e4d78]",
    primary: "border-[#5d4a77] bg-[#79639a] text-white shadow-[0_8px_0_#514066] hover:bg-[#6f598f]",
    secondary: "border-[#cbbde0] bg-white text-[#5e4d78] shadow-[0_6px_0_#ded5ea]",
    buttonPalette: { primary: "#79639a", secondary: "#ffffff", primaryText: "#ffffff", secondaryText: "#5e4d78", primaryShadow: "#514066", secondaryShadow: "#ded5ea" }
  },
  sky: {
    page: "bg-[#eaf4f5]",
    glow: "bg-[#bfdbdd]",
    accent: "text-[#3c6c70]",
    eyebrow: "border-[#b3d1d3] bg-white/60 text-[#3c686c]",
    card: "border-[#bdd7d9] bg-[#fffdf9]",
    muted: "border-[#c7dcde] bg-[#f2f8f8]",
    dark: "border-[#35666a] bg-[#35666a] text-white",
    bullet: "bg-[#d6eaeb] text-[#365f63]",
    primary: "border-[#35666a] bg-[#4d858a] text-white shadow-[0_8px_0_#315d60] hover:bg-[#457a7e]",
    secondary: "border-[#b3d1d3] bg-white text-[#365f63] shadow-[0_6px_0_#cce1e2]",
    buttonPalette: { primary: "#4d858a", secondary: "#ffffff", primaryText: "#ffffff", secondaryText: "#365f63", primaryShadow: "#315d60", secondaryShadow: "#cce1e2" }
  }
} as const;

type Theme = (typeof THEMES)[keyof typeof THEMES];

function resolveActionHref(action: FunnelAction, nextHref: string | null) {
  if (action.type === "next_step") return nextHref;
  if (action.type === "url") return action.target;
  if (action.type === "accept_offer" || action.type === "decline_offer") return nextHref;
  if (action.type === "none") return null;
  return action.target ?? nextHref;
}

function withSourceCheckoutSession(target: string, sourceCheckoutSessionId: string | null) {
  if (!sourceCheckoutSessionId || !target.startsWith("/") || target.startsWith("//")) {
    return target;
  }
  const url = new URL(target, "https://treehomeschool.invalid");
  url.searchParams.set("source_session_id", sourceCheckoutSessionId);
  return `${url.pathname}${url.search}${url.hash}`;
}

function alignClass(align: "left" | "center" | "right") {
  if (align === "center") return "text-center justify-center";
  if (align === "right") return "text-right justify-end";
  return "text-left justify-start";
}

function visibilityClass(element: FunnelPageElement) {
  const classes = [];
  if (element.visibility?.desktop === false) classes.push("lg:hidden");
  if (element.visibility?.mobile === false) classes.push("hidden lg:block");
  return classes.join(" ");
}

function sectionClasses(section: FunnelPageSection, theme: Theme) {
  if (section.props.tone === "dark") return theme.dark;
  if (section.props.tone === "muted") return theme.muted;
  if (section.props.tone === "accent") return `${theme.card} shadow-[0_20px_55px_rgba(51,43,33,.10)]`;
  return theme.card;
}

function widthClass(width: FunnelPageSection["props"]["width"]) {
  if (width === "narrow") return "max-w-[820px]";
  if (width === "wide") return "max-w-[1320px]";
  return "max-w-[1120px]";
}

function PageElement({
  element,
  theme,
  nextHref,
  attribution,
  trackedHref,
  styles,
  countdownStorageScope,
  stepId,
  stepType,
  sourceCheckoutSessionId,
  preview
}: {
  element: FunnelPageElement;
  theme: Theme;
  nextHref: string | null;
  attribution: ManagedFunnelAttribution | null;
  trackedHref: (target: string) => string;
  styles?: FunnelPageStyles;
  countdownStorageScope: string;
  stepId: string;
  stepType: ManagedFunnelPagePayload["step"]["stepType"];
  sourceCheckoutSessionId: string | null;
  preview: boolean;
}) {
  const visibility = visibilityClass(element);
  if (element.type === "eyebrow") {
    return (
      <p className={`${visibility} ${alignClass(element.props.align)}`}>
        <span className={`label-font inline-flex rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.1em] sm:text-sm ${theme.eyebrow}`}>
          {element.props.text}
        </span>
      </p>
    );
  }
  if (element.type === "heading") {
    const Tag = element.props.level;
    const size = element.props.level === "h1"
      ? "text-[42px] leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-[72px]"
      : element.props.level === "h2"
        ? "text-3xl leading-tight tracking-[-0.04em] sm:text-5xl"
        : "text-2xl leading-tight tracking-[-0.03em] sm:text-3xl";
    return <Tag style={{ fontFamily: styles?.typography?.headingFontFamily, color: styles?.typography?.headingColor }} className={`${visibility} ${size} ${alignClass(element.props.align)} font-semibold`}>{element.props.text}</Tag>;
  }
  if (element.type === "text") {
    const style = element.props.style === "lead"
      ? "text-xl leading-8 text-current/75 sm:text-2xl sm:leading-9"
      : element.props.style === "small"
        ? "text-sm leading-6 text-current/60"
        : "whitespace-pre-line text-base leading-7 text-current/70 sm:text-lg sm:leading-8";
    return <p className={`${visibility} ${style} ${alignClass(element.props.align)}`}>{element.props.text}</p>;
  }
  if (element.type === "list") {
    if (isCustomizedFunnelList(element.props)) {
      return (
        <ul className={`${visibility} grid ${element.props.align === "center" ? "mx-auto max-w-2xl" : ""}`} style={funnelListContainerStyle(element.props)}>
          {element.props.items.map((item, index) => (
            <li key={`${element.id}-${index}`} className="flex" style={funnelListItemStyle(element.props)}>
              <span className="shrink-0 font-black" aria-hidden="true" style={funnelListMarkerStyle(element.props, theme.buttonPalette.primary)}>{funnelListMarker(element.props)}</span>
              <span style={funnelListTextStyle(element.props)}>{item}</span>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ul className={`${visibility} grid gap-3 ${element.props.align === "center" ? "mx-auto max-w-2xl" : ""}`}>
        {element.props.items.map((item, index) => (
          <li key={`${element.id}-${index}`} className={`flex gap-3 rounded-[18px] border border-ink/10 bg-white/70 px-4 py-3.5 text-base leading-6 text-ink/75 ${alignClass(element.props.align)}`}>
            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-black ${theme.bullet}`} aria-hidden="true">
              {element.props.style === "checks" ? "✓" : "•"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (element.type === "image") {
    const source = element.props.media.publicUrl ?? element.props.media.storagePath;
    if (!source) return null;
    return (
      <figure className={`${visibility} grid gap-2`}>
        <Image
          src={source}
          alt={element.props.media.alt}
          width={element.props.media.width ?? 1200}
          height={element.props.media.height ?? 800}
          unoptimized
          className={`h-auto max-h-[620px] w-full rounded-[20px] ${element.props.fit === "cover" ? "object-cover" : "object-contain"}`}
        />
        {element.props.caption ? <figcaption className="text-center text-sm text-current/60">{element.props.caption}</figcaption> : null}
      </figure>
    );
  }
  if (element.type === "button") {
    const target = resolveActionHref(element.props.action, nextHref);
    const palette: FunnelButtonPalette = {
      ...theme.buttonPalette,
      primary: styles?.colors?.primary ?? theme.buttonPalette.primary,
      secondary: styles?.colors?.secondary ?? theme.buttonPalette.secondary,
      pageBorderRadius: styles?.buttons?.borderRadius
    };
    const textColor = funnelButtonDefaultTextColor(element.props, palette);
    const className = "inline-flex min-h-14 flex-col items-center justify-center gap-0.5 text-center transition duration-200 hover:-translate-y-0.5";
    const style = funnelButtonBoxStyle(element.props, palette);
    const contents = (
      <>
        <span className="inline-flex items-center justify-center gap-2 text-lg font-semibold" style={funnelButtonTextStyle(element.props.typography, textColor)}>
          {element.props.label}
          {element.props.showArrow === false ? null : <span aria-hidden="true">→</span>}
        </span>
        {element.props.subtext ? <span className="text-xs font-medium opacity-90" style={funnelButtonSubtextStyle(element.props.subtextTypography, textColor)}>{element.props.subtext}</span> : null}
      </>
    );
    if (
      element.props.action.type === "accept_offer" &&
      (stepType === "upsell" || stepType === "downsell")
    ) {
      return (
        <div className={`${visibility} flex ${alignClass(element.props.align)}`}>
          {preview ? (
            <button
              type="button"
              disabled
              title="One-click purchasing is disabled in preview mode."
              className={`${className} cursor-not-allowed opacity-70`}
              style={style}
            >
              {contents}
            </button>
          ) : (
            <ManagedFunnelOneClickButton
              label={element.props.label}
              stepId={stepId}
              sourceCheckoutSessionId={sourceCheckoutSessionId}
              className={className}
              style={style}
            >
              {contents}
            </ManagedFunnelOneClickButton>
          )}
        </div>
      );
    }
    if (!target) return null;
    const linkedTarget = withSourceCheckoutSession(target, sourceCheckoutSessionId);
    return (
      <div className={`${visibility} flex ${alignClass(element.props.align)}`}>
        <a
          href={trackedHref(linkedTarget)}
          data-funnel-target={linkedTarget}
          data-funnel-cta={element.props.variant === "primary" ? "primary" : "secondary"}
          className={className}
          style={style}
        >
          {contents}
        </a>
      </div>
    );
  }
  if (element.type === "countdown") {
    return (
      <div className={visibility}>
        <FunnelCountdown
          element={element}
          storageScope={countdownStorageScope}
          fallbackTimeColor={styles?.colors?.primary ?? theme.buttonPalette.primary}
          fallbackLabelColor={styles?.typography?.bodyColor ?? "#2a261f"}
        />
      </div>
    );
  }
  if (element.type === "lead_capture") {
    const target = resolveActionHref(element.props.action, nextHref);
    if (!target || !attribution) return null;
    return (
      <div className={visibility}>
        <ManagedFunnelLeadForm
          attribution={attribution}
          heading={element.props.heading}
          collectFirstName={element.props.collectFirstName}
          firstNameLabel={element.props.firstNameLabel}
          emailLabel={element.props.emailLabel}
          submitLabel={element.props.submitLabel}
          destination={trackedHref(target)}
          className={theme.primary}
        />
      </div>
    );
  }
  return <hr className={`${visibility} border-ink/10`} />;
}

export async function ManagedFunnelPageView({
  data,
  adminBackHref,
  visitorId,
  sourceCheckoutSessionId = null
}: {
  data: ManagedFunnelPagePayload;
  adminBackHref?: string;
  visitorId?: string | null;
  sourceCheckoutSessionId?: string | null;
}) {
  const { funnel, step, page } = data;
  const document = page.content;
  const theme = THEMES[document.theme];
  const styles = document.styles;
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
    const query = new URLSearchParams({ target, attribution: JSON.stringify(attribution) });
    return `/api/funnels/click?${query}`;
  };

  return (
    <main
      className={`relative min-h-screen overflow-hidden text-ink ${theme.page}`}
      style={{
        backgroundColor: styles?.colors?.pageBackground,
        color: styles?.typography?.bodyColor,
        fontFamily: styles?.typography?.bodyFontFamily,
        fontSize: styles?.typography?.baseFontSize
      }}
    >
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
        isThankYou={step.stepType === "thank_you" || step.stepType === "fulfillment"}
        preview={page.preview}
      />
      <div className={`pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full opacity-45 blur-3xl ${theme.glow}`} aria-hidden="true" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Treeschool home">
            <Image src="/tree-icon.png" alt="" width={54} height={54} className="h-12 w-12 object-contain" priority />
            <span className="brand-logo text-[25px] font-semibold leading-none">treeschool</span>
          </Link>
          {page.preview ? (
            <span className="rounded-full border border-ink/20 bg-white/70 px-3 py-1.5 text-xs font-semibold text-ink/60">
              Draft preview · Revision {page.latestRevisionNumber}
            </span>
          ) : null}
        </header>

        <div
          className="my-auto grid gap-6 py-10 sm:py-14"
          style={{ gap: styles?.layout?.sectionGap }}
        >
          {document.sections.map((section) => {
            const backgroundSource = section.props.background?.publicUrl ?? section.props.background?.storagePath;
            const style = {
              ...(backgroundSource
                ? { backgroundImage: `linear-gradient(rgba(255,255,255,.82),rgba(255,255,255,.82)),url(${JSON.stringify(backgroundSource)})` }
                : {}),
              ...(section.props.tone === "default" && styles?.colors?.surface
                ? { backgroundColor: styles.colors.surface }
                : {}),
              ...(styles?.layout?.sectionPaddingY !== undefined
                ? { paddingTop: styles.layout.sectionPaddingY, paddingBottom: styles.layout.sectionPaddingY }
                : {}),
              ...(styles?.layout?.contentWidth && section.props.width === "standard"
                ? { maxWidth: styles.layout.contentWidth }
                : {})
            } as CSSProperties;
            return (
              <section
                key={section.id}
                style={style}
                className={`mx-auto w-full rounded-[30px] border bg-cover bg-center p-6 sm:p-10 lg:p-12 ${widthClass(section.props.width)} ${sectionClasses(section, theme)}`}
              >
                <div className="grid gap-8" style={{ gap: styles?.layout?.columnGap }}>
                  {section.rows.map((row) => (
                    <div key={row.id} className="grid grid-cols-1 gap-7 lg:grid-cols-12 lg:items-center">
                      {row.columns.map((column) => (
                        <div
                          key={column.id}
                          className="grid gap-5"
                          style={{ gridColumn: `span ${column.span} / span ${column.span}` }}
                        >
                          {column.elements.map((element) => (
                            <PageElement
                              key={element.id}
                              element={element}
                              theme={theme}
                              nextHref={step.stepType === "order_form" ? null : page.nextHref}
                              attribution={attribution}
                              trackedHref={trackedHref}
                              styles={styles}
                              countdownStorageScope={`${page.preview ? "preview" : "live"}:${page.id}:${page.latestRevisionNumber}`}
                              stepId={step.id}
                              stepType={step.stepType}
                              sourceCheckoutSessionId={sourceCheckoutSessionId}
                              preview={page.preview}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <ManagedFunnelOrderForm data={data} visitorId={visitorId} />

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-ink/10 py-5 text-center text-xs text-ink/50 sm:flex-row sm:text-left">
          <p>© {new Date().getFullYear()} Treeschool · Paper-first homeschooling for grades K–4.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </div>
        </footer>
        {adminBackHref ? (
          <a href={adminBackHref} className="mx-auto mb-2 mt-4 text-xs text-ink/40 underline underline-offset-4 hover:text-ink/60">
            Back to funnel administration
          </a>
        ) : null}
      </div>
    </main>
  );
}
