"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { FunnelProgressSteps } from "../../../components/funnel-progress-steps";
import { moveItemAtInsertionPoint } from "../../../lib/editor-drag";
import { allSpacingSides, funnelElementSpacingStyle } from "../../../lib/funnels/element-spacing";
import type {
  FunnelAction,
  FunnelListMarker,
  FunnelMediaSnapshot,
  FunnelPageDocument,
  FunnelPageElement,
  FunnelPageSection,
  FunnelRowColumnCount
} from "../../../lib/funnels/page-document";
import {
  createFunnelDocumentId,
  createFunnelPageRow,
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
import type { AdminManagedFunnelPagePayload, FunnelSubscriptionProduct, ManagedFunnelPage } from "../../../lib/funnels/server";
import type { NativeWorkbookCatalogItem } from "../../../lib/native-workbooks/server";
import { showGlobalToast } from "../../../lib/toast";
import { CurriculumCheckoutOptions } from "../../first-grade-homeschool-curriculum/curriculum-checkout-choice";

type Selection =
  | { kind: "page" }
  | { kind: "section"; sectionIndex: number }
  | { kind: "element"; sectionIndex: number; rowIndex: number; columnIndex: number; elementIndex: number };

type FunnelElementLocation = Extract<Selection, { kind: "element" }>;
type FunnelElementDropTarget = Omit<FunnelElementLocation, "kind">;
type FunnelElementDrag =
  | { kind: "existing"; source: FunnelElementLocation }
  | { kind: "new"; elementType: FunnelPageElement["type"] };
type FunnelBlockKind = "hero" | "split" | "offer" | "blank";
type FunnelRowDropTarget = { sectionIndex: number; rowIndex: number };

const funnelElementGroups: Array<{
  label: string;
  elements: FunnelPageElement["type"][];
}> = [
  { label: "Text", elements: ["heading", "text", "eyebrow", "list"] },
  { label: "Media", elements: ["image", "workbook_gallery", "countdown"] },
  { label: "Actions", elements: ["button", "lead_capture", "progress_steps"] },
  { label: "Utility", elements: ["divider"] }
];

type PendingNavigation =
  | { kind: "href"; href: string }
  | { kind: "back" };

type MediaTarget =
  | { kind: "selection" }
  | { kind: "workbook_gallery"; slot: "cover" | "append" | number };

const INPUT = "min-h-10 w-full rounded-[11px] border border-[#cfbea4] bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-[#739655] focus:ring-4 focus:ring-[#739655]/15";
const themes = {
  sage: { page: "#edf4e7", surface: "#fffdf8", muted: "#f5f9f0", accent: "#dfeccf", dark: "#4d6b3a", primary: "#76a456", secondary: "#ffffff", primaryShadow: "#486f34", secondaryShadow: "#cdddbd" },
  cream: { page: "#f8f1e4", surface: "#fffaf2", muted: "#fbf4e8", accent: "#f1e3cf", dark: "#694833", primary: "#8a674d", secondary: "#ffffff", primaryShadow: "#5b3d2c", secondaryShadow: "#e3d0b0" },
  violet: { page: "#f2eef8", surface: "#fffdfd", muted: "#f8f5fb", accent: "#e5dcf1", dark: "#5d4a77", primary: "#79639a", secondary: "#ffffff", primaryShadow: "#514066", secondaryShadow: "#ded5ea" },
  sky: { page: "#eaf4f5", surface: "#fffdf9", muted: "#f2f8f8", accent: "#d6eaeb", dark: "#35666a", primary: "#4d858a", secondary: "#ffffff", primaryShadow: "#315d60", secondaryShadow: "#cce1e2" }
} as const;

function sectionToneColor(
  section: FunnelPageSection,
  theme: (typeof themes)[keyof typeof themes],
  surface: string = theme.surface
) {
  if (section.props.tone === "dark") return theme.dark;
  if (section.props.tone === "muted") return theme.muted;
  if (section.props.tone === "accent") return theme.accent;
  return surface;
}

function cloneDocument(document: FunnelPageDocument) {
  return structuredClone(document);
}

function emptyMedia(): FunnelMediaSnapshot {
  return { assetId: null, storagePath: null, publicUrl: null, alt: "", width: null, height: null };
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
  if (type === "image") return { id, type, props: { media: emptyMedia(), fit: "contain", caption: "" } };
  if (type === "workbook_gallery") return { id, type, props: { title: "Workbook preview", cover: emptyMedia(), images: [], fit: "contain", caption: "" } };
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
  if (type === "progress_steps") return {
    id,
    type,
    props: {
      steps: ["Details", "Review", "Checkout"],
      currentStep: 1,
      showNumbers: true
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
  if (element.type === "workbook_gallery") {
    const preview = element.props.cover.publicUrl ?? element.props.images.find((image) => image.publicUrl)?.publicUrl;
    return <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden border border-dashed border-ink/20 bg-white/40`}>{preview ? <Image src={preview} alt={element.props.cover.alt} fill unoptimized className={element.props.fit === "cover" ? "object-cover" : "object-contain p-3"} /> : <span className="absolute inset-0 grid place-items-center px-4 text-sm text-ink/45">Choose a cover and sample pages in the inspector</span>}<span className="absolute bottom-2 right-2 rounded-full bg-[#24311d]/85 px-2 py-1 text-[10px] font-bold text-white">Gallery · {element.props.previewSlug ? "generated previews" : element.props.images.length + (element.props.cover.publicUrl ? 1 : 0)}</span></button>;
  }
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
  if (element.type === "progress_steps") {
    return <div onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} p-2`}><FunnelProgressSteps steps={element.props.steps} currentStep={element.props.currentStep} showNumbers={element.props.showNumbers} activeColor={palette.primary} activeBorderColor={palette.primaryShadow} /></div>;
  }
  if (element.type === "lead_capture") return <div onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} grid gap-3 rounded-[16px] border border-ink/10 bg-white p-4`}><strong>{element.props.heading}</strong>{element.props.collectFirstName ? <span className="rounded-[10px] border border-ink/15 px-3 py-2 text-sm text-ink/45">{element.props.firstNameLabel}</span> : null}<span className="rounded-[10px] border border-ink/15 px-3 py-2 text-sm text-ink/45">{element.props.emailLabel}</span><span className="rounded-[10px] px-4 py-2 text-center font-semibold text-white" style={{ background: palette.primary }}>{element.props.submitLabel}</span></div>;
  return <hr onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} border-ink/15`} />;
}

function sameElementLocation(left: FunnelElementLocation, right: FunnelElementLocation) {
  return left.sectionIndex === right.sectionIndex
    && left.rowIndex === right.rowIndex
    && left.columnIndex === right.columnIndex
    && left.elementIndex === right.elementIndex;
}

function sameDropTarget(left: FunnelElementDropTarget | null, right: FunnelElementDropTarget) {
  return left?.sectionIndex === right.sectionIndex
    && left.rowIndex === right.rowIndex
    && left.columnIndex === right.columnIndex
    && left.elementIndex === right.elementIndex;
}

function sameRowDropTarget(left: FunnelRowDropTarget | null, right: FunnelRowDropTarget) {
  return left?.sectionIndex === right.sectionIndex && left.rowIndex === right.rowIndex;
}

function FunnelElementDropZone({
  target,
  active,
  copy,
  onTarget,
  onDrop
}: {
  target: FunnelElementDropTarget;
  active: boolean;
  copy: boolean;
  onTarget: (target: FunnelElementDropTarget) => void;
  onDrop: (target: FunnelElementDropTarget) => void;
}) {
  return <div
    className={`my-1 h-4 rounded-full border-2 border-dashed transition ${active ? "border-[#4f7538] bg-[#dcebcf]" : "border-[#739655]/30 bg-white/25"}`}
    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); onTarget(target); }}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = copy ? "copy" : "move"; onTarget(target); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(target); }}
    aria-hidden="true"
  />;
}

function FunnelSectionDropZone({
  target,
  active,
  onTarget,
  onDrop
}: {
  target: number;
  active: boolean;
  onTarget: (target: number) => void;
  onDrop: (target: number) => void;
}) {
  return <div
    className={`grid h-12 place-items-center rounded-[14px] border-2 border-dashed text-xs font-bold transition ${active ? "border-[#4f7538] bg-[#dcebcf] text-[#3f6130]" : "border-[#739655]/40 bg-white/35 text-[#567b40]/60"}`}
    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); onTarget(target); }}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; onTarget(target); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(target); }}
  >
    Drop section here
  </div>;
}

