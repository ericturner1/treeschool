import { describe, expect, test } from "bun:test";
import { buildAdminFunnelStepSaveInput } from "./admin-step-save";

function baseForm() {
  const form = new FormData();
  form.set("id", "step-1");
  form.set("funnelId", "funnel-1");
  form.set("funnelSlug", "first-grade-curriculum");
  form.set("name", "Curriculum details");
  form.set("stepType", "sales");
  form.set("status", "active");
  form.set("sourceType", "generated");
  form.set("routePath", "first-grade-curriculum/details");
  return form;
}

describe("admin funnel step form input", () => {
  test("normalizes an in-place URL save into the existing backend input", () => {
    const result = buildAdminFunnelStepSaveInput(baseForm(), "admin-1");

    expect(result.funnelSlug).toBe("first-grade-curriculum");
    expect(result.routePath).toBe("first-grade-curriculum/details");
    expect(result.input).toMatchObject({
      id: "step-1",
      funnelId: "funnel-1",
      userId: "admin-1",
      slug: "details",
      routePath: "first-grade-curriculum/details"
    });
  });

  test("preserves order bumps while excluding the primary product", () => {
    const form = baseForm();
    form.set("stepType", "order_form");
    form.set("orderPrimaryProductId", "primary");
    form.append("orderBumpProductId", "primary");
    form.append("orderBumpProductId", "bump-1");

    const result = buildAdminFunnelStepSaveInput(form, "admin-1");
    expect((result.input as { settings?: unknown }).settings).toEqual({
      journeyNextAction: "button",
      orderForm: {
        primaryProductId: "primary",
        orderBumpProductIds: ["bump-1"],
        submitLabel: "Continue to secure checkout"
      }
    });
  });
});
