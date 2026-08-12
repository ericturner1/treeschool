import { describe, expect, test } from "bun:test";
import { createFunnelPageRow, emptyFunnelPageDocument } from "./page-document";

describe("funnel page layout rows", () => {
  test("creates balanced one-to-four-column rows", () => {
    for (const count of [1, 2, 3, 4] as const) {
      const row = createFunnelPageRow(count);

      expect(row.columns).toHaveLength(count);
      expect(row.columns.reduce((total, column) => total + column.span, 0)).toBe(
        12,
      );
      expect(row.columns.every((column) => column.elements.length === 0)).toBe(
        true,
      );
      expect(new Set(row.columns.map((column) => column.id)).size).toBe(count);
    }
  });

  test("keeps site chrome off until an admin explicitly enables it", () => {
    const document = emptyFunnelPageDocument("A focused funnel page");

    expect(document.siteChrome).toEqual({
      showHeader: false,
      showFooter: false,
    });
  });
});