function FunnelRowDropZone({
  target,
  active,
  onTarget,
  onDrop
}: {
  target: FunnelRowDropTarget;
  active: boolean;
  onTarget: (target: FunnelRowDropTarget) => void;
  onDrop: (target: FunnelRowDropTarget) => void;
}) {
  return <div
    className={`my-2 grid h-10 place-items-center rounded-[12px] border-2 border-dashed text-[11px] font-bold transition ${active ? "border-[#4f7538] bg-[#dcebcf] text-[#3f6130]" : "border-[#739655]/35 bg-white/30 text-[#567b40]/55"}`}
    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); onTarget(target); }}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; onTarget(target); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(target); }}
  >
    Drop row here
  </div>;
}

function EditorCanvas({
  document,
  selection,
  onSelect,
  viewport,
  elementDrag,
  dropTarget,
  onStartElementDrag,
  onDropTarget,
  onDropElement,
  onEndElementDrag,
  blockDrag,
  sectionDropTarget,
  onSectionDropTarget,
  onDropBlock,
  rowDrag,
  rowDropTarget,
  onRowDropTarget,
  onDropRow,
  onRemoveRow,
  orderFormPreview = null
}: {
  document: FunnelPageDocument;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  viewport: "desktop" | "mobile";
  elementDrag: FunnelElementDrag | null;
  dropTarget: FunnelElementDropTarget | null;
  onStartElementDrag: (event: DragEvent<HTMLElement>, drag: FunnelElementDrag) => void;
  onDropTarget: (target: FunnelElementDropTarget) => void;
  onDropElement: (target: FunnelElementDropTarget) => void;
  onEndElementDrag: () => void;
  blockDrag: FunnelBlockKind | null;
  sectionDropTarget: number | null;
  onSectionDropTarget: (target: number) => void;
  onDropBlock: (target: number) => void;
  rowDrag: FunnelRowColumnCount | null;
  rowDropTarget: FunnelRowDropTarget | null;
  onRowDropTarget: (target: FunnelRowDropTarget) => void;
  onDropRow: (target: FunnelRowDropTarget) => void;
  onRemoveRow: (sectionIndex: number, rowIndex: number) => void;
  orderFormPreview?: ReactNode;
}) {
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
      {document.siteChrome?.showHeader ? (
        <header className={`flex items-center justify-between border-b border-black/10 ${viewport === "mobile" ? "px-4 py-3" : "px-6 py-4"}`}>
          <span className="inline-flex items-center gap-2.5">
            <Image src="/tree-icon.png" alt="" width={42} height={42} className="h-9 w-9 object-contain" />
            <span className="brand-logo text-[22px] font-semibold leading-none">treeschool</span>
          </span>
          <span className="text-xs font-semibold text-ink/45">Site header</span>
        </header>
      ) : null}
      <div className="grid" style={{ gap: sectionGap, padding: viewport === "mobile" ? 12 : 24 }}>
        {document.sections.map((section, sectionIndex) => {
          const selected = selection.kind === "section" && selection.sectionIndex === sectionIndex;
          const tone = section.props.backgroundColor ?? sectionToneColor(section, baseTheme, surface);
          const background = section.props.background?.publicUrl ? `url(${section.props.background.publicUrl}) center/cover` : tone;
          const sectionPaddingY = section.props.paddingY ?? paddingY;
          return (
            <Fragment key={section.id}>
            {blockDrag ? <FunnelSectionDropZone target={sectionIndex} active={sectionDropTarget === sectionIndex} onTarget={onSectionDropTarget} onDrop={onDropBlock} /> : null}
            <section
              onClick={(event) => { event.stopPropagation(); onSelect({ kind: "section", sectionIndex }); }}
              className={`rounded-[22px] border border-black/10 transition ${selected ? "ring-4 ring-[#739655]/35" : "hover:ring-2 hover:ring-[#739655]/20"}`}
              style={{
                background,
                color: section.props.tone === "dark" ? "white" : undefined,
                borderColor: section.props.borderColor,
                borderWidth: section.props.borderWidth,
                borderRadius: section.props.borderRadius,
                borderStyle: section.props.borderStyle,
                marginTop: section.props.marginTop,
                marginBottom: section.props.marginBottom,
                paddingTop: sectionPaddingY,
                paddingRight: section.props.paddingX ?? (viewport === "mobile" ? 24 : 40),
                paddingBottom: sectionPaddingY,
                paddingLeft: section.props.paddingX ?? (viewport === "mobile" ? 24 : 40)
              }}
            >
              <div className="mx-auto" style={{ maxWidth: section.props.width === "narrow" ? Math.min(width, 820) : section.props.width === "wide" ? Math.max(width, 1280) : width }}>
                {section.rows.map((row, rowIndex) => <Fragment key={row.id}>
                  {rowDrag ? <FunnelRowDropZone target={{ sectionIndex, rowIndex }} active={sameRowDropTarget(rowDropTarget, { sectionIndex, rowIndex })} onTarget={onRowDropTarget} onDrop={onDropRow} /> : null}
                  <div className="group/row relative">
                  <div className={`grid ${viewport === "mobile" ? "grid-cols-1" : "grid-cols-12"}`} style={{ gap: columnGap }}>
                  {row.columns.map((column, columnIndex) => <div key={column.id} className="grid content-start gap-4" style={viewport === "mobile" ? undefined : { gridColumn: column.offset !== undefined ? `${column.offset + 1} / span ${column.span}` : `span ${column.span}` }}>
                    {column.elements.map((element, elementIndex) => {
                      const location: FunnelElementLocation = { kind: "element", sectionIndex, rowIndex, columnIndex, elementIndex };
                      const target: FunnelElementDropTarget = { sectionIndex, rowIndex, columnIndex, elementIndex };
                      const dragged = elementDrag?.kind === "existing" && sameElementLocation(elementDrag.source, location);
                      return <div key={element.id} className="min-w-0">
                        {elementDrag ? <FunnelElementDropZone target={target} active={sameDropTarget(dropTarget, target)} copy={elementDrag.kind === "new"} onTarget={onDropTarget} onDrop={onDropElement} /> : null}
                        <div className={`group/drag relative transition ${dragged ? "opacity-35" : ""}`} style={funnelElementSpacingStyle(element)}>
                          <button
                            type="button"
                            draggable
                            onClick={(event) => { event.stopPropagation(); onSelect(location); }}
                            onDragStart={(event) => onStartElementDrag(event, { kind: "existing", source: location })}
                            onDragEnd={onEndElementDrag}
                            className={`absolute right-2 top-2 z-40 grid h-8 w-8 cursor-grab place-items-center rounded-[9px] border border-[#b9a78c] bg-white text-base leading-none text-ink/55 shadow-md active:cursor-grabbing ${selection.kind === "element" && sameElementLocation(selection, location) ? "opacity-100" : "opacity-0 group-hover/drag:opacity-100 focus:opacity-100"}`}
                            aria-label={`Drag ${element.type.replaceAll("_", " ")}`}
                            title="Drag to move this element"
                          >
                            ⠿
                          </button>
                          <PreviewElement element={element} palette={palette} selected={selection.kind === "element" && sameElementLocation(selection, location)} onSelect={() => onSelect(location)} />
                        </div>
                      </div>;
                    })}
                    {elementDrag ? (() => {
                      const target = { sectionIndex, rowIndex, columnIndex, elementIndex: column.elements.length };
                      return <FunnelElementDropZone target={target} active={sameDropTarget(dropTarget, target)} copy={elementDrag.kind === "new"} onTarget={onDropTarget} onDrop={onDropElement} />;
                    })() : null}
                    {column.elements.length === 0 && !elementDrag ? <button type="button" onClick={(event) => { event.stopPropagation(); onSelect({ kind: "section", sectionIndex }); }} className="min-h-24 rounded-[14px] border border-dashed border-ink/20 text-sm text-ink/40">Empty column</button> : null}
                  </div>)}
                  </div>
                  <div className="pointer-events-none absolute -right-2 -top-3 z-30 flex items-center gap-1 opacity-0 transition group-hover/row:opacity-100">
                    <span className="rounded-full border border-[#cbb99e] bg-white px-2 py-1 text-[10px] font-bold text-ink/55 shadow-sm">{row.columns.length} col</span>
                    <button type="button" disabled={section.rows.length <= 1} onClick={(event) => { event.stopPropagation(); onRemoveRow(sectionIndex, rowIndex); }} className="pointer-events-auto rounded-full border border-[#d7b8ad] bg-white px-2 py-1 text-[10px] font-bold text-[#8c4536] shadow-sm disabled:hidden">Remove</button>
                  </div>
                  </div>
                </Fragment>)}
                {rowDrag ? <FunnelRowDropZone target={{ sectionIndex, rowIndex: section.rows.length }} active={sameRowDropTarget(rowDropTarget, { sectionIndex, rowIndex: section.rows.length })} onTarget={onRowDropTarget} onDrop={onDropRow} /> : null}
              </div>
            </section>
            </Fragment>
          );
        })}
        {blockDrag ? <FunnelSectionDropZone target={document.sections.length} active={sectionDropTarget === document.sections.length} onTarget={onSectionDropTarget} onDrop={onDropBlock} /> : null}
        {orderFormPreview}
      </div>
      {document.siteChrome?.showFooter ? (
        <footer className={`flex border-t border-black/10 text-xs text-ink/50 ${viewport === "mobile" ? "flex-col gap-2 px-4 py-4 text-center" : "items-center justify-between px-6 py-5"}`}>
          <span>© Treeschool · Paper-first homeschooling for grades K–4.</span>
          <span>Privacy · Terms</span>
        </footer>
      ) : null}
    </div>
  );
}

