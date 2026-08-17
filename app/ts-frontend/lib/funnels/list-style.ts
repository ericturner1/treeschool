import type { CSSProperties } from "react";
import type { FunnelPageElement } from "./page-document";

type FunnelListProps = Extract<FunnelPageElement, { type: "list" }>["props"];

const MARKERS = {
  check: "✓",
  bullet: "•",
  arrow: "→",
  star: "★"
} as const;

export function isCustomizedFunnelList(props: FunnelListProps) {
  return Boolean(props.typography || props.appearance);
}

export function funnelListMarker(props: FunnelListProps) {
  const marker = props.appearance?.marker ?? (props.style === "bullets" ? "bullet" : "check");
  return MARKERS[marker];
}

export function funnelListContainerStyle(props: FunnelListProps): CSSProperties {
  const appearance = props.appearance;
  const inline = appearance?.layout === "inline";
  return {
    display: inline ? "flex" : undefined,
    flexWrap: inline ? "wrap" : undefined,
    backgroundColor: appearance?.backgroundColor,
    borderColor: appearance?.borderColor,
    borderStyle: (appearance?.borderWidth ?? 0) > 0 ? "solid" : undefined,
    borderWidth: appearance?.borderWidth,
    borderRadius: appearance?.borderRadius,
    paddingInline: appearance?.paddingX,
    paddingBlock: appearance?.paddingY,
    rowGap: appearance?.itemSpacing,
    columnGap: inline ? appearance?.itemSpacing : undefined
  };
}

export function funnelListItemStyle(props: FunnelListProps): CSSProperties {
  return {
    alignItems: props.appearance?.markerBadge ? "center" : undefined,
    columnGap: props.appearance?.markerGap,
    justifyContent: props.align === "center" ? "center" : props.align === "right" ? "flex-end" : "flex-start"
  };
}

export function funnelListTextStyle(props: FunnelListProps): CSSProperties {
  return {
    color: props.typography?.color,
    fontFamily: props.typography?.fontFamily,
    fontSize: props.typography?.fontSize,
    fontWeight: props.typography?.fontWeight,
    lineHeight: props.typography?.lineHeight ? `${props.typography.lineHeight}px` : undefined,
    textAlign: props.align
  };
}

export function funnelListMarkerStyle(props: FunnelListProps, fallbackColor: string): CSSProperties {
  const badge = props.appearance?.markerBadge === true;
  const badgeSize = props.appearance?.markerBadgeSize ?? 24;
  return {
    color: props.appearance?.markerColor ?? fallbackColor,
    fontSize: props.appearance?.markerSize,
    lineHeight: badge ? 1 : props.typography?.lineHeight ? `${props.typography.lineHeight}px` : 1,
    textAlign: "center",
    ...(badge ? {
      alignItems: "center",
      backgroundColor: props.appearance?.markerBadgeColor ?? "#dfead4",
      borderRadius: 999,
      display: "inline-grid",
      height: badgeSize,
      justifyItems: "center",
      width: badgeSize
    } : {})
  };
}
