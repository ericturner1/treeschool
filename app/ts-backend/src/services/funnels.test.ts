import { describe, expect, test } from "bun:test";
import {
  chooseWeightedFunnelVariant,
  funnelCheckoutMetadata,
  funnelPageContentSchema,
  normalizeFunnelCheckoutAttribution,
  normalizeFunnelPath,
  normalizeFunnelRoutePath,
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

  test("normalizes flexible customer-facing funnel paths", () => {
    expect(normalizeFunnelRoutePath(" Courses/Japanese A ")).toBe("/courses/japanese-a");
    expect(normalizeFunnelRoutePath("/first-grade-curriculum/offer/"))
      .toBe("/first-grade-curriculum/offer");
    expect(() => normalizeFunnelRoutePath("offer?variant=a")).toThrow();
  });

  test("validates structured managed-page content and applies safe defaults", () => {
    const content = funnelPageContentSchema.parse({
      headline: "A calmer first-grade year",
      primaryCtaLabel: "Get the curriculum",
      bullets: ["Printable workbooks", "Clear next steps"]
    });

    expect(content.schemaVersion).toBe(2);
    expect(content.kind).toBe("funnel_page");
    expect(content.theme).toBe("sage");
    const elements = content.sections[0]?.rows[0]?.columns[0]?.elements ?? [];
    expect(elements.some((element) =>
      element.type === "list" && element.props.items.length === 2
    )).toBe(true);
    expect(elements.some((element) =>
      element.type === "button" && element.props.action.type === "next_step"
    )).toBe(true);
    expect(() => funnelPageContentSchema.parse({
      headline: "A",
      primaryCtaLabel: "Go"
    })).toThrow();
  });

  test("preserves configurable sales-list typography and markers", () => {
    const content = funnelPageContentSchema.parse({
      schemaVersion: 2,
      kind: "funnel_page",
      theme: "sage",
      sections: [{
        id: "section_list",
        props: { tone: "default", width: "standard", background: null },
        rows: [{
          id: "row_list",
          columns: [{
            id: "column_list",
            span: 12,
            elements: [{
              id: "list_test",
              type: "list",
              props: {
                items: ["Printable lessons", "Clear weekly plan"],
                style: "checks",
                align: "left",
                typography: { fontSize: 19, lineHeight: 29, fontWeight: 700, color: "#172033" },
                appearance: { marker: "star", markerSize: 22, markerColor: "#76a456", itemSpacing: 8, markerGap: 12, backgroundColor: "#ffffff", borderColor: "#d8c5a8", borderWidth: 1, borderRadius: 16, paddingX: 18, paddingY: 14 }
              }
            }]
          }]
        }]
      }]
    });

    const list = content.sections[0]?.rows[0]?.columns[0]?.elements[0];
    expect(list?.type).toBe("list");
    if (list?.type === "list") {
      expect(list.props.appearance?.marker).toBe("star");
      expect(list.props.typography?.lineHeight).toBe(29);
    }
  });

  test("preserves editor styles and immutable media snapshots", () => {
    const asset = {
      assetId: "75bc53a9-c880-4c5f-a5cc-a4aa2194b962",
      storagePath: "funnel-assets/7525a64a-0f8d-4392-b7a0-c1608f75c31f/3402df76-4db3-497f-b7a3-a3b48983baf0/75bc53a9-c880-4c5f-a5cc-a4aa2194b962.webp",
      publicUrl: "/api/funnels/assets/7525a64a-0f8d-4392-b7a0-c1608f75c31f/3402df76-4db3-497f-b7a3-a3b48983baf0/75bc53a9-c880-4c5f-a5cc-a4aa2194b962.webp",
      alt: "A family learning together",
      width: 1200,
      height: 800
    };
    const content = funnelPageContentSchema.parse({
      schemaVersion: 2,
      kind: "funnel_page",
      theme: "sage",
      styles: {
        colors: { pageBackground: "#edf4e7", primary: "#76a456" },
        layout: { contentWidth: 1080, sectionGap: 24, sectionPaddingY: 36 },
        buttons: { borderRadius: 18 }
      },
      assets: [asset],
      sections: [{
        id: "section_test",
        props: { tone: "default", width: "standard", background: null },
        rows: [{
          id: "row_test",
          columns: [{
            id: "column_test",
            span: 12,
            elements: [{
              id: "image_test",
              type: "image",
              props: { media: asset, fit: "contain", caption: "" }
            }]
          }]
        }]
      }]
    });

    expect(content.styles?.layout?.contentWidth).toBe(1080);
    expect(content.assets?.[0]?.storagePath).toBe(asset.storagePath);
    const element = content.sections[0]?.rows[0]?.columns[0]?.elements[0];
    expect(element?.type).toBe("image");
    if (element?.type !== "image") throw new Error("Expected an image element.");
    expect(element.props.media.publicUrl).toBe(asset.publicUrl);
  });

  test("preserves conversion-focused button typography and appearance", () => {
    const content = funnelPageContentSchema.parse({
      schemaVersion: 2,
      kind: "funnel_page",
      theme: "sage",
      sections: [{
        id: "section_button",
        props: { tone: "default", width: "standard", background: null },
        rows: [{
          id: "row_button",
          columns: [{
            id: "column_button",
            span: 12,
            elements: [{
              id: "button_offer",
              type: "button",
              props: {
                label: "Get the complete curriculum",
                subtext: "30-day guarantee",
                variant: "primary",
                align: "center",
                showArrow: false,
                typography: { fontFamily: "Georgia, serif", fontSize: 28, lineHeight: 32, fontWeight: 700, color: "#ffffff" },
                subtextTypography: { fontSize: 14, lineHeight: 18, fontWeight: 500, color: "#f4f8ee" },
                appearance: { backgroundColor: "#76a456", borderColor: "#365e2d", borderWidth: 3, borderRadius: 12, paddingX: 36, paddingY: 18, width: "full", shadowColor: "#294823", shadowDepth: 7 },
                action: { type: "next_step" }
              }
            }]
          }]
        }]
      }]
    });

    const button = content.sections[0]?.rows[0]?.columns[0]?.elements[0];
    expect(button?.type).toBe("button");
    if (button?.type !== "button") throw new Error("Expected a button element.");
    expect(button.props.subtext).toBe("30-day guarantee");
    expect(button.props.typography?.fontFamily).toBe("Georgia, serif");
    expect(button.props.appearance?.borderColor).toBe("#365e2d");
    expect(button.props.appearance?.width).toBe("full");
    expect(button.props.showArrow).toBe(false);
  });

  test("preserves countdown timing, expiry behavior, and typography", () => {
    const content = funnelPageContentSchema.parse({
      schemaVersion: 2,
      kind: "funnel_page",
      theme: "sage",
      sections: [{
        id: "section_countdown",
        props: { tone: "default", width: "standard", background: null },
        rows: [{
          id: "row_countdown",
          columns: [{
            id: "column_countdown",
            span: 12,
            elements: [{
              id: "countdown_offer",
              type: "countdown",
              props: {
                mode: "delay",
                duration: { days: 1, hours: 2, minutes: 3, seconds: 4 },
                expiryAction: { type: "redirect", target: "/offer-ended" },
                align: "center",
                showDays: true,
                showLabels: true,
                separator: ":",
                typography: { fontFamily: "Georgia, serif", fontSize: 38, fontWeight: 700, color: "#a31313" },
                labelTypography: { fontSize: 12, fontWeight: 600, color: "#6f6a62" }
              }
            }]
          }]
        }]
      }]
    });

    const countdown = content.sections[0]?.rows[0]?.columns[0]?.elements[0];
    expect(countdown?.type).toBe("countdown");
    if (countdown?.type !== "countdown") throw new Error("Expected a countdown element.");
    expect(countdown.props.duration).toEqual({ days: 1, hours: 2, minutes: 3, seconds: 4 });
    expect(countdown.props.expiryAction).toEqual({ type: "redirect", target: "/offer-ended" });
    expect(countdown.props.typography?.fontFamily).toBe("Georgia, serif");
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
