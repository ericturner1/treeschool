import { getFirstGradeMarketingCoverPath } from "../first-grade-curriculum/catalog";
import type { NativeWorkbookCatalogItem } from "../native-workbooks/server";
import type { FunnelPageDocument, FunnelPageElement, FunnelPageRow } from "./page-document";

function comparablePath(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value, "https://www.treehomeschool.com").pathname
      .replace(/\/+$/g, "")
      .toLowerCase();
  } catch {
    return value.split(/[?#]/, 1)[0]?.replace(/\/+$/g, "").toLowerCase() ?? null;
  }
}

function workbookForImage(
  element: Extract<FunnelPageElement, { type: "image" }>,
  catalog: NativeWorkbookCatalogItem[]
) {
  const imagePath = comparablePath(
    element.props.media.publicUrl ?? element.props.media.storagePath
  );
  if (!imagePath) return null;
  return catalog.find((item) =>
    item.catalogKind === "workbook" &&
    comparablePath(getFirstGradeMarketingCoverPath(item)) === imagePath
  ) ?? null;
}

export function upgradeCatalogWorkbookImages(
  document: FunnelPageDocument,
  catalog: NativeWorkbookCatalogItem[]
) {
  let upgradedCount = 0;
  const content = structuredClone(document);

  function upgradeRows(rows: FunnelPageRow[]) {
    for (const row of rows) {
      for (const column of row.columns) {
        column.elements = column.elements.map((element) => {
          if (element.type !== "image") return element;
          const workbook = workbookForImage(element, catalog);
          if (!workbook) return element;
          upgradedCount += 1;
          return {
            id: element.id,
            type: "workbook_gallery" as const,
            ...(element.visibility ? { visibility: element.visibility } : {}),
            ...(element.spacing ? { spacing: element.spacing } : {}),
            props: {
              title: workbook.title,
              cover: element.props.media,
              images: [],
              previewSlug: workbook.slug,
              fit: element.props.fit,
              caption: element.props.caption
            }
          };
        });
        upgradeRows(column.rows ?? []);
      }
    }
  }

  for (const section of content.sections) {
    upgradeRows(section.rows);
  }

  return { content, upgradedCount };
}