type FunnelButtonElement = Extract<FunnelPageElement, { type: "button" }>;
type FunnelListElement = Extract<FunnelPageElement, { type: "list" }>;
type FunnelCountdownElement = Extract<FunnelPageElement, { type: "countdown" }>;
type FunnelWorkbookGalleryElement = Extract<FunnelPageElement, { type: "workbook_gallery" }>;
type FunnelProgressStepsElement = Extract<FunnelPageElement, { type: "progress_steps" }>;

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
      <label className="grid gap-1.5 text-xs font-semibold">Layout<select className={INPUT} value={appearance.layout ?? "stacked"} onChange={(event) => updateAppearance({ layout: event.target.value as "stacked" | "inline" })}><option value="stacked">Stacked</option><option value="inline">Inline, wrapping</option></select></label>
      <label className="grid gap-1.5 text-xs font-semibold">Bullet icon<select className={INPUT} value={marker} onChange={(event) => { const nextMarker = event.target.value as FunnelListMarker; updateProps({ style: nextMarker === "bullet" ? "bullets" : "checks", appearance: { ...appearance, marker: nextMarker } }); }}><option value="check">Checkmark ✓</option><option value="bullet">Bullet •</option><option value="arrow">Arrow →</option><option value="star">Star ★</option></select></label>
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Icon size" value={appearance.markerSize ?? 22} min={8} max={96} onChange={(markerSize) => updateAppearance({ markerSize })} /><NumberControl label="Icon gap" value={appearance.markerGap ?? 12} min={0} max={80} onChange={(markerGap) => updateAppearance({ markerGap })} /></div>
      <NumberControl label={appearance.layout === "inline" ? "Item spacing" : "Vertical spacing"} value={appearance.itemSpacing ?? 8} min={0} max={80} onChange={(itemSpacing) => updateAppearance({ itemSpacing })} />
      <ColorControl label="Icon color" value={appearance.markerColor ?? palette.primary} onChange={(markerColor) => updateAppearance({ markerColor })} />
      <label className="flex items-center justify-between gap-3 rounded-[11px] border border-[#dfcfb7] bg-white px-3 py-2 text-xs font-semibold"><span>Circular icon badge</span><input type="checkbox" checked={appearance.markerBadge === true} onChange={(event) => updateAppearance({ markerBadge: event.target.checked })} className="h-4 w-4 accent-[#76a456]" /></label>
      {appearance.markerBadge ? <div className="grid grid-cols-[1fr_96px] gap-2"><ColorControl label="Badge color" value={appearance.markerBadgeColor ?? "#dfead4"} onChange={(markerBadgeColor) => updateAppearance({ markerBadgeColor })} /><NumberControl label="Badge size" value={appearance.markerBadgeSize ?? 24} min={16} max={96} onChange={(markerBadgeSize) => updateAppearance({ markerBadgeSize })} /></div> : null}
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

function WorkbookGalleryInspector({
  element,
  update,
  chooseMedia
}: {
  element: FunnelWorkbookGalleryElement;
  update: (next: FunnelWorkbookGalleryElement) => void;
  chooseMedia: (slot: "cover" | "append" | number) => void;
}) {
  const updateProps = (next: Partial<FunnelWorkbookGalleryElement["props"]>) => update({
    ...element,
    props: { ...element.props, ...next }
  });
  const updateImage = (index: number, next: FunnelMediaSnapshot) => {
    const images = [...element.props.images];
    images[index] = next;
    updateProps({ images });
  };
  const moveImage = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= element.props.images.length) return;
    const images = [...element.props.images];
    const [image] = images.splice(index, 1);
    if (image) images.splice(destination, 0, image);
    updateProps({ images });
  };

  return <div className="grid gap-3">
    <label className="grid gap-1.5 text-xs font-semibold">Workbook title<input className={INPUT} value={element.props.title} onChange={(event) => updateProps({ title: event.target.value })} /></label>
    {element.props.previewSlug ? <div className="grid gap-2 rounded-[11px] border border-[#b7cda3] bg-[#edf5e7] p-3"><p className="text-xs font-semibold text-[#4d6a39]">Linked to generated previews</p><p className="break-all text-[10px] text-ink/50">{element.props.previewSlug}</p><p className="text-[10px] leading-4 text-ink/50">Treeschool loads the latest generated cover, contents, and sample-page thumbnails when a visitor opens this gallery.</p><button type="button" onClick={() => updateProps({ previewSlug: undefined })} className="justify-self-start text-[10px] font-bold text-earth underline underline-offset-2">Use only manually selected images</button></div> : null}
    <InspectorGroup title="Cover thumbnail" open>
      {element.props.cover.publicUrl ? <Image src={element.props.cover.publicUrl} alt={element.props.cover.alt} width={260} height={320} unoptimized className="mx-auto max-h-44 w-full rounded-[10px] border border-[#dfcfb7] bg-white object-contain p-2" /> : <div className="grid min-h-28 place-items-center rounded-[10px] border border-dashed border-[#cfbea4] bg-white text-xs text-ink/45">No cover selected</div>}
      <button type="button" onClick={() => chooseMedia("cover")} className="rounded-[11px] border-2 border-[#739655] bg-[#edf5e7] px-3 py-2 text-xs font-semibold text-[#4d6a39]">{element.props.cover.publicUrl ? "Replace cover" : "Choose cover"}</button>
      <label className="grid gap-1.5 text-xs font-semibold">Cover alternative text<input className={INPUT} value={element.props.cover.alt} onChange={(event) => updateProps({ cover: { ...element.props.cover, alt: event.target.value } })} /></label>
    </InspectorGroup>
    <InspectorGroup title={`Sample pages (${element.props.images.length}/8)`} open>
      <p className="text-xs leading-5 text-ink/50">Add the table of contents and representative inside pages. Visitors can browse and zoom every image.</p>
      {element.props.images.map((image, index) => <div key={`${image.assetId ?? image.publicUrl}-${index}`} className="grid gap-2 rounded-[11px] border border-[#dfcfb7] bg-white p-2">
        <div className="flex gap-2">
          {image.publicUrl ? <Image src={image.publicUrl} alt="" width={72} height={88} unoptimized className="h-20 w-16 shrink-0 rounded-[7px] border border-[#eadfce] object-contain" /> : null}
          <label className="grid min-w-0 flex-1 gap-1 text-[10px] font-semibold">Page label / alternative text<input className={INPUT} value={image.alt} onChange={(event) => updateImage(index, { ...image, alt: event.target.value })} /></label>
        </div>
        <div className="grid grid-cols-4 gap-1">
          <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-35" aria-label="Move sample page earlier">↑</button>
          <button type="button" onClick={() => moveImage(index, 1)} disabled={index === element.props.images.length - 1} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-35" aria-label="Move sample page later">↓</button>
          <button type="button" onClick={() => chooseMedia(index)} className="rounded-lg border px-2 py-1 text-xs">Replace</button>
          <button type="button" onClick={() => updateProps({ images: element.props.images.filter((_, imageIndex) => imageIndex !== index) })} className="rounded-lg border px-2 py-1 text-xs text-[#9b4738]">Remove</button>
        </div>
      </div>)}
      <button type="button" disabled={element.props.images.length >= 8} onClick={() => chooseMedia("append")} className="rounded-[11px] border-2 border-[#739655] bg-[#edf5e7] px-3 py-2 text-xs font-semibold text-[#4d6a39] disabled:opacity-45">+ Add sample page</button>
    </InspectorGroup>
    <label className="grid gap-1.5 text-xs font-semibold">Image fit<select className={INPUT} value={element.props.fit} onChange={(event) => updateProps({ fit: event.target.value as "contain" | "cover" })}><option value="contain">Show whole page</option><option value="cover">Fill and crop</option></select></label>
    <label className="grid gap-1.5 text-xs font-semibold">Caption<input className={INPUT} value={element.props.caption} onChange={(event) => updateProps({ caption: event.target.value })} placeholder="Optional text below the thumbnail" /></label>
  </div>;
}

