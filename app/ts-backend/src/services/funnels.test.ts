import { describe, expect, test } from "bun:test";
import {
  chooseWeightedFunnelVariant,
  funnelCheckoutMetadata,
  funnelPageContentSchema,
  normalizeFunnelCheckoutAttribution,
  normalizeFunnelPath,
  normalizeFunnelSlug
} from "./funnels";

describe("funnel administration normalization", () => {
  test("creates stable, route-safe slugs", () => {
    expect(normalizeFunnelSlug(" Japanese A–D Launch! ")).toBe("japanese-a-d-launch");
  });

  test("accepts local paths and complete web URLs", () => {
    expect(normalizeFunnelPath("/f/japanese")).toBe("/f/japanese");
    expect(normalizeFunnelPath("https://checkout.stripe.com/example")).toBe(
      "https://checkout.stripe.com/example"
    );
  });

  test("rejects protocol-relative and unsafe URLs", () => {
    expect(() => normalizeFunnelPath("//malicious.example")).toThrow();
    expect(() => normalizeFunnelPath("javascript:alert(1)")).toThrow();
  });

  test("validates structured managed-page content and applies safe defaults", () => {
    const content = funnelPageContentSchema.parse({
      headline: "A calmer first-grade year",
      primaryCtaLabel: "Get the curriculum",
      bullets: ["Printable workbooks", "Clear next steps"]
    });

    expect(content.template).toBe("sales");
    expect(content.theme).toBe("sage");
    expect(content.bullets).toHaveLength(2);
    expect(content.leadCapture.enabled).toBe(false);
    expect(() => funnelPageContentSchema.parse({
      headline: "A",
      primaryCtaLabel: "Go"
    })).toThrow();
  });

  test("keeps managed funnel attribution vendor-neutral until checkout metadata", () => {
    const attribution = {
      funnelId: "7525a64a-0f8d-4392-b7a0-c1608f75c31f",
      funnelSlug: "first-grade-curriculum",
      stepId: "3402df76-4db3-497f-b7a3-a3b48983baf0",
      pageId: "f3937c78-71d4-4db4-9d19-2bb858ad1b8c",
      revisionNumber: 3,
      visitorId: "6a31bf79-88c5-4a65-bfe1-e87674bb14f6",
      experimentId: null,
      experimentVariantId: null
    };

    expect(normalizeFunnelCheckoutAttribution(attribution)).toEqual(attribution);
    expect(funnelCheckoutMetadata(attribution)).toEqual({
      managedFunnelId: attribution.funnelId,
      managedFunnelSlug: attribution.funnelSlug,
      managedFunnelStepId: attribution.stepId,
      managedFunnelPageId: attribution.pageId,
      managedFunnelRevision: "3",
      managedFunnelVisitorId: attribution.visitorId
    });
    expect(normalizeFunnelCheckoutAttribution({ ...attribution, visitorId: "bad" })).toBeNull();
  });

  test("assigns a visitor to the same weighted variant deterministically", () => {
    const variants = [
      { id: "control", weight: 50 },
      { id: "headline-b", weight: 50 }
    ];
    const first = chooseWeightedFunnelVariant(
      "0ca9d73c-8cc2-45cf-aed6-d7f85838f254",
      "f5c753c6-3b4e-416c-9c09-f40f735d402b",
      variants
    );
    const second = chooseWeightedFunnelVariant(
      "0ca9d73c-8cc2-45cf-aed6-d7f85838f254",
      "f5c753c6-3b4e-416c-9c09-f40f735d402b",
      variants
    );

    expect(first).toEqual(second);
    if (!first) throw new Error("Expected a weighted variant assignment.");
    expect(["control", "headline-b"]).toContain(first.id);
  });
});
