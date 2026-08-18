import { describe, expect, test } from "bun:test";
import type { NativeWorkbookCatalogItem } from "../native-workbooks/server";
import { createFunnelPageRow, emptyFunnelPageDocument } from "./page-document";
import { upgradeCatalogWorkbookImages } from "./workbook-gallery-upgrade";

describe("legacy workbook gallery upgrade", () => {
  test("turns recognized marketing covers into catalog-linked galleries", () => {
    const document = emptyFunnelPageDocument("First grade");
    document.sections[0]!.rows[0]!.columns[0]!.elements = [{
      id: "reading-f-cover",
      type: "image",
      props: {
        media: {
          assetId: null,
          storagePath: null,
          publicUrl: "/first-grade-curriculum/reading-level-f.png",
          alt: "Reading Level F workbook cover",
          width: 900,
          height: 1200
        },
        fit: "contain",
        caption: "Open the workbook"
      }
    }];
    const workbook = {
      catalogKind: "workbook",
      slug: "reading-level-f",
      title: "Reading Level F"
    } as NativeWorkbookCatalogItem;

    const upgraded = upgradeCatalogWorkbookImages(document, [workbook]);
    const element = upgraded.content.sections[0]!.rows[0]!.columns[0]!.elements[0];

    expect(upgraded.upgradedCount).toBe(1);
    expect(element?.type).toBe("workbook_gallery");
    if (element?.type === "workbook_gallery") {
      expect(element.props.previewSlug).toBe("reading-level-f");
      expect(element.props.cover.publicUrl).toBe(
        "/first-grade-curriculum/reading-level-f.png"
      );
      expect(element.props.caption).toBe("Open the workbook");
    }
  });

  test("leaves ordinary images unchanged", () => {
    const document = emptyFunnelPageDocument("First grade");
    const result = upgradeCatalogWorkbookImages(document, []);

    expect(result.upgradedCount).toBe(0);
    expect(result.content).toEqual(document);
  });

  test("upgrades recognized covers inside nested rows", () => {
    const document = emptyFunnelPageDocument("First grade");
    const nested = createFunnelPageRow(1);
    nested.columns[0]!.elements = [{
      id: "nested-reading-f-cover",
      type: "image",
      props: {
        media: { assetId: null, storagePath: null, publicUrl: "/first-grade-curriculum/reading-level-f.png", alt: "Reading Level F", width: 900, height: 1200 },
        fit: "contain",
        caption: ""
      }
    }];
    document.sections[0]!.rows[0]!.columns[0]!.rows = [nested];
    const workbook = { catalogKind: "workbook", slug: "reading-level-f", title: "Reading Level F" } as NativeWorkbookCatalogItem;

    const upgraded = upgradeCatalogWorkbookImages(document, [workbook]);
    expect(upgraded.upgradedCount).toBe(1);
    expect(upgraded.content.sections[0]!.rows[0]!.columns[0]!.rows?.[0]!.columns[0]!.elements[0]?.type).toBe("workbook_gallery");
  });
});
