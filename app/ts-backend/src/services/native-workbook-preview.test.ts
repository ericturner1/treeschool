import { describe, expect, test } from "bun:test";
import {
  buildNativeWorkbookLessonSummaries,
  nativeWorkbookLessonPageIndexes
} from "./native-workbook-preview";

describe("native workbook pre-planning preview", () => {
  test("builds ordered lesson summaries from validated physical page ranges", () => {
    const lessons = buildNativeWorkbookLessonSummaries({
      structureVersion: 3,
      sections: [{ startPage: 4, endPage: 7, notes: "Introduce the penguin passage, then complete its exercises." }],
      learningUnits: [{
        id: "unit-penguins",
        title: "Penguins",
        sequenceOrder: 2,
        estimatedMinutes: 35,
        conceptLabels: ["Reading comprehension"],
        components: [{ pdfPageStart: 4, pdfPageEnd: 5, role: "passage", includeInPacket: true }, { pdfPageStart: 6, pdfPageEnd: 7, role: "practice", includeInPacket: true }]
      }, {
        id: "unit-sounds",
        title: "Letter sounds",
        sequenceOrder: 1,
        estimatedMinutes: 20,
        conceptLabels: ["Phonics"],
        components: [{ pdfPageStart: 2, pdfPageEnd: 3, role: "instruction", includeInPacket: true }]
      }]
    }, 12);

    expect(lessons.map((lesson) => lesson.title)).toEqual(["Letter sounds", "Penguins"]);
    expect(lessons.map((lesson) => lesson.kind)).toEqual(["lesson", "lesson"]);
    expect(lessons[1]?.summary).toBe("Introduce the penguin passage, then complete its exercises.");
    expect(lessons[1]?.pageCount).toBe(4);
    expect(nativeWorkbookLessonPageIndexes(lessons[1]!)).toEqual([3, 4, 5, 6]);
  });

  test("replaces technical index notes with parent-facing summaries and identifies section openers", () => {
    const lessons = buildNativeWorkbookLessonSummaries({
      structureVersion: 3,
      sections: [{ startPage: 4, endPage: 4, notes: "Physical page range matched from the extracted table of contents." }],
      learningUnits: [{
        id: "chapter-1",
        title: "Chapter 1: Citizenship and Rules",
        conceptLabels: ["Chapter 1: Citizenship and Rules"],
        components: [{ pdfPageStart: 4, pdfPageEnd: 4, role: "instruction", includeInPacket: true }]
      }]
    }, 10);

    expect(lessons[0]?.kind).toBe("section");
    expect(lessons[0]?.summary).toBe("Introduces Citizenship and Rules.");
  });

  test("refuses incomplete or out-of-range unit metadata", () => {
    expect(buildNativeWorkbookLessonSummaries({
      structureVersion: 3,
      learningUnits: [{
        id: "bad-unit",
        title: "Bad unit",
        components: [{ pdfPageStart: 8, pdfPageEnd: 14, role: "practice", includeInPacket: true }]
      }]
    }, 10)).toEqual([]);
  });
});
