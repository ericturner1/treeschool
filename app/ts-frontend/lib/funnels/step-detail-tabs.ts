import type { AdminFunnelStepType } from "./server";

export type FunnelStepDetailTab =
  | "configuration"
  | "versions"
  | "experiment"
  | "leads"
  | "stats"
  | "sales";

const STEP_DETAIL_TABS: Record<
  AdminFunnelStepType,
  ReadonlyArray<FunnelStepDetailTab>
> = {
  landing: ["configuration", "experiment", "leads", "stats", "sales"],
  sales: ["configuration", "experiment", "leads", "stats", "sales"],
  order_form: ["configuration", "experiment", "stats", "sales"],
  upsell: ["configuration", "experiment", "stats", "sales"],
  downsell: ["configuration", "experiment", "stats", "sales"],
  thank_you: ["configuration", "experiment", "stats"],
  redirect: ["configuration", "stats"],
  fulfillment: ["configuration", "stats"],
};

export function funnelStepDetailTabs(
  stepType: AdminFunnelStepType,
  options: { experimentContainer?: boolean; hasManagedPage?: boolean } = {},
): ReadonlyArray<FunnelStepDetailTab> {
  const tabs = STEP_DETAIL_TABS[stepType];
  if (!options.experimentContainer) {
    return options.hasManagedPage
      ? [...tabs, "versions"]
      : tabs;
  }

  return [
    "experiment",
    ...tabs.filter((tab) => tab !== "configuration" && tab !== "experiment"),
  ];
}
