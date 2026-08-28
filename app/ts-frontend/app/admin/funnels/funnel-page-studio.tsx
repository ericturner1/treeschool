"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { FUNNEL_BUTTON_ICON_OPTIONS, FunnelButtonIconGlyph, resolveFunnelButtonIcon } from "../../../components/funnel-button-icon";
import { FunnelProgressSteps } from "../../../components/funnel-progress-steps";
import { FunnelRichTextContent } from "../../../components/funnel-rich-text-content";
import { moveItemAtInsertionPoint } from "../../../lib/editor-drag";
import { funnelElementSpacingStyle } from "../../../lib/funnels/element-spacing";
import type {
  FunnelAction,
  FunnelElementSpacing,
  FunnelListMarker,
  FunnelMediaSnapshot,
  FunnelPageColumn,
  FunnelPageDocument,
  FunnelPageElement,
  FunnelPageRow,
  FunnelPageSection,
  FunnelRichTextRun,
  FunnelRowColumnCount
} from "../../../lib/funnels/page-document";
import {
  createFunnelDocumentId,
  createFunnelPageRow,
  emptyFunnelPageDocument,
  funnelImageAlignmentStyle,
  removeFunnelPageColumn,
  resolveFunnelImageSizePercent,
  resizeFunnelPageRow
} from "../../../lib/funnels/page-document";
import {
  FUNNEL_BUTTON_FONT_OPTIONS,
  FUNNEL_BUTTON_INTERACTION_CLASS,
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
import {
  funnelWorkbookGalleryAspectClass,
  resolveFunnelWorkbookGalleryAppearance
} from "../../../lib/funnels/workbook-gallery-style";
import {
  funnelRichTextEditorHtml,
  funnelRichTextPlainText,
  normalizeFunnelRichTextColor,
  normalizeFunnelRichTextRuns
} from "../../../lib/funnels/rich-text";
import type { AdminManagedFunnelPagePayload, FunnelSubscriptionProduct, ManagedFunnelPage } from "../../../lib/funnels/server";
import type { NativeWorkbookCatalogItem } from "../../../lib/native-workbooks/server";
import { showGlobalToast } from "../../../lib/toast";
import { CurriculumCheckoutOptions } from "../../first-grade-homeschool-curriculum/curriculum-checkout-choice";

type Selection =
  | { kind: "page" }
  | { kind: "section"; sectionIndex: number }
  | { kind: "row"; sectionIndex: number; rowPath: number[] }
  | { kind: "column"; sectionIndex: number; rowPath: number[]; columnIndex: number }
  | { kind: "element"; sectionIndex: number; rowPath: number[]; columnIndex: number; elementIndex: number };

type FunnelElementLocation = Extract<Selection, { kind: "element" }>;
type FunnelElementDropTarget = Omit<FunnelElementLocation, "kind">;
type FunnelElementDrag =
  | { kind: "existing"; source: FunnelElementLocation }
  | { kind: "new"; elementType: FunnelPageElement["type"] };
type FunnelBlockKind = "hero" | "split" | "offer" | "blank";
type FunnelRowLocation = { sectionIndex: number; rowPath: number[] };
type FunnelRowDropTarget = { sectionIndex: number; parentColumnPath: number[] | null; rowIndex: number };
type FunnelRowDrag =
  | { kind: "new"; columnCount: FunnelRowColumnCount }
  | { kind: "existing"; source: FunnelRowLocation };
type FunnelColumnLocation = { sectionIndex: number; rowPath: number[]; columnIndex: number };
type FunnelColumnDropTarget = FunnelColumnLocation;
type FunnelCanvasDragOwner =
  | { kind: "row"; source: FunnelRowLocation }
  | { kind: "column"; source: FunnelColumnLocation };

type FunnelDragDebugEntry = {
  sequence: number;
  at: string;
  elapsedMs: number;
  event: string;
  details: Record<string, unknown>;
};

type FunnelDragDebugState = {
  sessionId: string;
  events: FunnelDragDebugEntry[];
};

let funnelDragDebugSequence = 0;
let funnelDragDebugStartedAt = 0;
let funnelDragDebugSessionActive = false;

function funnelDragDebugWindow() {
  return window as typeof window & {
    __treeschoolFunnelDragDebug?: FunnelDragDebugState;
  };
}

function funnelDragDebugEnabled() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debugDrag") === "1" || params.get("dragDebug") === "1";
}

function dragNodeSummary(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null;
  return {
    tag: target.tagName.toLowerCase(),
    id: target.id || null,
    ariaLabel: target.getAttribute("aria-label"),
    draggable: target.draggable,
  };
}

function dragEventSummary(event: DragEvent<HTMLElement>) {
  return {
    target: dragNodeSummary(event.target),
    currentTarget: dragNodeSummary(event.currentTarget),
    clientX: event.clientX,
    clientY: event.clientY,
    defaultPrevented: event.defaultPrevented,
    effectAllowed: event.dataTransfer.effectAllowed,
    dropEffect: event.dataTransfer.dropEffect,
    transferTypes: Array.from(event.dataTransfer.types),
  };
}

function setFunnelRowDragImage(event: DragEvent<HTMLElement>) {
  const eventTarget = event.currentTarget;
  const row = eventTarget.closest<HTMLElement>("[data-funnel-row]") ?? eventTarget;
  const bounds = row.getBoundingClientRect();
  const offsetX = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width);
  const offsetY = Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height);
  event.dataTransfer.setDragImage(row, offsetX, offsetY);
  writeFunnelDragDebug("row.drag-image.set", {
    source: dragNodeSummary(row),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    offsetX: Math.round(offsetX),
    offsetY: Math.round(offsetY),
  });
}

function beginFunnelDragDebug() {
  if (!funnelDragDebugEnabled()) return;
  funnelDragDebugSequence = 0;
  funnelDragDebugStartedAt = performance.now();
  funnelDragDebugSessionActive = true;
  funnelDragDebugWindow().__treeschoolFunnelDragDebug = {
    sessionId: crypto.randomUUID(),
    events: [],
  };
}

function writeFunnelDragDebug(event: string, details: Record<string, unknown> = {}) {
  if (!funnelDragDebugEnabled() || !funnelDragDebugSessionActive) return;
  const state = funnelDragDebugWindow().__treeschoolFunnelDragDebug;
  if (!state) return;
  const entry: FunnelDragDebugEntry = {
    sequence: ++funnelDragDebugSequence,
    at: new Date().toISOString(),
    elapsedMs: Math.round((performance.now() - funnelDragDebugStartedAt) * 10) / 10,
    event,
    details,
  };
  state.events.push(entry);
  if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
  console.info(`[Treeschool Funnel DnD #${entry.sequence}] ${event}`, details);
}

function finishFunnelDragDebug() {
  funnelDragDebugSessionActive = false;
}

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
const CONTROL_LABEL = "grid gap-1.5 text-xs font-semibold";
const TOGGLE_CONTROL = "flex min-h-11 items-center justify-between gap-3 rounded-[11px] border border-[#dfcfb7] bg-white px-3 py-2 text-xs font-semibold";
const SECONDARY_CONTROL = "rounded-[11px] border border-[#cfbea4] bg-white px-3 py-2 text-xs font-semibold text-[#74573e] transition hover:border-[#9f7c5e] hover:text-ink";
const RESET_CONTROL = "justify-self-start text-xs font-semibold text-[#74573e] underline decoration-[#74573e]/35 underline-offset-4 hover:decoration-[#74573e]";
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
  if (type === "image") return { id, type, props: { media: emptyMedia(), fit: "contain", caption: "", sizePercent: 100, align: "center" } };
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

type FunnelWorkbookGalleryPreviewElement = Extract<FunnelPageElement, { type: "workbook_gallery" }>;

function PreviewWorkbookGallery({ element, onSelect, selected }: { element: FunnelWorkbookGalleryPreviewElement; onSelect: () => void; selected: boolean }) {
  const embeddedPreview = element.props.cover.publicUrl
    ?? element.props.cover.storagePath
    ?? element.props.images.find((image) => image.publicUrl ?? image.storagePath)?.publicUrl
    ?? element.props.images.find((image) => image.storagePath)?.storagePath;
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const previewSlug = element.props.previewSlug?.trim();
    if (!previewSlug) {
      setGeneratedPreview(null);
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    setPreviewLoading(true);
    void fetch(`/api/native-workbooks/product-previews?slug=${encodeURIComponent(previewSlug)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Generated workbook previews could not be loaded.");
        return response.json() as Promise<{
          thumbnailUrl?: unknown;
          previewImages?: Array<{ url?: unknown }>;
        }>;
      })
      .then((payload) => {
        const sampleSource = payload.previewImages?.find((image) => typeof image.url === "string" && image.url)?.url;
        const source = typeof payload.thumbnailUrl === "string" && payload.thumbnailUrl
          ? payload.thumbnailUrl
          : sampleSource;
        setGeneratedPreview(typeof source === "string" ? source : null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setGeneratedPreview(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });

    return () => controller.abort();
  }, [element.props.previewSlug]);

  const preview = embeddedPreview ?? generatedPreview;
  const appearance = resolveFunnelWorkbookGalleryAppearance(element.props.appearance);
  const baseScale = Math.max(0.8, Math.min(1.6, appearance.imageScale / 100));
  const hoverScale = appearance.zoomOnHover ? baseScale * 1.04 : baseScale;
  const imageStyle = {
    padding: appearance.framePadding,
    "--workbook-gallery-base-scale": baseScale,
    "--workbook-gallery-hover-scale": hoverScale,
    "--workbook-gallery-hover-brightness": `${appearance.hoverBrightness}%`
  } as CSSProperties;
  const imageInteraction = [
    "transition-[filter,transform] duration-200 [transform:scale(var(--workbook-gallery-base-scale))]",
    appearance.zoomOnHover ? "group-hover:[transform:scale(var(--workbook-gallery-hover-scale))]" : "",
    appearance.darkenOnHover ? "group-hover:[filter:brightness(var(--workbook-gallery-hover-brightness))]" : ""
  ].filter(Boolean).join(" ");
  const selection = selected ? "ring-4 ring-[#739655]/35 ring-offset-2" : "";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={`relative rounded-[8px] cursor-pointer transition ${selection} group mx-auto w-full max-w-sm overflow-hidden ${funnelWorkbookGalleryAspectClass(appearance.aspectRatio)} ${appearance.restingShadow ? "shadow-[0_10px_26px_rgba(60,45,32,.12)]" : ""} ${appearance.hoverLift ? "hover:-translate-y-1" : ""} ${appearance.hoverShadow ? "hover:shadow-[0_14px_28px_rgba(80,58,39,.18)]" : ""}`}
      style={{
        backgroundColor: appearance.frameBackgroundColor,
        borderColor: appearance.frameBorderColor,
        borderRadius: appearance.frameBorderRadius,
        borderStyle: appearance.frameBorderWidth > 0 ? "solid" : undefined,
        borderWidth: appearance.frameBorderWidth
      }}
    >
      {preview ? (
        <Image
          src={preview}
          alt={element.props.cover.alt || element.props.title || "Workbook cover"}
          fill
          unoptimized
          className={`${element.props.fit === "cover" ? "object-cover" : "object-contain"} ${imageInteraction}`}
          style={imageStyle}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center px-4 text-sm text-ink/45">
          {previewLoading ? "Loading workbook cover…" : "Choose a cover and sample pages in the inspector"}
        </span>
      )}
      {appearance.showOverlay ? <span className="absolute inset-x-2 bottom-2 translate-y-2 rounded-full px-2 py-1.5 text-center text-[10px] font-bold opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100" style={{ backgroundColor: appearance.overlayBackgroundColor, color: appearance.overlayTextColor }}>{appearance.overlayText}</span> : null}
    </button>
  );
}

function PreviewElement({ element, palette, onSelect, selected }: { element: FunnelPageElement; palette: FunnelButtonPalette; onSelect: () => void; selected: boolean }) {
  const align = "align" in element.props ? element.props.align : "left";
  const selection = selected ? "ring-4 ring-[#739655]/35 ring-offset-2" : "";
  const common = `relative rounded-[8px] cursor-pointer transition ${selection}`;
  if (element.type === "eyebrow") return <p onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} text-xs font-black uppercase tracking-[.12em]`} style={{ textAlign: align }}>{element.props.text}</p>;
  if (element.type === "heading") {
    const Tag = element.props.level;
    return <Tag onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} font-semibold leading-[1.05] tracking-[-.045em] ${element.props.level === "h1" ? "text-5xl" : element.props.level === "h2" ? "text-4xl" : "text-2xl"}`} style={{ textAlign: align, fontFamily: element.props.typography?.fontFamily || undefined, fontSize: element.props.typography?.fontSize, lineHeight: element.props.typography?.fontSize ? 1.05 : undefined }}>{element.props.text}</Tag>;
  }
  if (element.type === "text") return <p onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} whitespace-pre-line ${element.props.style === "lead" ? "text-xl leading-8" : element.props.style === "small" ? "text-sm" : "text-base leading-7"}`} style={{ textAlign: align, fontFamily: element.props.typography?.fontFamily || undefined, fontSize: element.props.typography?.fontSize, lineHeight: element.props.typography?.fontSize ? 1.5 : undefined }}><FunnelRichTextContent text={element.props.text} runs={element.props.richText} /></p>;
  if (element.type === "list") {
    if (!isCustomizedFunnelList(element.props)) {
      return <ul onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} grid gap-2`}>{element.props.items.map((item, index) => <li key={index} className="flex gap-2 rounded-[12px] bg-white/70 px-3 py-2"><span style={{ color: palette.primary }}>{element.props.style === "checks" ? "✓" : "•"}</span>{item}</li>)}</ul>;
    }
    return <ul onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} grid`} style={funnelListContainerStyle(element.props)}>{element.props.items.map((item, index) => <li key={index} className="flex" style={funnelListItemStyle(element.props)}><span className="shrink-0 font-black" aria-hidden="true" style={funnelListMarkerStyle(element.props, palette.primary)}>{funnelListMarker(element.props)}</span><span style={funnelListTextStyle(element.props)}>{item}</span></li>)}</ul>;
  }
  if (element.type === "image") return <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} block min-h-28 overflow-hidden border border-dashed border-ink/20 bg-white/40`} style={{ width: `${resolveFunnelImageSizePercent(element.props.sizePercent)}%`, ...funnelImageAlignmentStyle(element.props.align) }}>{element.props.media.publicUrl ? <Image src={element.props.media.publicUrl} alt={element.props.media.alt} width={1000} height={700} unoptimized className={`max-h-96 w-full ${element.props.fit === "cover" ? "object-cover" : "object-contain"}`} /> : <span className="text-sm text-ink/45">Choose an image in the inspector</span>}</button>;
  if (element.type === "workbook_gallery") return <PreviewWorkbookGallery element={element} onSelect={onSelect} selected={selected} />;
  if (element.type === "button") {
    const textColor = funnelButtonDefaultTextColor(element.props, palette);
    const icon = resolveFunnelButtonIcon(element.props);
    const iconGlyph = icon ? <FunnelButtonIconGlyph icon={icon} className="h-[1.1em] w-[1.1em] shrink-0" /> : null;
    return <div onClick={(e) => { e.stopPropagation(); onSelect(); }} className={`${common} flex ${align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start"}`}><span className={`inline-flex min-h-12 flex-col items-center justify-center gap-0.5 text-center ${FUNNEL_BUTTON_INTERACTION_CLASS}`} style={funnelButtonBoxStyle(element.props, palette)}><span className="inline-flex items-center justify-center gap-2 text-lg font-semibold" style={funnelButtonTextStyle(element.props.typography, textColor)}>{element.props.iconPosition === "left" ? iconGlyph : null}{element.props.label}{element.props.iconPosition === "left" ? null : iconGlyph}</span>{element.props.subtext ? <span className="text-xs font-medium opacity-90" style={funnelButtonSubtextStyle(element.props.subtextTypography, textColor)}>{element.props.subtext}</span> : null}</span></div>;
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

function sameIndexPath(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSelection(left: Selection | null, right: Selection) {
  if (!left || left.kind !== right.kind) return false;
  if (right.kind === "page") return true;
  if (left.kind === "page" || left.sectionIndex !== right.sectionIndex) return false;
  if (right.kind === "section") return true;
  if (left.kind === "section" || !sameIndexPath(left.rowPath, right.rowPath)) return false;
  if (right.kind === "row") return true;
  if (left.kind === "row" || left.columnIndex !== right.columnIndex) return false;
  if (right.kind === "column") return true;
  return left.kind === "element" && left.elementIndex === right.elementIndex;
}

function selectionStackAt(location: Selection) {
  if (location.kind === "page") return [location];
  if (location.kind === "section") return [location];
  const stack: Selection[] = [];
  if (location.kind === "element") stack.push(location);
  if (location.kind === "element" || location.kind === "column") {
    stack.push({ kind: "column", sectionIndex: location.sectionIndex, rowPath: location.rowPath, columnIndex: location.columnIndex });
  }
  let rowPath = [...location.rowPath];
  stack.push({ kind: "row", sectionIndex: location.sectionIndex, rowPath });
  while (rowPath.length > 1) {
    const parentColumnIndex = rowPath.at(-2);
    rowPath = rowPath.slice(0, -2);
    if (parentColumnIndex === undefined) break;
    stack.push({ kind: "column", sectionIndex: location.sectionIndex, rowPath, columnIndex: parentColumnIndex });
    stack.push({ kind: "row", sectionIndex: location.sectionIndex, rowPath });
  }
  stack.push({ kind: "section", sectionIndex: location.sectionIndex });
  return stack;
}

function selectionLabel(document: FunnelPageDocument, location: Selection) {
  if (location.kind === "page") return "Page";
  if (location.kind === "section") return `Section ${location.sectionIndex + 1}`;
  if (location.kind === "row") return `${location.rowPath.length > 1 ? "Nested row" : "Row"} ${(location.rowPath.at(-1) ?? 0) + 1}`;
  if (location.kind === "column") return `Column ${location.columnIndex + 1}`;
  const element = columnAtPath(document, location)?.elements[location.elementIndex];
  return element ? element.type.replaceAll("_", " ") : `Element ${location.elementIndex + 1}`;
}

function indexPathStartsWith(path: number[], prefix: number[]) {
  return prefix.length <= path.length && prefix.every((value, index) => value === path[index]);
}

function rowsAtParentColumn(
  document: FunnelPageDocument,
  sectionIndex: number,
  parentColumnPath: number[] | null,
  create = false,
) {
  let rows = document.sections[sectionIndex]?.rows;
  if (!rows) return null;
  if (!parentColumnPath) return rows;
  for (let index = 0; index < parentColumnPath.length; index += 2) {
    const row = rows[parentColumnPath[index]!];
    const column = row?.columns[parentColumnPath[index + 1]!];
    if (!column) return null;
    if (!column.rows) {
      if (!create) return null;
      column.rows = [];
    }
    rows = column.rows;
  }
  return rows;
}

function rowAtPath(document: FunnelPageDocument, sectionIndex: number, rowPath: number[]) {
  const rowIndex = rowPath.at(-1);
  if (rowIndex === undefined) return null;
  const rows = rowsAtParentColumn(document, sectionIndex, rowPath.length > 1 ? rowPath.slice(0, -1) : null);
  return rows?.[rowIndex] ?? null;
}

function columnAtPath(document: FunnelPageDocument, location: FunnelColumnLocation) {
  return rowAtPath(document, location.sectionIndex, location.rowPath)?.columns[location.columnIndex] ?? null;
}

function replaceRowAtPath(document: FunnelPageDocument, sectionIndex: number, rowPath: number[], row: FunnelPageRow) {
  const rowIndex = rowPath.at(-1);
  if (rowIndex === undefined) return false;
  const rows = rowsAtParentColumn(document, sectionIndex, rowPath.length > 1 ? rowPath.slice(0, -1) : null);
  if (!rows?.[rowIndex]) return false;
  rows[rowIndex] = row;
  return true;
}

function findRowPath(document: FunnelPageDocument, sectionIndex: number, rowId: string) {
  const visit = (rows: FunnelPageRow[], parentColumnPath: number[] | null): number[] | null => {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]!;
      const rowPath = [...(parentColumnPath ?? []), rowIndex];
      if (row.id === rowId) return rowPath;
      for (let columnIndex = 0; columnIndex < row.columns.length; columnIndex += 1) {
        const nested = row.columns[columnIndex]!.rows;
        if (!nested) continue;
        const found = visit(nested, [...rowPath, columnIndex]);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(document.sections[sectionIndex]?.rows ?? [], null);
}

function findRowsParentColumnPath(document: FunnelPageDocument, sectionIndex: number, targetRows: FunnelPageRow[]) {
  const sectionRows = document.sections[sectionIndex]?.rows;
  if (!sectionRows) return undefined;
  if (sectionRows === targetRows) return null;
  const visit = (rows: FunnelPageRow[], parentColumnPath: number[] | null): number[] | null | undefined => {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]!;
      const rowPath = [...(parentColumnPath ?? []), rowIndex];
      for (let columnIndex = 0; columnIndex < row.columns.length; columnIndex += 1) {
        const nested = row.columns[columnIndex]!.rows;
        if (!nested) continue;
        const columnPath = [...rowPath, columnIndex];
        if (nested === targetRows) return columnPath;
        const found = visit(nested, columnPath);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return visit(sectionRows, null);
}

function balanceRowColumns(row: FunnelPageRow) {
  const span = 12 / row.columns.length;
  for (const column of row.columns) {
    column.span = span;
    delete column.offset;
  }
}

function sameElementLocation(left: FunnelElementLocation, right: FunnelElementLocation) {
  return left.sectionIndex === right.sectionIndex
    && sameIndexPath(left.rowPath, right.rowPath)
    && left.columnIndex === right.columnIndex
    && left.elementIndex === right.elementIndex;
}

function sameDropTarget(left: FunnelElementDropTarget | null, right: FunnelElementDropTarget) {
  return left?.sectionIndex === right.sectionIndex
    && sameIndexPath(left.rowPath, right.rowPath)
    && left.columnIndex === right.columnIndex
    && left.elementIndex === right.elementIndex;
}

function sameRowDropTarget(left: FunnelRowDropTarget | null, right: FunnelRowDropTarget) {
  return left?.sectionIndex === right.sectionIndex
    && left.rowIndex === right.rowIndex
    && ((left.parentColumnPath === null && right.parentColumnPath === null)
      || (left.parentColumnPath !== null && right.parentColumnPath !== null && sameIndexPath(left.parentColumnPath, right.parentColumnPath)));
}

function sameColumnDropTarget(left: FunnelColumnDropTarget | null, right: FunnelColumnDropTarget) {
  return left?.sectionIndex === right.sectionIndex
    && sameIndexPath(left.rowPath, right.rowPath)
    && left.columnIndex === right.columnIndex;
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
    className={`my-1 grid place-items-center rounded-full border-2 border-dashed text-[10px] font-bold transition-all ${active ? "h-9 border-[#4f7538] bg-[#dcebcf] text-[#3f6130]" : "h-4 border-[#739655]/30 bg-white/25 text-transparent"}`}
    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); onTarget(target); }}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = copy ? "copy" : "move"; onTarget(target); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(target); }}
    aria-hidden="true"
  >
    {active ? (copy ? "Add element here" : "Move element here") : null}
  </div>;
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
  copy,
  onTarget,
  onDrop
}: {
  target: FunnelRowDropTarget;
  active: boolean;
  copy: boolean;
  onTarget: (target: FunnelRowDropTarget) => void;
  onDrop: (target: FunnelRowDropTarget) => void;
}) {
  return <div
    className={`my-2 grid h-10 place-items-center rounded-[12px] border-2 border-dashed text-[11px] font-bold transition ${active ? "border-[#4f7538] bg-[#dcebcf] text-[#3f6130]" : "border-[#739655]/35 bg-white/30 text-[#567b40]/55"}`}
    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); onTarget(target); }}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = copy ? "copy" : "move"; onTarget(target); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(target); }}
  >
    {copy ? "Add row here" : "Move row here"}
  </div>;
}

