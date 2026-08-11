import { describe, expect, test } from "bun:test";
import {
  isByteIdenticalWorkbookUpload,
  nativeWorkbookErrorReference,
  selectProductPreviewPages
} from "./native-workbooks";

describe("native workbook processing errors", () => {
  test("creates a short support reference without exposing internal details", () => {
    expect(nativeWorkbookErrorReference("3b463b20-44a8-45a3-8af8-f79ce1cbf7f5"))
      .toBe("NW-3B463B20");
  });
});

describe("native workbook identical-upload guard", () => {
  test("recognizes the same SHA-256 fingerprint before AI indexing", () => {
    expect(isByteIdenticalWorkbookUpload({
      candidateFingerprint: "ABC123",
      publishedFingerprint: "abc123"
    })).toBe(true);
  });

  test("does not reject a genuinely changed PDF", () => {
    expect(isByteIdenticalWorkbookUpload({
      candidateFingerprint: "candidate",
      publishedFingerprint: "published"
    })).toBe(false);
    expect(isByteIdenticalWorkbookUpload({
      candidateFingerprint: "candidate",
      publishedFingerprint: null
    })).toBe(false);
  });
});

describe("native workbook marketing previews", () => {
  test("selects the table of contents and representative lessons across the workbook", () => {
    const pages = selectProductPreviewPages({
      sections: [{ title: "Table of Contents", category: "table_of_contents", startPage: 2 }],
      learningUnits: Array.from({ length: 12 }, (_, index) => ({
        title: `Lesson ${index + 1}`,
        components: [{
          role: "practice",
          includeInPacket: true,
          pdfPageStart: 4 + index * 5
        }]
      }))
    }, 80);

    expect(pages).toHaveLength(7);
    expect(pages[0]).toEqual({ pdfPageNumber: 2, label: "Table of contents" });
    expect(pages[1]?.pdfPageNumber).toBe(4);
    expect(pages.at(-1)?.pdfPageNumber).toBe(59);
  });

  test("does not duplicate a contents page that also appears in a lesson range", () => {
    const pages = selectProductPreviewPages({
      sections: [{ title: "Contents", category: "table_of_contents", startPage: 2 }],
      learningUnits: [{ title: "Front matter", components: [{ role: "practice", pdfPageStart: 2 }] }]
    }, 10);

    expect(pages).toEqual([{ pdfPageNumber: 2, label: "Table of contents" }]);
  });
});
