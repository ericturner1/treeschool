import { describe, expect, test } from "bun:test";
import {
  invalidActiveDownsell,
  nextActiveFunnelJourneyStep,
  pairedUpsellForDownsell,
  type FunnelOfferFlowStep
} from "./funnel-offer-flow";

function step(
  id: string,
  stepType: string,
  displayOrder: number,
  overrides: Partial<FunnelOfferFlowStep> = {}
): FunnelOfferFlowStep {
  return {
    id,
    name: id,
    stepType,
    status: "active",
    displayOrder,
    createdAt: new Date(`2026-08-09T00:${String(displayOrder).padStart(2, "0")}:00.000Z`),
    settingsJson: {},
    ...overrides
  };
}

describe("managed funnel offer flow", () => {
  const journey = [
    step("order", "order_form", 10),
    step("upsell", "upsell", 20),
    step("downsell", "downsell", 30),
    step("thanks", "thank_you", 40)
  ];

  test("declining an upsell enters its paired downsell", () => {
    expect(nextActiveFunnelJourneyStep(journey, "upsell")?.id).toBe("downsell");
  });

  test("accepting an upsell skips its paired downsell", () => {
    expect(nextActiveFunnelJourneyStep(journey, "upsell", {
      skipPairedDownsell: true
    })?.id).toBe("thanks");
  });

  test("accepting a downsell continues to the following step", () => {
    expect(nextActiveFunnelJourneyStep(journey, "downsell", {
      skipPairedDownsell: true
    })?.id).toBe("thanks");
  });

  test("draft previews still resolve the next active journey step", () => {
    expect(nextActiveFunnelJourneyStep([
      step("draft-offer", "upsell", 10, { status: "draft" }),
      step("thanks", "thank_you", 20)
    ], "draft-offer")?.id).toBe("thanks");
  });

  test("recognizes only an immediately preceding active upsell as the pair", () => {
    expect(pairedUpsellForDownsell(journey, "downsell")?.id).toBe("upsell");
    expect(invalidActiveDownsell([
      step("order", "order_form", 10),
      step("downsell", "downsell", 20)
    ])?.id).toBe("downsell");
    expect(invalidActiveDownsell([
      step("upsell", "upsell", 10),
      step("first-downsell", "downsell", 20),
      step("second-downsell", "downsell", 30)
    ])?.id).toBe("second-downsell");
  });

  test("ignores inactive steps and experiment variants when pairing offers", () => {
    const steps = [
      step("upsell", "upsell", 10),
      step("variant", "sales", 11, {
        settingsJson: { relationship: "experiment_variant" }
      }),
      step("inactive", "sales", 12, { status: "inactive" }),
      step("downsell", "downsell", 20)
    ];
    expect(invalidActiveDownsell(steps)).toBeNull();
    expect(pairedUpsellForDownsell(steps, "downsell")?.id).toBe("upsell");
  });
});
