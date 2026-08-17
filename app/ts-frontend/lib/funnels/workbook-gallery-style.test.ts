import { describe, expect, test } from "bun:test";
import {
  funnelWorkbookGalleryAspectClass,
  resolveFunnelWorkbookGalleryAppearance
} from "./workbook-gallery-style";

describe("funnel workbook gallery appearance", () => {
  test("keeps existing funnel galleries card-like by default", () => {
    expect(resolveFunnelWorkbookGalleryAppearance()).toMatchObject({
      preset: "funnel_card",
      aspectRatio: "4:5",
      frameBackgroundColor: "#ffffff",
      frameBorderRadius: 20,
      restingShadow: true,
      darkenOnHover: false
    });
  });

  test("matches the bookstore frameless thumbnail treatment", () => {
    expect(resolveFunnelWorkbookGalleryAppearance({ preset: "bookstore_frameless" })).toMatchObject({
      aspectRatio: "3:4",
      frameBackgroundColor: "transparent",
      frameBorderWidth: 0,
      frameBorderRadius: 8,
      framePadding: 0,
      imageScale: 107,
      darkenOnHover: true,
      hoverBrightness: 52
    });
  });

  test("allows individual controls to override a preset", () => {
    expect(resolveFunnelWorkbookGalleryAppearance({
      preset: "bookstore_frameless",
      zoomOnHover: true,
      overlayText: "Look inside",
      frameBorderRadius: 12
    })).toMatchObject({
      zoomOnHover: true,
      overlayText: "Look inside",
      frameBorderRadius: 12
    });
    expect(funnelWorkbookGalleryAspectClass("3:4")).toBe("aspect-[3/4]");
  });

  test("does not let undefined overrides erase preset defaults", () => {
    expect(resolveFunnelWorkbookGalleryAppearance({
      preset: "bookstore_frameless",
      hoverBrightness: undefined
    })).toMatchObject({
      hoverBrightness: 52,
      frameBorderRadius: 8
    });
  });
});
