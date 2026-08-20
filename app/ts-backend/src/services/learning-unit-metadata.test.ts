import { describe, expect, test } from "bun:test";
import {
  buildLearningUnitMetadata,
  learningUnitBaseTitle,
  normalizeGeneratedWeek,
  normalizeSupportScope,
  pageTitleMatchScore,
  parseTableOfContentsEntries,
  looksLikeTableOfContents,
  resolveStructuredSectionClassification,
  titleMatchVariants
} from "./paper-plans";
import {
  createPageSelectionAudit,
  normalizePageNumberMapping,
  type PageNumberMapping
} from "./pdf-page-numbers";

const mapping = normalizePageNumberMapping({
  source: "embedded_text_corners",
  confidence: "high",
  segments: [{
    pdfPageStart: 4,
    pdfPageEnd: 10,
    contentPageStart: 1,
    contentPageEnd: 7
  }]
}, 10) as PageNumberMapping;

const pages = [
  "Cover",
  "Publishing information",
  "Table of Contents",
  "Introduction & Tips",
  "Some tips on using our leveled readers",
  "List of Vocabulary Words",
  "Penguins I am a bird, but I do not fly.",
  "Penguins Reading comprehension questions and exercises",
  "Penguins vocabulary exercises",
  "Penguins Answers:"
].map((text, pageIndex) => ({ pageIndex, label: null, text }));

const sections = [
  {
    title: "Front matter",
    startPage: 1,
    endPage: 2,
    estimatedMinutes: 1,
    notes: "",
    category: "unclear" as const,
    includeInPlan: false,
    classificationConfidence: "high" as const,
    exclusionReason: "Not teaching content.",
    supportScope: null,
    boundaryConfidence: "high" as const,
    boundaryEvidence: [],
    pageSelectionAudit: createPageSelectionAudit(mapping, 1, 2)
  },
  {
    title: "Table of contents",
    startPage: 3,
    endPage: 3,
    estimatedMinutes: 1,
    notes: "",
    category: "table_of_contents" as const,
    includeInPlan: false,
    classificationConfidence: "high" as const,
    exclusionReason: "Navigation.",
    supportScope: null,
    boundaryConfidence: "high" as const,
    boundaryEvidence: [],
    pageSelectionAudit: createPageSelectionAudit(mapping, 3, 3)
  },
  {
    title: "Introduction & Tips",
    startPage: 4,
    endPage: 5,
    estimatedMinutes: 1,
    notes: "",
    category: "supporting_content" as const,
    includeInPlan: false,
    classificationConfidence: "high" as const,
    exclusionReason: "Parent guidance.",
    supportScope: "parent_guidance" as const,
    boundaryConfidence: "high" as const,
    boundaryEvidence: [],
    pageSelectionAudit: createPageSelectionAudit(mapping, 4, 5)
  },
  {
    title: "List of Vocabulary Words",
    startPage: 6,
    endPage: 6,
    estimatedMinutes: 1,
    notes: "",
    category: "supporting_content" as const,
    includeInPlan: false,
    classificationConfidence: "high" as const,
    exclusionReason: "Global reference.",
    supportScope: "global" as const,
    boundaryConfidence: "high" as const,
    boundaryEvidence: [],
    pageSelectionAudit: createPageSelectionAudit(mapping, 6, 6)
  },
  {
    title: "Stories & Exercises: Penguins",
    startPage: 7,
    endPage: 10,
    estimatedMinutes: 35,
    notes: "",
    category: "mixed_teaching" as const,
    includeInPlan: true,
    classificationConfidence: "high" as const,
    exclusionReason: null,
    supportScope: null,
    boundaryConfidence: "high" as const,
    boundaryEvidence: [{
      source: "table_of_contents" as const,
      pdfPageNumber: 7,
      detail: "Printed page 4 maps to physical page 7.",
      confidence: "high" as const
    }],
    pageSelectionAudit: createPageSelectionAudit(mapping, 7, 10)
  }
];

