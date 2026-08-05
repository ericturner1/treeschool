import type { CSSProperties } from "react";
import type { FunnelPageElement } from "./page-document";

type FunnelButtonElement = Extract<FunnelPageElement, { type: "button" }>;

export type FunnelButtonPalette = {
  primary: string;
  secondary: string;
  primaryText: string;
  secondaryText: string;
  primaryShadow: string;
  secondaryShadow: string;
  pageBorderRadius?: number;
};

export const FUNNEL_BUTTON_FONT_OPTIONS = [
  { value: "", label: "Use page font" },
  { value: '"Avenir Next", "Nunito", "Trebuchet MS", "Segoe UI", sans-serif', label: "Treeschool sans" },
  { value: 'Arial, Helvetica, sans-serif', label: "Arial" },
  { value: 'Georgia, "Times New Roman", serif', label: "Georgia" },
  { value: '"Trebuchet MS", "Segoe UI", sans-serif', label: "Trebuchet" },
  { value: 'Verdana, Geneva, sans-serif', label: "Verdana" }
] as const;

export function funnelButtonBoxStyle(
  props: FunnelButtonElement["props"],
  palette: FunnelButtonPalette
): CSSProperties {
  const appearance = props.appearance;
  const primary = props.variant === "primary";
  const text = props.variant === "text";
  const defaultShadowDepth = primary ? 8 : text ? 0 : 6;
  const shadowDepth = appearance?.shadowDepth ?? defaultShadowDepth;
  const shadowColor = appearance?.shadowColor ?? (primary ? palette.primaryShadow : palette.secondaryShadow);

  return {
    width: appearance?.width === "full" ? "100%" : undefined,
    backgroundColor: appearance?.backgroundColor ?? (primary ? palette.primary : text ? "transparent" : palette.secondary),
    borderColor: appearance?.borderColor ?? (text ? "transparent" : palette.primary),
    borderStyle: "solid",
    borderWidth: appearance?.borderWidth ?? (text ? 0 : 2),
    borderRadius: appearance?.borderRadius ?? palette.pageBorderRadius ?? (text ? 0 : 18),
    paddingInline: appearance?.paddingX ?? (text ? 0 : 28),
    paddingBlock: appearance?.paddingY ?? (text ? 0 : 16),
    boxShadow: shadowDepth > 0 ? `0 ${shadowDepth}px 0 ${shadowColor}` : "none",
    textDecoration: text ? "underline" : undefined,
    textUnderlineOffset: text ? 4 : undefined
  };
}

export function funnelButtonTextStyle(
  typography: FunnelButtonElement["props"]["typography"],
  fallbackColor: string
): CSSProperties {
  return {
    color: typography?.color ?? fallbackColor,
    fontFamily: typography?.fontFamily || undefined,
    fontSize: typography?.fontSize,
    lineHeight: typography?.lineHeight ? `${typography.lineHeight}px` : undefined,
    fontWeight: typography?.fontWeight
  };
}

export function funnelButtonSubtextStyle(
  typography: FunnelButtonElement["props"]["subtextTypography"],
  fallbackColor: string
): CSSProperties {
  return {
    color: typography?.color ?? fallbackColor,
    fontFamily: typography?.fontFamily || undefined,
    fontSize: typography?.fontSize,
    lineHeight: typography?.lineHeight ? `${typography.lineHeight}px` : undefined,
    fontWeight: typography?.fontWeight
  };
}

export function funnelButtonDefaultTextColor(
  props: FunnelButtonElement["props"],
  palette: FunnelButtonPalette
) {
  return props.variant === "primary" ? palette.primaryText : palette.secondaryText;
}
