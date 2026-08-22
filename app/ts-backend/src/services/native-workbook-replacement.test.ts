import { describe, expect, test } from "bun:test";
import {
  checkWorkbookReplacementCompatibility,
  readLessonManifest
} from "./native-workbook-replacement";

function analysis(units: Array<{
  title: string;
  components: Array<{
    pdfPageStart: number;
    pdfPageEnd: number;
    includeInPacket?: boolean;
    role?: string;
  }>;
}>) {
  return { structureVersion: 3, learningUnits: units };
}

function fragmentAnalysis(fragments: Array<{ title: string; roles: string[] }>) {
  let page = 1;
  return analysis(fragments.map((fragment) => ({
    title: fragment.title,
    components: fragment.roles.map((role) => ({
      pdfPageStart: page,
      pdfPageEnd: page++,
      role
    }))
  })));
}

const kokugoLessonNumbers = [
  "1.1", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2", "5.1", "6.1", "6.2"
];

function publishedKokugoAnalysis() {
  const fragments: Array<{ title: string; roles: string[] }> = [];
  for (const chapter of [1, 2, 3, 4, 5, 6]) {
    fragments.push({
      title: `Chapter ${chapter}: Chapter introduction`,
      roles: ["instruction"]
    });
    for (const lessonNumber of kokugoLessonNumbers.filter((number) =>
      number.startsWith(`${chapter}.`)
    )) {
      fragments.push({
        title: `Chapter ${lessonNumber}: Lesson subject ${lessonNumber}`,
        roles: ["instruction"]
      });
      fragments.push({
        title: `Chapter ${lessonNumber}`,
        roles: ["practice", "answer_key"]
      });
    }
  }
  return fragmentAnalysis(fragments);
}

function replacementKokugoAnalysis(lessonCount = kokugoLessonNumbers.length) {
  const fragments: Array<{ title: string; roles: string[] }> = [];
  const includedLessons = kokugoLessonNumbers.slice(0, lessonCount);
  let lessonIndex = 0;
  for (const chapter of [1, 2, 3, 4, 5, 6]) {
    const chapterLessons = includedLessons.filter((number) => number.startsWith(`${chapter}.`));
    if (!chapterLessons.length) continue;
    fragments.push({
      title: `Chapter ${chapter}: Chapter reference`,
      roles: ["reference"]
    });
    for (const lessonNumber of chapterLessons) {
      const subject = `学習内容${lessonNumber.replace(".", "・")}`;
      if (lessonIndex < 7) {
        fragments.push({ title: `Kanji Introduction: ${subject}`, roles: ["instruction"] });
        fragments.push({ title: `Practice: ${subject}`, roles: ["practice"] });
        fragments.push({ title: `Answer Key: ${subject}`, roles: ["answer_key"] });
      } else if (lessonIndex === 7) {
        fragments.push({ title: `Kanji Introduction: ${subject}`, roles: ["instruction"] });
        fragments.push({ title: `Answer Key: ${subject}`, roles: ["answer_key"] });
      } else {
        fragments.push({ title: `Practice: ${subject}`, roles: ["practice"] });
        fragments.push({ title: `Answer Key: ${subject}`, roles: ["answer_key"] });
      }
      lessonIndex += 1;
    }
  }
  return fragmentAnalysis(fragments);
}

function japaneseReplacementKokugoAnalysis() {
  const fragments: Array<{ title: string; roles: string[] }> = [];
  let lessonIndex = 0;
  for (const chapter of [1, 2, 3, 4, 5, 6]) {
    fragments.push({ title: `だい${chapter}しょう`, roles: ["reference"] });
    for (const lessonNumber of kokugoLessonNumbers.filter((number) =>
      number.startsWith(`${chapter}.`)
    )) {
      const subject = `学習内容${lessonNumber.replace(".", "・")}`;
      if (lessonIndex < 7) {
        fragments.push({ title: `漢字導入: ${subject}`, roles: ["instruction"] });
        fragments.push({ title: `漢字練習: ${subject}`, roles: ["practice"] });
        fragments.push({ title: `解答: ${subject}`, roles: ["answer_key"] });
      } else {
        fragments.push({ title: subject, roles: [lessonIndex === 7 ? "instruction" : "practice"] });
        fragments.push({ title: `解答: ${subject}`, roles: ["answer_key"] });
      }
      lessonIndex += 1;
    }
  }
  return fragmentAnalysis(fragments);
}

function overcountedReplacementKokugoAnalysis() {
  const fragments: Array<{ title: string; roles: string[] }> = [];
  kokugoLessonNumbers.forEach((lessonNumber, lessonIndex) => {
    const subject = `Topic ${lessonNumber}`;
    fragments.push({ title: `Lesson material: ${subject}`, roles: ["instruction"] });
    if (lessonIndex < 7) {
      // Simulates an AI run that gives the practice page a different title,
      // causing title-based grouping to incorrectly count it as a new lesson.
      fragments.push({ title: `Independent worksheet ${lessonIndex + 1}`, roles: ["practice"] });
    }
    fragments.push({ title: `Answers for ${subject}`, roles: ["answer_key"] });
  });
  return fragmentAnalysis(fragments);
}

