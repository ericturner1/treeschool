import { describe, expect, test } from "bun:test";
import type { AdminFunnelStep } from "./server";
import {
  canImportLegacyFunnelPage,
  getLegacyFunnelPageImport
} from "./legacy-page-imports";

function step(sourceRef: string | null, sourceType: AdminFunnelStep["sourceType"] = "code"):
  AdminFunnelStep {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    funnelId: "22222222-2222-4222-8222-222222222222",
    slug: "test-step",
    name: "Test step",
    description: "Test step description",
    stepType: "sales",
    status: "active",
    sourceType,
    sourceRef,
    routePath: "/legacy-test",
    publicPath: "/legacy-test",
    previewPath: "/legacy-test",
    linkLabel: "Preview",
    displayOrder: 10,
    isTopOfFunnel: false,
    settings: {},
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
}

describe("legacy funnel page imports", () => {
  test("converts each authored first-grade sales page into an editable document", () => {
    for (const sourceRef of [
      "first_grade_curriculum_variant_a",
      "first_grade_curriculum_variant_b",
      "first_grade_homeschool_curriculum_detail",
      "first_grade_japanese_upsell",
      "first_grade_japanese_downsell"
    ]) {
      const imported = getLegacyFunnelPageImport(step(sourceRef));
      expect(imported?.content.schemaVersion).toBe(2);
      expect(imported?.content.sections.length).toBeGreaterThan(0);
      expect(imported?.seo.title.length).toBeGreaterThan(3);
    }
  });

  test("converts config-driven marketing landing pages", () => {
    for (const sourceRef of [
      "first_grade_homeschool_landing",
      "switch_to_paper_landing",
      "no_subscription_landing"
    ]) {
      const imported = getLegacyFunnelPageImport(step(sourceRef));
      expect(imported?.content.sections.length).toBeGreaterThanOrEqual(5);
    }
  });

  test("does not present routing, checkout, or runtime interactions as content pages", () => {
    expect(canImportLegacyFunnelPage(step("first_grade_curriculum_experiment"))).toBe(false);
    expect(canImportLegacyFunnelPage(step("stripe_checkout", "external"))).toBe(false);
    expect(canImportLegacyFunnelPage(step("purchase_fulfillment", "runtime"))).toBe(false);
  });
});
