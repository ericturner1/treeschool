import { describe, expect, test } from "bun:test";
import { catalogItemOverlapsAttachedWorkbooks } from "./native-workbook-recommendations";

describe("native workbook ACC recommendations", () => {
  test("suppresses an updated bundle when its earlier members are already attached", () => {
    const attached = new Set(Array.from({ length: 11 }, (_, index) => `workbook-${index + 1}`));
    const bundle = {
      id: "grade-one-core",
      catalogKind: "bundle" as const,
      memberWorkbookIds: [
        ...Array.from({ length: 11 }, (_, index) => `workbook-${index + 1}`),
        "new-writing-workbook"
      ]
    };

    expect(catalogItemOverlapsAttachedWorkbooks(bundle, attached)).toBe(true);
  });

  test("keeps the newly added workbook eligible as an individual recommendation", () => {
    const attached = new Set(["existing-reading-workbook"]);
    const newWorkbook = {
      id: "new-writing-workbook",
      catalogKind: "workbook" as const
    };

    expect(catalogItemOverlapsAttachedWorkbooks(newWorkbook, attached)).toBe(false);
  });

  test("keeps a completely unrelated bundle eligible", () => {
    const attached = new Set(["existing-reading-workbook"]);
    const bundle = {
      id: "unrelated-bundle",
      catalogKind: "bundle" as const,
      memberWorkbookIds: ["math-one", "science-one"]
    };

    expect(catalogItemOverlapsAttachedWorkbooks(bundle, attached)).toBe(false);
  });
});
