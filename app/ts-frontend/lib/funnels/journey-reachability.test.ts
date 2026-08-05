import { describe, expect, test } from "bun:test";
import type { AdminFunnelStep } from "./server";
import { findFunnelJourneyIssues } from "./journey-reachability";

function step(
  id: string,
  overrides: Partial<AdminFunnelStep> = {}
): AdminFunnelStep {
  return {
    id,
    funnelId: "funnel",
    slug: id,
    name: id,
    description: "",
    stepType: "sales",
    status: "active",
    sourceType: "code",
    sourceRef: null,
    routePath: `/${id}`,
    publicPath: `/${id}`,
    previewPath: null,
    linkLabel: null,
    displayOrder: 0,
    isTopOfFunnel: false,
    settings: {},
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides
  };
}

describe("funnel journey reachability", () => {
  test("flags an active non-final page without an onward action", () => {
    const issues = findFunnelJourneyIssues([
      step("dead-end"),
      step("finish", { stepType: "fulfillment", sourceType: "runtime", publicPath: "/done" })
    ]);

    expect(issues.has("dead-end")).toBe(true);
    expect(issues.has("finish")).toBe(false);
  });

  test("accepts explicit buttons and automatic checkout transitions", () => {
    const issues = findFunnelJourneyIssues([
      step("sales", { settings: { journeyNextAction: "button" } }),
      step("checkout", { stepType: "order_form", sourceType: "generated", publicPath: "/order" }),
      step("finish", { stepType: "fulfillment", sourceType: "runtime" })
    ]);

    expect([...issues.keys()]).toEqual([]);
  });

  test("does not assume a generated page contains a usable next action", () => {
    const issues = findFunnelJourneyIssues([
      step("empty-generated", { sourceType: "generated" }),
      step("finish", { stepType: "fulfillment", sourceType: "runtime" })
    ]);

    expect(issues.has("empty-generated")).toBe(true);
  });

  test("flags the experiment container and only the blocked active variant", () => {
    const relationship = {
      relationship: "experiment_variant",
      parentStepSlug: "experiment"
    };
    const issues = findFunnelJourneyIssues([
      step("parent", { slug: "experiment", stepType: "landing" }),
      step("good", { settings: { ...relationship, journeyNextAction: "button" } }),
      step("blocked", { settings: relationship }),
      step("inactive", { status: "inactive", settings: relationship }),
      step("finish", { stepType: "fulfillment", sourceType: "runtime" })
    ]);

    expect(issues.has("parent")).toBe(true);
    expect(issues.has("blocked")).toBe(true);
    expect(issues.has("good")).toBe(false);
    expect(issues.has("inactive")).toBe(false);
  });

  test("exempts the final active experiment group", () => {
    const relationship = {
      relationship: "experiment_variant",
      parentStepSlug: "experiment"
    };
    const issues = findFunnelJourneyIssues([
      step("start", { settings: { journeyNextAction: "button" } }),
      step("parent", { slug: "experiment", stepType: "landing" }),
      step("blocked", { settings: relationship })
    ]);

    expect([...issues.keys()]).toEqual([]);
  });
});