function kokugoPageTexts(numbers = kokugoLessonNumbers) {
  return [
    `もくじ ${numbers.map((number) => `${number} — title`).join(" ")}`,
    ...numbers.map((number) => `だい ${number.split(".")[0]} しょう ${number} — lesson title`)
  ];
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

  test("compares logical lessons rather than AI-generated Kokugo page fragments", () => {
    const currentAnalysis = publishedKokugoAnalysis();
    const replacementAnalysis = replacementKokugoAnalysis();

    expect(currentAnalysis.learningUnits).toHaveLength(26);
    expect(replacementAnalysis.learningUnits).toHaveLength(33);
    expect(readLessonManifest(currentAnalysis)).toHaveLength(10);
    expect(readLessonManifest(replacementAnalysis)).toHaveLength(10);

    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 60,
      replacementPageCount: 60,
      currentAnalysis,
      replacementAnalysis
    });

    expect(result.compatible).toBe(true);
    expect(result.currentLessonCount).toBe(10);
    expect(result.replacementLessonCount).toBe(10);
    expect(result.reasons).toEqual([]);
  });

  test("groups Japanese instruction, practice, and answer labels into lessons", () => {
    const replacementAnalysis = japaneseReplacementKokugoAnalysis();
    expect(replacementAnalysis.learningUnits).toHaveLength(33);
    expect(readLessonManifest(replacementAnalysis)).toHaveLength(10);

    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 60,
      replacementPageCount: 60,
      currentAnalysis: publishedKokugoAnalysis(),
      replacementAnalysis
    });

    expect(result.compatible).toBe(true);
    expect(result.currentLessonCount).toBe(10);
    expect(result.replacementLessonCount).toBe(10);
  });

  test("uses stable printed lesson ids when AI splits practice into extra logical lessons", () => {
    const replacementAnalysis = overcountedReplacementKokugoAnalysis();
    expect(readLessonManifest(replacementAnalysis)).toHaveLength(17);

    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 60,
      replacementPageCount: 60,
      currentAnalysis: publishedKokugoAnalysis(),
      replacementAnalysis,
      currentPageTexts: kokugoPageTexts(),
      replacementPageTexts: kokugoPageTexts()
    });

    expect(result.compatible).toBe(true);
    expect(result.currentLessonCount).toBe(10);
    expect(result.replacementLessonCount).toBe(10);
    expect(result.reasons).toEqual([]);
  });

  test("still rejects a deleted lesson when printed ids establish the published contract", () => {
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 60,
      replacementPageCount: 58,
      currentAnalysis: publishedKokugoAnalysis(),
      replacementAnalysis: overcountedReplacementKokugoAnalysis(),
      currentPageTexts: kokugoPageTexts(),
      replacementPageTexts: kokugoPageTexts(kokugoLessonNumbers.slice(0, -1))
    });

    expect(result.compatible).toBe(false);
    expect(result.currentLessonCount).toBe(10);
    expect(result.replacementLessonCount).toBe(9);
    expect(result.reasons).toContain(
      "The replacement contains 9 printed lessons; the published workbook contains 10."
    );
  });

  test("still rejects a deleted logical lesson when page-fragment counts differ", () => {
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 60,
      replacementPageCount: 58,
      currentAnalysis: publishedKokugoAnalysis(),
      replacementAnalysis: replacementKokugoAnalysis(9)
    });

    expect(result.compatible).toBe(false);
    expect(result.currentLessonCount).toBe(10);
    expect(result.replacementLessonCount).toBe(9);
    expect(result.reasons).toContain(
      "The replacement contains 9 logical lessons; the published workbook contains 10."
    );
  });

  test("rejects reordered logical lessons when both PDFs expose stable numbering", () => {
    const numbered = (numbers: string[]) => fragmentAnalysis(numbers.map((number) => ({
      title: `Lesson ${number}: Topic ${number}`,
      roles: ["instruction"]
    })));
    const result = checkWorkbookReplacementCompatibility({
      currentPageCount: 4,
      replacementPageCount: 4,
      currentAnalysis: numbered(["1.1", "1.2"]),
      replacementAnalysis: numbered(["1.2", "1.1"])
    });

    expect(result.compatible).toBe(false);
    expect(result.reasons).toContain(
      "Logical lesson 1 no longer has the same printed number or sequence position."
    );
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
    expect(result.reasons.some((reason) => reason.includes("1 logical lessons"))).toBe(true);
  });
});