describe("learning-unit metadata V3", () => {
  test("parses extracted TOC dot leaders without an AI call", () => {
    const parsed = parseTableOfContentsEntries(`Table of Contents
Introduction & Tips
....................................................................1
Stories & Exercises:
Penguins ................................................................4
Jack
'
s Birdhouse .............................................................68
More from K5 Learning
...................................................................84`);

    expect(parsed).toEqual([
      { title: "Introduction & Tips", printedStartPage: "1" },
      { title: "Penguins", printedStartPage: "4" },
      { title: "Jack's Birdhouse", printedStartPage: "68" },
      { title: "More from K5 Learning", printedStartPage: "84" }
    ]);
  });

  test("parses numbered lesson entries when a TOC has no dot leaders", () => {
    const parsed = parseTableOfContentsEntries(`Table of Contents
1. Lesson 4.3 — Comparing Data 64
2. Lesson 5.1 — What Makes a Shape 70
3. Lesson 5.2 — Building and Drawing Shapes 73
4. Lesson 5.3 — Combining Shapes 77
5. Lesson 5.4 — Halves and Fourths 80
Answer Key 83`);

    expect(parsed).toEqual([
      { title: "Lesson 4.3 — Comparing Data", printedStartPage: "64" },
      { title: "Lesson 5.1 — What Makes a Shape", printedStartPage: "70" },
      { title: "Lesson 5.2 — Building and Drawing Shapes", printedStartPage: "73" },
      { title: "Lesson 5.3 — Combining Shapes", printedStartPage: "77" },
      { title: "Lesson 5.4 — Halves and Fourths", printedStartPage: "80" },
      { title: "Answer Key", printedStartPage: "83" }
    ]);
  });

  test("parses generic numbered workbook lessons without an AI call", () => {
    const parsed = parseTableOfContentsEntries(`Table of Contents
1. Vocabulary Summary 4
2. In the Garden 5
3. A New Puppy 8
4. The Shy Squirrel 11
5. Helpers at School 14
6. Rainy Day Fun 17
7. My Loose Tooth 20`);

    expect(parsed).toEqual([
      { title: "Vocabulary Summary", printedStartPage: "4" },
      { title: "In the Garden", printedStartPage: "5" },
      { title: "A New Puppy", printedStartPage: "8" },
      { title: "The Shy Squirrel", printedStartPage: "11" },
      { title: "Helpers at School", printedStartPage: "14" },
      { title: "Rainy Day Fun", printedStartPage: "17" },
      { title: "My Loose Tooth", printedStartPage: "20" }
    ]);
  });

  test("keeps a plainly named story range when its pages contain explicit lesson evidence", () => {
    expect(resolveStructuredSectionClassification({
      category: "unclear",
      supportScope: null,
      title: "In the Garden",
      role: "student",
      openingText: "WORD BANK garden seed. Student Exercises: circle the answer.",
      closingText: "For parents only - answer key"
    })).toEqual({
      category: "mixed_teaching",
      supportScope: null,
      includeInPlan: true
    });
  });

  test("keeps workbook-wide vocabulary summaries out of the lesson plan", () => {
    expect(resolveStructuredSectionClassification({
      category: "mixed_teaching",
      supportScope: null,
      title: "Vocabulary Summary",
      role: "student",
      openingText: "Every word your child will meet in this workbook."
    })).toEqual({
      category: "supporting_content",
      supportScope: "global",
      includeInPlan: false
    });
  });

  test("recognizes a table-of-contents continuation page with plain numbered lessons", () => {
    expect(looksLikeTableOfContents(`3. Lesson 4.3 — Reading a Graph 66
Chapter 5: Shapes and Fractions
1. Lesson 5.1 — What Makes a Shape 70
2. Lesson 5.2 — Building and Drawing Shapes 73
3. Lesson 5.3 — Combining Shapes 76
4. Lesson 5.4 — Halves and Fourths 79`)).toBe(true);
  });

  test("matches a grouped TOC title to its leaf lesson title", () => {
    expect(titleMatchVariants("Stories & Exercises: Penguins")).toContain("penguins");
    expect(pageTitleMatchScore("Penguins I am a bird, but I do not fly.", "Stories & Exercises: Penguins")).toBe(1);
    expect(pageTitleMatchScore(
      "Please visit the store for more workbooks from K5 Learning.",
      "More from K5 Learning"
    )).toBeLessThan(1);
    expect(pageTitleMatchScore(
      "More from K5 Learning Math Workbooks",
      "More from K5 Learning"
    )).toBe(1);
  });

  test("creates one atomic Penguins unit and excludes general front matter", () => {
    const result = buildLearningUnitMetadata({
      label: "Reading Level D",
      role: "student",
      pageCount: 10,
      pages,
      pageNumberMapping: mapping,
      sections
    });

    expect(result.documentQuality.status).toBe("passed");
    expect(result.learningUnits).toHaveLength(1);
    expect(result.learningUnits[0]?.title).toBe("Penguins");
    expect(result.learningUnits[0]?.components[0]?.pdfPageStart).toBe(7);
    expect(result.learningUnits[0]?.components.at(-1)?.pdfPageEnd).toBe(10);
    expect(result.learningUnits[0]?.components.at(-1)?.category).toBe("answer_key");
    expect(result.pageLedger[3]?.includeInPlan).toBe(false);
    expect(result.pageLedger[5]?.supportScope).toBe("global");
    expect(result.pageLedger[5]?.includeInPlan).toBe(false);
    expect(result.pageLedger[6]?.contentPageNumber).toBe(4);
    expect(result.pageLedger[6]?.learningUnitId).toBe(result.learningUnits[0]?.id);
  });

  test("fuses adjacent story, exercise, and answer sections into one indivisible lesson", () => {
    const splitLessonSections = [
      ...sections.slice(0, 4),
      {
        ...sections[4]!,
        title: "Penguins Story",
        startPage: 7,
        endPage: 7,
        category: "concept_introduction" as const,
        pageSelectionAudit: createPageSelectionAudit(mapping, 7, 7)
      },
      {
        ...sections[4]!,
        title: "Penguins Exercises",
        startPage: 8,
        endPage: 9,
        category: "concept_practice" as const,
        pageSelectionAudit: createPageSelectionAudit(mapping, 8, 9)
      },
      {
        ...sections[4]!,
        title: "Penguins Answers",
        startPage: 10,
        endPage: 10,
        category: "answer_key" as const,
        pageSelectionAudit: createPageSelectionAudit(mapping, 10, 10)
      }
    ];
    const result = buildLearningUnitMetadata({
      label: "Reading Level D",
      role: "student",
      pageCount: 10,
      pages,
      pageNumberMapping: mapping,
      sections: splitLessonSections
    });

    expect(learningUnitBaseTitle("Penguins (Exercises)")).toBe("Penguins");
    expect(learningUnitBaseTitle("Penguins Answers")).toBe("Penguins");
    expect(learningUnitBaseTitle("Penguins - Reading Passage")).toBe("Penguins");
    expect(result.learningUnits).toHaveLength(1);
    expect(result.learningUnits[0]?.title).toBe("Penguins");
    expect(result.learningUnits[0]?.components.map((component) => [
      component.pdfPageStart,
      component.pdfPageEnd,
      component.category
    ])).toEqual([
      [7, 7, "concept_introduction"],
      [8, 9, "concept_practice"],
      [10, 10, "answer_key"]
    ]);
    expect(new Set(result.pageLedger.slice(6).map((page) => page.learningUnitId)).size).toBe(1);
  });

  test("splits an explicit one-page-per-letter practice collection into schedulable units", () => {
    const result = buildLearningUnitMetadata({
      label: "Cursive",
      role: "student",
      pageCount: 3,
      pages: [
        { pageIndex: 0, label: null, text: "Cursive A" },
        { pageIndex: 1, label: null, text: "Cursive B" },
        { pageIndex: 2, label: null, text: "Cursive C" }
      ],
      pageNumberMapping: null,
      sections: [{
        title: "Cursive Letter Practice: A-C",
        startPage: 1,
        endPage: 3,
        estimatedMinutes: 60,
        notes: "",
        category: "concept_practice",
        includeInPlan: true,
        classificationConfidence: "high",
        exclusionReason: null,
        supportScope: null,
        boundaryConfidence: "high",
        boundaryEvidence: [],
        pageSelectionAudit: createPageSelectionAudit(null, 1, 3)
      }]
    });

    expect(result.documentQuality.status).toBe("passed");
    expect(result.learningUnits.map((unit) => unit.title)).toEqual([
      "Cursive Letter A",
      "Cursive Letter B",
      "Cursive Letter C"
    ]);
    expect(result.learningUnits.map((unit) => unit.components[0]?.pdfPageStart)).toEqual([1, 2, 3]);
  });

  test("marks traceable writing pages as full-size in the persisted page ledger", () => {
    const result = buildLearningUnitMetadata({
      label: "Japanese A",
      role: "student",
      pageCount: 2,
      pages: [
        { pageIndex: 0, label: null, text: "あ を みて こえに だしましょう" },
        { pageIndex: 1, label: null, text: "もじを なぞって、じぶんで かいて みましょう" },
      ],
      pageNumberMapping: null,
      sections: [{
        title: "Hiragana あ",
        startPage: 1,
        endPage: 2,
        estimatedMinutes: 30,
        notes: "",
        category: "concept_practice",
        includeInPlan: true,
        classificationConfidence: "high",
        exclusionReason: null,
        supportScope: null,
        boundaryConfidence: "high",
        boundaryEvidence: [],
        pageSelectionAudit: createPageSelectionAudit(null, 1, 2),
      }],
    });

    expect(result.pageLedger[0]?.compactPrintPolicy).toBe("shrink");
    expect(result.pageLedger[1]?.compactPrintPolicy).toBe("full_size_only");
    expect(result.pageLedger[1]?.compactPrintReason).toContain("full-size");
  });

  test("does not let an AI-provided unit scope schedule obvious parent guidance", () => {
    expect(normalizeSupportScope(
      "unit",
      "Introduction & Tips",
      "teacher_guidance",
      "mixed"
    )).toBe("parent_guidance");
    expect(normalizeSupportScope(
      "unit",
      "List of Vocabulary Words",
      "supporting_content",
      "student"
    )).toBe("global");
  });

  test("does not split one multi-page unit merely to fill five teaching days", () => {
    const metadata = buildLearningUnitMetadata({
      label: "Reading Level D",
      role: "student",
      pageCount: 10,
      pages,
      pageNumberMapping: mapping,
      sections
    });
    const unit = metadata.learningUnits[0]!;
    const week = normalizeGeneratedWeek({
      weekNumber: 1,
      summary: "Read Penguins.",
      items: [{
        documentId: "document-1",
        learningUnitId: unit.id,
        label: unit.title,
        subjectTitle: "Reading",
        dayNumber: 1,
        conceptLabels: ["Penguins"],
        conceptRedundant: false,
        redundancyReason: null
      }]
    }, [{
      id: "document-1",
      label: "Reading Level D",
      pageCount: 10,
      subjectId: null,
      subjectLabel: "Reading",
      documentRole: "student",
      analysisJson: {
        structureVersion: 3,
        classificationVersion: 3,
        documentQuality: metadata.documentQuality,
        pageLedger: metadata.pageLedger,
        learningUnits: metadata.learningUnits,
        pageNumberMapping: mapping,
        sections
      }
    }], 1, 5);

    expect(new Set(week.items.map((item) => item.sourceUnitId))).toEqual(new Set([unit.id]));
    expect(new Set(week.items.map((item) => item.dayNumber))).toEqual(new Set([1]));
    expect(week.items[0]?.firstPageIndex).toBe(6);
    expect(week.items.at(-1)?.lastPageIndex).toBe(9);
  });
});
