import { describe, expect, test } from "bun:test";
import { funnelStepDetailTabs } from "./step-detail-tabs";

describe("funnel step detail tabs", () => {
  test("shows leads only on pages that can intentionally capture prospects", () => {
    expect(funnelStepDetailTabs("landing")).toContain("leads");
    expect(funnelStepDetailTabs("sales")).toContain("leads");

    for (const type of [
      "order_form",
      "upsell",
      "downsell",
      "thank_you",
      "redirect",
      "fulfillment",
    ] as const) {
      expect(funnelStepDetailTabs(type)).not.toContain("leads");
    }
  });

  test("keeps sales reporting on steps that acquire or change an order", () => {
    for (const type of [
      "landing",
      "sales",
      "order_form",
      "upsell",
      "downsell",
    ] as const) {
      expect(funnelStepDetailTabs(type)).toContain("sales");
    }

    for (const type of ["thank_you", "redirect", "fulfillment"] as const) {
      expect(funnelStepDetailTabs(type)).not.toContain("sales");
    }
  });

  test("keeps redirect and fulfillment panes focused", () => {
    expect(funnelStepDetailTabs("redirect")).toEqual([
      "configuration",
      "stats",
    ]);
    expect(funnelStepDetailTabs("fulfillment")).toEqual([
      "configuration",
      "stats",
    ]);
  });

  test("replaces configuration with experiment management for a container", () => {
    expect(
      funnelStepDetailTabs("order_form", { experimentContainer: true }),
    ).toEqual(["experiment", "stats", "sales"]);
    expect(
      funnelStepDetailTabs("redirect", { experimentContainer: true }),
    ).toEqual(["experiment", "stats"]);
  });

  test("adds version history only when the selected step has a managed page", () => {
    expect(funnelStepDetailTabs("order_form", { hasManagedPage: true })).toEqual([
      "configuration",
      "versions",
      "experiment",
      "stats",
      "sales",
    ]);
    expect(funnelStepDetailTabs("order_form")).not.toContain("versions");
  });
});
