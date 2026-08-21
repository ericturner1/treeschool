import { describe, expect, test } from "bun:test";
import {
  chooseWeightedFunnelVariant,
  funnelCheckoutMetadata,
  funnelPaymentProviderStatus,
  funnelPageContentSchema,
  normalizeFunnelCheckoutAttribution,
  normalizeFunnelPath,
  normalizeFunnelRoutePath,
  normalizeFunnelSlug
} from "./funnels";

describe("funnel administration normalization", () => {
  test("reports Stripe ready only when checkout and fulfillment secrets are configured", () => {
    expect(funnelPaymentProviderStatus({
      stripeSecretKey: "sk_test_example",
      stripeWebhookSecret: "whsec_example"
    }).stripe).toEqual({
      ready: true,
      checkoutConfigured: true,
      webhookConfigured: true
    });
    expect(funnelPaymentProviderStatus({
      stripeSecretKey: "sk_test_example"
    }).stripe).toEqual({
      ready: false,
      checkoutConfigured: true,
      webhookConfigured: false
    });
  });

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

  test("preserves rows nested inside funnel columns", () => {
    const content = funnelPageContentSchema.parse({
      schemaVersion: 2,
      kind: "funnel_page",
      theme: "sage",
      sections: [{
        id: "section_nested",
        props: { tone: "default", width: "standard", background: null },
        rows: [{
          id: "row_parent",
          columns: [{
            id: "column_parent",
            span: 12,
            verticalAlign: "top",
            elements: [],
            rows: [{
              id: "row_child",
              columns: [{
                id: "column_child",
                span: 12,
                elements: [{ id: "nested_text", type: "text", props: { text: "Nested content", style: "body", align: "left" } }]
              }]
            }]
          }]
        }]
      }]
    });

    expect(content.sections[0]?.rows[0]?.columns[0]?.rows?.[0]?.id).toBe("row_child");
    expect(content.sections[0]?.rows[0]?.columns[0]?.verticalAlign).toBe("top");
    expect(content.sections[0]?.rows[0]?.columns[0]?.rows?.[0]?.columns[0]?.elements[0]?.id).toBe("nested_text");
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
      siteChrome: { showHeader: true, showFooter: false },
      styles: {
        colors: { pageBackground: "#edf4e7", primary: "#76a456" },
        layout: { contentWidth: 1080, sectionGap: 24, sectionPaddingY: 36 },
        buttons: { borderRadius: 18 }
      },
      assets: [asset],
      sections: [{
        id: "section_test",
        props: {
          tone: "default",
          width: "standard",
          background: null,
          backgroundColor: "#f6ead8",
          paddingX: 32,
          paddingY: 24,
          paddingTop: 18,
          paddingRight: 28,
          paddingBottom: 22,
          paddingLeft: 30,
          marginTop: 12,
          marginRight: 16,
          marginBottom: 20,
          marginLeft: 8,
          borderColor: "#8a674d",
          borderWidth: 3,
          borderRadius: 18,
          borderStyle: "dashed"
        },
        rows: [{
          id: "row_test",
          spacing: { marginTop: 6, marginBottom: 10, paddingLeft: 12, paddingRight: 12 },
          columns: [{
            id: "column_test",
            span: 12,
            spacing: { marginLeft: -3, paddingTop: 9 },
            elements: [{
              id: "image_test",
              type: "image",
              spacing: {
                marginTop: 10,
                marginRight: -4,
                marginBottom: 18,
                marginLeft: 2,
                paddingTop: 6,
                paddingRight: 12,
                paddingBottom: 8,
                paddingLeft: 14
              },
              props: { media: asset, fit: "contain", caption: "", sizePercent: 64 }
            }]
          }]
        }]
      }]
    });

    expect(content.styles?.layout?.contentWidth).toBe(1080);
    expect(content.siteChrome).toEqual({ showHeader: true, showFooter: false });
    expect(content.assets?.[0]?.storagePath).toBe(asset.storagePath);
    expect(content.sections[0]?.props).toMatchObject({
      backgroundColor: "#f6ead8",
      paddingX: 32,
      paddingY: 24,
      paddingTop: 18,
      paddingRight: 28,
      paddingBottom: 22,
      paddingLeft: 30,
      marginTop: 12,
      marginRight: 16,
      marginBottom: 20,
      marginLeft: 8,
      borderColor: "#8a674d",
      borderWidth: 3,
      borderRadius: 18,
      borderStyle: "dashed"
    });
    expect(content.sections[0]?.rows[0]?.spacing).toMatchObject({ marginTop: 6, marginBottom: 10, paddingLeft: 12 });
    expect(content.sections[0]?.rows[0]?.columns[0]?.spacing).toMatchObject({ marginLeft: -3, paddingTop: 9 });
    const element = content.sections[0]?.rows[0]?.columns[0]?.elements[0];
    expect(element?.type).toBe("image");
    if (element?.type !== "image") throw new Error("Expected an image element.");
    expect(element.props.media.publicUrl).toBe(asset.publicUrl);
    expect(element.props.sizePercent).toBe(64);
    expect(element.spacing).toMatchObject({ marginTop: 10, marginRight: -4, paddingLeft: 14 });
  });

  test("validates workbook galleries as ordered immutable media snapshots", () => {
    const cover = {
      assetId: "cover",
      storagePath: "funnel-assets/funnel/step/cover.webp",
      publicUrl: "/api/funnels/assets/funnel/step/cover.webp",
      alt: "Math 1 cover",
      width: 800,
      height: 1000
    };
    const sample = {
      ...cover,
      assetId: "sample",
      storagePath: "funnel-assets/funnel/step/sample.webp",
      publicUrl: "/api/funnels/assets/funnel/step/sample.webp",
      alt: "Table of contents"
    };
    const content = funnelPageContentSchema.parse({
      schemaVersion: 2,
      kind: "funnel_page",
      theme: "sage",
      assets: [cover, sample],
      sections: [{
        id: "section_gallery",
        props: { tone: "default", width: "standard", background: null },
        rows: [{
          id: "row_gallery",
          columns: [{
            id: "column_gallery",
            span: 4,
            elements: [{
              id: "gallery_math",
              type: "workbook_gallery",
              props: {
                title: "Math 1",
                cover,
                images: [sample],
                previewSlug: "math-1",
                fit: "contain",
                caption: "Look inside",
                appearance: {
                  preset: "bookstore_frameless",
                  zoomOnHover: true,
                  darkenOnHover: true,
                  hoverBrightness: 48,
                  overlayText: "See inside",
                  overlayBackgroundColor: "#24311d",
                  overlayTextColor: "#ffffff"
                }
              }
            }]
          }]
        }]
      }]
    });

    const element = content.sections[0]?.rows[0]?.columns[0]?.elements[0];
    expect(element?.type).toBe("workbook_gallery");
    if (element?.type !== "workbook_gallery") throw new Error("Expected a workbook gallery element.");
    expect(element.props.images[0]?.alt).toBe("Table of contents");
    expect(element.props.previewSlug).toBe("math-1");
    expect(element.props.appearance).toMatchObject({
      preset: "bookstore_frameless",
      zoomOnHover: true,
      hoverBrightness: 48,
      overlayText: "See inside"
    });
  });

  test("preserves inline list layouts and circular marker badges", () => {
    const content = funnelPageContentSchema.parse({
      schemaVersion: 2,
      kind: "funnel_page",
      theme: "sage",
      sections: [{
        id: "section_benefits",
        props: { tone: "default", width: "standard", background: null },
        rows: [{
          id: "row_benefits",
          columns: [{
            id: "column_benefits",
            span: 12,
            offset: 0,
            elements: [{
              id: "list_benefits",
              type: "list",
              props: {
                items: ["Downloadable PDF", "Print at home"],
                style: "checks",
                align: "left",
                appearance: {
                  layout: "inline",
                  marker: "check",
                  markerBadge: true,
                  markerBadgeColor: "#dfead4",
                  markerBadgeSize: 24
                }
              }
            }]
          }]
        }]
      }]
    });

    const element = content.sections[0]?.rows[0]?.columns[0]?.elements[0];
    expect(element?.type).toBe("list");
    if (element?.type !== "list") throw new Error("Expected a list element.");
    expect(element.props.appearance).toMatchObject({
      layout: "inline",
      markerBadge: true,
      markerBadgeColor: "#dfead4",
      markerBadgeSize: 24
    });
    expect(content.sections[0]?.rows[0]?.columns[0]?.offset).toBe(0);
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
                icon: "lightbulb",
                iconPosition: "left",
                typography: { fontFamily: "Georgia, serif", fontSize: 28, lineHeight: 32, fontWeight: 700, color: "#ffffff" },
                subtextTypography: { fontSize: 14, lineHeight: 18, fontWeight: 500, color: "#f4f8ee" },
                appearance: { backgroundColor: "#76a456", borderColor: "#365e2d", borderWidth: 3, borderRadius: 12, paddingX: 36, paddingY: 18, width: "full", shadowColor: "#294823", shadowDepth: 7, hoverBackgroundColor: "#5d8742", hoverScale: 1.08 },
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
    expect(button.props.appearance?.hoverBackgroundColor).toBe("#5d8742");
    expect(button.props.appearance?.hoverScale).toBe(1.08);
    expect(button.props.icon).toBe("lightbulb");
    expect(button.props.iconPosition).toBe("left");
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

  test("validates configurable progress steps and their current position", () => {
    const baseContent = {
      schemaVersion: 2 as const,
      kind: "funnel_page" as const,
      theme: "sage" as const,
      sections: [{
        id: "section_progress",
        props: { tone: "default" as const, width: "standard" as const, background: null },
        rows: [{
          id: "row_progress",
          columns: [{
            id: "column_progress",
            span: 12,
            elements: [{
              id: "progress_checkout",
              type: "progress_steps" as const,
              props: {
                steps: ["Details", "Review", "Checkout"],
                currentStep: 2,
                showNumbers: true
              }
            }]
          }]
        }]
      }]
    };
    const content = funnelPageContentSchema.parse(baseContent);
    const progress = content.sections[0]?.rows[0]?.columns[0]?.elements[0];

    expect(progress?.type).toBe("progress_steps");
    if (progress?.type !== "progress_steps") throw new Error("Expected progress steps.");
    expect(progress.props.steps).toEqual(["Details", "Review", "Checkout"]);
    expect(progress.props.currentStep).toBe(2);
    expect(() => funnelPageContentSchema.parse({
      ...baseContent,
      sections: [{
        ...baseContent.sections[0],
        rows: [{
          ...baseContent.sections[0]!.rows[0],
          columns: [{
            ...baseContent.sections[0]!.rows[0]!.columns[0],
            elements: [{
              ...baseContent.sections[0]!.rows[0]!.columns[0]!.elements[0],
              props: { steps: ["Details", "Review"], currentStep: 3, showNumbers: true }
            }]
          }]
        }]
      }]
    })).toThrow("Current progress step");
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
