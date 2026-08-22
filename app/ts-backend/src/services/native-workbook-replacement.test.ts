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

  test("accepts a changed page count when the lessons are unchanged", () => {
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 12,
      replacementPageCount: 13,
      currentAnalysis: published,
      replacementAnalysis: published
    });

    expect(result.compatible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test("accepts moved lesson boundaries when the lessons are unchanged", () => {
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

    expect(result.compatible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test("accepts numbered-only chapter titles as complete manifest entries", () => {
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 12,
      replacementPageCount: 13,
      currentAnalysis: analysis([
        {
          title: "Chapter 1.1",
          components: [{ pdfPageStart: 5, pdfPageEnd: 7 }]
        }
      ]),
      replacementAnalysis: analysis([
        {
          title: "Lesson 1.1",
          components: [{ pdfPageStart: 6, pdfPageEnd: 9 }]
        }
      ])
    });

    expect(result.compatible).toBe(true);
    expect(result.currentLessonCount).toBe(1);
    expect(result.replacementLessonCount).toBe(1);
    expect(result.reasons).toEqual([]);
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

  test("rejects an added or deleted lesson", () => {
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 12,
      replacementPageCount: 12,
      currentAnalysis: published,
      replacementAnalysis: analysis([published.learningUnits[0]!])
    });

    expect(result.compatible).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("1 lessons"))).toBe(true);
  });
});
