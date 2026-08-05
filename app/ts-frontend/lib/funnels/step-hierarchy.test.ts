import { describe, expect, test } from "bun:test";
import type { AdminFunnelStep } from "./server";
import {
  buildFunnelStepHierarchy,
  funnelExperimentContainerForStep,
  moveFunnelStepGroup,
  reorderFunnelStepGroups,
  reorderFunnelStepGroupsAtIndex
} from "./step-hierarchy";

function step(
  id: string,
  slug: string,
  settings: Record<string, unknown> = {}
): AdminFunnelStep {
  return {
    id,
    funnelId: "funnel",
    slug,
    name: slug,
    description: "",
    stepType: "landing",
    status: "active",
    sourceType: "code",
    sourceRef: null,
    routePath: null,
    publicPath: null,
    previewPath: null,
    linkLabel: null,
    displayOrder: 0,
    isTopOfFunnel: false,
    settings,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

const variantSettings = {
  relationship: "experiment_variant",
  parentStepSlug: "experiment"
};

describe("funnel step hierarchy", () => {
  test("nests experiment variants under their assignment step", () => {
    const hierarchy = buildFunnelStepHierarchy([
      step("parent", "experiment"),
      step("a", "variant-a", variantSettings),
      step("b", "variant-b", variantSettings),
      step("checkout", "checkout")
    ]);

    expect(hierarchy.map(({ step: item }) => item.id)).toEqual(["parent", "checkout"]);
    expect(hierarchy[0]?.children.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("moves a parent and its variants as one group", () => {
    const original = [
      step("parent", "experiment"),
      step("a", "variant-a", variantSettings),
      step("b", "variant-b", variantSettings),
      step("checkout", "checkout")
    ];

    expect(moveFunnelStepGroup(original, "parent", 1).map((item) => item.id)).toEqual([
      "checkout",
      "parent",
      "a",
      "b"
    ]);
    expect(reorderFunnelStepGroups(original, "checkout", "parent").map((item) => item.id)).toEqual([
      "checkout",
      "parent",
      "a",
      "b"
    ]);
  });

  test("moves a grouped step into a visible insertion slot", () => {
    const original = [
      step("parent", "experiment"),
      step("a", "variant-a", variantSettings),
      step("b", "variant-b", variantSettings),
      step("checkout", "checkout"),
      step("thanks", "thanks")
    ];

    expect(reorderFunnelStepGroupsAtIndex(original, "parent", 3).map((item) => item.id)).toEqual([
      "checkout",
      "thanks",
      "parent",
      "a",
      "b"
    ]);
    expect(reorderFunnelStepGroupsAtIndex(original, "thanks", 1).map((item) => item.id)).toEqual([
      "parent",
      "a",
      "b",
      "thanks",
      "checkout"
    ]);
  });

  test("keeps the current order when an adjacent insertion slot is selected", () => {
    const original = [step("first", "first"), step("second", "second")];

    expect(reorderFunnelStepGroupsAtIndex(original, "first", 0)).toBe(original);
    expect(reorderFunnelStepGroupsAtIndex(original, "first", 1)).toBe(original);
  });

  test("resolves a variant to the experiment container", () => {
    const parent = step("parent", "experiment");
    const variant = step("a", "variant-a", variantSettings);

    expect(funnelExperimentContainerForStep([parent, variant], variant).id).toBe("parent");
    expect(funnelExperimentContainerForStep([parent, variant], parent).id).toBe("parent");
  });
});
