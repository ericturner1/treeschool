"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  FunnelAction,
  FunnelListMarker,
  FunnelMediaSnapshot,
  FunnelPageDocument,
  FunnelPageElement,
  FunnelPageSection
} from "../../../lib/funnels/page-document";
import {
  createFunnelDocumentId,
  emptyFunnelPageDocument
} from "../../../lib/funnels/page-document";
import {
  FUNNEL_BUTTON_FONT_OPTIONS,
  funnelButtonBoxStyle,
  funnelButtonDefaultTextColor,
  funnelButtonSubtextStyle,
  funnelButtonTextStyle,
  type FunnelButtonPalette
} from "../../../lib/funnels/button-style";
import { countdownDurationMs, countdownParts } from "../../../lib/funnels/countdown";
import {
  funnelListContainerStyle,
  funnelListItemStyle,
  funnelListMarker,
  funnelListMarkerStyle,
  funnelListTextStyle,
  isCustomizedFunnelList
} from "../../../lib/funnels/list-style";
import type { AdminManagedFunnelPagePayload, ManagedFunnelPage } from "../../../lib/funnels/server";
import { showGlobalToast } from "../../../lib/toast";

type Selection =
  | { kind: "page" }
  | { kind: "section"; sectionIndex: number }
  | { kind: "element"; sectionIndex: number; rowIndex: number; columnIndex: number; elementIndex: number };

type PendingNavigation =
  | { kind: "href"; href: string }
  | { kind: "back" };

const INPUT = "min-h-10 w-full rounded-[11px] border border-[#cfbea4] bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-[#739655] focus:ring-4 focus:ring-[#739655]/15";
const themes = {
  sage: { page: "#edf4e7", surface: "#fffdf8", muted: "#f5f9f0", accent: "#dfeccf", dark: "#4d6b3a", primary: "#76a456", secondary: "#ffffff", primaryShadow: "#486f34", secondaryShadow: "#cdddbd" },
  cream: { page: "#f8f1e4", surface: "#fffaf2", muted: "#fbf4e8", accent: "#f1e3cf", dark: "#694833", primary: "#8a674d", secondary: "#ffffff", primaryShadow: "#5b3d2c", secondaryShadow: "#e3d0b0" },
  violet: { page: "#f2eef8", surface: "#fffdfd", muted: "#f8f5fb", accent: "#e5dcf1", dark: "#5d4a77", primary: "#79639a", secondary: "#ffffff", primaryShadow: "#514066", secondaryShadow: "#ded5ea" },
  sky: { page: "#eaf4f5", surface: "#fffdf9", muted: "#f2f8f8", accent: "#d6eaeb", dark: "#35666a", primary: "#4d858a", secondary: "#ffffff", primaryShadow: "#315d60", secondaryShadow: "#cce1e2" }
} as const;

function cloneDocument(document: FunnelPageDocument) {
  return structuredClone(document);
}

function createElement(type: FunnelPageElement["type"]): FunnelPageElement {
  const id = createFunnelDocumentId(type);
  if (type === "eyebrow") return { id, type, props: { text: "Short lead-in", align: "left" } };
  if (type === "heading") return { id, type, props: { text: "New heading", level: "h2", align: "left" } };
  if (type === "text") return { id, type, props: { text: "Add your copy here.", style: "body", align: "left" } };
  if (type === "list") return {
    id,
    type,
    props: {
      items: ["First benefit", "Second benefit"],
      style: "checks",
      align: "left",
      typography: { fontSize: 18, lineHeight: 28, fontWeight: 600 },
      appearance: { marker: "check", markerSize: 22, markerColor: "#76a456", itemSpacing: 8, markerGap: 12, borderWidth: 0, borderRadius: 14, paddingX: 0, paddingY: 0 }
    }
  };
  if (type === "image") return { id, type, props: { media: { assetId: null, storagePath: null, publicUrl: null, alt: "", width: null, height: null }, fit: "contain", caption: "" } };
  if (type === "button") return { id, type, props: { label: "Continue", variant: "primary", align: "left", action: { type: "next_step" } } };
  if (type === "countdown") return {
    id,
    type,
    props: {
      mode: "delay",
      duration: { days: 1, hours: 0, minutes: 0, seconds: 0 },
      expiryAction: { type: "none" },
      align: "center",
      showDays: true,
      showLabels: true,
      separator: ":",
      typography: { fontSize: 36, fontWeight: 700 },
      labelTypography: { fontSize: 11, fontWeight: 600 }
    }
  };
  if (type === "lead_capture") return { id, type, props: { heading: "Where should we send it?", collectFirstName: true, firstNameLabel: "First name", emailLabel: "Email address", submitLabel: "Continue", action: { type: "next_step" } } };
  return { id, type: "divider", props: {} };
}

function newSection(kind: "blank" | "hero" | "split" | "offer"): FunnelPageSection {
  const columns = kind === "split" ? 2 : 1;
  const elements = kind === "hero"
    ? [createElement("eyebrow"), createElement("heading"), createElement("text"), createElement("button")]
    : kind === "offer"
      ? [createElement("heading"), createElement("list"), createElement("button")]
      : [];
  return {
    id: createFunnelDocumentId("section"),
    props: { tone: kind === "offer" ? "accent" : "default", width: "standard", background: null },
    rows: [{
      id: createFunnelDocumentId("row"),
      columns: Array.from({ length: columns }, (_, index) => ({
        id: createFunnelDocumentId("column"),
        span: columns === 2 ? 6 : 12,
        elements: index === 0 ? elements : [createElement("image")]
      }))
    }]
  };
}

function actionTarget(action: FunnelAction) {
  if (action.type === "url") return action.target;
  return "target" in action ? action.target ?? "" : "";
}

function actionOffer(action: FunnelAction) {
  return "offerKey" in action ? action.offerKey : "";
}

function buildAction(type: FunnelAction["type"], target: string, offerKey: string): FunnelAction {
  if (type === "url") return { type, target: target || "/" };
  if (type === "checkout" || type === "accept_offer" || type === "decline_offer") {
    return { type, offerKey: offerKey || "offer", target: target || null };
  }
  return { type };
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || fallback;
}

