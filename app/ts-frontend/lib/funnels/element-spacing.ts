import type { FunnelElementSpacing, FunnelPageElement } from "./page-document";

export function funnelElementSpacingStyle(element: Pick<FunnelPageElement, "spacing">) {
  const spacing = element.spacing;
  if (!spacing) return undefined;
  return {
    marginTop: spacing.marginTop,
    marginRight: spacing.marginRight,
    marginBottom: spacing.marginBottom,
    marginLeft: spacing.marginLeft,
    paddingTop: spacing.paddingTop,
    paddingRight: spacing.paddingRight,
    paddingBottom: spacing.paddingBottom,
    paddingLeft: spacing.paddingLeft
  };
}

export function allSpacingSides(
  kind: "margin" | "padding",
  value: number
): FunnelElementSpacing {
  return kind === "margin"
    ? { marginTop: value, marginRight: value, marginBottom: value, marginLeft: value }
    : { paddingTop: value, paddingRight: value, paddingBottom: value, paddingLeft: value };
}
