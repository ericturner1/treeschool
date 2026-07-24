import { describe, expect, test } from "bun:test";
import {
  buildPageNumberMappingFromObservedPoints,
  contentPageNumberToPdfPageNumber,
  createPageSelectionAudit,
  pdfPageNumberToContentPageNumber
} from "./pdf-page-numbers";

describe("page-number conversion metadata", () => {
  test("builds a bidirectional mapping from consistent observed page numbers", () => {
    const mapping = buildPageNumberMappingFromObservedPoints({
      points: [
        { pdfPageNumber: 5, contentPageNumber: 1 },
        { pdfPageNumber: 15, contentPageNumber: 11 },
        { pdfPageNumber: 25, contentPageNumber: 21 }
      ],
      pdfPageCount: 30,
      source: "ai_visual_ocr",
      confidence: "medium",
      location: "bottom_right",
      sampledPdfPages: [5, 15, 25],
      note: "Test observations"
    });

    expect(mapping?.globalFormat?.location).toBe("bottom_right");
    expect(contentPageNumberToPdfPageNumber(mapping, 11)).toBe(15);
    expect(pdfPageNumberToContentPageNumber(mapping, 20)).toBe(16);
  });

  test("records converter use even when a selected endpoint is not mapped", () => {
    const mapping = buildPageNumberMappingFromObservedPoints({
      points: [
        { pdfPageNumber: 5, contentPageNumber: 1 },
        { pdfPageNumber: 10, contentPageNumber: 6 }
      ],
      pdfPageCount: 20,
      source: "embedded_text_corners",
      confidence: "medium",
      location: "bottom_center",
      sampledPdfPages: [5, 10],
      note: "Test observations"
    });
    const audit = createPageSelectionAudit(mapping, 8, 12);

    expect(audit.used).toBe(true);
    expect(audit.startConversionStatus).toBe("resolved");
    expect(audit.endConversionStatus).toBe("unmapped");
    expect(audit.contentPageStart).toBe(4);
    expect(audit.contentPageEnd).toBeNull();
  });
});
