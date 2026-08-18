import { describe, expect, test } from "bun:test";
import {
  createFunnelPageRow,
  emptyFunnelPageDocument,
  funnelDocumentHasForwardAction,
  getFunnelDocumentTitle,
  removeFunnelPageColumn,
  resizeFunnelPageRow,
  type FunnelPageElement,
} from "./page-document";

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

  test("resizes rows without discarding content", () => {
    const row = createFunnelPageRow(4);
    row.columns.forEach((column, index) => {
      column.elements.push({
        id: `text_${index}`,
        type: "text",
        props: { text: String(index), style: "body", align: "left" },
      } satisfies FunnelPageElement);
    });

    const resized = resizeFunnelPageRow(row, 2);

    expect(resized.columns).toHaveLength(2);
    expect(resized.columns.map((column) => column.span)).toEqual([6, 6]);
    expect(resized.columns.flatMap((column) => column.elements).map((element) => element.id)).toEqual([
      "text_0",
      "text_1",
      "text_2",
      "text_3",
    ]);
  });

  test("removes a selected column without discarding its elements", () => {
    const row = createFunnelPageRow(3);
    row.columns[0]!.elements.push({
      id: "text_left",
      type: "text",
      props: { text: "Left", style: "body", align: "left" },
    });
    row.columns[1]!.elements.push({
      id: "text_middle",
      type: "text",
      props: { text: "Keep me", style: "body", align: "left" },
    });
    row.columns[2]!.elements.push({
      id: "text_right",
      type: "text",
      props: { text: "Right", style: "body", align: "left" },
    });

    const resized = removeFunnelPageColumn(row, 1);

    expect(resized.columns).toHaveLength(2);
    expect(resized.columns.map((column) => column.span)).toEqual([6, 6]);
    expect(resized.columns.flatMap((column) => column.elements).map((element) => element.id)).toEqual([
      "text_left",
      "text_middle",
      "text_right",
    ]);
  });

  test("preserves nested rows when resizing or removing columns", () => {
    const row = createFunnelPageRow(3);
    const nested = createFunnelPageRow(2);
    row.columns[2]!.rows = [nested];

    const resized = resizeFunnelPageRow(row, 2);
    expect(resized.columns[1]!.rows?.[0]?.id).toBe(nested.id);

    const removed = removeFunnelPageColumn(row, 2);
    expect(removed.columns[1]!.rows?.[0]?.id).toBe(nested.id);
  });

  test("finds headings and forward actions inside nested rows", () => {
    const document = emptyFunnelPageDocument("Outer heading");
    document.sections[0]!.rows[0]!.columns[0]!.elements = [];
    const nested = createFunnelPageRow(1);
    nested.columns[0]!.elements = [
      { id: "nested_heading", type: "heading", props: { text: "Nested heading", level: "h1", align: "left" } },
      { id: "nested_button", type: "button", props: { label: "Continue", variant: "primary", align: "left", action: { type: "next_step" } } },
    ];
    document.sections[0]!.rows[0]!.columns[0]!.rows = [nested];

    expect(getFunnelDocumentTitle(document)).toBe("Nested heading");
    expect(funnelDocumentHasForwardAction(document)).toBe(true);
  });
});