function ProgressStepsInspector({
  element,
  update
}: {
  element: FunnelProgressStepsElement;
  update: (next: FunnelProgressStepsElement) => void;
}) {
  const updateProps = (next: Partial<FunnelProgressStepsElement["props"]>) => update({
    ...element,
    props: { ...element.props, ...next }
  });
  const updateLabel = (index: number, label: string) => {
    const steps = [...element.props.steps];
    steps[index] = label;
    updateProps({ steps });
  };
  const moveStep = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= element.props.steps.length) return;
    const steps = [...element.props.steps];
    [steps[index], steps[destination]] = [steps[destination]!, steps[index]!];
    const currentIndex = element.props.currentStep - 1;
    const currentStep = currentIndex === index
      ? destination + 1
      : currentIndex === destination
        ? index + 1
        : element.props.currentStep;
    updateProps({ steps, currentStep });
  };
  const removeStep = (index: number) => {
    if (element.props.steps.length <= 2) return;
    const steps = element.props.steps.filter((_, stepIndex) => stepIndex !== index);
    const currentIndex = element.props.currentStep - 1;
    const currentStep = currentIndex > index
      ? element.props.currentStep - 1
      : currentIndex === index
        ? Math.min(element.props.currentStep, steps.length)
        : element.props.currentStep;
    updateProps({ steps, currentStep: Math.max(1, currentStep) });
  };

  return <div className="grid gap-3">
    <InspectorGroup title="Progress" open>
      <label className="grid gap-1.5 text-xs font-semibold">Current step<select className={INPUT} value={element.props.currentStep} onChange={(event) => updateProps({ currentStep: Number(event.target.value) })}>{element.props.steps.map((step, index) => <option key={index} value={index + 1}>{index + 1} · {step || "Untitled step"}</option>)}</select></label>
      <label className="flex items-center justify-between gap-3 rounded-[11px] border border-[#dfcfb7] bg-white px-3 py-2 text-xs font-semibold"><span>Show step numbers</span><input type="checkbox" checked={element.props.showNumbers} onChange={(event) => updateProps({ showNumbers: event.target.checked })} className="h-4 w-4 accent-[#76a456]" /></label>
    </InspectorGroup>
    <InspectorGroup title={`Steps (${element.props.steps.length}/8)`} open>
      <p className="text-xs leading-5 text-ink/50">Add two to eight labels. The highlighted step follows the item when you reorder it.</p>
      {element.props.steps.map((step, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[11px] border border-[#dfcfb7] bg-white p-2">
        <label className="grid min-w-0 gap-1 text-[10px] font-semibold">Step {index + 1}<input className={INPUT} value={step} maxLength={120} onChange={(event) => updateLabel(index, event.target.value)} /></label>
        <div className="grid grid-cols-3 gap-1 self-end pb-0.5">
          <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-35" aria-label={`Move step ${index + 1} earlier`}>↑</button>
          <button type="button" onClick={() => moveStep(index, 1)} disabled={index === element.props.steps.length - 1} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-35" aria-label={`Move step ${index + 1} later`}>↓</button>
          <button type="button" onClick={() => removeStep(index)} disabled={element.props.steps.length <= 2} className="rounded-lg border px-2 py-1 text-xs text-[#9b4738] disabled:opacity-35" aria-label={`Remove step ${index + 1}`}>×</button>
        </div>
      </div>)}
      <button type="button" disabled={element.props.steps.length >= 8} onClick={() => updateProps({ steps: [...element.props.steps, `Step ${element.props.steps.length + 1}`] })} className="rounded-[11px] border-2 border-[#739655] bg-[#edf5e7] px-3 py-2 text-xs font-semibold text-[#4d6a39] disabled:opacity-45">+ Add step</button>
    </InspectorGroup>
  </div>;
}

function ElementSpacingInspector({ element, update }: { element: FunnelPageElement; update: (next: FunnelPageElement) => void }) {
  const spacing = element.spacing ?? {};
  const marginValues = [spacing.marginTop, spacing.marginRight, spacing.marginBottom, spacing.marginLeft];
  const paddingValues = [spacing.paddingTop, spacing.paddingRight, spacing.paddingBottom, spacing.paddingLeft];
  const uniformValue = (values: Array<number | undefined>) => values.every((value) => value === values[0]) ? values[0] ?? 0 : 0;
  const setSpacing = (next: Partial<NonNullable<FunnelPageElement["spacing"]>>) => update({ ...element, spacing: { ...spacing, ...next } });

  return <InspectorGroup title="Margin & padding" open>
    <p className="text-xs leading-5 text-ink/50">Margin adds space around the element. Padding adds space inside it. Use “all sides” for speed, then fine-tune individual sides.</p>
    <div className="grid grid-cols-2 gap-2">
      <NumberControl label="Margin · all sides" value={uniformValue(marginValues)} min={-300} max={300} onChange={(value) => setSpacing(allSpacingSides("margin", value))} />
      <NumberControl label="Padding · all sides" value={uniformValue(paddingValues)} min={0} max={300} onChange={(value) => setSpacing(allSpacingSides("padding", value))} />
    </div>
    <details className="rounded-[11px] border border-[#dfcfb7] bg-white p-3">
      <summary className="cursor-pointer text-xs font-semibold">Fine-tune each side</summary>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberControl label="Margin top" value={spacing.marginTop ?? 0} min={-300} max={300} onChange={(marginTop) => setSpacing({ marginTop })} />
        <NumberControl label="Margin right" value={spacing.marginRight ?? 0} min={-300} max={300} onChange={(marginRight) => setSpacing({ marginRight })} />
        <NumberControl label="Margin bottom" value={spacing.marginBottom ?? 0} min={-300} max={300} onChange={(marginBottom) => setSpacing({ marginBottom })} />
        <NumberControl label="Margin left" value={spacing.marginLeft ?? 0} min={-300} max={300} onChange={(marginLeft) => setSpacing({ marginLeft })} />
        <NumberControl label="Padding top" value={spacing.paddingTop ?? 0} min={0} max={300} onChange={(paddingTop) => setSpacing({ paddingTop })} />
        <NumberControl label="Padding right" value={spacing.paddingRight ?? 0} min={0} max={300} onChange={(paddingRight) => setSpacing({ paddingRight })} />
        <NumberControl label="Padding bottom" value={spacing.paddingBottom ?? 0} min={0} max={300} onChange={(paddingBottom) => setSpacing({ paddingBottom })} />
        <NumberControl label="Padding left" value={spacing.paddingLeft ?? 0} min={0} max={300} onChange={(paddingLeft) => setSpacing({ paddingLeft })} />
      </div>
    </details>
    {element.spacing ? <button type="button" onClick={() => { const next = { ...element }; delete next.spacing; update(next); }} className="justify-self-start text-xs font-semibold text-[#74573e] underline underline-offset-4">Reset element spacing</button> : null}
  </InspectorGroup>;
}

function ElementInspector({ element, update, chooseMedia, chooseGalleryMedia, move, remove, buttonPalette }: { element: FunnelPageElement; update: (next: FunnelPageElement) => void; chooseMedia: () => void; chooseGalleryMedia: (slot: "cover" | "append" | number) => void; move: (direction: -1 | 1) => void; remove: () => void; buttonPalette: FunnelButtonPalette }) {
  const align = "align" in element.props ? element.props.align : null;
  return <div className="grid gap-4">
    <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Element</p><h3 className="mt-1 text-lg font-semibold capitalize">{element.type.replaceAll("_", " ")}</h3></div><div className="flex gap-1"><button type="button" onClick={() => move(-1)} className="rounded-lg border px-2 py-1">↑</button><button type="button" onClick={() => move(1)} className="rounded-lg border px-2 py-1">↓</button><button type="button" onClick={remove} className="rounded-lg border px-2 py-1 text-[#9b4738]">×</button></div></div>
    {element.type === "eyebrow" || element.type === "heading" || element.type === "text" ? <label className="grid gap-1.5 text-xs font-semibold">Text<textarea rows={element.type === "text" ? 7 : 3} className={`${INPUT} resize-y`} value={element.props.text} onChange={(event) => update({ ...element, props: { ...element.props, text: event.target.value } } as FunnelPageElement)} /></label> : null}
    {element.type === "heading" ? <label className="grid gap-1.5 text-xs font-semibold">Heading size<select className={INPUT} value={element.props.level} onChange={(event) => update({ ...element, props: { ...element.props, level: event.target.value as "h1" | "h2" | "h3" } })}><option value="h1">Page headline</option><option value="h2">Section heading</option><option value="h3">Small heading</option></select></label> : null}
    {element.type === "text" ? <label className="grid gap-1.5 text-xs font-semibold">Text style<select className={INPUT} value={element.props.style} onChange={(event) => update({ ...element, props: { ...element.props, style: event.target.value as "lead" | "body" | "small" } })}><option value="lead">Lead</option><option value="body">Body</option><option value="small">Small</option></select></label> : null}
    {element.type === "list" ? <ListInspector element={element} palette={buttonPalette} update={update} /> : null}
    {element.type === "image" ? <><button type="button" onClick={chooseMedia} className="rounded-[13px] border-2 border-[#739655] bg-[#edf5e7] px-4 py-3 text-sm font-semibold text-[#4d6a39]">Choose from media manager</button><label className="grid gap-1.5 text-xs font-semibold">Alternative text<input className={INPUT} value={element.props.media.alt} onChange={(event) => update({ ...element, props: { ...element.props, media: { ...element.props.media, alt: event.target.value } } })} /></label><label className="grid gap-1.5 text-xs font-semibold">Image fit<select className={INPUT} value={element.props.fit} onChange={(event) => update({ ...element, props: { ...element.props, fit: event.target.value as "contain" | "cover" } })}><option value="contain">Show whole image</option><option value="cover">Fill and crop</option></select></label></> : null}
    {element.type === "workbook_gallery" ? <WorkbookGalleryInspector element={element} update={update} chooseMedia={chooseGalleryMedia} /> : null}
    {element.type === "button" ? <ButtonInspector element={element} palette={buttonPalette} update={update} /> : null}
    {element.type === "countdown" ? <CountdownInspector element={element} palette={buttonPalette} update={update} /> : null}
    {element.type === "progress_steps" ? <ProgressStepsInspector element={element} update={update} /> : null}
    {element.type === "lead_capture" ? <><label className="grid gap-1.5 text-xs font-semibold">Form heading<input className={INPUT} value={element.props.heading} onChange={(event) => update({ ...element, props: { ...element.props, heading: event.target.value } })} /></label><label className="grid gap-1.5 text-xs font-semibold">Submit label<input className={INPUT} value={element.props.submitLabel} onChange={(event) => update({ ...element, props: { ...element.props, submitLabel: event.target.value } })} /></label></> : null}
    {element.type === "button" || element.type === "lead_capture" ? <><label className="grid gap-1.5 text-xs font-semibold">Click action<select className={INPUT} value={element.props.action.type} onChange={(event) => update({ ...element, props: { ...element.props, action: buildAction(event.target.value as FunnelAction["type"], actionTarget(element.props.action), actionOffer(element.props.action)) } } as FunnelPageElement)}><option value="next_step">Next funnel step</option><option value="url">Fixed URL</option><option value="checkout">Start checkout</option><option value="accept_offer">Accept offer</option><option value="decline_offer">Decline offer</option><option value="none">No action</option></select></label>{element.props.action.type === "url" || element.props.action.type === "checkout" ? <label className="grid gap-1.5 text-xs font-semibold">Destination<input className={INPUT} value={actionTarget(element.props.action)} onChange={(event) => update({ ...element, props: { ...element.props, action: buildAction(element.props.action.type, event.target.value, actionOffer(element.props.action)) } } as FunnelPageElement)} placeholder="Optional funnel-relative target" /></label> : null}{"offerKey" in element.props.action ? <label className="grid gap-1.5 text-xs font-semibold">Offer key<input className={INPUT} value={element.props.action.offerKey} onChange={(event) => update({ ...element, props: { ...element.props, action: buildAction(element.props.action.type, actionTarget(element.props.action), event.target.value) } } as FunnelPageElement)} /></label> : null}</> : null}
    {align ? <label className="grid gap-1.5 text-xs font-semibold">Alignment<select className={INPUT} value={align} onChange={(event) => update({ ...element, props: { ...element.props, align: event.target.value as "left" | "center" | "right" } } as FunnelPageElement)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label> : null}
    <ElementSpacingInspector element={element} update={update} />
  </div>;
}

export function FunnelPageStudio({
  funnelId,
  funnelSlug,
  stepId,
  data,
  orderFormCatalog = [],
  subscriptionProducts = [],
  editorUserEmail = null
}: {
  funnelId: string;
  funnelSlug: string;
  stepId: string;
  data: AdminManagedFunnelPagePayload;
  orderFormCatalog?: NativeWorkbookCatalogItem[];
  subscriptionProducts?: FunnelSubscriptionProduct[];
  editorUserEmail?: string | null;
}) {
  const [page, setPage] = useState<ManagedFunnelPage | null>(data.page);
  const [document, setDocument] = useState<FunnelPageDocument>(() => data.page?.content ?? emptyFunnelPageDocument(data.step.name, data.step.description));
  const [seo, setSeo] = useState<ManagedFunnelPage["seo"]>(() => data.page?.seo ?? { title: data.step.name, description: data.step.description, noIndex: false });
  const [savedDocumentSnapshot, setSavedDocumentSnapshot] = useState(() => JSON.stringify({ document: data.page?.content ?? document, seo: data.page?.seo ?? { title: data.step.name, description: data.step.description, noIndex: false } }));
  const [selection, setSelection] = useState<Selection>({ kind: "page" });
  const [elementDrag, setElementDrag] = useState<FunnelElementDrag | null>(null);
  const [elementDropTarget, setElementDropTarget] = useState<FunnelElementDropTarget | null>(null);
  const [blockDrag, setBlockDrag] = useState<FunnelBlockKind | null>(null);
  const [sectionDropTarget, setSectionDropTarget] = useState<number | null>(null);
  const [rowDrag, setRowDrag] = useState<FunnelRowColumnCount | null>(null);
  const [rowDropTarget, setRowDropTarget] = useState<FunnelRowDropTarget | null>(null);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [panel, setPanel] = useState<"elements" | "blocks" | "styles">("elements");
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<MediaTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const assets = useMemo(() => document.assets ?? [], [document.assets]);
  const currentDocumentSnapshot = useMemo(() => JSON.stringify({ document, seo }), [document, seo]);
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

  function assignMedia(draft: FunnelPageDocument, asset: FunnelMediaSnapshot) {
    if (!mediaTarget) return;
    if (mediaTarget.kind === "workbook_gallery" && selection.kind === "element") {
      const element = draft.sections[selection.sectionIndex]?.rows[selection.rowIndex]?.columns[selection.columnIndex]?.elements[selection.elementIndex];
      if (element?.type !== "workbook_gallery") return;
      if (mediaTarget.slot === "cover") {
        element.props.cover = { ...asset, alt: element.props.cover.alt || asset.alt };
      } else if (mediaTarget.slot === "append") {
        if (element.props.images.length < 8) element.props.images.push(asset);
      } else {
        const current = element.props.images[mediaTarget.slot];
        if (current) element.props.images[mediaTarget.slot] = { ...asset, alt: current.alt || asset.alt };
      }
      return;
    }
    if (mediaTarget.kind !== "selection") return;
    if (selection.kind === "element") {
      const element = draft.sections[selection.sectionIndex]?.rows[selection.rowIndex]?.columns[selection.columnIndex]?.elements[selection.elementIndex];
      if (element?.type === "image") element.props.media = asset;
    } else if (selection.kind === "section") {
      draft.sections[selection.sectionIndex]!.props.background = asset;
    }
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

  function appendBlock(kind: FunnelBlockKind) {
    mutate((draft) => {
      draft.sections.push(newSection(kind));
      setSelection({ kind: "section", sectionIndex: draft.sections.length - 1 });
    });
  }

  function destinationSectionIndex() {
    if (selection.kind === "section" || selection.kind === "element") {
      return selection.sectionIndex;
    }
    return Math.max(0, document.sections.length - 1);
  }

  function appendRow(columnCount: FunnelRowColumnCount) {
    const sectionIndex = destinationSectionIndex();
    mutate((draft) => {
      const section = draft.sections[sectionIndex];
      if (!section) return;
      section.rows.push(createFunnelPageRow(columnCount));
      setSelection({ kind: "section", sectionIndex });
    });
  }

  function startRowDrag(event: DragEvent<HTMLElement>, columnCount: FunnelRowColumnCount) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", `new:funnel-row:${columnCount}`);
    setRowDrag(columnCount);
    setRowDropTarget(null);
    endElementDrag();
    endBlockDrag();
  }

  function endRowDrag() {
    setRowDrag(null);
    setRowDropTarget(null);
  }

  function updateRowDropTarget(target: FunnelRowDropTarget) {
    setRowDropTarget((current) => sameRowDropTarget(current, target) ? current : target);
  }

  function dropRow(target: FunnelRowDropTarget) {
    const columnCount = rowDrag;
    if (!columnCount) return;
    mutate((draft) => {
      const rows = draft.sections[target.sectionIndex]?.rows;
      if (!rows) return;
      const destinationIndex = Math.min(Math.max(target.rowIndex, 0), rows.length);
      rows.splice(destinationIndex, 0, createFunnelPageRow(columnCount));
      setSelection({ kind: "section", sectionIndex: target.sectionIndex });
    });
    endRowDrag();
  }

  function removeRow(sectionIndex: number, rowIndex: number) {
    mutate((draft) => {
      const section = draft.sections[sectionIndex];
      if (!section || section.rows.length <= 1) return;
      section.rows.splice(rowIndex, 1);
      setSelection({ kind: "section", sectionIndex });
    });
  }

  function startBlockDrag(event: DragEvent<HTMLElement>, kind: FunnelBlockKind) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", `new:funnel-section:${kind}`);
    setBlockDrag(kind);
    setSectionDropTarget(null);
    endElementDrag();
    endRowDrag();
  }

  function endBlockDrag() {
    setBlockDrag(null);
    setSectionDropTarget(null);
  }

  function updateSectionDropTarget(target: number) {
    setSectionDropTarget((current) => current === target ? current : target);
  }

  function dropBlock(target: number) {
    const kind = blockDrag;
    if (!kind) return;
    mutate((draft) => {
      const destinationIndex = Math.min(Math.max(target, 0), draft.sections.length);
      draft.sections.splice(destinationIndex, 0, newSection(kind));
      setSelection({ kind: "section", sectionIndex: destinationIndex });
    });
    endBlockDrag();
  }

  function startElementDrag(event: DragEvent<HTMLElement>, drag: FunnelElementDrag) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = drag.kind === "new" ? "copy" : "move";
    event.dataTransfer.setData("text/plain", drag.kind === "new" ? `new:${drag.elementType}` : "move:funnel-element");
    setElementDrag(drag);
    setElementDropTarget(null);
    endBlockDrag();
    endRowDrag();
  }

  function endElementDrag() {
    setElementDrag(null);
    setElementDropTarget(null);
  }

  function updateElementDropTarget(target: FunnelElementDropTarget) {
    setElementDropTarget((current) => sameDropTarget(current, target) ? current : target);
  }

  function dropElement(target: FunnelElementDropTarget) {
    const drag = elementDrag;
    if (!drag) return;
    if (
      drag.kind === "existing"
      && drag.source.sectionIndex === target.sectionIndex
      && drag.source.rowIndex === target.rowIndex
      && drag.source.columnIndex === target.columnIndex
      && (target.elementIndex === drag.source.elementIndex || target.elementIndex === drag.source.elementIndex + 1)
    ) {
      endElementDrag();
      return;
    }
    mutate((draft) => {
      const targetElements = draft.sections[target.sectionIndex]?.rows[target.rowIndex]?.columns[target.columnIndex]?.elements;
      if (!targetElements) return;
      if (drag.kind === "new") {
        const destinationIndex = Math.min(Math.max(target.elementIndex, 0), targetElements.length);
        targetElements.splice(destinationIndex, 0, createElement(drag.elementType));
        setSelection({ kind: "element", ...target, elementIndex: destinationIndex });
        return;
      }
      const sourceElements = draft.sections[drag.source.sectionIndex]?.rows[drag.source.rowIndex]?.columns[drag.source.columnIndex]?.elements;
      if (!sourceElements) return;
      const destinationIndex = moveItemAtInsertionPoint(
        sourceElements,
        drag.source.elementIndex,
        targetElements,
        target.elementIndex
      );
      if (destinationIndex !== null) {
        setSelection({ kind: "element", ...target, elementIndex: destinationIndex });
      }
    });
    endElementDrag();
  }

  async function save(publish = false) {
    const snapshotBeingSaved = JSON.stringify({ document, seo });
    setError(null);
    publish ? setPublishing(true) : setSaving(true);
    try {
      const saveResponse = await fetch("/api/funnels/pages", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          funnelId, stepId, pageId: page?.id ?? null, source: "manual", content: document,
          seo
        })
      });
      if (!saveResponse.ok) throw new Error(await responseError(saveResponse, "Could not save the page draft."));
      const saved = await saveResponse.json() as { page: ManagedFunnelPage };
      setPage(saved.page);
      setSeo(saved.page.seo);
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
  const rawOrderFormSettings = data.step.settings.orderForm;
  const orderFormSettings = rawOrderFormSettings && typeof rawOrderFormSettings === "object"
    ? rawOrderFormSettings as Record<string, unknown>
    : {};
  const primaryProductId = typeof orderFormSettings.primaryProductId === "string" ? orderFormSettings.primaryProductId : null;
  const primaryWorkbook = primaryProductId ? orderFormCatalog.find((item) => item.id === primaryProductId) ?? null : null;
  const primarySubscription = primaryProductId ? subscriptionProducts.find((item) => item.id === primaryProductId) ?? null : null;
  const primaryProduct = primaryWorkbook ?? primarySubscription;
  const orderBumpIds = Array.isArray(orderFormSettings.orderBumpProductIds)
    ? orderFormSettings.orderBumpProductIds.filter((id): id is string => typeof id === "string")
    : [];
  const orderBumps = orderBumpIds
    .map((id) => orderFormCatalog.find((item) => item.id === id) ?? null)
    .filter((item): item is NativeWorkbookCatalogItem => Boolean(
      item &&
      item.id !== primaryProduct?.id &&
      (!primarySubscription || item.type === "elective")
    ));
  const submitLabel = typeof orderFormSettings.submitLabel === "string" && orderFormSettings.submitLabel.trim()
    ? orderFormSettings.submitLabel.trim()
    : "Continue to secure checkout";
  const primarySubscriptionStartPrice = primarySubscription?.introductoryPriceInCents ?? primarySubscription?.priceInCents;
  const primaryPriceInCents = primaryWorkbook?.priceInCents ?? primarySubscriptionStartPrice ?? 0;
  const formattedPrimaryPrice = primarySubscription?.introductoryPriceInCents != null
    ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: primarySubscription.currencyCode }).format(primarySubscription.introductoryPriceInCents / 100)} first month`
    : primaryProduct
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: primaryProduct.currencyCode }).format(primaryProduct.priceInCents / 100)
      : "";
  const primaryBillingNote = primarySubscription
    ? primarySubscription.billingInterval === "yearly"
      ? "Billed annually"
      : `Then ${new Intl.NumberFormat("en-US", { style: "currency", currency: primarySubscription.currencyCode }).format(primarySubscription.priceInCents / 100)}/month`
    : "One time";
  const orderFormPreview = data.step.stepType === "order_form" ? (
    <section className="pointer-events-none mx-auto mb-12 w-full max-w-[1120px] rounded-[30px] border border-[#d8c7ad] bg-[#fffaf2] p-6 shadow-[0_18px_50px_rgba(79,54,34,.09)] sm:p-9" aria-label="Protected checkout preview">
      {primaryProduct ? (
        <CurriculumCheckoutOptions
          bundleId={primaryProduct.id}
          bundleSlug={primaryWorkbook?.slug ?? primaryProduct.id}
          bundleTitle={primaryProduct.title}
          bundleDescription={primaryProduct.description}
          bundlePrice={formattedPrimaryPrice}
          bundlePriceInCents={primaryPriceInCents}
          currencyCode={primaryProduct.currencyCode}
          primaryProductKind={primarySubscription ? "subscription" : "bookstore"}
          primaryBillingNote={primaryBillingNote}
          orderBumps={orderBumps.map((item) => ({ id: item.id, title: item.title, description: item.description, priceInCents: item.priceInCents, currencyCode: item.currencyCode }))}
          submitLabel={submitLabel}
          userEmail={editorUserEmail}
          returnPath={page?.publicPath ?? "/"}
          funnelKey={funnelSlug}
          previewMode
          successPath={page?.nextHref ?? undefined}
        />
      ) : (
        <div className="grid gap-4 text-center">
          <p className="text-base font-semibold text-ink/65">Checkout is temporarily unavailable because this order form does not have a published product configured.</p>
          <button type="button" disabled className="cta-button cta-button--light w-full cursor-not-allowed justify-center opacity-50">{submitLabel}</button>
        </div>
      )}
    </section>
  ) : null;
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
    <div
      className="grid min-h-0 flex-1"
      style={{ gridTemplateColumns: `${leftSidebarCollapsed ? 48 : 220}px minmax(0, 1fr) ${rightSidebarCollapsed ? 48 : 300}px` }}
    >
      <aside className={`overflow-auto border-r border-[#d6c6af] bg-[#fffaf2] ${leftSidebarCollapsed ? "p-2" : "p-3"}`}>
        <div className={`flex items-center gap-2 ${leftSidebarCollapsed ? "justify-center" : ""}`}>
          {!leftSidebarCollapsed ? <div className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-[11px] bg-[#eee7dc] p-1">{(["elements", "blocks", "styles"] as const).map((item) => <button type="button" key={item} onClick={() => { setPanel(item); if (item === "styles") setSelection({ kind: "page" }); }} className={`rounded-[8px] px-2 py-2 text-[11px] font-semibold capitalize ${panel === item ? "bg-white shadow-sm" : "text-ink/50"}`}>{item}</button>)}</div> : null}
          <button type="button" onClick={() => setLeftSidebarCollapsed((collapsed) => !collapsed)} aria-label={leftSidebarCollapsed ? "Expand element sidebar" : "Collapse element sidebar"} title={leftSidebarCollapsed ? "Expand element sidebar" : "Collapse element sidebar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#d8c5a8] bg-white text-lg font-bold text-ink/55 shadow-sm hover:border-[#739655] hover:text-[#4d6a39]">{leftSidebarCollapsed ? "›" : "‹"}</button>
        </div>
        {!leftSidebarCollapsed && panel === "elements" ? <div className="mt-4 grid gap-5">
          <p className="text-[11px] leading-4 text-ink/45">Drag a row into an existing section, then drag elements into its columns.</p>
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Layout</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([1, 2, 3, 4] as FunnelRowColumnCount[]).map((columnCount) => <button type="button" draggable key={columnCount} onClick={() => appendRow(columnCount)} onDragStart={(event) => startRowDrag(event, columnCount)} onDragEnd={endRowDrag} className="min-h-14 cursor-grab rounded-[12px] border border-[#b7cda3] bg-[#edf5e7] px-2 text-xs font-semibold text-[#4d6a39] hover:border-[#739655] active:cursor-grabbing">⠿ {columnCount}-column row</button>)}
            </div>
          </section>
          {funnelElementGroups.map((group) => <section key={group.label}>
            <h3 className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">{group.label}</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {group.elements.map((type) => <button type="button" draggable key={type} onClick={() => addElement(type)} onDragStart={(event) => startElementDrag(event, { kind: "new", elementType: type })} onDragEnd={endElementDrag} className="min-h-14 cursor-grab rounded-[12px] border border-[#d8c5a8] bg-white px-2 text-xs font-semibold capitalize hover:border-[#739655] active:cursor-grabbing">⠿ {type.replaceAll("_", " ")}</button>)}
            </div>
          </section>)}
        </div> : null}
        {!leftSidebarCollapsed && panel === "blocks" ? <div className="mt-4"><p className="mb-2 text-[11px] leading-4 text-ink/45">Drag a block between sections on the page, or click to append it.</p><div className="grid gap-2">{(["hero", "split", "offer", "blank"] as FunnelBlockKind[]).map((kind) => <button type="button" draggable key={kind} onClick={() => appendBlock(kind)} onDragStart={(event) => startBlockDrag(event, kind)} onDragEnd={endBlockDrag} className="min-h-14 cursor-grab rounded-[12px] border border-[#d8c5a8] bg-white px-3 text-left text-sm font-semibold capitalize hover:border-[#739655] active:cursor-grabbing">⠿ {kind} section</button>)}</div></div> : null}
        {!leftSidebarCollapsed && panel === "styles" ? <div className="mt-4 grid gap-4"><InspectorGroup title="Site header & footer" open><p className="text-[11px] leading-5 text-ink/50">Funnel pages have no site chrome unless you enable it here.</p><label className="flex items-center justify-between gap-3 rounded-[11px] border border-[#dfcfb7] bg-white px-3 py-2 text-xs font-semibold"><span>Show site header</span><input type="checkbox" checked={document.siteChrome?.showHeader === true} onChange={(event) => mutate((draft) => { draft.siteChrome = { showHeader: event.target.checked, showFooter: draft.siteChrome?.showFooter === true }; })} className="h-4 w-4 accent-[#76a456]" /></label><label className="flex items-center justify-between gap-3 rounded-[11px] border border-[#dfcfb7] bg-white px-3 py-2 text-xs font-semibold"><span>Show site footer</span><input type="checkbox" checked={document.siteChrome?.showFooter === true} onChange={(event) => mutate((draft) => { draft.siteChrome = { showHeader: draft.siteChrome?.showHeader === true, showFooter: event.target.checked }; })} className="h-4 w-4 accent-[#76a456]" /></label></InspectorGroup><label className="grid gap-1 text-xs font-semibold">Theme<select className={INPUT} value={document.theme} onChange={(event) => mutate((draft) => { draft.theme = event.target.value as FunnelPageDocument["theme"]; })}>{Object.keys(themes).map((theme) => <option key={theme} value={theme}>{theme[0]!.toUpperCase()}{theme.slice(1)}</option>)}</select></label><ColorControl label="Page background" value={document.styles?.colors?.pageBackground ?? baseTheme.page} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, colors: { ...draft.styles?.colors, pageBackground: value } }; })} /><ColorControl label="Surface" value={document.styles?.colors?.surface ?? baseTheme.surface} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, colors: { ...draft.styles?.colors, surface: value } }; })} /><ColorControl label="Primary" value={document.styles?.colors?.primary ?? baseTheme.primary} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, colors: { ...draft.styles?.colors, primary: value } }; })} /><NumberControl label="Content width" value={document.styles?.layout?.contentWidth ?? 1120} min={640} max={1600} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, layout: { ...draft.styles?.layout, contentWidth: value } }; })} /><NumberControl label="Section spacing" value={document.styles?.layout?.sectionGap ?? 22} min={0} max={160} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, layout: { ...draft.styles?.layout, sectionGap: value } }; })} /></div> : null}
      </aside>
      <section className="min-w-0 overflow-auto bg-[#d9d4cc] p-5"><EditorCanvas document={document} selection={selection} onSelect={setSelection} viewport={viewport} elementDrag={elementDrag} dropTarget={elementDropTarget} onStartElementDrag={startElementDrag} onDropTarget={updateElementDropTarget} onDropElement={dropElement} onEndElementDrag={endElementDrag} blockDrag={blockDrag} sectionDropTarget={sectionDropTarget} onSectionDropTarget={updateSectionDropTarget} onDropBlock={dropBlock} rowDrag={rowDrag} rowDropTarget={rowDropTarget} onRowDropTarget={updateRowDropTarget} onDropRow={dropRow} onRemoveRow={removeRow} orderFormPreview={orderFormPreview} /></section>
      <aside className={`overflow-auto border-l border-[#d6c6af] bg-[#fffaf2] ${rightSidebarCollapsed ? "p-2" : "p-4"}`}>
        <div className={`mb-3 flex items-center ${rightSidebarCollapsed ? "justify-center" : "justify-between"}`}>
          {!rightSidebarCollapsed ? <span className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Inspector</span> : null}
          <button type="button" onClick={() => setRightSidebarCollapsed((collapsed) => !collapsed)} aria-label={rightSidebarCollapsed ? "Expand inspector sidebar" : "Collapse inspector sidebar"} title={rightSidebarCollapsed ? "Expand inspector sidebar" : "Collapse inspector sidebar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#d8c5a8] bg-white text-lg font-bold text-ink/55 shadow-sm hover:border-[#739655] hover:text-[#4d6a39]">{rightSidebarCollapsed ? "‹" : "›"}</button>
        </div>
        {!rightSidebarCollapsed ? currentElement && selection.kind === "element" ? <ElementInspector element={currentElement} buttonPalette={buttonPalette} chooseMedia={() => setMediaTarget({ kind: "selection" })} chooseGalleryMedia={(slot) => setMediaTarget({ kind: "workbook_gallery", slot })} update={(next) => mutate((draft) => { draft.sections[selection.sectionIndex]!.rows[selection.rowIndex]!.columns[selection.columnIndex]!.elements[selection.elementIndex] = next; })} move={(direction) => mutate((draft) => { const items = draft.sections[selection.sectionIndex]!.rows[selection.rowIndex]!.columns[selection.columnIndex]!.elements; const nextIndex = selection.elementIndex + direction; if (nextIndex < 0 || nextIndex >= items.length) return; const [item] = items.splice(selection.elementIndex, 1); if (item) items.splice(nextIndex, 0, item); setSelection({ ...selection, elementIndex: nextIndex }); })} remove={() => mutate((draft) => { draft.sections[selection.sectionIndex]!.rows[selection.rowIndex]!.columns[selection.columnIndex]!.elements.splice(selection.elementIndex, 1); setSelection({ kind: "section", sectionIndex: selection.sectionIndex }); })} /> : selection.kind === "section" ? <SectionInspector section={document.sections[selection.sectionIndex]!} chooseMedia={() => setMediaTarget({ kind: "selection" })} update={(recipe) => mutate((draft) => recipe(draft.sections[selection.sectionIndex]!))} move={(direction) => mutate((draft) => { const nextIndex = selection.sectionIndex + direction; if (nextIndex < 0 || nextIndex >= draft.sections.length) return; const [item] = draft.sections.splice(selection.sectionIndex, 1); if (item) draft.sections.splice(nextIndex, 0, item); setSelection({ kind: "section", sectionIndex: nextIndex }); })} remove={() => mutate((draft) => { if (draft.sections.length <= 1) return; draft.sections.splice(selection.sectionIndex, 1); setSelection({ kind: "page" }); })} /> : <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Page</p><h3 className="mt-1 text-lg font-semibold">Page settings</h3><p className="mt-3 text-sm leading-6 text-ink/55">Select an element on the canvas to edit its content. Page-wide styles are available from the left panel.</p><button type="button" onClick={() => { setPanel("styles"); setLeftSidebarCollapsed(false); }} className="mt-4 w-full rounded-[12px] border border-[#d8c5a8] bg-white px-4 py-3 text-sm font-semibold">Open page styles</button><div className="mt-5 border-t border-[#eadfce] pt-5"><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Search appearance</p><div className="mt-3 grid gap-4"><label className="grid gap-1.5 text-xs font-semibold">SEO title<input className={INPUT} value={seo.title} maxLength={140} onChange={(event) => setSeo((current) => ({ ...current, title: event.target.value }))} /><span className="text-[10px] font-normal text-ink/45">{seo.title.length}/140 characters</span></label><label className="grid gap-1.5 text-xs font-semibold">Meta description<textarea className={`${INPUT} min-h-28 resize-y`} value={seo.description} maxLength={320} onChange={(event) => setSeo((current) => ({ ...current, description: event.target.value }))} /><span className="text-[10px] font-normal text-ink/45">{seo.description.length}/320 characters</span></label><label className="flex items-start gap-3 rounded-[12px] border border-[#dfcfb7] bg-white px-3 py-3 text-xs font-semibold"><input type="checkbox" checked={seo.noIndex} onChange={(event) => setSeo((current) => ({ ...current, noIndex: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#76a456]" /><span>Hide this page from search engines<span className="mt-1 block font-normal leading-5 text-ink/50">Adds a no-index directive while keeping the page available by its funnel URL.</span></span></label></div></div></div> : null}
      </aside>
    </div>
    {mediaTarget ? <AssetLibrary assets={assets} funnelId={funnelId} stepId={stepId} onClose={() => setMediaTarget(null)} onUploaded={(asset) => mutate((draft) => { draft.assets = [...(draft.assets ?? []), asset]; assignMedia(draft, asset); setMediaTarget(null); })} onChoose={(asset) => mutate((draft) => { assignMedia(draft, asset); setMediaTarget(null); })} /> : null}
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
function SectionInspector({
  section,
  defaultBackgroundColor = "#fffdf8",
  defaultBorderColor = "#b9cfa5",
  defaultPaddingX = 40,
  defaultPaddingY = 38,
  chooseMedia,
  update,
  move,
  remove
}: {
  section: FunnelPageSection;
  defaultBackgroundColor?: string;
  defaultBorderColor?: string;
  defaultPaddingX?: number;
  defaultPaddingY?: number;
  chooseMedia: () => void;
  update: (recipe: (section: FunnelPageSection) => void) => void;
  move: (direction: -1 | 1) => void;
  remove: () => void;
}) {
  return <div className="grid gap-4">
    <div className="flex items-center justify-between">
      <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Section</p><h3 className="mt-1 text-lg font-semibold">Layout</h3></div>
      <div className="flex gap-1"><button type="button" onClick={() => move(-1)} className="rounded-lg border px-2 py-1">↑</button><button type="button" onClick={() => move(1)} className="rounded-lg border px-2 py-1">↓</button><button type="button" onClick={remove} className="rounded-lg border px-2 py-1 text-[#9b4738]">×</button></div>
    </div>
    <label className="grid gap-1 text-xs font-semibold">Background tone<select className={INPUT} value={section.props.tone} onChange={(event) => update((draft) => { draft.props.tone = event.target.value as FunnelPageSection["props"]["tone"]; })}><option value="default">Default</option><option value="muted">Muted</option><option value="accent">Accent</option><option value="dark">Dark</option></select></label>
    <div className="grid gap-2 rounded-[13px] border border-[#dfcfb7] bg-white/55 p-3">
      <ColorControl label="Background color" value={section.props.backgroundColor ?? defaultBackgroundColor} onChange={(backgroundColor) => update((draft) => { draft.props.backgroundColor = backgroundColor; })} />
      {section.props.backgroundColor ? <button type="button" onClick={() => update((draft) => { delete draft.props.backgroundColor; })} className="justify-self-start text-xs font-semibold text-[#74573e] underline underline-offset-4">Use tone color</button> : <p className="text-[10px] leading-4 text-ink/45">Choose a color to override the selected tone.</p>}
    </div>
    <InspectorGroup title="Border" open>
      <ColorControl label="Border color" value={section.props.borderColor ?? defaultBorderColor} onChange={(borderColor) => update((draft) => { draft.props.borderColor = borderColor; })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberControl label="Width" value={section.props.borderWidth ?? 1} min={0} max={20} onChange={(borderWidth) => update((draft) => { draft.props.borderWidth = borderWidth; })} />
        <NumberControl label="Corner radius" value={section.props.borderRadius ?? 30} min={0} max={200} onChange={(borderRadius) => update((draft) => { draft.props.borderRadius = borderRadius; })} />
      </div>
      <label className="grid gap-1 text-xs font-semibold">Border style<select className={INPUT} value={section.props.borderStyle ?? "solid"} onChange={(event) => update((draft) => { draft.props.borderStyle = event.target.value as NonNullable<FunnelPageSection["props"]["borderStyle"]>; })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
      {(section.props.borderColor !== undefined || section.props.borderWidth !== undefined || section.props.borderRadius !== undefined || section.props.borderStyle !== undefined) ? <button type="button" onClick={() => update((draft) => { delete draft.props.borderColor; delete draft.props.borderWidth; delete draft.props.borderRadius; delete draft.props.borderStyle; })} className="justify-self-start text-xs font-semibold text-[#74573e] underline underline-offset-4">Reset border</button> : null}
    </InspectorGroup>
    <label className="grid gap-1 text-xs font-semibold">Content width<select className={INPUT} value={section.props.width} onChange={(event) => update((draft) => { draft.props.width = event.target.value as FunnelPageSection["props"]["width"]; })}><option value="narrow">Narrow</option><option value="standard">Standard</option><option value="wide">Wide</option></select></label>
    <InspectorGroup title="Spacing" open>
      <p className="text-xs leading-5 text-ink/50">Margin adds space outside this section. Padding adds space inside it.</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberControl label="Margin top" value={section.props.marginTop ?? 0} min={0} max={300} onChange={(marginTop) => update((draft) => { draft.props.marginTop = marginTop; })} />
        <NumberControl label="Margin bottom" value={section.props.marginBottom ?? 0} min={0} max={300} onChange={(marginBottom) => update((draft) => { draft.props.marginBottom = marginBottom; })} />
        <NumberControl label="Padding sides" value={section.props.paddingX ?? defaultPaddingX} min={0} max={300} onChange={(paddingX) => update((draft) => { draft.props.paddingX = paddingX; })} />
        <NumberControl label="Padding top/bottom" value={section.props.paddingY ?? defaultPaddingY} min={0} max={300} onChange={(paddingY) => update((draft) => { draft.props.paddingY = paddingY; })} />
      </div>
      {(section.props.marginTop !== undefined || section.props.marginBottom !== undefined || section.props.paddingX !== undefined || section.props.paddingY !== undefined) ? <button type="button" onClick={() => update((draft) => { delete draft.props.marginTop; delete draft.props.marginBottom; delete draft.props.paddingX; delete draft.props.paddingY; })} className="justify-self-start text-xs font-semibold text-[#74573e] underline underline-offset-4">Reset spacing</button> : null}
    </InspectorGroup>
    <button type="button" onClick={chooseMedia} className="rounded-[13px] border border-[#d8c5a8] bg-white px-4 py-3 text-sm font-semibold">{section.props.background ? "Change background image" : "Add background image"}</button>
    {section.props.background ? <button type="button" onClick={() => update((draft) => { draft.props.background = null; })} className="text-sm font-semibold text-[#8c4536] underline underline-offset-4">Remove background image</button> : null}
  </div>;
}