function FunnelColumnDropZone({
  target,
  side,
  active,
  onTarget,
  onDrop
}: {
  target: FunnelColumnDropTarget;
  side: "start" | "end";
  active: boolean;
  onTarget: (target: FunnelColumnDropTarget) => void;
  onDrop: (target: FunnelColumnDropTarget) => void;
}) {
  return <div
    className={`absolute inset-y-0 z-[60] w-4 rounded-full border-2 border-dashed transition ${side === "start" ? "-left-2" : "-right-2"} ${active ? "border-[#8a674d] bg-[#f4e7d5]" : "border-[#8a674d]/35 bg-white/45"}`}
    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); onTarget(target); }}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; onTarget(target); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(target); }}
    aria-hidden="true"
  >
    {active ? <span className="pointer-events-none absolute left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-[#8a674d] bg-[#fff7ec] px-2 py-1 text-[9px] font-bold text-[#704d34] shadow-md">Move column here</span> : null}
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
  onStartRowDrag,
  onEndRowDrag,
  resolveRowDrag,
  columnDrag,
  columnDropTarget,
  onStartColumnDrag,
  onColumnDropTarget,
  onDropColumn,
  onEndColumnDrag,
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
  rowDrag: FunnelRowDrag | null;
  rowDropTarget: FunnelRowDropTarget | null;
  onRowDropTarget: (target: FunnelRowDropTarget) => void;
  onDropRow: (target: FunnelRowDropTarget) => void;
  onStartRowDrag: (event: DragEvent<HTMLElement>, drag: FunnelRowDrag) => void;
  onEndRowDrag: (event: DragEvent<HTMLElement>) => void;
  resolveRowDrag: () => FunnelRowDrag | null;
  columnDrag: FunnelColumnLocation | null;
  columnDropTarget: FunnelColumnDropTarget | null;
  onStartColumnDrag: (event: DragEvent<HTMLElement>, source: FunnelColumnLocation) => void;
  onColumnDropTarget: (target: FunnelColumnDropTarget) => void;
  onDropColumn: (target: FunnelColumnDropTarget) => void;
  onEndColumnDrag: () => void;
  orderFormPreview?: ReactNode;
}) {
  const [hoverSelection, setHoverSelection] = useState<Selection | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; location: Selection } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPointRef = useRef<{ x: number; y: number; location: Selection } | null>(null);
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
  // Keep the inspector selection stable while letting the canvas show the one
  // item currently under the pointer. This makes containers such as sections
  // discoverable without drawing both the selected child and its parent.
  const activeSelection = hoverSelection ?? selection;
  const dragging = Boolean(elementDrag || blockDrag || rowDrag || columnDrag);

  function clearHoverTimer() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }

  function selectAt(location: Selection, cycle = false) {
    clearHoverTimer();
    setHoverSelection(null);
    setSelectionMenu(null);
    if (!cycle) {
      onSelect(location);
      return;
    }
    const stack = selectionStackAt(location);
    const currentIndex = stack.findIndex((item) => sameSelection(selection, item));
    onSelect(stack[currentIndex >= 0 ? (currentIndex + 1) % stack.length : 0] ?? location);
  }

  function trackPointer(event: ReactPointerEvent<HTMLElement>, location: Selection) {
    event.stopPropagation();
    if (event.buttons !== 0) {
      clearHoverTimer();
      return;
    }
    if (dragging || selectionMenu) return;
    setHoverSelection((current) => sameSelection(current, location) ? current : location);
    const previous = hoverPointRef.current;
    const moved = !previous
      || !sameSelection(previous.location, location)
      || Math.abs(previous.x - event.clientX) > 3
      || Math.abs(previous.y - event.clientY) > 3;
    if (!moved) return;
    hoverPointRef.current = { x: event.clientX, y: event.clientY, location };
    clearHoverTimer();
    const stack = selectionStackAt(location);
    if (stack.length <= 1) return;
    const x = Math.max(12, Math.min(event.clientX + 12, window.innerWidth - 230));
    const y = Math.max(12, Math.min(event.clientY + 12, window.innerHeight - 260));
    hoverTimerRef.current = setTimeout(() => {
      setSelectionMenu({ x, y, location });
      hoverTimerRef.current = null;
    }, 3000);
  }

  function canvasDragOwner(sectionIndex: number, rowPath: number[], columnIndex?: number): FunnelCanvasDragOwner | null {
    const candidate = selection.kind === "row" || selection.kind === "column" || selection.kind === "element"
      ? selection
      : hoverSelection;
    if (!candidate || candidate.kind === "page" || candidate.kind === "section" || candidate.sectionIndex !== sectionIndex) return null;
    if (candidate.kind === "row" && indexPathStartsWith(rowPath, candidate.rowPath)) {
      return { kind: "row", source: { sectionIndex, rowPath: candidate.rowPath } };
    }
    if (candidate.kind !== "column") return null;
    const directColumn = columnIndex !== undefined
      && sameIndexPath(rowPath, candidate.rowPath)
      && columnIndex === candidate.columnIndex;
    const nestedInsideColumn = indexPathStartsWith(rowPath, [...candidate.rowPath, candidate.columnIndex]);
    return directColumn || nestedInsideColumn ? { kind: "column", source: candidate } : null;
  }

  function startCanvasRowDrag(event: DragEvent<HTMLElement>, source: FunnelRowLocation) {
    beginFunnelDragDebug();
    const owner = canvasDragOwner(source.sectionIndex, source.rowPath);
    writeFunnelDragDebug("canvas.dragstart.classified", {
      gestureOrigin: "row",
      requestedSource: source,
      selected: selection,
      hoverSelection,
      resolvedOwner: owner,
      browserEvent: dragEventSummary(event),
    });
    if (owner?.kind === "column") onStartColumnDrag(event, owner.source);
    else onStartRowDrag(event, { kind: "existing", source: owner?.source ?? source });
  }

  function startCanvasColumnDrag(event: DragEvent<HTMLElement>, source: FunnelColumnLocation) {
    beginFunnelDragDebug();
    const owner = canvasDragOwner(source.sectionIndex, source.rowPath, source.columnIndex);
    writeFunnelDragDebug("canvas.dragstart.classified", {
      gestureOrigin: "column",
      requestedSource: source,
      selected: selection,
      hoverSelection,
      resolvedOwner: owner,
      browserEvent: dragEventSummary(event),
    });
    if (owner?.kind === "row") onStartRowDrag(event, { kind: "existing", source: owner.source });
    else onStartColumnDrag(event, owner?.source ?? source);
  }

  function startCanvasElementDrag(event: DragEvent<HTMLElement>, source: FunnelElementLocation) {
    beginFunnelDragDebug();
    const owner = canvasDragOwner(source.sectionIndex, source.rowPath, source.columnIndex);
    writeFunnelDragDebug("canvas.dragstart.classified", {
      gestureOrigin: "element",
      requestedSource: source,
      selected: selection,
      hoverSelection,
      resolvedOwner: owner,
      browserEvent: dragEventSummary(event),
    });
    if (owner?.kind === "row") onStartRowDrag(event, { kind: "existing", source: owner.source });
    else if (owner?.kind === "column") onStartColumnDrag(event, owner.source);
    else onStartElementDrag(event, { kind: "existing", source });
  }

  function canDropRowInsideColumn(drag: FunnelRowDrag, sectionIndex: number, columnPath: number[]) {
    return !(drag.kind === "existing"
      && drag.source.sectionIndex === sectionIndex
      && indexPathStartsWith(columnPath, drag.source.rowPath));
  }

  useEffect(() => () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);
  useEffect(() => {
    if (!dragging) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setHoverSelection(null);
    setSelectionMenu(null);
  }, [dragging]);

  const renderRows = (
    rows: FunnelPageRow[],
    sectionIndex: number,
    parentColumnPath: number[] | null,
    depth = 0,
  ): ReactNode => {
    const canDropRowsHere = !(rowDrag?.kind === "existing"
      && rowDrag.source.sectionIndex === sectionIndex
      && parentColumnPath !== null
      && indexPathStartsWith(parentColumnPath, rowDrag.source.rowPath));
    return <>
      {rows.map((row, rowIndex) => {
        const rowPath = [...(parentColumnPath ?? []), rowIndex];
        const rowLocation: FunnelRowLocation = { sectionIndex, rowPath };
        const rowTarget: FunnelRowDropTarget = { sectionIndex, parentColumnPath, rowIndex };
        const rowDragged = rowDrag?.kind === "existing"
          && rowDrag.source.sectionIndex === sectionIndex
          && sameIndexPath(rowDrag.source.rowPath, rowPath);
        const canDropColumnsHere = !(columnDrag
          && columnDrag.sectionIndex === sectionIndex
          && indexPathStartsWith(rowPath, [...columnDrag.rowPath, columnDrag.columnIndex]));
        const rowSelection: Selection = { kind: "row", sectionIndex, rowPath };
        const rowSelected = sameSelection(selection, rowSelection);
        const rowActive = sameSelection(activeSelection, rowSelection);
        return <Fragment key={row.id}>
          {rowDrag && canDropRowsHere ? <FunnelRowDropZone key="drop-zone" target={rowTarget} active={sameRowDropTarget(rowDropTarget, rowTarget)} copy={rowDrag.kind === "new"} onTarget={onRowDropTarget} onDrop={onDropRow} /> : null}
          <div
            key="row"
            data-funnel-row={row.id}
            draggable={rowSelected}
            className={`group/row relative rounded-[10px] transition ${rowSelected ? "cursor-grab active:cursor-grabbing" : ""} ${depth > 0 ? "my-2" : ""} ${rowDragged ? "opacity-35" : ""} ${rowActive ? "outline outline-2 outline-[#5f873f] outline-offset-4" : ""}`}
            onClick={(event) => { event.stopPropagation(); selectAt(rowSelection, event.altKey); }}
            onPointerMove={(event) => trackPointer(event, rowSelection)}
            onDragStartCapture={(event) => {
              if (!rowSelected) return;
              startCanvasRowDrag(event, rowLocation);
            }}
            onDragEnd={(event) => onEndRowDrag(event)}
            style={funnelElementSpacingStyle(row)}
          >
            <div className={`grid ${viewport === "mobile" ? "grid-cols-1" : "grid-cols-12"}`} style={{ gap: columnGap }}>
              {row.columns.map((column, columnIndex) => {
                const columnLocation: FunnelColumnLocation = { sectionIndex, rowPath, columnIndex };
                const columnPath = [...rowPath, columnIndex];
                const canDropInsideColumn = !(rowDrag?.kind === "existing"
                  && rowDrag.source.sectionIndex === sectionIndex
                  && indexPathStartsWith(columnPath, rowDrag.source.rowPath));
                const columnDragged = columnDrag?.sectionIndex === sectionIndex
                  && sameIndexPath(columnDrag.rowPath, rowPath)
                  && columnDrag.columnIndex === columnIndex;
                const columnSelection: Selection = { kind: "column", ...columnLocation };
                const columnSelected = sameSelection(selection, columnSelection);
                const columnActive = sameSelection(activeSelection, columnSelection);
                return <div
                  key={column.id}
                  draggable={columnSelected}
                  onClick={(event) => { event.stopPropagation(); selectAt(columnSelection, event.altKey); }}
                  onPointerMove={(event) => trackPointer(event, columnSelection)}
                  onDragStart={(event) => startCanvasColumnDrag(event, columnLocation)}
                  onDragEnd={onEndColumnDrag}
                  onDragEnter={(event) => {
                    const activeRowDrag = resolveRowDrag();
                    writeFunnelDragDebug("column.dragenter.observed", {
                      destination: { sectionIndex, parentColumnPath: columnPath, rowIndex: column.rows?.length ?? 0 },
                      activeRowDrag,
                      browserEvent: dragEventSummary(event),
                    });
                    if (!activeRowDrag || !canDropRowInsideColumn(activeRowDrag, sectionIndex, columnPath)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    writeFunnelDragDebug("column.dragenter.accept-row", {
                      destination: { sectionIndex, parentColumnPath: columnPath, rowIndex: column.rows?.length ?? 0 },
                      rowDrag: activeRowDrag,
                      browserEvent: dragEventSummary(event),
                    });
                    onRowDropTarget({ sectionIndex, parentColumnPath: columnPath, rowIndex: column.rows?.length ?? 0 });
                  }}
                  onDragOver={(event) => {
                    const activeRowDrag = resolveRowDrag();
                    if (!activeRowDrag || !canDropRowInsideColumn(activeRowDrag, sectionIndex, columnPath)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = activeRowDrag.kind === "new" ? "copy" : "move";
                    onRowDropTarget({ sectionIndex, parentColumnPath: columnPath, rowIndex: column.rows?.length ?? 0 });
                  }}
                  onDrop={(event) => {
                    const activeRowDrag = resolveRowDrag();
                    writeFunnelDragDebug("column.drop.observed", {
                      destination: { sectionIndex, parentColumnPath: columnPath, rowIndex: column.rows?.length ?? 0 },
                      activeRowDrag,
                      browserEvent: dragEventSummary(event),
                    });
                    if (!activeRowDrag || !canDropRowInsideColumn(activeRowDrag, sectionIndex, columnPath)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    writeFunnelDragDebug("column.drop.accept-row", {
                      destination: { sectionIndex, parentColumnPath: columnPath, rowIndex: column.rows?.length ?? 0 },
                      rowDrag: activeRowDrag,
                      browserEvent: dragEventSummary(event),
                    });
                    onDropRow({ sectionIndex, parentColumnPath: columnPath, rowIndex: column.rows?.length ?? 0 });
                  }}
                  className={`group/column relative grid min-w-0 content-start gap-4 rounded-[8px] transition ${columnSelected ? "cursor-grab active:cursor-grabbing" : ""} ${columnDragged ? "opacity-35" : ""} ${columnActive ? "outline outline-2 outline-[#8a674d] outline-offset-2" : ""}`}
                  style={{
                    ...(funnelElementSpacingStyle(column) ?? {}),
                    alignSelf: column.verticalAlign === "top" ? "start" : column.verticalAlign === "center" ? "center" : column.verticalAlign === "bottom" ? "end" : undefined,
                    ...(viewport === "mobile" ? {} : { gridColumn: column.offset !== undefined ? `${column.offset + 1} / span ${column.span}` : `span ${column.span}` }),
                  }}
                >
                  {columnDrag && canDropColumnsHere ? <FunnelColumnDropZone target={columnLocation} side="start" active={sameColumnDropTarget(columnDropTarget, columnLocation)} onTarget={onColumnDropTarget} onDrop={onDropColumn} /> : null}
                  {columnDrag && canDropColumnsHere && columnIndex === row.columns.length - 1 ? <FunnelColumnDropZone target={{ sectionIndex, rowPath, columnIndex: row.columns.length }} side="end" active={sameColumnDropTarget(columnDropTarget, { sectionIndex, rowPath, columnIndex: row.columns.length })} onTarget={onColumnDropTarget} onDrop={onDropColumn} /> : null}
                  <button
                    type="button"
                    draggable
                    onClick={(event) => { event.stopPropagation(); selectAt(columnSelection, event.altKey); }}
                    onDragStart={(event) => onStartColumnDrag(event, columnLocation)}
                    onDragEnd={onEndColumnDrag}
                    className={`absolute -left-1 -top-3 z-40 rounded-full border border-[#cbb99e] bg-white px-2 py-1 text-[9px] font-bold text-ink/55 shadow-sm transition ${columnSelected ? "opacity-100" : "opacity-0 group-hover/column:opacity-100 focus:opacity-100"}`}
                    aria-label={`Select column ${columnIndex + 1}`}
                    title="Select this column; drag the column itself to move it"
                  >
                    Column {columnIndex + 1} · {column.span}/12{column.offset !== undefined ? ` · offset ${column.offset}` : ""}
                  </button>
                  {column.elements.map((element, elementIndex) => {
                    const location: FunnelElementLocation = { kind: "element", sectionIndex, rowPath, columnIndex, elementIndex };
                    const target: FunnelElementDropTarget = { sectionIndex, rowPath, columnIndex, elementIndex };
                    const dragged = elementDrag?.kind === "existing" && sameElementLocation(elementDrag.source, location);
                    const elementSelected = sameSelection(selection, location);
                    return <div key={element.id} className="min-w-0">
                      {elementDrag ? <FunnelElementDropZone key="drop-zone" target={target} active={sameDropTarget(dropTarget, target)} copy={elementDrag.kind === "new"} onTarget={onDropTarget} onDrop={onDropElement} /> : null}
                      <div key="element" draggable={elementSelected} onClickCapture={(event) => { if (!event.altKey) return; event.preventDefault(); event.stopPropagation(); selectAt(location, true); }} onPointerMove={(event) => trackPointer(event, location)} onDragStart={(event) => startCanvasElementDrag(event, location)} onDragEnd={onEndElementDrag} className={`group/drag relative transition ${elementSelected ? "cursor-grab active:cursor-grabbing" : ""} ${dragged ? "opacity-35" : ""}`} style={funnelElementSpacingStyle(element)}>
                        <PreviewElement element={element} palette={palette} selected={sameSelection(activeSelection, location)} onSelect={() => selectAt(location)} />
                      </div>
                    </div>;
                  })}
                  {elementDrag ? (() => {
                    const target = { sectionIndex, rowPath, columnIndex, elementIndex: column.elements.length };
                    return <FunnelElementDropZone target={target} active={sameDropTarget(dropTarget, target)} copy={elementDrag.kind === "new"} onTarget={onDropTarget} onDrop={onDropElement} />;
                  })() : null}
                  {column.elements.length === 0 && !column.rows?.length && !elementDrag && !rowDrag ? <button type="button" onClick={(event) => { event.stopPropagation(); selectAt(columnSelection, event.altKey); }} className="min-h-24 rounded-[14px] border border-dashed border-ink/20 text-sm text-ink/40">Empty column</button> : null}
                  {column.rows?.length || (rowDrag && canDropInsideColumn) ? (
                    <div className={`rounded-[10px] ${rowDrag && canDropInsideColumn ? "border border-dashed border-[#739655]/45 bg-white/20 p-2" : ""}`}>
                      {renderRows(column.rows ?? [], sectionIndex, columnPath, depth + 1)}
                    </div>
                  ) : null}
                </div>;
              })}
            </div>
            <button
              type="button"
              draggable
              onClick={(event) => { event.stopPropagation(); selectAt(rowSelection, event.altKey); }}
              onDragStart={(event) => onStartRowDrag(event, { kind: "existing", source: rowLocation })}
              onDragEnd={(event) => onEndRowDrag(event)}
              className={`absolute -right-2 -top-3 z-50 rounded-full border border-[#9eb489] bg-[#f4f9ef] px-2 py-1 text-[10px] font-bold text-[#4d6a39] shadow-sm transition ${rowSelected ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 focus:opacity-100"}`}
              aria-label={`Select row ${rowIndex + 1}`}
              title="Select this row; drag the row itself to move it"
            >
              Row {rowIndex + 1} · {row.columns.length} {row.columns.length === 1 ? "column" : "columns"}
            </button>
          </div>
        </Fragment>;
      })}
      {rowDrag && canDropRowsHere ? (() => {
        const target = { sectionIndex, parentColumnPath, rowIndex: rows.length };
        return <FunnelRowDropZone target={target} active={sameRowDropTarget(rowDropTarget, target)} copy={rowDrag.kind === "new"} onTarget={onRowDropTarget} onDrop={onDropRow} />;
      })() : null}
    </>;
  };
  return (
    <div
      className={`mx-auto min-h-full overflow-hidden bg-white shadow-2xl transition-all ${viewport === "mobile" ? "w-[390px]" : "w-full max-w-[1320px]"}`}
      style={{ background: pageBg, color: styles?.typography?.bodyColor, fontFamily: styles?.typography?.bodyFontFamily, fontSize: styles?.typography?.baseFontSize }}
      onClick={() => selectAt({ kind: "page" })}
      onPointerLeave={() => {
        clearHoverTimer();
        hoverPointRef.current = null;
        if (!selectionMenu) setHoverSelection(null);
      }}
    >
      {document.siteChrome?.showHeader ? (
        <header className={`flex items-center justify-between border-b border-black/10 ${viewport === "mobile" ? "px-4 py-3" : "px-6 py-4"}`}>
          <span className="inline-flex items-center gap-2.5">
            <Image src="/tree-icon.png" alt="" width={42} height={42} className="h-9 w-9 object-contain" />
            <span className="brand-logo text-[22px] font-semibold leading-none">treeschool</span>
          </span>
          <span className="text-xs font-semibold text-ink/45">Site header</span>
        </header>
      ) : null}
      <div
        className="grid"
        style={{
          gap: sectionGap,
          paddingLeft: viewport === "mobile" ? 12 : 24,
          paddingRight: viewport === "mobile" ? 12 : 24,
        }}
      >
        {document.sections.map((section, sectionIndex) => {
          const sectionSelection: Selection = { kind: "section", sectionIndex };
          const selected = sameSelection(activeSelection, sectionSelection);
          const tone = section.props.backgroundColor ?? sectionToneColor(section, baseTheme, surface);
          const background = section.props.background?.publicUrl ? `url(${section.props.background.publicUrl}) center/cover` : tone;
          const sectionPaddingY = section.props.paddingY ?? paddingY;
          return (
            <Fragment key={section.id}>
            {blockDrag ? <FunnelSectionDropZone key="drop-zone" target={sectionIndex} active={sectionDropTarget === sectionIndex} onTarget={onSectionDropTarget} onDrop={onDropBlock} /> : null}
            <section
              key="section"
              onClick={(event) => { event.stopPropagation(); selectAt(sectionSelection, event.altKey); }}
              onPointerMove={(event) => trackPointer(event, sectionSelection)}
              onDragEnter={(event) => {
                const activeRowDrag = resolveRowDrag();
                if (!activeRowDrag) return;
                event.preventDefault();
                writeFunnelDragDebug("section.dragenter.accept-row", {
                  destination: { sectionIndex, parentColumnPath: null, rowIndex: section.rows.length },
                  activeRowDrag,
                  browserEvent: dragEventSummary(event),
                });
                onRowDropTarget({ sectionIndex, parentColumnPath: null, rowIndex: section.rows.length });
              }}
              onDragOver={(event) => {
                const activeRowDrag = resolveRowDrag();
                if (!activeRowDrag) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = activeRowDrag.kind === "new" ? "copy" : "move";
                onRowDropTarget({ sectionIndex, parentColumnPath: null, rowIndex: section.rows.length });
              }}
              onDrop={(event) => {
                const activeRowDrag = resolveRowDrag();
                if (!activeRowDrag) return;
                event.preventDefault();
                writeFunnelDragDebug("section.drop.accept-row", {
                  destination: { sectionIndex, parentColumnPath: null, rowIndex: section.rows.length },
                  activeRowDrag,
                  browserEvent: dragEventSummary(event),
                });
                onDropRow({ sectionIndex, parentColumnPath: null, rowIndex: section.rows.length });
              }}
              className={`rounded-[22px] border border-black/10 transition ${selected ? "ring-4 ring-[#739655]/35" : ""}`}
              style={{
                background,
                color: section.props.tone === "dark" ? "white" : undefined,
                borderColor: section.props.borderColor,
                borderWidth: section.props.borderWidth,
                borderRadius: section.props.borderRadius,
                borderStyle: section.props.borderStyle,
                marginTop: section.props.marginTop,
                marginRight: section.props.marginRight,
                marginBottom: section.props.marginBottom,
                marginLeft: section.props.marginLeft,
                paddingTop: section.props.paddingTop ?? sectionPaddingY,
                paddingRight: section.props.paddingRight ?? section.props.paddingX ?? (viewport === "mobile" ? 24 : 40),
                paddingBottom: section.props.paddingBottom ?? sectionPaddingY,
                paddingLeft: section.props.paddingLeft ?? section.props.paddingX ?? (viewport === "mobile" ? 24 : 40)
              }}
            >
              <div className="mx-auto" style={{ maxWidth: section.props.width === "narrow" ? Math.min(width, 820) : section.props.width === "wide" ? Math.max(width, 1280) : width }}>
                {renderRows(section.rows, sectionIndex, null)}
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
      {selectionMenu ? (
        <div
          className="fixed z-[170] w-[218px] rounded-[14px] border border-[#bda98b] bg-[#fffaf2] p-2 text-ink shadow-2xl"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          role="menu"
          aria-label="Select an item under the pointer"
        >
          <div className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-1">
            <span className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Select underneath</span>
            <button type="button" onClick={() => { setSelectionMenu(null); setHoverSelection(null); }} className="grid h-6 w-6 place-items-center rounded-full text-sm text-ink/45 hover:bg-black/5" aria-label="Close selection menu">×</button>
          </div>
          <div className="grid gap-1">
            {selectionStackAt(selectionMenu.location).map((item, index) => (
              <button
                key={`${item.kind}-${index}`}
                type="button"
                role="menuitem"
                onClick={() => selectAt(item)}
                className={`rounded-[9px] px-2.5 py-2 text-left text-xs capitalize transition hover:bg-[#e7f0dc] ${sameSelection(selection, item) ? "bg-[#edf5e7] font-bold text-[#466333]" : "font-semibold"}`}
              >
                {selectionLabel(document, item)}
              </button>
            ))}
          </div>
          <p className="px-2 pb-1 pt-2 text-[9px] leading-4 text-ink/45">Tip: Option/Alt-click cycles through this list.</p>
        </div>
      ) : null}
    </div>
  );
}

type FunnelButtonElement = Extract<FunnelPageElement, { type: "button" }>;
type FunnelListElement = Extract<FunnelPageElement, { type: "list" }>;
type FunnelCountdownElement = Extract<FunnelPageElement, { type: "countdown" }>;
type FunnelWorkbookGalleryElement = Extract<FunnelPageElement, { type: "workbook_gallery" }>;
type FunnelProgressStepsElement = Extract<FunnelPageElement, { type: "progress_steps" }>;

function SelectionBreadcrumbs({ document, selection, onSelect }: { document: FunnelPageDocument; selection: Selection; onSelect: (selection: Selection) => void }) {
  const items = [...selectionStackAt(selection)].reverse();
  return <nav aria-label="Selected page hierarchy" className="mb-4 flex flex-wrap items-center gap-1 rounded-[12px] border border-[#dfcfb7] bg-white/65 p-2">
    {items.map((item, index) => <Fragment key={`${item.kind}-${index}`}>
      {index > 0 ? <span className="text-[10px] text-ink/30" aria-hidden="true">›</span> : null}
      <button type="button" onClick={() => onSelect(item)} className={`rounded-[7px] px-2 py-1 text-[10px] capitalize transition hover:bg-[#e7f0dc] ${sameSelection(selection, item) ? "bg-[#edf5e7] font-bold text-[#466333]" : "font-semibold text-ink/55"}`}>{selectionLabel(document, item)}</button>
    </Fragment>)}
  </nav>;
}

function InspectorGroup({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [expanded, setExpanded] = useState(open);
  return <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="group rounded-[14px] border border-[#dfcfb7] bg-white/65"><summary className="cursor-pointer list-none px-3 py-3 text-xs font-bold text-ink marker:hidden">{title}<span className="float-right text-ink/35 transition group-open:rotate-180">⌄</span></summary><div className="grid gap-3 border-t border-[#eadfce] p-3">{children}</div></details>;
}

function SelectControl({ label, value, onChange, children, help }: { label: string; value: string | number; onChange: (value: string) => void; children: ReactNode; help?: string }) {
  return <label className={CONTROL_LABEL}>{label}<select className={INPUT} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>{help ? <span className="text-[10px] font-normal leading-4 text-ink/45">{help}</span> : null}</label>;
}

function ToggleControl({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (checked: boolean) => void; help?: string }) {
  return <label className={`${TOGGLE_CONTROL} ${help ? "items-start" : ""}`}><span>{label}{help ? <span className="mt-1 block font-normal leading-4 text-ink/50">{help}</span> : null}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className={`${help ? "mt-0.5" : ""} h-4 w-4 shrink-0 accent-[#76a456]`} /></label>;
}

function FontFamilyControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <SelectControl label={label} value={value} onChange={onChange}>{FUNNEL_BUTTON_FONT_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}</SelectControl>;
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
  const selectedIcon = resolveFunnelButtonIcon(props)?.toString() ?? "none";
  const iconPosition = props.iconPosition ?? "right";
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const selectedIconOption = FUNNEL_BUTTON_ICON_OPTIONS.find((option) => option.value === selectedIcon) ?? FUNNEL_BUTTON_ICON_OPTIONS[0]!;
  const matchingIconOptions = FUNNEL_BUTTON_ICON_OPTIONS.filter((option) => `${option.label} ${option.category}`.toLowerCase().includes(iconSearch.trim().toLowerCase()));
  const iconCategories = ["General", "Navigation", "Actions", "Commerce", "Learning", "People"] as const;

  useEffect(() => {
    if (!iconPickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setIconPickerOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [iconPickerOpen]);

  return <div className="grid gap-3">
    <InspectorGroup title="Copy" open>
      <label className="grid gap-1.5 text-xs font-semibold">Button text<input className={INPUT} value={props.label} onChange={(event) => updateProps({ label: event.target.value })} /></label>
      <label className="grid gap-1.5 text-xs font-semibold">Subtext<input className={INPUT} value={props.subtext ?? ""} placeholder="Optional reassurance or guarantee" onChange={(event) => updateProps({ subtext: event.target.value })} /></label>
      <ToggleControl label="Full width" checked={appearance.width === "full"} onChange={(checked) => updateAppearance({ width: checked ? "full" : "fit" })} />
    </InspectorGroup>
    <InspectorGroup title="Icon">
      <p className="text-xs leading-5 text-ink/50">Choose an icon, then place it before or after the button text.</p>
      <div className="flex items-center gap-3 rounded-[12px] border border-[#dfcfb7] bg-white p-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-[#edf5e7] text-[#4e7139]">
          {selectedIconOption.value === "none" ? <span className="text-xl font-light" aria-hidden="true">—</span> : <FunnelButtonIconGlyph icon={selectedIconOption.value} className="h-6 w-6" />}
        </span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-xs">{selectedIconOption.label}</strong><span className="text-[10px] text-ink/45">{selectedIconOption.category}</span></span>
        <button type="button" onClick={() => setIconPickerOpen(true)} className="rounded-[10px] border border-[#b8cba7] bg-[#f5faef] px-3 py-2 text-xs font-semibold text-[#4d6a39]">Choose icon</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={selectedIcon === "none"} aria-pressed={iconPosition === "left"} onClick={() => updateProps({ iconPosition: "left" })} className={`rounded-[11px] border px-3 py-2.5 text-xs font-semibold disabled:opacity-40 ${iconPosition === "left" ? "border-[#5f8546] bg-[#e5f0dc] text-[#466333]" : "border-[#dfcfb7] bg-white"}`}>Icon on left</button>
        <button type="button" disabled={selectedIcon === "none"} aria-pressed={iconPosition === "right"} onClick={() => updateProps({ iconPosition: "right" })} className={`rounded-[11px] border px-3 py-2.5 text-xs font-semibold disabled:opacity-40 ${iconPosition === "right" ? "border-[#5f8546] bg-[#e5f0dc] text-[#466333]" : "border-[#dfcfb7] bg-white"}`}>Icon on right</button>
      </div>
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
    <InspectorGroup title="Appearance" open>
      <label className="grid gap-1.5 text-xs font-semibold">Style<select className={INPUT} value={props.variant} onChange={(event) => updateProps({ variant: event.target.value as FunnelButtonElement["props"]["variant"] })}><option value="primary">Primary</option><option value="secondary">Secondary</option><option value="text">Text link</option></select></label>
      <ColorControl label="Background color" value={appearance.backgroundColor ?? defaultBackground} onChange={(backgroundColor) => updateAppearance({ backgroundColor })} />
      <ColorControl label="Border color" value={appearance.borderColor ?? defaultBorder} onChange={(borderColor) => updateAppearance({ borderColor })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Border width" value={appearance.borderWidth ?? (textVariant ? 0 : 2)} min={0} max={16} onChange={(borderWidth) => updateAppearance({ borderWidth })} /><NumberControl label="Corner radius" value={appearance.borderRadius ?? palette.pageBorderRadius ?? (textVariant ? 0 : 18)} min={0} max={999} onChange={(borderRadius) => updateAppearance({ borderRadius })} /></div>
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Padding horizontal" value={appearance.paddingX ?? (textVariant ? 0 : 28)} min={0} max={160} onChange={(paddingX) => updateAppearance({ paddingX })} /><NumberControl label="Padding vertical" value={appearance.paddingY ?? (textVariant ? 0 : 16)} min={0} max={100} onChange={(paddingY) => updateAppearance({ paddingY })} /></div>
      <div className="grid grid-cols-[1fr_96px] gap-2"><ColorControl label="Shadow color" value={appearance.shadowColor ?? defaultShadow} onChange={(shadowColor) => updateAppearance({ shadowColor })} /><NumberControl label="Depth" value={appearance.shadowDepth ?? (primary ? 8 : textVariant ? 0 : 6)} min={0} max={30} onChange={(shadowDepth) => updateAppearance({ shadowDepth })} /></div>
      <button type="button" onClick={() => updateProps({ typography: undefined, subtextTypography: undefined, appearance: undefined, icon: undefined, iconPosition: undefined, showArrow: undefined })} className={SECONDARY_CONTROL}>Reset styling to page defaults</button>
    </InspectorGroup>
    <InspectorGroup title="Hover effect" open>
      <ColorControl label="Hover background color" value={appearance.hoverBackgroundColor ?? appearance.backgroundColor ?? defaultBackground} onChange={(hoverBackgroundColor) => updateAppearance({ hoverBackgroundColor })} />
      <RangeControl label="Hover scale" value={appearance.hoverScale ?? 1} min={0.5} max={1.25} step={0.01} onChange={(hoverScale) => updateAppearance({ hoverScale })} />
      <p className="text-[10px] leading-4 text-ink/50">1.00 keeps the button at its normal size. Values below 1 shrink it; values above 1 enlarge it.</p>
    </InspectorGroup>
    {iconPickerOpen ? <div className="fixed inset-0 z-[300] grid place-items-center bg-[#1f261b]/55 p-4 backdrop-blur-[2px]" onMouseDown={() => setIconPickerOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="button-icon-picker-title" className="flex max-h-[86vh] w-full max-w-[860px] flex-col overflow-hidden rounded-[24px] border border-[#cdbb9f] bg-[#fffaf2] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 border-b border-[#e3d6c2] px-5 py-4 sm:px-6">
          <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Button</p><h3 id="button-icon-picker-title" className="mt-1 text-xl font-semibold">Choose an icon</h3></div>
          <button type="button" onClick={() => setIconPickerOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-[#d7c6ad] bg-white text-xl text-ink/60" aria-label="Close icon picker">×</button>
        </div>
        <div className="border-b border-[#e3d6c2] px-5 py-3 sm:px-6"><label className="grid gap-1.5 text-xs font-semibold">Search icons<input autoFocus className={INPUT} value={iconSearch} onChange={(event) => setIconSearch(event.target.value)} placeholder="Try cart, book, arrow, person…" /></label></div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          {matchingIconOptions.length ? <div className="grid gap-6">{iconCategories.map((category) => {
            const options = matchingIconOptions.filter((option) => option.category === category);
            if (!options.length) return null;
            return <section key={category}><h4 className="mb-2 text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">{category}</h4><div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">{options.map((option) => {
              const selected = selectedIcon === option.value;
              return <button key={option.value} type="button" aria-pressed={selected} title={option.label} onClick={() => { updateProps({ icon: option.value, showArrow: undefined }); setIconPickerOpen(false); }} className={`grid min-h-[76px] place-items-center gap-1 rounded-[12px] border px-1.5 py-2 text-center transition ${selected ? "border-[#5f8546] bg-[#e5f0dc] text-[#466333] ring-2 ring-[#739655]/25" : "border-[#dfcfb7] bg-white text-ink/65 hover:border-[#9bb586] hover:bg-[#f6faf2]"}`}>
                {option.value === "none" ? <span className="grid h-7 w-7 place-items-center text-xl font-light" aria-hidden="true">—</span> : <FunnelButtonIconGlyph icon={option.value} className="h-7 w-7" />}
                <span className="text-[9px] font-semibold leading-3">{option.label}</span>
              </button>;
            })}</div></section>;
          })}</div> : <p className="py-16 text-center text-sm text-ink/50">No icons match “{iconSearch}”.</p>}
        </div>
      </div>
    </div> : null}
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
      <ToggleControl label="Circular icon badge" checked={appearance.markerBadge === true} onChange={(markerBadge) => updateAppearance({ markerBadge })} />
      {appearance.markerBadge ? <div className="grid grid-cols-[1fr_96px] gap-2"><ColorControl label="Badge color" value={appearance.markerBadgeColor ?? "#dfead4"} onChange={(markerBadgeColor) => updateAppearance({ markerBadgeColor })} /><NumberControl label="Badge size" value={appearance.markerBadgeSize ?? 24} min={16} max={96} onChange={(markerBadgeSize) => updateAppearance({ markerBadgeSize })} /></div> : null}
    </InspectorGroup>
    <InspectorGroup title="Typography" open>
      <FontFamilyControl label="Font type" value={typography.fontFamily ?? ""} onChange={(fontFamily) => updateTypography({ fontFamily: fontFamily || undefined })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Font size" value={typography.fontSize ?? 18} min={10} max={96} onChange={(fontSize) => updateTypography({ fontSize })} /><NumberControl label="Line height" value={typography.lineHeight ?? 28} min={10} max={120} onChange={(lineHeight) => updateTypography({ lineHeight })} /></div>
      <label className="grid gap-1.5 text-xs font-semibold">Font weight<select className={INPUT} value={typography.fontWeight ?? 600} onChange={(event) => updateTypography({ fontWeight: Number(event.target.value) })}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option><option value="900">Black</option></select></label>
      <ColorControl label="Text color" value={typography.color ?? "#172033"} onChange={(color) => updateTypography({ color })} />
    </InspectorGroup>
    <InspectorGroup title="Appearance">
      <ToggleControl label="Transparent background" checked={!appearance.backgroundColor} onChange={(checked) => updateAppearance({ backgroundColor: checked ? undefined : "#ffffff" })} />
      {appearance.backgroundColor ? <ColorControl label="Background color" value={appearance.backgroundColor} onChange={(backgroundColor) => updateAppearance({ backgroundColor })} /> : null}
      <ColorControl label="Border color" value={appearance.borderColor ?? "#d8c5a8"} onChange={(borderColor) => updateAppearance({ borderColor })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Border width" value={appearance.borderWidth ?? 0} min={0} max={16} onChange={(borderWidth) => updateAppearance({ borderWidth })} /><NumberControl label="Corner radius" value={appearance.borderRadius ?? 14} min={0} max={160} onChange={(borderRadius) => updateAppearance({ borderRadius })} /></div>
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Padding horizontal" value={appearance.paddingX ?? 0} min={0} max={160} onChange={(paddingX) => updateAppearance({ paddingX })} /><NumberControl label="Padding vertical" value={appearance.paddingY ?? 0} min={0} max={120} onChange={(paddingY) => updateAppearance({ paddingY })} /></div>
      <button type="button" onClick={() => updateProps({ typography: undefined, appearance: undefined })} className={SECONDARY_CONTROL}>Reset list styling</button>
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
      <div className="grid grid-cols-2 gap-2"><ToggleControl label="Show days" checked={props.showDays} onChange={(showDays) => updateProps({ showDays })} /><ToggleControl label="Show labels" checked={props.showLabels} onChange={(showLabels) => updateProps({ showLabels })} /></div>
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
      <button type="button" onClick={() => updateProps({ typography: undefined, labelTypography: undefined })} className={SECONDARY_CONTROL}>Reset typography</button>
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
  const appearance = resolveFunnelWorkbookGalleryAppearance(element.props.appearance);
  const updateProps = (next: Partial<FunnelWorkbookGalleryElement["props"]>) => update({
    ...element,
    props: { ...element.props, ...next }
  });
  const updateAppearance = (next: Partial<NonNullable<FunnelWorkbookGalleryElement["props"]["appearance"]>>) => updateProps({
    appearance: { ...element.props.appearance, ...next }
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
    <InspectorGroup title="Gallery copy" open>
      <label className={CONTROL_LABEL}>Workbook title<input className={INPUT} value={element.props.title} onChange={(event) => updateProps({ title: event.target.value })} /></label>
      <label className={CONTROL_LABEL}>Caption<input className={INPUT} value={element.props.caption} onChange={(event) => updateProps({ caption: event.target.value })} placeholder="Optional text below the thumbnail" /></label>
      {element.props.previewSlug ? <div className="grid gap-2 rounded-[11px] border border-[#b7cda3] bg-[#edf5e7] p-3"><p className="text-xs font-semibold text-[#4d6a39]">Linked to generated previews</p><p className="break-all text-[10px] text-ink/50">{element.props.previewSlug}</p><p className="text-[10px] leading-4 text-ink/50">Treeschool loads the latest generated cover, contents, and sample-page thumbnails when a visitor opens this gallery.</p><button type="button" onClick={() => updateProps({ previewSlug: undefined })} className={RESET_CONTROL}>Use only manually selected images</button></div> : null}
    </InspectorGroup>
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
    <InspectorGroup title="Thumbnail style" open>
      <label className="grid gap-1.5 text-xs font-semibold">Style preset<select className={INPUT} value={appearance.preset} onChange={(event) => updateProps({ appearance: { preset: event.target.value as "funnel_card" | "bookstore_frameless" } })}><option value="funnel_card">Funnel card</option><option value="bookstore_frameless">Bookstore frameless</option></select></label>
      <p className="text-[10px] leading-4 text-ink/50">The bookstore preset removes the white frame and darkens the cover on hover so the label stays readable. Any setting below can be adjusted independently.</p>
      <label className="grid gap-1.5 text-xs font-semibold">Thumbnail shape<select className={INPUT} value={appearance.aspectRatio} onChange={(event) => updateAppearance({ aspectRatio: event.target.value as "3:4" | "4:5" | "square" })}><option value="3:4">Workbook cover (3:4)</option><option value="4:5">Tall card (4:5)</option><option value="square">Square</option></select></label>
      <label className="grid gap-1.5 text-xs font-semibold">Image fit<select className={INPUT} value={element.props.fit} onChange={(event) => updateProps({ fit: event.target.value as "contain" | "cover" })}><option value="contain">Show whole page</option><option value="cover">Fill and crop</option></select></label>
      <ToggleControl label="Transparent frame" checked={appearance.frameBackgroundColor === "transparent"} onChange={(checked) => updateAppearance({ frameBackgroundColor: checked ? "transparent" : "#ffffff" })} />
      {appearance.frameBackgroundColor === "transparent" ? null : <ColorControl label="Frame background" value={appearance.frameBackgroundColor} onChange={(frameBackgroundColor) => updateAppearance({ frameBackgroundColor })} />}
      <ColorControl label="Frame border color" value={appearance.frameBorderColor === "transparent" ? "#ffffff" : appearance.frameBorderColor} onChange={(frameBorderColor) => updateAppearance({ frameBorderColor })} />
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Border width" value={appearance.frameBorderWidth} min={0} max={16} onChange={(frameBorderWidth) => updateAppearance({ frameBorderWidth })} /><NumberControl label="Corner radius" value={appearance.frameBorderRadius} min={0} max={160} onChange={(frameBorderRadius) => updateAppearance({ frameBorderRadius })} /></div>
      <div className="grid grid-cols-2 gap-2"><NumberControl label="Inner padding" value={appearance.framePadding} min={0} max={100} onChange={(framePadding) => updateAppearance({ framePadding })} /><NumberControl label="Image scale %" value={appearance.imageScale} min={80} max={160} onChange={(imageScale) => updateAppearance({ imageScale })} /></div>
      <ToggleControl label="Show resting shadow" checked={appearance.restingShadow} onChange={(restingShadow) => updateAppearance({ restingShadow })} />
    </InspectorGroup>
    <InspectorGroup title="Hover effect" open>
      <ToggleControl label="Zoom image on hover" checked={appearance.zoomOnHover} onChange={(zoomOnHover) => updateAppearance({ zoomOnHover })} />
      <ToggleControl label="Darken image on hover" checked={appearance.darkenOnHover} onChange={(darkenOnHover) => updateAppearance({ darkenOnHover })} />
      {appearance.darkenOnHover ? <NumberControl label="Hover brightness %" value={appearance.hoverBrightness} min={10} max={100} onChange={(hoverBrightness) => updateAppearance({ hoverBrightness })} /> : null}
      <ToggleControl label="Lift thumbnail on hover" checked={appearance.hoverLift} onChange={(hoverLift) => updateAppearance({ hoverLift })} />
      <ToggleControl label="Add shadow on hover" checked={appearance.hoverShadow} onChange={(hoverShadow) => updateAppearance({ hoverShadow })} />
    </InspectorGroup>
    <InspectorGroup title="Hover label" open>
      <ToggleControl label="Show hover label" checked={appearance.showOverlay} onChange={(showOverlay) => updateAppearance({ showOverlay })} />
      {appearance.showOverlay ? <><label className="grid gap-1.5 text-xs font-semibold">Label text<input className={INPUT} value={appearance.overlayText} maxLength={160} onChange={(event) => updateAppearance({ overlayText: event.target.value })} /></label><ColorControl label="Label background" value={appearance.overlayBackgroundColor} onChange={(overlayBackgroundColor) => updateAppearance({ overlayBackgroundColor })} /><ColorControl label="Label text color" value={appearance.overlayTextColor} onChange={(overlayTextColor) => updateAppearance({ overlayTextColor })} /></> : null}
    </InspectorGroup>
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
      <SelectControl label="Current step" value={element.props.currentStep} onChange={(value) => updateProps({ currentStep: Number(value) })}>{element.props.steps.map((step, index) => <option key={index} value={index + 1}>{index + 1} · {step || "Untitled step"}</option>)}</SelectControl>
      <ToggleControl label="Show step numbers" checked={element.props.showNumbers} onChange={(showNumbers) => updateProps({ showNumbers })} />
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
  return <LayoutSpacingControls spacing={element.spacing} onChange={(spacing) => {
    const next = { ...element };
    if (spacing) next.spacing = spacing;
    else delete next.spacing;
    update(next);
  }} />;
}

type FunnelHeadingOrTextElement = Extract<FunnelPageElement, { type: "heading" | "text" }>;

function HeadingTextTypographyInspector({ element, update }: { element: FunnelHeadingOrTextElement; update: (next: FunnelPageElement) => void }) {
  const typography = element.props.typography ?? {};
  const defaultFontSize = element.type === "heading"
    ? element.props.level === "h1" ? 72 : element.props.level === "h2" ? 48 : 30
    : element.props.style === "lead" ? 24 : element.props.style === "small" ? 14 : 18;
  const updateTypography = (next: Partial<NonNullable<FunnelHeadingOrTextElement["props"]["typography"]>>) => update({
    ...element,
    props: { ...element.props, typography: { ...typography, ...next } }
  } as FunnelPageElement);
  const resetTypography = () => {
    const next = structuredClone(element);
    delete next.props.typography;
    update(next);
  };

  return <InspectorGroup title="Typography" open>
    <FontFamilyControl label="Font" value={typography.fontFamily ?? ""} onChange={(fontFamily) => updateTypography({ fontFamily: fontFamily || undefined })} />
    <RangeControl label="Font size" value={typography.fontSize ?? defaultFontSize} min={element.type === "heading" ? 12 : 8} max={element.type === "heading" ? 160 : 72} step={1} formatValue={(value) => `${Math.round(value)}px`} onChange={(fontSize) => updateTypography({ fontSize })} />
    {element.props.typography ? <button type="button" onClick={resetTypography} className={RESET_CONTROL}>Use page typography</button> : <p className="text-[10px] leading-4 text-ink/45">This element currently follows the page typography.</p>}
  </InspectorGroup>;
}

type FunnelRichTextStyle = Omit<FunnelRichTextRun, "text">;

function appendFunnelRichTextRun(
  runs: FunnelRichTextRun[],
  text: string,
  style: FunnelRichTextStyle
) {
  const normalizedText = text.replaceAll("\u00a0", " ");
  if (!normalizedText) return;
  runs.push({ text: normalizedText, ...style });
}

function funnelRichTextRunsFromNode(
  node: Node,
  inheritedStyle: FunnelRichTextStyle,
  runs: FunnelRichTextRun[]
) {
  if (node.nodeType === Node.TEXT_NODE) {
    appendFunnelRichTextRun(runs, node.textContent ?? "", inheritedStyle);
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.tagName === "BR") {
    appendFunnelRichTextRun(runs, "\n", {});
    return;
  }
  const fontWeight = Number(node.style.fontWeight);
  const textDecoration = `${node.style.textDecoration} ${node.style.textDecorationLine}`;
  const color = normalizeFunnelRichTextColor(node.style.color || node.getAttribute("color")) ?? inheritedStyle.color;
  const style: FunnelRichTextStyle = {
    ...(inheritedStyle.bold || node.tagName === "B" || node.tagName === "STRONG" || node.style.fontWeight === "bold" || (!Number.isNaN(fontWeight) && fontWeight >= 600) ? { bold: true } : {}),
    ...(inheritedStyle.italic || node.tagName === "I" || node.tagName === "EM" || node.style.fontStyle === "italic" || node.style.fontStyle === "oblique" ? { italic: true } : {}),
    ...(inheritedStyle.underline || node.tagName === "U" || textDecoration.includes("underline") ? { underline: true } : {}),
    ...(inheritedStyle.strikethrough || ["S", "STRIKE", "DEL"].includes(node.tagName) || textDecoration.includes("line-through") ? { strikethrough: true } : {}),
    ...(color ? { color } : {})
  };
  node.childNodes.forEach((child) => funnelRichTextRunsFromNode(child, style, runs));
}

function funnelRichTextRunsFromEditor(editor: HTMLDivElement) {
  const runs: FunnelRichTextRun[] = [];
  const children = Array.from(editor.childNodes);
  const appendLineBreak = () => {
    if (runs.length > 0 && !runs.at(-1)?.text.endsWith("\n")) {
      appendFunnelRichTextRun(runs, "\n", {});
    }
  };
  children.forEach((node, index) => {
    const isBlock = node instanceof HTMLElement && ["DIV", "P", "LI"].includes(node.tagName);
    if (isBlock && runs.length > 0) appendLineBreak();
    funnelRichTextRunsFromNode(node, {}, runs);
    if (isBlock && index < children.length - 1) appendLineBreak();
  });
  return normalizeFunnelRichTextRuns(runs);
}

function selectionIsInside(editor: HTMLDivElement, selection: ReturnType<typeof window.getSelection>) {
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return range.commonAncestorContainer === editor || editor.contains(range.commonAncestorContainer);
}

function colorInputValue(value: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const rgb = value.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
  if (!rgb) return null;
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, "0")).join("")}`;
}

function FunnelTextRichTextEditor({
  text,
  runs,
  onChange
}: {
  text: string;
  runs?: FunnelRichTextRun[];
  onChange: (text: string, runs: FunnelRichTextRun[]) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const html = useMemo(() => funnelRichTextEditorHtml(runs, text), [runs, text]);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false, strikethrough: false });
  const [color, setColor] = useState("#243042");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    if (editor.innerHTML !== html) editor.innerHTML = html;
  }, [html]);

  useEffect(() => {
    const refresh = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selectionIsInside(editor, selection)) return;
      savedRangeRef.current = selection!.getRangeAt(0).cloneRange();
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikethrough: document.queryCommandState("strikeThrough")
      });
      const selectedColor = colorInputValue(String(document.queryCommandValue("foreColor") ?? ""));
      if (selectedColor) setColor(selectedColor);
    };
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, []);

  const rememberSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (editor && selectionIsInside(editor, selection)) {
      savedRangeRef.current = selection!.getRangeAt(0).cloneRange();
    }
  };
  const restoreSelection = () => {
    const range = savedRangeRef.current;
    if (!range) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextRuns = funnelRichTextRunsFromEditor(editor);
    onChange(funnelRichTextPlainText(nextRuns), nextRuns);
  };
  const applyCommand = (command: "bold" | "italic" | "underline" | "strikeThrough") => {
    restoreSelection();
    document.execCommand(command, false);
    emitChange();
    rememberSelection();
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      strikethrough: document.queryCommandState("strikeThrough")
    });
  };
  const toolbarButton = (
    command: "bold" | "italic" | "underline" | "strikeThrough",
    label: string,
    content: ReactNode,
    pressed: boolean
  ) => (
    <button
      type="button"
      title={`${label} selected text`}
      aria-label={`${label} selected text`}
      aria-pressed={pressed}
      onMouseDown={(event) => {
        event.preventDefault();
        applyCommand(command);
      }}
      className={`grid h-8 w-8 place-items-center rounded-[6px] border text-sm text-ink transition ${pressed ? "border-[#739655] bg-[#e7f0dc]" : "border-[#d8c8ae] bg-white hover:bg-[#edf4e7]"}`}
    >
      {content}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-[9px] border border-[#d8c8ae] bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-[#e5d8c4] bg-[#f7f3eb] px-2 py-1.5">
        {toolbarButton("bold", "Bold", <strong>B</strong>, active.bold)}
        {toolbarButton("italic", "Italicize", <span className="font-serif italic">I</span>, active.italic)}
        {toolbarButton("underline", "Underline", <span className="underline underline-offset-2">U</span>, active.underline)}
        {toolbarButton("strikeThrough", "Strikethrough", <span className="line-through">S</span>, active.strikethrough)}
        <label className="relative ml-0.5 grid h-8 w-8 cursor-pointer place-items-center rounded-[6px] border border-[#d8c8ae] bg-white" title="Color selected text">
          <span className="text-sm font-bold" style={{ color }}>A</span>
          <input
            type="color"
            value={color}
            aria-label="Color selected text"
            className="absolute inset-0 cursor-pointer opacity-0"
            onPointerDown={rememberSelection}
            onChange={(event) => {
              const nextColor = event.target.value;
              setColor(nextColor);
              restoreSelection();
              document.execCommand("styleWithCSS", false, "true");
              document.execCommand("foreColor", false, nextColor);
              emitChange();
              rememberSelection();
            }}
          />
        </label>
        <span className="ml-1 text-[10px] leading-4 text-ink/45">Select text, then format it</span>
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-label="Text content"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
          emitChange();
        }}
        className="min-h-32 whitespace-pre-wrap px-3 py-2 text-sm leading-6 outline-none"
      />
    </div>
  );
}

function ElementInspector({ element, update, chooseMedia, chooseGalleryMedia, move, remove, buttonPalette }: { element: FunnelPageElement; update: (next: FunnelPageElement) => void; chooseMedia: () => void; chooseGalleryMedia: (slot: "cover" | "append" | number) => void; move: (direction: -1 | 1) => void; remove: () => void; buttonPalette: FunnelButtonPalette }) {
  const align = "align" in element.props ? element.props.align : null;
  return <div className="grid gap-4">
    <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Element</p><h3 className="mt-1 text-lg font-semibold capitalize">{element.type.replaceAll("_", " ")}</h3></div><div className="flex gap-1"><button type="button" onClick={() => move(-1)} className="rounded-lg border px-2 py-1">↑</button><button type="button" onClick={() => move(1)} className="rounded-lg border px-2 py-1">↓</button><button type="button" onClick={remove} className="rounded-lg border px-2 py-1 text-[#9b4738]">×</button></div></div>
    {element.type === "eyebrow" || element.type === "heading" || element.type === "text" ? <InspectorGroup title="Content" open>
      {element.type === "text" ? <FunnelTextRichTextEditor text={element.props.text} runs={element.props.richText} onChange={(text, richText) => update({ ...element, props: { ...element.props, text, richText } })} /> : <label className={CONTROL_LABEL}>Text<textarea rows={3} className={`${INPUT} resize-y`} value={element.props.text} onChange={(event) => update({ ...element, props: { ...element.props, text: event.target.value } } as FunnelPageElement)} /></label>}
      {element.type === "heading" ? <SelectControl label="Heading size" value={element.props.level} onChange={(value) => update({ ...element, props: { ...element.props, level: value as "h1" | "h2" | "h3" } })}><option value="h1">Page headline</option><option value="h2">Section heading</option><option value="h3">Small heading</option></SelectControl> : null}
      {element.type === "text" ? <SelectControl label="Text style" value={element.props.style} onChange={(value) => update({ ...element, props: { ...element.props, style: value as "lead" | "body" | "small" } })}><option value="lead">Lead</option><option value="body">Body</option><option value="small">Small</option></SelectControl> : null}
    </InspectorGroup> : null}
    {element.type === "heading" || element.type === "text" ? <HeadingTextTypographyInspector element={element} update={update} /> : null}
    {element.type === "list" ? <ListInspector element={element} palette={buttonPalette} update={update} /> : null}
    {element.type === "image" ? <InspectorGroup title="Image" open><button type="button" onClick={chooseMedia} className={SECONDARY_CONTROL}>Choose from media manager</button><RangeControl label="Size" value={resolveFunnelImageSizePercent(element.props.sizePercent)} min={10} max={100} step={1} formatValue={(value) => `${Math.round(value)}%`} onChange={(sizePercent) => update({ ...element, props: { ...element.props, sizePercent } })} /><SelectControl label="Horizontal alignment" value={element.props.align ?? "center"} onChange={(value) => update({ ...element, props: { ...element.props, align: value as "left" | "center" | "right" } })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></SelectControl><label className={CONTROL_LABEL}>Alternative text<input className={INPUT} value={element.props.media.alt} onChange={(event) => update({ ...element, props: { ...element.props, media: { ...element.props.media, alt: event.target.value } } })} /></label><SelectControl label="Image fit" value={element.props.fit} onChange={(value) => update({ ...element, props: { ...element.props, fit: value as "contain" | "cover" } })}><option value="contain">Show whole image</option><option value="cover">Fill and crop</option></SelectControl></InspectorGroup> : null}
    {element.type === "workbook_gallery" ? <WorkbookGalleryInspector element={element} update={update} chooseMedia={chooseGalleryMedia} /> : null}
    {element.type === "button" ? <ButtonInspector element={element} palette={buttonPalette} update={update} /> : null}
    {element.type === "countdown" ? <CountdownInspector element={element} palette={buttonPalette} update={update} /> : null}
    {element.type === "progress_steps" ? <ProgressStepsInspector element={element} update={update} /> : null}
    {element.type === "lead_capture" ? <InspectorGroup title="Form" open><label className={CONTROL_LABEL}>Form heading<input className={INPUT} value={element.props.heading} onChange={(event) => update({ ...element, props: { ...element.props, heading: event.target.value } })} /></label><label className={CONTROL_LABEL}>Submit label<input className={INPUT} value={element.props.submitLabel} onChange={(event) => update({ ...element, props: { ...element.props, submitLabel: event.target.value } })} /></label></InspectorGroup> : null}
    {element.type === "button" || element.type === "lead_capture" ? <InspectorGroup title="Action" open><SelectControl label="Click action" value={element.props.action.type} onChange={(value) => update({ ...element, props: { ...element.props, action: buildAction(value as FunnelAction["type"], actionTarget(element.props.action), actionOffer(element.props.action)) } } as FunnelPageElement)}><option value="next_step">Next funnel step</option><option value="url">Fixed URL</option><option value="checkout">Start checkout</option><option value="accept_offer">Accept offer</option><option value="decline_offer">Decline offer</option><option value="none">No action</option></SelectControl>{element.props.action.type === "url" || element.props.action.type === "checkout" ? <label className={CONTROL_LABEL}>Destination<input className={INPUT} value={actionTarget(element.props.action)} onChange={(event) => update({ ...element, props: { ...element.props, action: buildAction(element.props.action.type, event.target.value, actionOffer(element.props.action)) } } as FunnelPageElement)} placeholder="Optional funnel-relative target" /></label> : null}{"offerKey" in element.props.action ? <label className={CONTROL_LABEL}>Offer key<input className={INPUT} value={element.props.action.offerKey} onChange={(event) => update({ ...element, props: { ...element.props, action: buildAction(element.props.action.type, actionTarget(element.props.action), event.target.value) } } as FunnelPageElement)} /></label> : null}</InspectorGroup> : null}
    {align ? <InspectorGroup title="Alignment" open><SelectControl label="Content alignment" value={align} onChange={(value) => update({ ...element, props: { ...element.props, align: value as "left" | "center" | "right" } } as FunnelPageElement)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></SelectControl></InspectorGroup> : null}
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
  const [rowDrag, setRowDrag] = useState<FunnelRowDrag | null>(null);
  const [rowDropTarget, setRowDropTarget] = useState<FunnelRowDropTarget | null>(null);
  const [columnDrag, setColumnDrag] = useState<FunnelColumnLocation | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<FunnelColumnDropTarget | null>(null);
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
  const rowDragRef = useRef<FunnelRowDrag | null>(null);
  const rowDropTargetRef = useRef<FunnelRowDropTarget | null>(null);
  const rowDragFrameRef = useRef<number | null>(null);
  const historyGuardIdRef = useRef(`funnel-page-editor-${stepId}`);
  const backHref = `/admin/funnels/${encodeURIComponent(funnelSlug)}?step=${encodeURIComponent(stepId)}${page ? `&page=${encodeURIComponent(page.id)}` : ""}`;
  const previewHref = `/admin/funnels/${encodeURIComponent(funnelSlug)}/preview/${encodeURIComponent(stepId)}${page ? `?page=${encodeURIComponent(page.id)}` : ""}`;

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!funnelDragDebugEnabled()) return;
    console.warn(
      "[Treeschool Funnel DnD] Diagnostics enabled. Reproduce one drag, then inspect window.__treeschoolFunnelDragDebug."
    );
  }, []);

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
    return columnAtPath(document, selection)?.elements[selection.elementIndex] ?? null;
  }

  function selectedRow() {
    if (selection.kind !== "row") return null;
    return rowAtPath(document, selection.sectionIndex, selection.rowPath);
  }

  function selectedColumn() {
    if (selection.kind !== "column") return null;
    return columnAtPath(document, selection);
  }

  function assignMedia(draft: FunnelPageDocument, asset: FunnelMediaSnapshot) {
    if (!mediaTarget) return;
    if (mediaTarget.kind === "workbook_gallery" && selection.kind === "element") {
      const element = columnAtPath(draft, selection)?.elements[selection.elementIndex];
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
      const element = columnAtPath(draft, selection)?.elements[selection.elementIndex];
      if (element?.type === "image") element.props.media = asset;
    } else if (selection.kind === "section") {
      draft.sections[selection.sectionIndex]!.props.background = asset;
    }
  }

  function destinationColumn(): Omit<FunnelElementDropTarget, "elementIndex"> {
    if (selection.kind === "element" || selection.kind === "column") return { sectionIndex: selection.sectionIndex, rowPath: selection.rowPath, columnIndex: selection.columnIndex };
    if (selection.kind === "row") return { sectionIndex: selection.sectionIndex, rowPath: selection.rowPath, columnIndex: 0 };
    const sectionIndex = selection.kind === "section" ? selection.sectionIndex : Math.max(0, document.sections.length - 1);
    const section = document.sections[sectionIndex];
    const rowIndex = Math.max(0, (section?.rows.length ?? 1) - 1);
    const columnIndex = 0;
    return { sectionIndex, rowPath: [rowIndex], columnIndex };
  }

  function addElement(type: FunnelPageElement["type"]) {
    const target = destinationColumn();
    mutate((draft) => {
      const elements = columnAtPath(draft, target)?.elements;
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
    if (selection.kind !== "page") {
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
      setSelection({ kind: "row", sectionIndex, rowPath: [section.rows.length - 1] });
    });
  }

  function startRowDrag(event: DragEvent<HTMLElement>, drag: FunnelRowDrag) {
    if (!funnelDragDebugSessionActive) beginFunnelDragDebug();
    event.stopPropagation();
    event.dataTransfer.effectAllowed = drag.kind === "new" ? "copy" : "move";
    event.dataTransfer.setData("text/plain", drag.kind === "new" ? `new:funnel-row:${drag.columnCount}` : "move:funnel-row");
    if (drag.kind === "existing") setFunnelRowDragImage(event);
    writeFunnelDragDebug("row.dragstart", {
      drag,
      previousRowDragRef: rowDragRef.current,
      browserEvent: dragEventSummary(event),
    });
    rowDragRef.current = drag;
    rowDropTargetRef.current = null;
    if (rowDragFrameRef.current !== null) cancelAnimationFrame(rowDragFrameRef.current);
    // Updating the canvas during the dragstart event makes Chromium cancel a
    // nested row drag before it can enter a destination. Wait until the browser
    // has committed the native drag, then reveal the insertion targets.
    rowDragFrameRef.current = requestAnimationFrame(() => {
      rowDragFrameRef.current = null;
      if (rowDragRef.current !== drag) return;
      setRowDrag(drag);
      setRowDropTarget(null);
      endElementDrag();
      endBlockDrag();
      endColumnDrag();
    });
  }

  function endRowDrag(event?: DragEvent<HTMLElement>) {
    writeFunnelDragDebug("row.dragend", {
      rowDragRef: rowDragRef.current,
      rowDragState: rowDrag,
      browserEvent: event ? dragEventSummary(event) : null,
    });
    if (rowDragFrameRef.current !== null) {
      cancelAnimationFrame(rowDragFrameRef.current);
      rowDragFrameRef.current = null;
    }
    rowDragRef.current = null;
    setRowDrag(null);
    rowDropTargetRef.current = null;
    setRowDropTarget(null);
    // A successful drop clears React drag state before the browser emits its
    // final dragend event. Keep the diagnostic session alive until that event
    // so its dropEffect and target are preserved in the same trace.
    if (event) finishFunnelDragDebug();
  }

  function updateRowDropTarget(target: FunnelRowDropTarget) {
    if (sameRowDropTarget(rowDropTargetRef.current, target)) return;
    writeFunnelDragDebug("row.drop-target.changed", { previous: rowDropTargetRef.current, next: target });
    rowDropTargetRef.current = target;
    setRowDropTarget(target);
  }

  function dropRow(target: FunnelRowDropTarget) {
    const drag = rowDragRef.current ?? rowDrag;
    writeFunnelDragDebug("row.drop.received", {
      target,
      rowDragRef: rowDragRef.current,
      rowDragState: rowDrag,
      resolvedDrag: drag,
    });
    if (!drag) {
      writeFunnelDragDebug("row.drop.rejected", { reason: "No active row drag was available.", target });
      return;
    }
    mutate((draft) => {
      if (drag.kind === "existing"
        && drag.source.sectionIndex === target.sectionIndex
        && target.parentColumnPath !== null
        && indexPathStartsWith(target.parentColumnPath, drag.source.rowPath)) {
        writeFunnelDragDebug("row.drop.rejected", { reason: "The destination is inside the dragged row.", drag, target });
        return;
      }
      const targetRows = rowsAtParentColumn(draft, target.sectionIndex, target.parentColumnPath, true);
      if (!targetRows) {
        writeFunnelDragDebug("row.drop.rejected", { reason: "The destination row collection could not be resolved.", drag, target });
        return;
      }
      if (drag.kind === "new") {
        const destinationIndex = Math.min(Math.max(target.rowIndex, 0), targetRows.length);
        targetRows.splice(destinationIndex, 0, createFunnelPageRow(drag.columnCount));
        const destinationParentPath = findRowsParentColumnPath(draft, target.sectionIndex, targetRows);
        writeFunnelDragDebug("row.drop.applied", { drag, target, destinationIndex, destinationParentPath });
        if (destinationParentPath !== undefined) setSelection({ kind: "row", sectionIndex: target.sectionIndex, rowPath: [...(destinationParentPath ?? []), destinationIndex] });
        return;
      }
      const sourceParentColumnPath = drag.source.rowPath.length > 1 ? drag.source.rowPath.slice(0, -1) : null;
      const sourceRows = rowsAtParentColumn(draft, drag.source.sectionIndex, sourceParentColumnPath);
      const sourceIndex = drag.source.rowPath.at(-1);
      if (sourceIndex === undefined) {
        writeFunnelDragDebug("row.drop.rejected", { reason: "The source row index was missing.", drag, target });
        return;
      }
      if (!sourceRows) {
        writeFunnelDragDebug("row.drop.rejected", { reason: "The source row collection could not be resolved.", drag, target });
        return;
      }
      if (sourceRows !== targetRows && sourceParentColumnPath === null && sourceRows.length <= 1) {
        writeFunnelDragDebug("row.drop.rejected", { reason: "A section must retain at least one root row.", drag, target, sourceRowCount: sourceRows.length });
        return;
      }
      const destinationIndex = moveItemAtInsertionPoint(sourceRows, sourceIndex, targetRows, target.rowIndex);
      if (destinationIndex === null) {
        writeFunnelDragDebug("row.drop.rejected", { reason: "The row move helper rejected the insertion point.", drag, target, sourceIndex });
        return;
      }
      if (sourceParentColumnPath === null && target.parentColumnPath !== null) {
        const nestedRow = targetRows[destinationIndex];
        if (nestedRow) {
          targetRows[destinationIndex] = resizeFunnelPageRow(
            nestedRow,
            nestedRow.columns.length as FunnelRowColumnCount,
          );
        }
      }
      const destinationParentPath = findRowsParentColumnPath(draft, target.sectionIndex, targetRows);
      writeFunnelDragDebug("row.drop.applied", {
        drag,
        target,
        sourceIndex,
        sourceParentColumnPath,
        destinationIndex,
        destinationParentPath,
      });
      if (destinationParentPath !== undefined) setSelection({ kind: "row", sectionIndex: target.sectionIndex, rowPath: [...(destinationParentPath ?? []), destinationIndex] });
    });
    endRowDrag();
  }

  function removeRow(sectionIndex: number, rowPath: number[]) {
    mutate((draft) => {
      const parentColumnPath = rowPath.length > 1 ? rowPath.slice(0, -1) : null;
      const rows = rowsAtParentColumn(draft, sectionIndex, parentColumnPath);
      const rowIndex = rowPath.at(-1);
      if (!rows || rowIndex === undefined || (parentColumnPath === null && rows.length <= 1)) return;
      rows.splice(rowIndex, 1);
      if (rows.length > 0) {
        setSelection({ kind: "row", sectionIndex, rowPath: [...(parentColumnPath ?? []), Math.min(rowIndex, rows.length - 1)] });
      } else if (parentColumnPath) {
        setSelection({ kind: "column", sectionIndex, rowPath: parentColumnPath.slice(0, -1), columnIndex: parentColumnPath.at(-1)! });
      }
    });
  }

  function moveRow(sectionIndex: number, rowPath: number[], direction: -1 | 1) {
    mutate((draft) => {
      const parentColumnPath = rowPath.length > 1 ? rowPath.slice(0, -1) : null;
      const rows = rowsAtParentColumn(draft, sectionIndex, parentColumnPath);
      const rowIndex = rowPath.at(-1);
      if (rowIndex === undefined) return;
      const destinationIndex = rowIndex + direction;
      if (!rows || destinationIndex < 0 || destinationIndex >= rows.length) return;
      const [row] = rows.splice(rowIndex, 1);
      if (!row) return;
      rows.splice(destinationIndex, 0, row);
      setSelection({ kind: "row", sectionIndex, rowPath: [...(parentColumnPath ?? []), destinationIndex] });
    });
  }

  function setRowColumnCount(sectionIndex: number, rowPath: number[], columnCount: FunnelRowColumnCount) {
    mutate((draft) => {
      const row = rowAtPath(draft, sectionIndex, rowPath);
      if (!row) return;
      replaceRowAtPath(draft, sectionIndex, rowPath, resizeFunnelPageRow(row, columnCount));
      setSelection({ kind: "row", sectionIndex, rowPath });
    });
  }

  function updateColumn(sectionIndex: number, rowPath: number[], columnIndex: number, recipe: (column: FunnelPageColumn) => void) {
    mutate((draft) => {
      const column = columnAtPath(draft, { sectionIndex, rowPath, columnIndex });
      if (!column) return;
      recipe(column);
    });
  }

  function moveColumn(sectionIndex: number, rowPath: number[], columnIndex: number, direction: -1 | 1) {
    mutate((draft) => {
      const columns = rowAtPath(draft, sectionIndex, rowPath)?.columns;
      const destinationIndex = columnIndex + direction;
      if (!columns || destinationIndex < 0 || destinationIndex >= columns.length) return;
      const [column] = columns.splice(columnIndex, 1);
      if (!column) return;
      columns.splice(destinationIndex, 0, column);
      setSelection({ kind: "column", sectionIndex, rowPath, columnIndex: destinationIndex });
    });
  }

  function removeColumn(sectionIndex: number, rowPath: number[], columnIndex: number) {
    mutate((draft) => {
      const row = rowAtPath(draft, sectionIndex, rowPath);
      if (!row || row.columns.length <= 1) return;
      const next = removeFunnelPageColumn(row, columnIndex);
      replaceRowAtPath(draft, sectionIndex, rowPath, next);
      setSelection({ kind: "column", sectionIndex, rowPath, columnIndex: Math.min(columnIndex, next.columns.length - 1) });
    });
  }

  function startColumnDrag(event: DragEvent<HTMLElement>, source: FunnelColumnLocation) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "move:funnel-column");
    setColumnDrag(source);
    setColumnDropTarget(null);
    endElementDrag();
    endBlockDrag();
    endRowDrag();
  }

  function endColumnDrag() {
    setColumnDrag(null);
    setColumnDropTarget(null);
  }

  function updateColumnDropTarget(target: FunnelColumnDropTarget) {
    setColumnDropTarget((current) => sameColumnDropTarget(current, target) ? current : target);
  }

  function dropColumn(target: FunnelColumnDropTarget) {
    const source = columnDrag;
    if (!source) return;
    mutate((draft) => {
      if (source.sectionIndex === target.sectionIndex && indexPathStartsWith(target.rowPath, [...source.rowPath, source.columnIndex])) return;
      const sourceRow = rowAtPath(draft, source.sectionIndex, source.rowPath);
      const targetRow = rowAtPath(draft, target.sectionIndex, target.rowPath);
      if (!sourceRow || !targetRow) return;
      const sameRow = sourceRow === targetRow;
      if (!sameRow && (sourceRow.columns.length <= 1 || targetRow.columns.length >= 4)) return;
      const destinationIndex = moveItemAtInsertionPoint(sourceRow.columns, source.columnIndex, targetRow.columns, target.columnIndex);
      if (destinationIndex === null) return;
      if (!sameRow) {
        balanceRowColumns(sourceRow);
        balanceRowColumns(targetRow);
      }
      const destinationRowPath = findRowPath(draft, target.sectionIndex, targetRow.id);
      if (destinationRowPath) setSelection({ kind: "column", sectionIndex: target.sectionIndex, rowPath: destinationRowPath, columnIndex: destinationIndex });
    });
    endColumnDrag();
  }

  function startBlockDrag(event: DragEvent<HTMLElement>, kind: FunnelBlockKind) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", `new:funnel-section:${kind}`);
    setBlockDrag(kind);
    setSectionDropTarget(null);
    endElementDrag();
    endRowDrag();
    endColumnDrag();
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
    endColumnDrag();
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
      && sameIndexPath(drag.source.rowPath, target.rowPath)
      && drag.source.columnIndex === target.columnIndex
      && (target.elementIndex === drag.source.elementIndex || target.elementIndex === drag.source.elementIndex + 1)
    ) {
      endElementDrag();
      return;
    }
    mutate((draft) => {
      const targetElements = columnAtPath(draft, target)?.elements;
      if (!targetElements) return;
      if (drag.kind === "new") {
        const destinationIndex = Math.min(Math.max(target.elementIndex, 0), targetElements.length);
        targetElements.splice(destinationIndex, 0, createElement(drag.elementType));
        setSelection({ kind: "element", ...target, elementIndex: destinationIndex });
        return;
      }
      const sourceElements = columnAtPath(draft, drag.source)?.elements;
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
  const currentRow = selectedRow();
  const currentColumn = selectedColumn();
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
  const pageInspector = <div className="grid gap-4">
    <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Page</p><h3 className="mt-1 text-lg font-semibold">Page settings</h3></div>
    <p className="text-sm leading-6 text-ink/55">Select a section, row, column, or element on the canvas to edit it. Page-wide styles are available from the left panel.</p>
    <button type="button" onClick={() => { setPanel("styles"); setLeftSidebarCollapsed(false); }} className={SECONDARY_CONTROL}>Open page styles</button>
    <InspectorGroup title="Search appearance" open>
      <label className={CONTROL_LABEL}>SEO title<input className={INPUT} value={seo.title} maxLength={140} onChange={(event) => setSeo((current) => ({ ...current, title: event.target.value }))} /><span className="text-[10px] font-normal text-ink/45">{seo.title.length}/140 characters</span></label>
      <label className={CONTROL_LABEL}>Meta description<textarea className={`${INPUT} min-h-28 resize-y`} value={seo.description} maxLength={320} onChange={(event) => setSeo((current) => ({ ...current, description: event.target.value }))} /><span className="text-[10px] font-normal text-ink/45">{seo.description.length}/320 characters</span></label>
      <ToggleControl label="Hide this page from search engines" help="Adds a no-index directive while keeping the page available by its funnel URL." checked={seo.noIndex} onChange={(noIndex) => setSeo((current) => ({ ...current, noIndex }))} />
    </InspectorGroup>
  </div>;
  const inspectorContent = (() => {
    if (selection.kind === "element" && currentElement) {
      return <ElementInspector
        element={currentElement}
        buttonPalette={buttonPalette}
        chooseMedia={() => setMediaTarget({ kind: "selection" })}
        chooseGalleryMedia={(slot) => setMediaTarget({ kind: "workbook_gallery", slot })}
        update={(next) => mutate((draft) => { const column = columnAtPath(draft, selection); if (column) column.elements[selection.elementIndex] = next; })}
        move={(direction) => mutate((draft) => { const items = columnAtPath(draft, selection)?.elements; if (!items) return; const nextIndex = selection.elementIndex + direction; if (nextIndex < 0 || nextIndex >= items.length) return; const [item] = items.splice(selection.elementIndex, 1); if (item) items.splice(nextIndex, 0, item); setSelection({ ...selection, elementIndex: nextIndex }); })}
        remove={() => mutate((draft) => { const column = columnAtPath(draft, selection); if (!column) return; column.elements.splice(selection.elementIndex, 1); setSelection({ kind: "column", sectionIndex: selection.sectionIndex, rowPath: selection.rowPath, columnIndex: selection.columnIndex }); })}
      />;
    }
    if (selection.kind === "column" && currentColumn) {
      const row = rowAtPath(document, selection.sectionIndex, selection.rowPath);
      const rowIndex = selection.rowPath.at(-1) ?? 0;
      return <ColumnInspector
        column={currentColumn}
        sectionIndex={selection.sectionIndex}
        rowIndex={rowIndex}
        columnIndex={selection.columnIndex}
        columnCount={row?.columns.length ?? 1}
        update={(recipe) => updateColumn(selection.sectionIndex, selection.rowPath, selection.columnIndex, recipe)}
        selectRow={() => setSelection({ kind: "row", sectionIndex: selection.sectionIndex, rowPath: selection.rowPath })}
        move={(direction) => moveColumn(selection.sectionIndex, selection.rowPath, selection.columnIndex, direction)}
        remove={() => removeColumn(selection.sectionIndex, selection.rowPath, selection.columnIndex)}
      />;
    }
    if (selection.kind === "row" && currentRow) {
      const parentColumnPath = selection.rowPath.length > 1 ? selection.rowPath.slice(0, -1) : null;
      const siblingRows = rowsAtParentColumn(document, selection.sectionIndex, parentColumnPath) ?? [];
      const rowIndex = selection.rowPath.at(-1) ?? 0;
      return <RowInspector
        row={currentRow}
        sectionIndex={selection.sectionIndex}
        rowIndex={rowIndex}
        rowCount={siblingRows.length}
        nested={parentColumnPath !== null}
        update={(recipe) => mutate((draft) => { const row = rowAtPath(draft, selection.sectionIndex, selection.rowPath); if (row) recipe(row); })}
        updateColumnCount={(columnCount) => setRowColumnCount(selection.sectionIndex, selection.rowPath, columnCount)}
        selectColumn={(columnIndex) => setSelection({ kind: "column", sectionIndex: selection.sectionIndex, rowPath: selection.rowPath, columnIndex })}
        move={(direction) => moveRow(selection.sectionIndex, selection.rowPath, direction)}
        remove={() => removeRow(selection.sectionIndex, selection.rowPath)}
      />;
    }
    if (selection.kind === "section") {
      const section = document.sections[selection.sectionIndex];
      if (!section) return pageInspector;
      return <SectionInspector
        section={section}
        chooseMedia={() => setMediaTarget({ kind: "selection" })}
        update={(recipe) => mutate((draft) => recipe(draft.sections[selection.sectionIndex]!))}
        move={(direction) => mutate((draft) => { const nextIndex = selection.sectionIndex + direction; if (nextIndex < 0 || nextIndex >= draft.sections.length) return; const [item] = draft.sections.splice(selection.sectionIndex, 1); if (item) draft.sections.splice(nextIndex, 0, item); setSelection({ kind: "section", sectionIndex: nextIndex }); })}
        remove={() => mutate((draft) => { if (draft.sections.length <= 1) return; draft.sections.splice(selection.sectionIndex, 1); setSelection({ kind: "page" }); })}
      />;
    }
    return pageInspector;
  })();
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
          <p className="text-[11px] leading-4 text-ink/45">Drag a row into a section or inside any existing column, then drag elements into its columns.</p>
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Layout</h3>
            <div className="mt-2 grid gap-2">
              {([1, 2, 3, 4] as FunnelRowColumnCount[]).map((columnCount) => <button type="button" draggable key={columnCount} onClick={() => appendRow(columnCount)} onDragStart={(event) => startRowDrag(event, { kind: "new", columnCount })} onDragEnd={endRowDrag} className="min-h-12 cursor-grab rounded-[12px] border border-[#b7cda3] bg-[#edf5e7] px-3 text-left text-xs font-semibold text-[#4d6a39] hover:border-[#739655] active:cursor-grabbing">{columnCount}-column row</button>)}
            </div>
          </section>
          {funnelElementGroups.map((group) => <section key={group.label}>
            <h3 className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">{group.label}</h3>
            <div className="mt-2 grid gap-2">
              {group.elements.map((type) => <button type="button" draggable key={type} onClick={() => addElement(type)} onDragStart={(event) => startElementDrag(event, { kind: "new", elementType: type })} onDragEnd={endElementDrag} className="min-h-12 cursor-grab rounded-[12px] border border-[#d8c5a8] bg-white px-3 text-left text-xs font-semibold capitalize hover:border-[#739655] active:cursor-grabbing">{type.replaceAll("_", " ")}</button>)}
            </div>
          </section>)}
        </div> : null}
        {!leftSidebarCollapsed && panel === "blocks" ? <div className="mt-4"><p className="mb-2 text-[11px] leading-4 text-ink/45">Drag a block between sections on the page, or click to append it.</p><div className="grid gap-2">{(["hero", "split", "offer", "blank"] as FunnelBlockKind[]).map((kind) => <button type="button" draggable key={kind} onClick={() => appendBlock(kind)} onDragStart={(event) => startBlockDrag(event, kind)} onDragEnd={endBlockDrag} className="min-h-14 cursor-grab rounded-[12px] border border-[#d8c5a8] bg-white px-3 text-left text-sm font-semibold capitalize hover:border-[#739655] active:cursor-grabbing">{kind} section</button>)}</div></div> : null}
        {!leftSidebarCollapsed && panel === "styles" ? <div className="mt-4 grid gap-3">
          <InspectorGroup title="Site header & footer" open>
            <p className="text-[11px] leading-5 text-ink/50">Funnel pages have no site chrome unless you enable it here.</p>
            <ToggleControl label="Show site header" checked={document.siteChrome?.showHeader === true} onChange={(showHeader) => mutate((draft) => { draft.siteChrome = { showHeader, showFooter: draft.siteChrome?.showFooter === true }; })} />
            <ToggleControl label="Show site footer" checked={document.siteChrome?.showFooter === true} onChange={(showFooter) => mutate((draft) => { draft.siteChrome = { showHeader: draft.siteChrome?.showHeader === true, showFooter }; })} />
          </InspectorGroup>
          <InspectorGroup title="Theme & colors" open>
            <SelectControl label="Theme" value={document.theme} onChange={(value) => mutate((draft) => { draft.theme = value as FunnelPageDocument["theme"]; })}>{Object.keys(themes).map((theme) => <option key={theme} value={theme}>{theme[0]!.toUpperCase()}{theme.slice(1)}</option>)}</SelectControl>
            <ColorControl label="Page background" value={document.styles?.colors?.pageBackground ?? baseTheme.page} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, colors: { ...draft.styles?.colors, pageBackground: value } }; })} />
            <ColorControl label="Surface" value={document.styles?.colors?.surface ?? baseTheme.surface} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, colors: { ...draft.styles?.colors, surface: value } }; })} />
            <ColorControl label="Primary" value={document.styles?.colors?.primary ?? baseTheme.primary} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, colors: { ...draft.styles?.colors, primary: value } }; })} />
          </InspectorGroup>
          <InspectorGroup title="Page layout" open>
            <NumberControl label="Content width" value={document.styles?.layout?.contentWidth ?? 1120} min={640} max={1600} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, layout: { ...draft.styles?.layout, contentWidth: value } }; })} />
            <NumberControl label="Space between sections" value={document.styles?.layout?.sectionGap ?? 22} min={0} max={160} onChange={(value) => mutate((draft) => { draft.styles = { ...draft.styles, layout: { ...draft.styles?.layout, sectionGap: value } }; })} />
          </InspectorGroup>
        </div> : null}
      </aside>
      <section className="min-w-0 overflow-auto bg-[#d9d4cc] p-5"><EditorCanvas document={document} selection={selection} onSelect={setSelection} viewport={viewport} elementDrag={elementDrag} dropTarget={elementDropTarget} onStartElementDrag={startElementDrag} onDropTarget={updateElementDropTarget} onDropElement={dropElement} onEndElementDrag={endElementDrag} blockDrag={blockDrag} sectionDropTarget={sectionDropTarget} onSectionDropTarget={updateSectionDropTarget} onDropBlock={dropBlock} rowDrag={rowDrag} rowDropTarget={rowDropTarget} onRowDropTarget={updateRowDropTarget} onDropRow={dropRow} onStartRowDrag={startRowDrag} onEndRowDrag={endRowDrag} resolveRowDrag={() => rowDragRef.current ?? rowDrag} columnDrag={columnDrag} columnDropTarget={columnDropTarget} onStartColumnDrag={startColumnDrag} onColumnDropTarget={updateColumnDropTarget} onDropColumn={dropColumn} onEndColumnDrag={endColumnDrag} orderFormPreview={orderFormPreview} /></section>
      <aside className={`overflow-auto border-l border-[#d6c6af] bg-[#fffaf2] ${rightSidebarCollapsed ? "p-2" : "p-4"}`}>
        <div className={`mb-3 flex items-center ${rightSidebarCollapsed ? "justify-center" : "justify-between"}`}>
          {!rightSidebarCollapsed ? <span className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Inspector</span> : null}
          <button type="button" onClick={() => setRightSidebarCollapsed((collapsed) => !collapsed)} aria-label={rightSidebarCollapsed ? "Expand inspector sidebar" : "Collapse inspector sidebar"} title={rightSidebarCollapsed ? "Expand inspector sidebar" : "Collapse inspector sidebar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#d8c5a8] bg-white text-lg font-bold text-ink/55 shadow-sm hover:border-[#739655] hover:text-[#4d6a39]">{rightSidebarCollapsed ? "‹" : "›"}</button>
        </div>
        {!rightSidebarCollapsed ? <><SelectionBreadcrumbs document={document} selection={selection} onSelect={setSelection} />{inspectorContent}</> : null}
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

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className={CONTROL_LABEL}>{label}<span className="flex items-center gap-2"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-[10px] border border-[#cfbea4] bg-white p-1" /><input className={INPUT} value={value} onChange={(event) => onChange(event.target.value)} /></span></label>; }
function NumberControl({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <label className={CONTROL_LABEL}>{label}<input type="number" className={INPUT} value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function RangeControl({ label, value, min, max, step, onChange, formatValue = (current) => `${current.toFixed(2)}×` }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; formatValue?: (value: number) => string }) { return <label className={CONTROL_LABEL}><span className="flex items-center justify-between gap-3"><span>{label}</span><output className="rounded-full bg-[#edf5e7] px-2 py-1 text-[10px] font-bold tabular-nums text-[#4d6a39]">{formatValue(value)}</output></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="h-2 w-full cursor-pointer accent-[#76a456]" /></label>; }
function LayoutSpacingControls({ spacing, onChange, hasOverrides, allowNegativeMargins = true }: { spacing?: FunnelElementSpacing; onChange: (spacing: FunnelElementSpacing | undefined) => void; hasOverrides?: boolean; allowNegativeMargins?: boolean }) {
  const [moreControl, setMoreControl] = useState(false);
  const value = spacing ?? {};
  const marginTop = value.marginTop ?? 0;
  const marginRight = value.marginRight ?? 0;
  const marginBottom = value.marginBottom ?? 0;
  const marginLeft = value.marginLeft ?? 0;
  const paddingTop = value.paddingTop ?? 0;
  const paddingRight = value.paddingRight ?? 0;
  const paddingBottom = value.paddingBottom ?? 0;
  const paddingLeft = value.paddingLeft ?? 0;
  const axisValue = (first: number, second: number) => first === second ? first : 0;
  const setSpacing = (next: Partial<FunnelElementSpacing>) => onChange({ ...value, ...next });
  const marginMin = allowNegativeMargins ? -300 : 0;
  const resettable = hasOverrides ?? spacing !== undefined;

  return <InspectorGroup title="Spacing" open>
    <p className="text-xs leading-5 text-ink/50">Margin adds space outside the selected item. Padding adds space inside it.</p>
    <div className="grid grid-cols-2 gap-2">
      <NumberControl label={marginLeft === marginRight ? "Margin horizontal" : "Margin horizontal · mixed"} value={axisValue(marginLeft, marginRight)} min={marginMin} max={300} onChange={(next) => setSpacing({ marginLeft: next, marginRight: next })} />
      <NumberControl label={marginTop === marginBottom ? "Margin vertical" : "Margin vertical · mixed"} value={axisValue(marginTop, marginBottom)} min={marginMin} max={300} onChange={(next) => setSpacing({ marginTop: next, marginBottom: next })} />
      <NumberControl label={paddingLeft === paddingRight ? "Padding horizontal" : "Padding horizontal · mixed"} value={axisValue(paddingLeft, paddingRight)} min={0} max={300} onChange={(next) => setSpacing({ paddingLeft: next, paddingRight: next })} />
      <NumberControl label={paddingTop === paddingBottom ? "Padding vertical" : "Padding vertical · mixed"} value={axisValue(paddingTop, paddingBottom)} min={0} max={300} onChange={(next) => setSpacing({ paddingTop: next, paddingBottom: next })} />
    </div>
    <button type="button" onClick={() => setMoreControl((current) => !current)} className={`justify-self-start ${SECONDARY_CONTROL}`}>{moreControl ? "Less control" : "More control…"}</button>
    {moreControl ? <div className="grid gap-3 rounded-[12px] border border-[#dfcfb7] bg-white/60 p-3">
      <p className="text-[10px] font-black uppercase tracking-[.1em] text-[#567b40]">Individual margins</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberControl label="Top" value={marginTop} min={marginMin} max={300} onChange={(marginTop) => setSpacing({ marginTop })} />
        <NumberControl label="Right" value={marginRight} min={marginMin} max={300} onChange={(marginRight) => setSpacing({ marginRight })} />
        <NumberControl label="Bottom" value={marginBottom} min={marginMin} max={300} onChange={(marginBottom) => setSpacing({ marginBottom })} />
        <NumberControl label="Left" value={marginLeft} min={marginMin} max={300} onChange={(marginLeft) => setSpacing({ marginLeft })} />
      </div>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[.1em] text-[#567b40]">Individual padding</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberControl label="Top" value={paddingTop} min={0} max={300} onChange={(paddingTop) => setSpacing({ paddingTop })} />
        <NumberControl label="Right" value={paddingRight} min={0} max={300} onChange={(paddingRight) => setSpacing({ paddingRight })} />
        <NumberControl label="Bottom" value={paddingBottom} min={0} max={300} onChange={(paddingBottom) => setSpacing({ paddingBottom })} />
        <NumberControl label="Left" value={paddingLeft} min={0} max={300} onChange={(paddingLeft) => setSpacing({ paddingLeft })} />
      </div>
    </div> : null}
    {resettable ? <button type="button" onClick={() => onChange(undefined)} className={RESET_CONTROL}>Reset spacing</button> : null}
  </InspectorGroup>;
}
function RowInspector({
  row,
  sectionIndex,
  rowIndex,
  rowCount,
  nested,
  update,
  updateColumnCount,
  selectColumn,
  move,
  remove
}: {
  row: FunnelPageRow;
  sectionIndex: number;
  rowIndex: number;
  rowCount: number;
  nested: boolean;
  update: (recipe: (row: FunnelPageRow) => void) => void;
  updateColumnCount: (columnCount: FunnelRowColumnCount) => void;
  selectColumn: (columnIndex: number) => void;
  move: (direction: -1 | 1) => void;
  remove: () => void;
}) {
  return <div className="grid gap-4">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Section {sectionIndex + 1} → {nested ? "Nested row" : "Row"} {rowIndex + 1}</p><h3 className="mt-1 text-lg font-semibold">Row layout</h3></div>
      <div className="flex gap-1"><button type="button" disabled={rowIndex === 0} onClick={() => move(-1)} className="rounded-lg border px-2 py-1 disabled:opacity-30">↑</button><button type="button" disabled={rowIndex === rowCount - 1} onClick={() => move(1)} className="rounded-lg border px-2 py-1 disabled:opacity-30">↓</button><button type="button" disabled={!nested && rowCount <= 1} onClick={remove} className="rounded-lg border px-2 py-1 text-[#9b4738] disabled:opacity-30">×</button></div>
    </div>
    <LayoutSpacingControls spacing={row.spacing} onChange={(spacing) => update((draft) => { if (spacing) draft.spacing = spacing; else delete draft.spacing; })} />
    <InspectorGroup title="Grid layout" open>
      <SelectControl label="Number of columns" value={row.columns.length} onChange={(value) => updateColumnCount(Number(value) as FunnelRowColumnCount)}>{([1, 2, 3, 4] as const).map((count) => <option key={count} value={count}>{count} {count === 1 ? "column" : "columns"}</option>)}</SelectControl>
      <p className="text-[10px] leading-4 text-ink/50">Changing the count creates an even grid. If you reduce it, Treeschool moves content from removed columns into the last remaining column instead of deleting it.</p>
    </InspectorGroup>
    <InspectorGroup title="Columns">
      {row.columns.map((column, columnIndex) => <button key={column.id} type="button" onClick={() => selectColumn(columnIndex)} className="flex items-center justify-between gap-3 rounded-[11px] border border-[#dfcfb7] bg-white px-3 py-2 text-left text-xs transition hover:border-[#8a674d] hover:bg-[#fffaf2]"><span className="font-semibold">Column {columnIndex + 1}</span><span className="text-[10px] text-ink/45">{column.span}/12{column.offset !== undefined ? ` · offset ${column.offset}` : " · auto"} · {column.elements.length} {column.elements.length === 1 ? "element" : "elements"}{column.rows?.length ? ` · ${column.rows.length} nested ${column.rows.length === 1 ? "row" : "rows"}` : ""}</span></button>)}
    </InspectorGroup>
  </div>;
}

function ColumnInspector({
  column,
  sectionIndex,
  rowIndex,
  columnIndex,
  columnCount,
  update,
  selectRow,
  move,
  remove
}: {
  column: FunnelPageColumn;
  sectionIndex: number;
  rowIndex: number;
  columnIndex: number;
  columnCount: number;
  update: (recipe: (column: FunnelPageColumn) => void) => void;
  selectRow: () => void;
  move: (direction: -1 | 1) => void;
  remove: () => void;
}) {
  const positioned = column.offset !== undefined;
  const maxOffset = Math.max(0, 12 - column.span);
  return <div className="grid gap-4">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Section {sectionIndex + 1} → Row {rowIndex + 1}</p><h3 className="mt-1 text-lg font-semibold">Column {columnIndex + 1}</h3></div>
      <div className="flex gap-1"><button type="button" disabled={columnIndex === 0} onClick={() => move(-1)} className="rounded-lg border px-2 py-1 disabled:opacity-30">←</button><button type="button" disabled={columnIndex === columnCount - 1} onClick={() => move(1)} className="rounded-lg border px-2 py-1 disabled:opacity-30">→</button><button type="button" disabled={columnCount <= 1} onClick={remove} className="rounded-lg border px-2 py-1 text-[#9b4738] disabled:opacity-30">×</button></div>
    </div>
    <button type="button" onClick={selectRow} className={RESET_CONTROL}>Select parent row</button>
    <LayoutSpacingControls spacing={column.spacing} onChange={(spacing) => update((draft) => { if (spacing) draft.spacing = spacing; else delete draft.spacing; })} />
    <InspectorGroup title="Layout" open>
      <SelectControl label="Vertical content alignment" value={column.verticalAlign ?? "row"} onChange={(value) => update((draft) => { if (value === "row") delete draft.verticalAlign; else draft.verticalAlign = value as NonNullable<FunnelPageColumn["verticalAlign"]>; })}><option value="row">Use row default</option><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></SelectControl>
      <p className="text-[10px] leading-4 text-ink/50">Top aligns this column with the top edge of the tallest column in its row. Center and bottom align it within that same row height.</p>
      <NumberControl label="Width · grid columns" value={column.span} min={1} max={12} onChange={(span) => update((draft) => { draft.span = Math.max(1, Math.min(12, span)); if (draft.offset !== undefined) draft.offset = Math.min(draft.offset, 12 - draft.span); })} />
      <SelectControl label="Horizontal placement" value={positioned ? "positioned" : "auto"} onChange={(value) => update((draft) => { if (value === "auto") delete draft.offset; else draft.offset = Math.min(draft.offset ?? 0, 12 - draft.span); })}><option value="auto">Flow after previous column</option><option value="positioned">Set grid offset manually</option></SelectControl>
      {positioned ? <NumberControl label="Offset from left" value={column.offset ?? 0} min={0} max={maxOffset} onChange={(offset) => update((draft) => { draft.offset = Math.max(0, Math.min(12 - draft.span, offset)); })} /> : null}
      <p className="text-[10px] leading-4 text-ink/50">The page uses a twelve-column grid. Width controls how many tracks this column occupies; offset pins its starting position from the left.</p>
    </InspectorGroup>
    <div className="rounded-[12px] border border-[#dfcfb7] bg-white/65 px-3 py-3 text-xs text-ink/55"><strong className="text-ink">{column.elements.length}</strong> {column.elements.length === 1 ? "element" : "elements"} in this column. Drag elements on the canvas to move them between columns.</div>
  </div>;
}
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
  const marginTop = section.props.marginTop ?? 0;
  const marginRight = section.props.marginRight ?? 0;
  const marginBottom = section.props.marginBottom ?? 0;
  const marginLeft = section.props.marginLeft ?? 0;
  const paddingTop = section.props.paddingTop ?? section.props.paddingY ?? defaultPaddingY;
  const paddingRight = section.props.paddingRight ?? section.props.paddingX ?? defaultPaddingX;
  const paddingBottom = section.props.paddingBottom ?? section.props.paddingY ?? defaultPaddingY;
  const paddingLeft = section.props.paddingLeft ?? section.props.paddingX ?? defaultPaddingX;
  const sectionSpacing: FunnelElementSpacing = { marginTop, marginRight, marginBottom, marginLeft, paddingTop, paddingRight, paddingBottom, paddingLeft };
  const hasSpacingOverrides = section.props.marginTop !== undefined || section.props.marginRight !== undefined || section.props.marginBottom !== undefined || section.props.marginLeft !== undefined || section.props.paddingX !== undefined || section.props.paddingY !== undefined || section.props.paddingTop !== undefined || section.props.paddingRight !== undefined || section.props.paddingBottom !== undefined || section.props.paddingLeft !== undefined;
  const updateSectionSpacing = (spacing: FunnelElementSpacing | undefined) => update((draft) => {
    delete draft.props.marginTop;
    delete draft.props.marginRight;
    delete draft.props.marginBottom;
    delete draft.props.marginLeft;
    delete draft.props.paddingX;
    delete draft.props.paddingY;
    delete draft.props.paddingTop;
    delete draft.props.paddingRight;
    delete draft.props.paddingBottom;
    delete draft.props.paddingLeft;
    if (!spacing) return;
    draft.props.marginTop = spacing.marginTop;
    draft.props.marginRight = spacing.marginRight;
    draft.props.marginBottom = spacing.marginBottom;
    draft.props.marginLeft = spacing.marginLeft;
    draft.props.paddingTop = spacing.paddingTop;
    draft.props.paddingRight = spacing.paddingRight;
    draft.props.paddingBottom = spacing.paddingBottom;
    draft.props.paddingLeft = spacing.paddingLeft;
  });

  return <div className="grid gap-4">
    <div className="flex items-center justify-between">
      <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Section</p><h3 className="mt-1 text-lg font-semibold">Layout</h3></div>
      <div className="flex gap-1"><button type="button" onClick={() => move(-1)} className="rounded-lg border px-2 py-1">↑</button><button type="button" onClick={() => move(1)} className="rounded-lg border px-2 py-1">↓</button><button type="button" onClick={remove} className="rounded-lg border px-2 py-1 text-[#9b4738]">×</button></div>
    </div>
    <InspectorGroup title="Background" open>
      <SelectControl label="Background tone" value={section.props.tone} onChange={(value) => update((draft) => { draft.props.tone = value as FunnelPageSection["props"]["tone"]; })}><option value="default">Default</option><option value="muted">Muted</option><option value="accent">Accent</option><option value="dark">Dark</option></SelectControl>
      <ColorControl label="Background color" value={section.props.backgroundColor ?? defaultBackgroundColor} onChange={(backgroundColor) => update((draft) => { draft.props.backgroundColor = backgroundColor; })} />
      {section.props.backgroundColor ? <button type="button" onClick={() => update((draft) => { delete draft.props.backgroundColor; })} className={RESET_CONTROL}>Use tone color</button> : <p className="text-[10px] leading-4 text-ink/45">Choose a color to override the selected tone.</p>}
      <button type="button" onClick={chooseMedia} className={SECONDARY_CONTROL}>{section.props.background ? "Change background image" : "Add background image"}</button>
      {section.props.background ? <button type="button" onClick={() => update((draft) => { draft.props.background = null; })} className={RESET_CONTROL}>Remove background image</button> : null}
    </InspectorGroup>
    <InspectorGroup title="Border" open>
      <ColorControl label="Border color" value={section.props.borderColor ?? defaultBorderColor} onChange={(borderColor) => update((draft) => { draft.props.borderColor = borderColor; })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberControl label="Width" value={section.props.borderWidth ?? 1} min={0} max={20} onChange={(borderWidth) => update((draft) => { draft.props.borderWidth = borderWidth; })} />
        <NumberControl label="Corner radius" value={section.props.borderRadius ?? 30} min={0} max={200} onChange={(borderRadius) => update((draft) => { draft.props.borderRadius = borderRadius; })} />
      </div>
      <SelectControl label="Border style" value={section.props.borderStyle ?? "solid"} onChange={(value) => update((draft) => { draft.props.borderStyle = value as NonNullable<FunnelPageSection["props"]["borderStyle"]>; })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></SelectControl>
      {(section.props.borderColor !== undefined || section.props.borderWidth !== undefined || section.props.borderRadius !== undefined || section.props.borderStyle !== undefined) ? <button type="button" onClick={() => update((draft) => { delete draft.props.borderColor; delete draft.props.borderWidth; delete draft.props.borderRadius; delete draft.props.borderStyle; })} className={RESET_CONTROL}>Reset border</button> : null}
    </InspectorGroup>
    <InspectorGroup title="Content width" open>
      <SelectControl label="Width" value={section.props.width} onChange={(value) => update((draft) => { draft.props.width = value as FunnelPageSection["props"]["width"]; })}><option value="narrow">Narrow</option><option value="standard">Standard</option><option value="wide">Wide</option></SelectControl>
    </InspectorGroup>
    <LayoutSpacingControls spacing={sectionSpacing} hasOverrides={hasSpacingOverrides} allowNegativeMargins={false} onChange={updateSectionSpacing} />
  </div>;
}
