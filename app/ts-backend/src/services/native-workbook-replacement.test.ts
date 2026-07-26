import { describe, expect, test } from "bun:test";
import { checkWorkbookReplacementCompatibility } from "./native-workbook-replacement";

function analysis(units: Array<{
  title: string;
  components: Array<{ pdfPageStart: number; pdfPageEnd: number; includeInPacket?: boolean }>;
}>) {
  return { structureVersion: 3, learningUnits: units };
}

const published = analysis([
  {
    title: "Lesson 1.1 — What Makes Sound?",
    components: [
      { pdfPageStart: 5, pdfPageEnd: 6 },
      { pdfPageStart: 7, pdfPageEnd: 7 }
    ]
  },
  {
    title: "Lesson 1.2 — Light and Shadows",
    components: [{ pdfPageStart: 8, pdfPageEnd: 10 }]
  }
]);

describe("workbook PDF replacement compatibility", () => {
  test("accepts the same lesson order and physical ranges", () => {
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 12,
      replacementPageCount: 12,
      currentAnalysis: published,
      replacementAnalysis: analysis([
        {
          title: "What Makes Sound?",
          components: [{ pdfPageStart: 5, pdfPageEnd: 7 }]
        },
        {
          title: "Light and Shadows",
          components: [{ pdfPageStart: 8, pdfPageEnd: 10 }]
        }
      ])
    });

    expect(result.compatible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test("rejects a changed page count", () => {
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 12,
      replacementPageCount: 13,
      currentAnalysis: published,
      replacementAnalysis: published
    });

    expect(result.compatible).toBe(false);
    expect(result.reasons[0]).toContain("13 pages");
  });

  test("rejects moved lesson boundaries", () => {
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 12,
      replacementPageCount: 12,
      currentAnalysis: published,
      replacementAnalysis: analysis([
        {
          title: "What Makes Sound?",
          components: [{ pdfPageStart: 5, pdfPageEnd: 8 }]
        },
        {
          title: "Light and Shadows",
          components: [{ pdfPageStart: 9, pdfPageEnd: 10 }]
        }
      ])
    });

    expect(result.compatible).toBe(false);
    expect(result.reasons).toContain("Lesson 1 no longer uses the same physical page range.");
  });

  test("rejects reordered or renamed lessons", () => {
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 12,
      replacementPageCount: 12,
      currentAnalysis: published,
      replacementAnalysis: analysis([
        {
          title: "Light and Shadows",
          components: [{ pdfPageStart: 5, pdfPageEnd: 7 }]
        },
        {
          title: "What Makes Sound?",
          components: [{ pdfPageStart: 8, pdfPageEnd: 10 }]
        }
      ])
    });

    expect(result.compatible).toBe(false);
    expect(result.reasons).toContain("Lesson 1 no longer has the same title or sequence position.");
  });

  test("rejects materially changed lesson text even when its boundaries match", () => {
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 12,
      replacementPageCount: 12,
      currentAnalysis: published,
      replacementAnalysis: published,
      currentPageTexts: Array.from({ length: 12 }, (_, index) =>
        index >= 4 && index <= 6
          ? "Sound is made by vibrations. Observe and compare loud and quiet sounds."
          : "Light travels and creates a shadow when an object blocks it."
      ),
      replacementPageTexts: Array.from({ length: 12 }, (_, index) =>
        index >= 4 && index <= 6
          ? "Plants need sunlight soil water roots stems flowers and leaves to grow."
          : "Light travels and creates a shadow when an object blocks it."
      )
    });

    expect(result.compatible).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("content changed too much"))).toBe(true);
  });
});