function AssetLibrary({
  assets,
  funnelId,
  stepId,
  onChoose,
  onUploaded,
  onClose
}: {
  assets: FunnelMediaSnapshot[];
  funnelId: string;
  stepId: string;
  onChoose: (asset: FunnelMediaSnapshot) => void;
  onUploaded: (asset: FunnelMediaSnapshot) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    if (uploading) return;
    setError(null);
    setUploading(true);
    let prepared: { assetId: string; objectPath: string; uploadUrl: string; contentType: string } | null = null;
    try {
      const response = await fetch("/api/funnels/assets/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnelId, stepId, contentType: file.type, sizeBytes: file.size })
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not prepare the image."));
      prepared = await response.json();
      const uploadResponse = await fetch(prepared!.uploadUrl, { method: "PUT", headers: { "Content-Type": prepared!.contentType }, body: file });
      if (!uploadResponse.ok) throw new Error("The image could not be uploaded to storage.");
      const complete = await fetch("/api/funnels/assets/upload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnelId, stepId, objectPath: prepared!.objectPath, assetId: prepared!.assetId })
      });
      if (!complete.ok) throw new Error(await responseError(complete, "Could not verify the image."));
      const asset = await complete.json() as FunnelMediaSnapshot;
      onUploaded({ ...asset, alt: file.name.replace(/\.[^.]+$/, "") });
    } catch (uploadError) {
      if (prepared) {
        await fetch("/api/funnels/assets/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ funnelId, stepId, objectPath: prepared.objectPath }) }).catch(() => undefined);
      }
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="max-h-[86vh] w-full max-w-4xl overflow-auto rounded-[24px] border border-[#d8c5a8] bg-[#fffaf2] p-5 shadow-2xl">
        <header className="flex items-center justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[.12em] text-[#567b40]">Media manager</p><h2 className="mt-1 text-2xl font-semibold">Page images</h2></div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-[#d8c5a8] bg-white text-xl" aria-label="Close media manager">×</button>
        </header>
        <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="mt-5 flex min-h-28 w-full items-center justify-center rounded-[18px] border-2 border-dashed border-[#a88969] bg-white px-5 text-center font-semibold text-[#74573e] disabled:opacity-60">
          {uploading ? "Uploading image…" : "Upload a JPEG, PNG, or WebP image"}
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
        {error ? <p className="mt-3 rounded-[12px] bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#8c4536]">{error}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset) => asset.publicUrl ? (
            <button key={asset.assetId ?? asset.publicUrl} type="button" onClick={() => onChoose(asset)} className="group rounded-[16px] border border-[#d8c5a8] bg-white p-2 text-left transition hover:border-[#739655] hover:ring-4 hover:ring-[#739655]/10">
              <Image src={asset.publicUrl} alt={asset.alt} width={320} height={220} unoptimized className="aspect-[4/3] w-full rounded-[10px] object-contain" />
              <span className="mt-2 block truncate px-1 text-xs text-ink/55">{asset.alt || "Uploaded image"}</span>
            </button>
          ) : null)}
        </div>
        {assets.length === 0 ? <p className="py-8 text-center text-sm text-ink/50">Uploaded images will remain available in this page’s revision history.</p> : null}
      </section>
    </div>
  );
}

function PreviewElement({ element, palette, onSelect, selected }: { element: FunnelPageElement; palette: FunnelButtonPalette; onSelect: () => void; selected: boolean }) {
  const align = "align" in element.props ? element.props.align : "left";
  const selection = selected ? "ring-4 ring-[#739655]/35 ring-offset-2" : "hover:ring-2 hover:ring-[#739655]/25";
  const common = `relative rounded-[8px] cursor-pointer transition ${selection}`;
  if (element.type === "eyebrow") return <p onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} text-xs font-black uppercase tracking-[.12em]`} style={{ textAlign: align }}>{element.props.text}</p>;
  if (element.type === "heading") {
    const Tag = element.props.level;
    return <Tag onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} font-semibold leading-[1.05] tracking-[-.045em] ${element.props.level === "h1" ? "text-5xl" : element.props.level === "h2" ? "text-4xl" : "text-2xl"}`} style={{ textAlign: align }}>{element.props.text}</Tag>;
  }
  if (element.type === "text") return <p onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} whitespace-pre-line ${element.props.style === "lead" ? "text-xl leading-8" : element.props.style === "small" ? "text-sm" : "text-base leading-7"}`} style={{ textAlign: align }}>{element.props.text}</p>;
  if (element.type === "list") {
    if (!isCustomizedFunnelList(element.props)) {
      return <ul onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} grid gap-2`}>{element.props.items.map((item, index) => <li key={index} className="flex gap-2 rounded-[12px] bg-white/70 px-3 py-2"><span style={{ color: palette.primary }}>{element.props.style === "checks" ? "✓" : "•"}</span>{item}</li>)}</ul>;
    }
    return <ul onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} grid`} style={funnelListContainerStyle(element.props)}>{element.props.items.map((item, index) => <li key={index} className="flex" style={funnelListItemStyle(element.props)}><span className="shrink-0 font-black" aria-hidden="true" style={funnelListMarkerStyle(element.props, palette.primary)}>{funnelListMarker(element.props)}</span><span style={funnelListTextStyle(element.props)}>{item}</span></li>)}</ul>;
  }
  if (element.type === "image") return <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} min-h-28 w-full overflow-hidden border border-dashed border-ink/20 bg-white/40`}>{element.props.media.publicUrl ? <Image src={element.props.media.publicUrl} alt={element.props.media.alt} width={1000} height={700} unoptimized className={`max-h-96 w-full ${element.props.fit === "cover" ? "object-cover" : "object-contain"}`} /> : <span className="text-sm text-ink/45">Choose an image in the inspector</span>}</button>;
  if (element.type === "button") {
    const textColor = funnelButtonDefaultTextColor(element.props, palette);
    return <div onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} flex ${align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start"}`}><span className="inline-flex min-h-12 flex-col items-center justify-center gap-0.5 text-center transition" style={funnelButtonBoxStyle(element.props, palette)}><span className="inline-flex items-center justify-center gap-2 text-lg font-semibold" style={funnelButtonTextStyle(element.props.typography, textColor)}>{element.props.label}{element.props.showArrow === false ? null : <span aria-hidden="true">→</span>}</span>{element.props.subtext ? <span className="text-xs font-medium opacity-90" style={funnelButtonSubtextStyle(element.props.subtextTypography, textColor)}>{element.props.subtext}</span> : null}</span></div>;
  }
  if (element.type === "countdown") {
    const configured = element.props.mode === "deadline"
      ? Math.max(0, Date.parse(element.props.deadline ?? "") - Date.now())
      : countdownDurationMs(element.props.duration);
    const parts = countdownParts(Number.isFinite(configured) ? configured : 0);
    const units = [
      ...(element.props.showDays ? [{ label: "Days", value: parts.days }] : []),
      { label: "Hours", value: parts.hours },
      { label: "Minutes", value: parts.minutes },
      { label: "Seconds", value: parts.seconds }
    ];
    const justify = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
    return <div onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} flex ${justify} px-3 py-2`}><div className="inline-flex items-start gap-2">{units.map((unit, index) => <span key={unit.label} className="contents">{index > 0 ? <span style={{ color: element.props.typography?.color ?? palette.primary, fontFamily: element.props.typography?.fontFamily, fontSize: element.props.typography?.fontSize, fontWeight: element.props.typography?.fontWeight }}>{element.props.separator}</span> : null}<span className="grid min-w-[2.2ch] justify-items-center leading-none"><span className="tabular-nums" style={{ color: element.props.typography?.color ?? palette.primary, fontFamily: element.props.typography?.fontFamily, fontSize: element.props.typography?.fontSize, fontWeight: element.props.typography?.fontWeight }}>{String(unit.value).padStart(2, "0")}</span>{element.props.showLabels ? <span className="mt-2 uppercase tracking-[.08em]" style={{ fontFamily: element.props.labelTypography?.fontFamily, fontSize: element.props.labelTypography?.fontSize, fontWeight: element.props.labelTypography?.fontWeight, color: element.props.labelTypography?.color }}>{unit.label}</span> : null}</span></span>)}</div></div>;
  }
  if (element.type === "lead_capture") return <div onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} grid gap-3 rounded-[16px] border border-ink/10 bg-white p-4`}><strong>{element.props.heading}</strong>{element.props.collectFirstName ? <span className="rounded-[10px] border border-ink/15 px-3 py-2 text-sm text-ink/45">{element.props.firstNameLabel}</span> : null}<span className="rounded-[10px] border border-ink/15 px-3 py-2 text-sm text-ink/45">{element.props.emailLabel}</span><span className="rounded-[10px] px-4 py-2 text-center font-semibold text-white" style={{ background: palette.primary }}>{element.props.submitLabel}</span></div>;
  return <hr onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} border-ink/15`} />;
}

function EditorCanvas({ document, selection, onSelect, viewport, showProtectedOrderForm = false }: { document: FunnelPageDocument; selection: Selection; onSelect: (selection: Selection) => void; viewport: "desktop" | "mobile"; showProtectedOrderForm?: boolean }) {
  const baseTheme = themes[document.theme];
  const styles = document.styles;
  const pageBg = styles?.colors?.pageBackground ?? baseTheme.page;
  const surface = styles?.colors?.surface ?? baseTheme.surface;
  const primary = styles?.colors?.primary ?? baseTheme.primary;
  const palette: FunnelButtonPalette = {
    primary,
    secondary: styles?.colors?.secondary ?? baseTheme.secondary,
    primaryText: "#ffffff",
    secondaryText: baseTheme.dark,
    primaryShadow: baseTheme.primaryShadow,
    secondaryShadow: baseTheme.secondaryShadow,
    pageBorderRadius: styles?.buttons?.borderRadius
  };
  const width = styles?.layout?.contentWidth ?? 1120;
  const sectionGap = styles?.layout?.sectionGap ?? 22;
  const paddingY = styles?.layout?.sectionPaddingY ?? 38;
  const columnGap = styles?.layout?.columnGap ?? 22;
  return (
    <div className={`mx-auto min-h-full overflow-hidden bg-white shadow-2xl transition-all ${viewport === "mobile" ? "w-[390px]" : "w-full max-w-[1320px]"}`} style={{ background: pageBg, color: styles?.typography?.bodyColor, fontFamily: styles?.typography?.bodyFontFamily, fontSize: styles?.typography?.baseFontSize }} onClick={() => onSelect({ kind: "page" })}>
      <div className="grid" style={{ gap: sectionGap, padding: viewport === "mobile" ? 12 : 24 }}>
        {document.sections.map((section, sectionIndex) => {
          const selected = selection.kind === "section" && selection.sectionIndex === sectionIndex;
          const tone = section.props.tone === "dark" ? baseTheme.dark : section.props.tone === "muted" ? baseTheme.muted : section.props.tone === "accent" ? baseTheme.accent : surface;
          const background = section.props.background?.publicUrl ? `url(${section.props.background.publicUrl}) center/cover` : tone;
          return (
            <section key={section.id} onClick={(event) => { event.stopPropagation(); onSelect({ kind: "section", sectionIndex }); }} className={`rounded-[22px] border border-black/10 transition ${selected ? "ring-4 ring-[#739655]/35" : "hover:ring-2 hover:ring-[#739655]/20"}`} style={{ background, color: section.props.tone === "dark" ? "white" : undefined, paddingTop: paddingY, paddingBottom: paddingY }}>
              <div className="mx-auto px-5" style={{ maxWidth: section.props.width === "narrow" ? Math.min(width, 820) : section.props.width === "wide" ? Math.max(width, 1280) : width }}>
                {section.rows.map((row, rowIndex) => <div key={row.id} className={`grid ${viewport === "mobile" ? "grid-cols-1" : "grid-cols-12"}`} style={{ gap: columnGap }}>
                  {row.columns.map((column, columnIndex) => <div key={column.id} className="grid content-start gap-4" style={viewport === "mobile" ? undefined : { gridColumn: `span ${column.span}` }}>
                    {column.elements.map((element, elementIndex) => <PreviewElement key={element.id} element={element} palette={palette} selected={selection.kind === "element" && selection.sectionIndex === sectionIndex && selection.rowIndex === rowIndex && selection.columnIndex === columnIndex && selection.elementIndex === elementIndex} onSelect={() => onSelect({ kind: "element", sectionIndex, rowIndex, columnIndex, elementIndex })} />)}
                    {column.elements.length === 0 ? <button type="button" onClick={(event) => { event.stopPropagation(); onSelect({ kind: "section", sectionIndex }); }} className="min-h-24 rounded-[14px] border border-dashed border-ink/20 text-sm text-ink/40">Empty column</button> : null}
                  </div>)}
                </div>)}
              </div>
            </section>
          );
        })}
        {showProtectedOrderForm ? (
          <section className="rounded-[22px] border border-[#bdd2aa] bg-[#f5faef] px-5 py-6 shadow-[0_8px_24px_rgba(79,84,51,.06)]">
            <div className="mx-auto flex max-w-[920px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#dfeccf] text-[#4d6b3a]" aria-hidden="true">
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                      <rect x="4.5" y="8.5" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M7 8.5V6.8a3 3 0 0 1 6 0v1.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                    </svg>
                  </span>
                  <p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Protected checkout</p>
                </div>
                <h3 className="mt-2 text-xl font-semibold tracking-[-.025em]">Secure order form</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/55">
                  The selected product, optional order bumps, and Stripe checkout button appear here on the live page.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-[#bdd2aa] bg-white px-3 py-1.5 text-xs font-semibold text-[#567b40]">
                Managed in step settings
              </span>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

type FunnelButtonElement = Extract<FunnelPageElement, { type: "button" }>;
type FunnelListElement = Extract<FunnelPageElement, { type: "list" }>;
type FunnelCountdownElement = Extract<FunnelPageElement, { type: "countdown" }>;

function InspectorGroup({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [expanded, setExpanded] = useState(open);
  return <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="group rounded-[14px] border border-[#dfcfb7] bg-white/65"><summary className="cursor-pointer list-none px-3 py-3 text-xs font-bold text-ink marker:hidden">{title}<span className="float-right text-ink/35 transition group-open:rotate-180">⌄</span></summary><div className="grid gap-3 border-t border-[#eadfce] p-3">{children}</div></details>;
}

function FontFamilyControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1.5 text-xs font-semibold">{label}<select className={INPUT} value={value} onChange={(event) => onChange(event.target.value)}>{FUNNEL_BUTTON_FONT_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}</select></label>;
}

function ButtonInspector({ element, update, palette }: { element: FunnelButtonElement; update: (next: FunnelButtonElement) => void; palette: FunnelButtonPalette }) {
  const props = element.props;
  const appearance = props.appearance ?? {};
  const typography = props.typography ?? {};
  const subtextTypography = props.subtextTypography ?? {};
  const primary = props.variant === "primary";
  const textVariant = props.variant === "text";
  const defaultTextColor = funnelButtonDefaultTextColor(props, palette);
  const updateProps = (next: Partial<FunnelButtonElement["props"]>) => update({ ...element, props: { ...props, ...next } });
  const updateTypography = (next: Partial<NonNullable<FunnelButtonElement["props"]["typography"]>>) => updateProps({ typography: { ...typography, ...next } });
  const updateSubtextTypography = (next: Partial<NonNullable<FunnelButtonElement["props"]["subtextTypography"]>>) => updateProps({ subtextTypography: { ...subtextTypography, ...next } });
  const updateAppearance = (next: Partial<NonNullable<FunnelButtonElement["props"]["appearance"]>>) => updateProps({ appearance: { ...appearance, ...next } });
  const defaultBackground = primary ? palette.primary : textVariant ? "#ffffff" : palette.secondary;
  const defaultBorder = palette.primary;
  const defaultShadow = primary ? palette.primaryShadow : palette.secondaryShadow;

  return <div className="grid gap-3">
    <InspectorGroup title="Copy" open>
      <label className="grid gap-1.5 text-xs font-semibold">Button text<input className={INPUT} value={props.label} onChange={(event) => updateProps({ label: event.target.value })} /></label>
      <label className="grid gap-1.5 text-xs font-semibold">Subtext<input className={INPUT} value={props.subtext ?? ""} placeholder="Optional reassurance or guarantee" onChange={(event) => updateProps({ subtext: event.target.value })} /></label>
      <label className="flex items-center justify-between gap-3 rounded-[11px] border border-[#dfcfb7] bg-white px-3 py-2 text-xs font-semibold"><span>Show arrow</span><input type="checkbox" checked={props.showArrow !== false} onChange={(event) => updateProps({ showArrow: event.target.checked })} className="h-4 w-4 accent-[#76a456]" /></label>
    </InspectorGroup>
    <InspectorGroup title="Main text typography" open>
      <FontFamilyControl label="Font type" value={typography.fontFamily ?? ""} onChange={(fontFamily) => updateTypography({ fontFamily: fontFamily || undefined })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Font size" value={typography.fontSize ?? 18} min={10} max={96} onChange={(fontSize) => updateTypography({ fontSize })} /><NumberControl label="Line height" value={typography.lineHeight ?? 24} min={10} max={120} onChange={(lineHeight) => updateTypography({ lineHeight })} /></div>
      <label className="grid gap-1.5 text-xs font-semibold">Font weight<select className={INPUT} value={typography.fontWeight ?? 600} onChange={(event) => updateTypography({ fontWeight: Number(event.target.value) })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option><option value="900">Black</option></select></label>
      <ColorControl label="Text color" value={typography.color ?? defaultTextColor} onChange={(color) => updateTypography({ color })} />
    </InspectorGroup>
    <InspectorGroup title="Subtext typography" open={Boolean(props.subtext)}>
      <FontFamilyControl label="Font type" value={subtextTypography.fontFamily ?? ""} onChange={(fontFamily) => updateSubtextTypography({ fontFamily: fontFamily || undefined })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Font size" value={subtextTypography.fontSize ?? 13} min={8} max={48} onChange={(fontSize) => updateSubtextTypography({ fontSize })} /><NumberControl label="Line height" value={subtextTypography.lineHeight ?? 18} min={8} max={72} onChange={(lineHeight) => updateSubtextTypography({ lineHeight })} /></div>
      <label className="grid gap-1.5 text-xs font-semibold">Font weight<select className={INPUT} value={subtextTypography.fontWeight ?? 500} onChange={(event) => updateSubtextTypography({ fontWeight: Number(event.target.value) })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></label>
      <ColorControl label="Subtext color" value={subtextTypography.color ?? defaultTextColor} onChange={(color) => updateSubtextTypography({ color })} />
    </InspectorGroup>
    <InspectorGroup title="Button shape & color" open>
      <label className="grid gap-1.5 text-xs font-semibold">Style<select className={INPUT} value={props.variant} onChange={(event) => updateProps({ variant: event.target.value as FunnelButtonElement["props"]["variant"] })}><option value="primary">Primary</option><option value="secondary">Secondary</option><option value="text">Text link</option></select></label>
      <label className="grid gap-1.5 text-xs font-semibold">Width<select className={INPUT} value={appearance.width ?? "fit"} onChange={(event) => updateAppearance({ width: event.target.value as "fit" | "full" })}><option value="fit">Fit content</option><option value="full">Full column</option></select></label>
      <ColorControl label="Background color" value={appearance.backgroundColor ?? defaultBackground} onChange={(backgroundColor) => updateAppearance({ backgroundColor })} />
      <ColorControl label="Border color" value={appearance.borderColor ?? defaultBorder} onChange={(borderColor) => updateAppearance({ borderColor })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Border width" value={appearance.borderWidth ?? (textVariant ? 0 : 2)} min={0} max={16} onChange={(borderWidth) => updateAppearance({ borderWidth })} /><NumberControl label="Corner radius" value={appearance.borderRadius ?? palette.pageBorderRadius ?? (textVariant ? 0 : 18)} min={0} max={999} onChange={(borderRadius) => updateAppearance({ borderRadius })} /></div>
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Side padding" value={appearance.paddingX ?? (textVariant ? 0 : 28)} min={0} max={160} onChange={(paddingX) => updateAppearance({ paddingX })} /><NumberControl label="Top/bottom" value={appearance.paddingY ?? (textVariant ? 0 : 16)} min={0} max={100} onChange={(paddingY) => updateAppearance({ paddingY })} /></div>
      <div className="grid grid-cols-[1fr_96px] gap-2"><ColorControl label="Shadow color" value={appearance.shadowColor ?? defaultShadow} onChange={(shadowColor) => updateAppearance({ shadowColor })} /><NumberControl label="Depth" value={appearance.shadowDepth ?? (primary ? 8 : textVariant ? 0 : 6)} min={0} max={30} onChange={(shadowDepth) => updateAppearance({ shadowDepth })} /></div>
      <button type="button" onClick={() => updateProps({ typography: undefined, subtextTypography: undefined, appearance: undefined, showArrow: undefined })} className="rounded-[11px] border border-[#cfbea4] bg-white px-3 py-2 text-xs font-semibold text-ink/60 hover:border-[#9f7c5e] hover:text-ink">Reset styling to page defaults</button>
    </InspectorGroup>
  </div>;
}

function ListInspector({ element, update, palette }: { element: FunnelListElement; update: (next: FunnelListElement) => void; palette: FunnelButtonPalette }) {
  const props = element.props;
  const typography = props.typography ?? {};
  const appearance = props.appearance ?? {};
  const marker = appearance.marker ?? (props.style === "bullets" ? "bullet" : "check");
  const updateProps = (next: Partial<FunnelListElement["props"]>) => update({ ...element, props: { ...props, ...next } });
  const updateTypography = (next: Partial<NonNullable<FunnelListElement["props"]["typography"]>>) => updateProps({ typography: { ...typography, ...next } });
  const updateAppearance = (next: Partial<NonNullable<FunnelListElement["props"]["appearance"]>>) => updateProps({ appearance: { ...appearance, ...next } });

  return <div className="grid gap-3">
    <InspectorGroup title="List items" open>
      <p className="text-xs leading-5 text-ink/55">Put each benefit or feature on its own line. Empty lines are removed.</p>
      <label className="grid gap-1.5 text-xs font-semibold">Items<textarea rows={8} className={`${INPUT} resize-y`} value={props.items.join("\n")} onChange={(event) => updateProps({ items: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
    </InspectorGroup>
    <InspectorGroup title="Marker & spacing" open>
      <label className="grid gap-1.5 text-xs font-semibold">Bullet icon<select className={INPUT} value={marker} onChange={(event) => { const nextMarker = event.target.value as FunnelListMarker; updateProps({ style: nextMarker === "bullet" ? "bullets" : "checks", appearance: { ...appearance, marker: nextMarker } }); }}><option value="check">Checkmark ✓</option><option value="bullet">Bullet •</option><option value="arrow">Arrow →</option><option value="star">Star ★</option></select></label>
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Icon size" value={appearance.markerSize ?? 22} min={8} max={96} onChange={(markerSize) => updateAppearance({ markerSize })} /><NumberControl label="Icon gap" value={appearance.markerGap ?? 12} min={0} max={80} onChange={(markerGap) => updateAppearance({ markerGap })} /></div>
      <NumberControl label="Vertical spacing" value={appearance.itemSpacing ?? 8} min={0} max={80} onChange={(itemSpacing) => updateAppearance({ itemSpacing })} />
      <ColorControl label="Icon color" value={appearance.markerColor ?? palette.primary} onChange={(markerColor) => updateAppearance({ markerColor })} />
    </InspectorGroup>
    <InspectorGroup title="Typography" open>
      <FontFamilyControl label="Font type" value={typography.fontFamily ?? ""} onChange={(fontFamily) => updateTypography({ fontFamily: fontFamily || undefined })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Font size" value={typography.fontSize ?? 18} min={10} max={96} onChange={(fontSize) => updateTypography({ fontSize })} /><NumberControl label="Line height" value={typography.lineHeight ?? 28} min={10} max={120} onChange={(lineHeight) => updateTypography({ lineHeight })} /></div>
      <label className="grid gap-1.5 text-xs font-semibold">Font weight<select className={INPUT} value={typography.fontWeight ?? 600} onChange={(event) => updateTypography({ fontWeight: Number(event.target.value) })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option><option value="900">Black</option></select></label>
      <ColorControl label="Text color" value={typography.color ?? "#172033"} onChange={(color) => updateTypography({ color })} />
    </InspectorGroup>
    <InspectorGroup title="Background, border & padding">
      <label className="flex items-center justify-between gap-3 rounded-[11px] border border-[#dfcfb7] bg-white px-3 py-2 text-xs font-semibold"><span>Transparent background</span><input type="checkbox" checked={!appearance.backgroundColor} onChange={(event) => updateAppearance({ backgroundColor: event.target.checked ? undefined : "#ffffff" })} className="h-4 w-4 accent-[#76a456]" /></label>
      {appearance.backgroundColor ? <ColorControl label="Background color" value={appearance.backgroundColor} onChange={(backgroundColor) => updateAppearance({ backgroundColor })} /> : null}
      <ColorControl label="Border color" value={appearance.borderColor ?? "#d8c5a8"} onChange={(borderColor) => updateAppearance({ borderColor })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Border width" value={appearance.borderWidth ?? 0} min={0} max={16} onChange={(borderWidth) => updateAppearance({ borderWidth })} /><NumberControl label="Corner radius" value={appearance.borderRadius ?? 14} min={0} max={160} onChange={(borderRadius) => updateAppearance({ borderRadius })} /></div>
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Side padding" value={appearance.paddingX ?? 0} min={0} max={160} onChange={(paddingX) => updateAppearance({ paddingX })} /><NumberControl label="Top/bottom" value={appearance.paddingY ?? 0} min={0} max={120} onChange={(paddingY) => updateAppearance({ paddingY })} /></div>
      <button type="button" onClick={() => updateProps({ typography: undefined, appearance: undefined })} className="rounded-[11px] border border-[#cfbea4] bg-white px-3 py-2 text-xs font-semibold text-ink/60 hover:border-[#9f7c5e] hover:text-ink">Reset list styling</button>
    </InspectorGroup>
  </div>;
}

function toDateTimeLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function CountdownInspector({ element, update, palette }: { element: FunnelCountdownElement; update: (next: FunnelCountdownElement) => void; palette: FunnelButtonPalette }) {
  const props = element.props;
  const typography = props.typography ?? {};
  const labelTypography = props.labelTypography ?? {};
  const updateProps = (next: Partial<FunnelCountdownElement["props"]>) => update({ ...element, props: { ...props, ...next } });
  const updateDuration = (part: keyof FunnelCountdownElement["props"]["duration"], value: number) => updateProps({ duration: { ...props.duration, [part]: value } });
  const updateTypography = (next: Partial<NonNullable<FunnelCountdownElement["props"]["typography"]>>) => updateProps({ typography: { ...typography, ...next } });
  const updateLabelTypography = (next: Partial<NonNullable<FunnelCountdownElement["props"]["labelTypography"]>>) => updateProps({ labelTypography: { ...labelTypography, ...next } });
  const changeExpiryAction = (type: FunnelCountdownElement["props"]["expiryAction"]["type"]) => {
    if (type === "redirect") updateProps({ expiryAction: { type, target: "/" } });
    else if (type === "message") updateProps({ expiryAction: { type, message: "This offer has ended." } });
    else updateProps({ expiryAction: { type } });
  };

  return <div className="grid gap-3">
    <InspectorGroup title="Countdown" open>
      <label className="grid gap-1.5 text-xs font-semibold">Countdown type<select className={INPUT} value={props.mode} onChange={(event) => updateProps({ mode: event.target.value as "delay" | "deadline" })}><option value="delay">Visitor delay (evergreen)</option><option value="deadline">Fixed date and time</option></select></label>
      {props.mode === "delay" ? <><p className="text-xs leading-5 text-ink/55">Starts separately for each visitor and continues across refreshes in that browser.</p><div className="grid grid-cols-2 gap-2"><NumberControl label="Days" value={props.duration.days} min={0} max={3650} onChange={(value) => updateDuration("days", value)} /><NumberControl label="Hours" value={props.duration.hours} min={0} max={23} onChange={(value) => updateDuration("hours", value)} /><NumberControl label="Minutes" value={props.duration.minutes} min={0} max={59} onChange={(value) => updateDuration("minutes", value)} /><NumberControl label="Seconds" value={props.duration.seconds} min={0} max={59} onChange={(value) => updateDuration("seconds", value)} /></div></> : <label className="grid gap-1.5 text-xs font-semibold">Deadline<input type="datetime-local" className={INPUT} value={toDateTimeLocal(props.deadline)} onChange={(event) => updateProps({ deadline: fromDateTimeLocal(event.target.value) })} /></label>}
      <label className="grid gap-1.5 text-xs font-semibold">When time runs out<select className={INPUT} value={props.expiryAction.type} onChange={(event) => changeExpiryAction(event.target.value as FunnelCountdownElement["props"]["expiryAction"]["type"])}><option value="none">Stop at zero</option><option value="redirect">Redirect to a page</option><option value="hide">Hide countdown</option><option value="message">Show a message</option></select></label>
      {props.expiryAction.type === "redirect" ? <label className="grid gap-1.5 text-xs font-semibold">Redirect URL<input className={INPUT} value={props.expiryAction.target} placeholder="/next-offer or https://…" onChange={(event) => updateProps({ expiryAction: { type: "redirect", target: event.target.value } })} /></label> : null}
      {props.expiryAction.type === "message" ? <label className="grid gap-1.5 text-xs font-semibold">Expired message<input className={INPUT} value={props.expiryAction.message} onChange={(event) => updateProps({ expiryAction: { type: "message", message: event.target.value } })} /></label> : null}
    </InspectorGroup>
    <InspectorGroup title="Display" open>
      <div className="grid grid-cols-2 gap-2"><label className="flex items-center justify-between gap-2 rounded-[11px] border border-[#dfcfb7] bg-white px-3 py-2 text-xs font-semibold"><span>Show days</span><input type="checkbox" checked={props.showDays} onChange={(event) => updateProps({ showDays: event.target.checked })} className="h-4 w-4 accent-[#76a456]" /></label><label className="flex items-center justify-between gap-2 rounded-[11px] border border-[#dfcfb7] bg-white px-3 py-2 text-xs font-semibold"><span>Show labels</span><input type="checkbox" checked={props.showLabels} onChange={(event) => updateProps({ showLabels: event.target.checked })} className="h-4 w-4 accent-[#76a456]" /></label></div>
      <label className="grid gap-1.5 text-xs font-semibold">Separator<input className={INPUT} value={props.separator} maxLength={3} onChange={(event) => updateProps({ separator: event.target.value })} /></label>
    </InspectorGroup>
    <InspectorGroup title="Time typography" open>
      <FontFamilyControl label="Font type" value={typography.fontFamily ?? ""} onChange={(fontFamily) => updateTypography({ fontFamily: fontFamily || undefined })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Font size" value={typography.fontSize ?? 36} min={12} max={120} onChange={(fontSize) => updateTypography({ fontSize })} /><label className="grid gap-1.5 text-xs font-semibold">Weight<select className={INPUT} value={typography.fontWeight ?? 700} onChange={(event) => updateTypography({ fontWeight: Number(event.target.value) })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option><option value="900">Black</option></select></label></div>
      <ColorControl label="Time color" value={typography.color ?? palette.primary} onChange={(color) => updateTypography({ color })} />
    </InspectorGroup>
    <InspectorGroup title="Label typography" open={props.showLabels}>
      <FontFamilyControl label="Font type" value={labelTypography.fontFamily ?? ""} onChange={(fontFamily) => updateLabelTypography({ fontFamily: fontFamily || undefined })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Font size" value={labelTypography.fontSize ?? 11} min={8} max={48} onChange={(fontSize) => updateLabelTypography({ fontSize })} /><label className="grid gap-1.5 text-xs font-semibold">Weight<select className={INPUT} value={labelTypography.fontWeight ?? 600} onChange={(event) => updateLabelTypography({ fontWeight: Number(event.target.value) })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></label></div>
      <ColorControl label="Label color" value={labelTypography.color ?? "#70685d"} onChange={(color) => updateLabelTypography({ color })} />
      <button type="button" onClick={() => updateProps({ typography: undefined, labelTypography: undefined })} className="rounded-[11px] border border-[#cfbea4] bg-white px-3 py-2 text-xs font-semibold text-ink/60 hover:border-[#9f7c5e] hover:text-ink">Reset typography</button>
    </InspectorGroup>
  </div>;
}

function ElementInspector({ element, update, chooseMedia, move, remove, buttonPalette }: { element: FunnelPageElement; update: (next: FunnelPageElement) => void; chooseMedia: () => void; move: (direction: -1 | 1) => void; remove: () => void; buttonPalette: FunnelButtonPalette }) {
  const align = "align" in element.props ? element.props.align : null;
  return <div className="grid gap-4">
    <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Element</p><h3 className="mt-1 text-lg font-semibold capitalize">{element.type.replaceAll("_", " ")}</h3></div><div className="flex gap-1"><button type="button" onClick={() => move(-1)} className="rounded-lg border px-2 py-1">↑</button><button type="button" onClick={() => move(1)} className="rounded-lg border px-2 py-1">↓</button><button type="button" onClick={remove} className="rounded-lg border px-2 py-1 text-[#9b4738]">×</button></div></div>
    {element.type === "eyebrow" || element.type === "heading" || element.type === "text" ? <label className="grid gap-1.5 text-xs font-semibold">Text<textarea rows={element.type === "text" ? 7 : 3} className={`${INPUT} resize-y`} value={element.props.text} onChange={(event) => update({ ...element, props: { ...element.props, text: event.target.value } } as FunnelPageElement)} /></label> : null}
    {element.type === "heading" ? <label className="grid gap-1.5 text-xs font-semibold">Heading size<select className={INPUT} value={element.props.level} onChange={(event) => update({ ...element, props: { ...element.props, level: event.target.value as "h1" | "h2" | "h3" } })}><option value="h1">Page headline</option><option value="h2">Section heading</option><option value="h3">Small heading</option></select></label> : null}
    {element.type === "text" ? <label className="grid gap-1.5 text-xs font-semibold">Text style<select className={INPUT} value={element.props.style} onChange={(event) => update({ ...element, props: { ...element.props, style: event.target.value as "lead" | "body" | "small" } })}><option value="lead">Lead</option><option value="body">Body</option><option value="small">Small</option></select></label> : null}
    {element.type === "list" ? <ListInspector element={element} palette={buttonPalette} update={update} /> : null}
    {element.type === "image" ? <><button type="button" onClick={chooseMedia} className="rounded-[13px] border-2 border-[#739655] bg-[#edf5e7] px-4 py-3 text-sm font-semibold text-[#4d6a39]">Choose from media manager</button><label className="grid gap-1.5 text-xs font-semibold">Alternative text<input className={INPUT} value={element.props.media.alt} onChange={(event) => update({ ...element, props: { ...element.props, media: { ...element.props.media, alt: event.target.value } } })} /></label><label className="grid gap-1.5 text-xs font-semibold">Image fit<select className={INPUT} value={element.props.fit} onChange={(event) => update({ ...element, props: { ...element.props, fit: event.target.value as "contain" | "cover" } })}><option value="contain">Show whole image</option><option value="cover">Fill and crop</option></select></label></> : null}
    {element.type === "button" ? <ButtonInspector element={element} palette={buttonPalette} update={update} /> : null}
    {element.type === "countdown" ? <CountdownInspector element={element} palette={buttonPalette} update={update} /> : null}
    {element.type === "lead_capture" ? <><label className="grid gap-1.5 text-xs font-semibold">Form heading<input className={INPUT} value={element.props.heading} onChange={(event) => update({ ...element, props: { ...element.props, heading: event.target.value } })} /></label><label className="grid gap-1.5 text-xs font-semibold">Submit label<input className={INPUT} value={element.props.submitLabel} onChange={(event) => update({ ...element, props: { ...element.props, submitLabel: event.target.value } })} /></label></> : null}
    {element.type === "button" || element.type === "lead_capture" ? <><label className="grid gap-1.5 text-xs font-semibold">Click action<select className={INPUT} value={element.props.action.type} onChange={(event) => update({ ...element, props: { ...element.props, action: buildAction(event.target.value as FunnelAction["type"], actionTarget(element.props.action), actionOffer(element.props.action)) } } as FunnelPageElement)}><option value="next_step">Next funnel step</option><option value="url">Fixed URL</option><option value="checkout">Start checkout</option><option value="accept_offer">Accept offer</option><option value="decline_offer">Decline offer</option><option value="none">No action</option></select></label>{element.props.action.type !== "next_step" && element.props.action.type !== "none" ? <label className="grid gap-1.5 text-xs font-semibold">Destination<input className={INPUT} value={actionTarget(element.props.action)} onChange={(event) => update({ ...element, props: { ...element.props, action: buildAction(element.props.action.type, event.target.value, actionOffer(element.props.action)) } } as FunnelPageElement)} placeholder="Optional funnel-relative target" /></label> : null}{"offerKey" in element.props.action ? <label className="grid gap-1.5 text-xs font-semibold">Offer key<input className={INPUT} value={element.props.action.offerKey} onChange={(event) => update({ ...element, props: { ...element.props, action: buildAction(element.props.action.type, actionTarget(element.props.action), event.target.value) } } as FunnelPageElement)} /></label> : null}</> : null}
    {align ? <label className="grid gap-1.5 text-xs font-semibold">Alignment<select className={INPUT} value={align} onChange={(event) => update({ ...element, props: { ...element.props, align: event.target.value as "left" | "center" | "right" } } as FunnelPageElement)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label> : null}
  </div>;
}

export function FunnelPageStudio({ funnelId, funnelSlug, stepId, data }: { funnelId: string; funnelSlug: string; stepId: string; data: AdminManagedFunnelPagePayload }) {
  const [page, setPage] = useState<ManagedFunnelPage | null>(data.page);
  const [document, setDocument] = useState<FunnelPageDocument>(() => data.page?.content ?? emptyFunnelPageDocument(data.step.name, data.step.description));
  const [savedDocumentSnapshot, setSavedDocumentSnapshot] = useState(() => JSON.stringify(data.page?.content ?? document));
  const [selection, setSelection] = useState<Selection>({ kind: "page" });
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [panel, setPanel] = useState<"elements" | "blocks" | "styles">("elements");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const assets = useMemo(() => document.assets ?? [], [document.assets]);
  const currentDocumentSnapshot = useMemo(() => JSON.stringify(document), [document]);
  const hasUnsavedChanges = currentDocumentSnapshot !== savedDocumentSnapshot;
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const allowNavigationRef = useRef(false);
  const historyGuardIdRef = useRef(`funnel-page-editor-${stepId}`);
  const backHref = `/admin/funnels/${encodeURIComponent(funnelSlug)}?step=${encodeURIComponent(stepId)}${page ? `&page=${encodeURIComponent(page.id)}` : ""}`;
  const previewHref = `/admin/funnels/${encodeURIComponent(funnelSlug)}/preview/${encodeURIComponent(stepId)}${page ? `?page=${encodeURIComponent(page.id)}` : ""}`;

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedChangesRef.current || allowNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function interceptLink(event: MouseEvent) {
      if (!hasUnsavedChangesRef.current || allowNavigationRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.href === window.location.href || (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash)) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation({ kind: "href", href: destination.href });
    }

    const guardId = historyGuardIdRef.current;
    if (window.history.state?.__funnelPageEditorGuard !== guardId) {
      window.history.pushState({ ...window.history.state, __funnelPageEditorGuard: guardId }, "", window.location.href);
    }

    function interceptBackNavigation() {
      if (allowNavigationRef.current) return;
      if (!hasUnsavedChangesRef.current) {
        allowNavigationRef.current = true;
        window.history.back();
        return;
      }
      window.history.pushState({ ...window.history.state, __funnelPageEditorGuard: guardId }, "", window.location.href);
      setPendingNavigation({ kind: "back" });
    }

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", interceptBackNavigation);
    window.document.addEventListener("click", interceptLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", interceptBackNavigation);
      window.document.removeEventListener("click", interceptLink, true);
    };
  }, []);

  function mutate(recipe: (draft: FunnelPageDocument) => void) {
    setDocument((current) => { const next = cloneDocument(current); recipe(next); return next; });
  }

  function selectedElement() {
    if (selection.kind !== "element") return null;
    return document.sections[selection.sectionIndex]?.rows[selection.rowIndex]?.columns[selection.columnIndex]?.elements[selection.elementIndex] ?? null;
  }

  function destinationColumn() {
    if (selection.kind === "element") return selection;
    const sectionIndex = selection.kind === "section" ? selection.sectionIndex : Math.max(0, document.sections.length - 1);
    const section = document.sections[sectionIndex];
    const rowIndex = Math.max(0, (section?.rows.length ?? 1) - 1);
    const columnIndex = 0;
    return { sectionIndex, rowIndex, columnIndex };
  }

  function addElement(type: FunnelPageElement["type"]) {
    const target = destinationColumn();
    mutate((draft) => {
      const elements = draft.sections[target.sectionIndex]?.rows[target.rowIndex]?.columns[target.columnIndex]?.elements;
      if (!elements) return;
      elements.push(createElement(type));
      setSelection({ kind: "element", ...target, elementIndex: elements.length - 1 });
    });
  }

  async function save(publish = false) {
    const snapshotBeingSaved = JSON.stringify(document);
    setError(null);
    publish ? setPublishing(true) : setSaving(true);
    try {
      const saveResponse = await fetch("/api/funnels/pages", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          funnelId, stepId, pageId: page?.id ?? null, source: "manual", content: document,
          seo: page?.seo ?? { title: data.step.name, description: data.step.description, noIndex: false }
        })
      });
      if (!saveResponse.ok) throw new Error(await responseError(saveResponse, "Could not save the page draft."));
      const saved = await saveResponse.json() as { page: ManagedFunnelPage };
      setPage(saved.page);
      setSavedDocumentSnapshot(snapshotBeingSaved);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}?page=${encodeURIComponent(saved.page.id)}`);
      if (publish) {
        const publishResponse = await fetch("/api/funnels/pages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ funnelId, stepId, pageId: saved.page.id }) });
        if (!publishResponse.ok) throw new Error(await responseError(publishResponse, "Could not publish the page."));
        setPage({ ...saved.page, status: "published", publishedRevisionNumber: saved.page.latestRevisionNumber });
        showGlobalToast({ kind: "success", text: `Revision ${saved.page.latestRevisionNumber} is live.` });
      } else {
        showGlobalToast({ kind: "success", text: `Draft revision ${saved.page.latestRevisionNumber} saved.` });
      }
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the page.");
      return false;
    }
    finally { setSaving(false); setPublishing(false); }
  }

  function continueNavigation(navigation: PendingNavigation) {
    allowNavigationRef.current = true;
    setPendingNavigation(null);
    if (navigation.kind === "href") {
      window.location.assign(navigation.href);
      return;
    }
    window.history.go(-2);
  }

  async function saveAndContinueNavigation() {
    if (!pendingNavigation || saving || publishing) return;
    const navigation = pendingNavigation;
    const saved = await save(false);
    if (saved) continueNavigation(navigation);
  }

  async function unpublish() {
    if (!page || unpublishing) return;
    setError(null);
    setUnpublishing(true);
    try {
      const response = await fetch("/api/funnels/pages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnelId, stepId, pageId: page.id })
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not unpublish the page."));
      setPage({ ...page, status: "draft", publishedRevisionNumber: null });
      showGlobalToast({ kind: "success", text: "The page is no longer public. Its revisions are preserved." });
    } catch (unpublishError) {
      setError(unpublishError instanceof Error ? unpublishError.message : "Could not unpublish the page.");
    } finally {
      setUnpublishing(false);
    }
  }

  const currentElement = selectedElement();
  const baseTheme = themes[document.theme];
  const buttonPalette: FunnelButtonPalette = {
    primary: document.styles?.colors?.primary ?? baseTheme.primary,
    secondary: document.styles?.colors?.secondary ?? baseTheme.secondary,
    primaryText: "#ffffff",
    secondaryText: baseTheme.dark,
    primaryShadow: baseTheme.primaryShadow,
    secondaryShadow: baseTheme.secondaryShadow,
    pageBorderRadius: document.styles?.buttons?.borderRadius
  };
  return <main className="flex min-h-screen flex-col bg-[#eee8dd] text-ink">
    <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-[#d6c6af] bg-[#fffaf2] px-4 py-2 shadow-sm">
      <a href={backHref} className="inline-flex h-10 items-center rounded-[11px] border border-[#d8c5a8] bg-white px-3 text-sm font-semibold">← Funnel</a>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{page?.name ?? `${data.step.name} page`}</p><p className="text-xs text-ink/45">{page?.status === "published" ? `Published revision ${page.publishedRevisionNumber}` : "Draft page"}</p></div>
      <div className="flex items-center rounded-[11px] border border-[#d8c5a8] bg-white p-1"><button type="button" onClick={() => setViewport("desktop")} className={`rounded-[8px] px-3 py-1.5 text-xs font-semibold ${viewport === "desktop" ? "bg-[#e5eedb] text-[#4d6a39]" : "text-ink/45"}`}>Desktop</button><button type="button" onClick={() => setViewport("mobile")} className={`rounded-[8px] px-3 py-1.5 text-xs font-semibold ${viewport === "mobile" ? "bg-[#e5eedb] text-[#4d6a39]" : "text-ink/45"}`}>Mobile</button></div>
      {page ? <a href={previewHref} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-[11px] border border-[#d8c5a8] bg-white px-3 text-sm font-semibold">Preview ↗</a> : null}
      {page?.status === "published" ? <button type="button" disabled={saving || publishing || unpublishing} onClick={() => void unpublish()} className="inline-flex h-10 items-center rounded-[11px] border border-[#d8c5a8] bg-white px-3 text-sm font-semibold text-ink/60 disabled:opacity-50">{unpublishing ? "Unpublishing…" : "Unpublish"}</button> : null}
      <button type="button" disabled={saving || publishing || unpublishing} onClick={() => void save(false)} className="inline-flex h-10 items-center rounded-[11px] border border-[#9f7c5e] bg-white px-4 text-sm font-semibold text-[#74573e] disabled:opacity-50">{saving ? "Saving…" : "Save draft"}</button>
      <button type="button" disabled={saving || publishing || unpublishing} onClick={() => void save(true)} className="inline-flex h-10 items-center rounded-[11px] border border-[#4f7538] bg-[#76a456] px-4 text-sm font-semibold text-white shadow-[0_4px_0_#486f34] disabled:opacity-50">{publishing ? "Publishing…" : "Publish"}</button>
    </header>
    {error ? <div className="fixed left-1/2 top-20 z-[180] -translate-x-1/2 rounded-full bg-[#fff0eb] px-5 py-3 text-sm font-semibold text-[#8c4536] shadow-xl">{error}</div> : null}
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_300px]">
      <aside className="overflow-auto border-r border-[#d6c6af] bg-[#fffaf2] p-3">
        <div className="grid grid-cols-3 gap-1 rounded-[11px] bg-[#eee7dc] p-1">{(["elements", "blocks", "styles"] as const).map((item) => <button type="button" key={item} onClick={() => { setPanel(item); if (item === "styles") setSelection({ kind: "page" }); }} className={`rounded-[8px] px-2 py-2 text-[11px] font-semibold capitalize ${panel === item ? "bg-white shadow-sm" : "text-ink/50"}`}>{item}</button>)}</div>
        {panel === "elements" ? <div className="mt-4 grid grid-cols-2 gap-2">{(["heading", "text", "eyebrow", "list", "image", "button", "countdown", "lead_capture", "divider"] as FunnelPageElement["type"][]).map((type) => <button type="button" key={type} onClick={() => addElement(type)} className="min-h-16 rounded-[12px] border border-[#d8c5a8] bg-white px-2 text-xs font-semibold capitalize hover:border-[#739655]">{type.replaceAll("_", " ")}</button>)}</div> : null}
        {panel === "blocks" ? <div className="mt-4 grid gap-2">{(["hero", "split", "offer", "blank"] as const).map((kind) => <button type="button" key={kind} onClick={() => mutate((draft) => { draft.sections.push(newSection(kind)); setSelection({ kind: "section", sectionIndex: draft.sections.length - 1 }); })} className="min-h-14 rounded-[12px] border border-[#d8c5a8] bg-white px-3 text-left text-sm font-semibold capitalize hover:border-[#739655]">+ {kind} section</button>)}</div> : null}
        {panel === "styles" ? <div className="mt-4 grid gap-4"><label className="grid gap-1 text-xs font-semibold">Theme<select className={INPUT} value={document.theme} onChange={(event) => mutate((draft) => { draft.theme = event.target.value as FunnelPageDocument["theme"]; })}>{Object.keys(themes).map((theme) => <option key={theme} value={theme}>{theme[0]!.toUpperCase()}{theme.slice(1)}</option>)}</select></label><ColorControl label="Page background" value={document.styles?.colors?.pageBackground ?? baseTheme.page} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, colors: { ...draft.styles?.colors, pageBackground: value } }; })} /><ColorControl label="Surface" value={document.styles?.colors?.surface ?? baseTheme.surface} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, colors: { ...draft.styles?.colors, surface: value } }; })} /><ColorControl label="Primary" value={document.styles?.colors?.primary ?? baseTheme.primary} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, colors: { ...draft.styles?.colors, primary: value } }; })} /><NumberControl label="Content width" value={document.styles?.layout?.contentWidth ?? 1120} min={640} max={1600} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, layout: { ...draft.styles?.layout, contentWidth: value } }; })} /><NumberControl label="Section spacing" value={document.styles?.layout?.sectionGap ?? 22} min={0} max={160} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, layout: { ...draft.styles?.layout, sectionGap: value } }; })} /></div> : null}
      </aside>
      <section className="min-w-0 overflow-auto bg-[#d9d4cc] p-5"><EditorCanvas document={document} selection={selection} onSelect={setSelection} viewport={viewport} showProtectedOrderForm={data.step.stepType === "order_form"} /></section>
      <aside className="overflow-auto border-l border-[#d6c6af] bg-[#fffaf2] p-4">
        {currentElement && selection.kind === "element" ? <ElementInspector element={currentElement} buttonPalette={buttonPalette} chooseMedia={() => setMediaOpen(true)} update={(next) => mutate((draft) => { draft.sections[selection.sectionIndex]!.rows[selection.rowIndex]!.columns[selection.columnIndex]!.elements[selection.elementIndex] = next; })} move={(direction) => mutate((draft) => { const items = draft.sections[selection.sectionIndex]!.rows[selection.rowIndex]!.columns[selection.columnIndex]!.elements; const nextIndex = selection.elementIndex + direction; if (nextIndex < 0 || nextIndex >= items.length) return; const [item] = items.splice(selection.elementIndex, 1); if (item) items.splice(nextIndex, 0, item); setSelection({ ...selection, elementIndex: nextIndex }); })} remove={() => mutate((draft) => { draft.sections[selection.sectionIndex]!.rows[selection.rowIndex]!.columns[selection.columnIndex]!.elements.splice(selection.elementIndex, 1); setSelection({ kind: "section", sectionIndex: selection.sectionIndex }); })} /> : selection.kind === "section" ? <SectionInspector section={document.sections[selection.sectionIndex]!} chooseMedia={() => setMediaOpen(true)} update={(recipe) => mutate((draft) => recipe(draft.sections[selection.sectionIndex]!))} move={(direction) => mutate((draft) => { const nextIndex = selection.sectionIndex + direction; if (nextIndex < 0 || nextIndex >= draft.sections.length) return; const [item] = draft.sections.splice(selection.sectionIndex, 1); if (item) draft.sections.splice(nextIndex, 0, item); setSelection({ kind: "section", sectionIndex: nextIndex }); })} remove={() => mutate((draft) => { if (draft.sections.length <= 1) return; draft.sections.splice(selection.sectionIndex, 1); setSelection({ kind: "page" }); })} /> : <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Page</p><h3 className="mt-1 text-lg font-semibold">Styles & structure</h3><p className="mt-3 text-sm leading-6 text-ink/55">Select an element on the canvas to edit its content. Use the left panel to add elements, complete blocks, and page-wide styles.</p><button type="button" onClick={() => setPanel("styles")} className="mt-4 w-full rounded-[12px] border border-[#d8c5a8] bg-white px-4 py-3 text-sm font-semibold">Open page styles</button></div>}
      </aside>
    </div>
    {mediaOpen ? <AssetLibrary assets={assets} funnelId={funnelId} stepId={stepId} onClose={() => setMediaOpen(false)} onUploaded={(asset) => mutate((draft) => { draft.assets = [...(draft.assets ?? []), asset]; if (selection.kind === "element") { const element = draft.sections[selection.sectionIndex]!.rows[selection.rowIndex]!.columns[selection.columnIndex]!.elements[selection.elementIndex]; if (element?.type === "image") element.props.media = asset; } else if (selection.kind === "section") draft.sections[selection.sectionIndex]!.props.background = asset; setMediaOpen(false); })} onChoose={(asset) => mutate((draft) => { if (selection.kind === "element") { const element = draft.sections[selection.sectionIndex]!.rows[selection.rowIndex]!.columns[selection.columnIndex]!.elements[selection.elementIndex]; if (element?.type === "image") element.props.media = asset; } else if (selection.kind === "section") draft.sections[selection.sectionIndex]!.props.background = asset; setMediaOpen(false); })} /> : null}
    {pendingNavigation ? <div className="fixed inset-0 z-[320] grid place-items-center bg-black/50 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="unsaved-page-title" className="w-full max-w-lg rounded-[24px] border border-[#d8c5a8] bg-[#fffaf2] p-6 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[.12em] text-[#8a674d]">Unsaved changes</p>
        <h2 id="unsaved-page-title" className="mt-2 text-3xl font-semibold tracking-[-.035em]">Save this page before leaving?</h2>
        <p className="mt-3 text-base leading-7 text-ink/60">You changed this funnel page since the last save. Save the draft now, leave without saving, or keep editing.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={saving || publishing} onClick={() => void saveAndContinueNavigation()} className="inline-flex min-h-12 items-center justify-center rounded-[14px] border border-[#4f7538] bg-[#76a456] px-5 py-3 font-semibold text-white shadow-[0_4px_0_#486f34] disabled:opacity-60">{saving ? "Saving…" : "Save and leave"}</button>
          <button type="button" disabled={saving || publishing} onClick={() => continueNavigation(pendingNavigation)} className="inline-flex min-h-12 items-center justify-center rounded-[14px] border border-[#c79b8d] bg-white px-5 py-3 font-semibold text-[#8c4536] disabled:opacity-60">Leave without saving</button>
        </div>
        <button type="button" disabled={saving || publishing} onClick={() => setPendingNavigation(null)} className="mt-4 w-full px-4 py-2 text-sm font-semibold text-ink/55 underline decoration-ink/25 underline-offset-4 disabled:opacity-60">Keep editing</button>
      </section>
    </div> : null}
  </main>;
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1 text-xs font-semibold">{label}<span className="flex items-center gap-2"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 rounded border" /><input className={INPUT} value={value} onChange={(event) => onChange(event.target.value)} /></span></label>; }
function NumberControl({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <label className="grid gap-1 text-xs font-semibold">{label}<input type="number" className={INPUT} value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function SectionInspector({ section, chooseMedia, update, move, remove }: { section: FunnelPageSection; chooseMedia: () => void; update: (recipe: (section: FunnelPageSection) => void) => void; move: (direction: -1 | 1) => void; remove: () => void }) { return <div className="grid gap-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Section</p><h3 className="mt-1 text-lg font-semibold">Layout</h3></div><div className="flex gap-1"><button type="button" onClick={() => move(-1)} className="rounded-lg border px-2 py-1">↑</button><button type="button" onClick={() => move(1)} className="rounded-lg border px-2 py-1">↓</button><button type="button" onClick={remove} className="rounded-lg border px-2 py-1 text-[#9b4738]">×</button></div></div><label className="grid gap-1 text-xs font-semibold">Background tone<select className={INPUT} value={section.props.tone} onChange={(event) => update((draft) => { draft.props.tone = event.target.value as FunnelPageSection["props"]["tone"]; })}><option value="default">Default</option><option value="muted">Muted</option><option value="accent">Accent</option><option value="dark">Dark</option></select></label><label className="grid gap-1 text-xs font-semibold">Content width<select className={INPUT} value={section.props.width} onChange={(event) => update((draft) => { draft.props.width = event.target.value as FunnelPageSection["props"]["width"]; })}><option value="narrow">Narrow</option><option value="standard">Standard</option><option value="wide">Wide</option></select></label><button type="button" onClick={chooseMedia} className="rounded-[13px] border border-[#d8c5a8] bg-white px-4 py-3 text-sm font-semibold">{section.props.background ? "Change background image" : "Add background image"}</button>{section.props.background ? <button type="button" onClick={() => update((draft) => { draft.props.background = null; })} className="text-sm font-semibold text-[#8c4536] underline underline-offset-4">Remove background image</button> : null}</div>; }
