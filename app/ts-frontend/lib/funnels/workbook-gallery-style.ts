import type { FunnelWorkbookGalleryAppearance } from "./page-document";

export type ResolvedFunnelWorkbookGalleryAppearance = {
  preset: "funnel_card" | "bookstore_frameless";
  aspectRatio: "3:4" | "4:5" | "square";
  frameBackgroundColor: string;
  frameBorderColor: string;
  frameBorderWidth: number;
  frameBorderRadius: number;
  framePadding: number;
  restingShadow: boolean;
  imageScale: number;
  zoomOnHover: boolean;
  darkenOnHover: boolean;
  hoverBrightness: number;
  hoverLift: boolean;
  hoverShadow: boolean;
  showOverlay: boolean;
  overlayText: string;
  overlayBackgroundColor: string;
  overlayTextColor: string;
};

const PRESETS: Record<ResolvedFunnelWorkbookGalleryAppearance["preset"], ResolvedFunnelWorkbookGalleryAppearance> = {
  funnel_card: {
    preset: "funnel_card",
    aspectRatio: "4:5",
    frameBackgroundColor: "#ffffff",
    frameBorderColor: "#e4ddd3",
    frameBorderWidth: 1,
    frameBorderRadius: 20,
    framePadding: 16,
    restingShadow: true,
    imageScale: 100,
    zoomOnHover: false,
    darkenOnHover: false,
    hoverBrightness: 100,
    hoverLift: true,
    hoverShadow: true,
    showOverlay: true,
    overlayText: "View sample pages",
    overlayBackgroundColor: "#24311d",
    overlayTextColor: "#ffffff"
  },
  bookstore_frameless: {
    preset: "bookstore_frameless",
    aspectRatio: "3:4",
    frameBackgroundColor: "transparent",
    frameBorderColor: "transparent",
    frameBorderWidth: 0,
    frameBorderRadius: 8,
    framePadding: 0,
    restingShadow: false,
    imageScale: 107,
    zoomOnHover: false,
    darkenOnHover: true,
    hoverBrightness: 52,
    hoverLift: true,
    hoverShadow: true,
    showOverlay: true,
    overlayText: "View sample pages",
    overlayBackgroundColor: "#24311d",
    overlayTextColor: "#ffffff"
  }
};

export function resolveFunnelWorkbookGalleryAppearance(
  appearance?: FunnelWorkbookGalleryAppearance
): ResolvedFunnelWorkbookGalleryAppearance {
  const preset = appearance?.preset ?? "funnel_card";
  const definedOverrides = Object.fromEntries(
    Object.entries(appearance ?? {}).filter(([, value]) => value !== undefined)
  ) as FunnelWorkbookGalleryAppearance;
  return {
    ...PRESETS[preset],
    ...definedOverrides,
    preset
  };
}

export function funnelWorkbookGalleryAspectClass(
  aspectRatio: ResolvedFunnelWorkbookGalleryAppearance["aspectRatio"]
) {
  if (aspectRatio === "3:4") return "aspect-[3/4]";
  if (aspectRatio === "square") return "aspect-square";
  return "aspect-[4/5]";
}
