import { describe, expect, test } from "bun:test";
import {
  classifyWorkbookContentChange,
  emptyWorkbookContent,
  parseWorkbookContent,
  validateWorkbookForPublish,
  workbookLessonIdFingerprint,
} from "./workbook-studio-model";

function validContent() {
  const content = emptyWorkbookContent({
    title: "Math A",
    editionLabel: "1st Edition",
    gradeLabel: "Grade 1",
    subjectLabel: "Math",
  });
  content.chapters[0].lessons[0].exercises = Array.from(
    { length: 5 },
    (_, index) => ({
      id: `lesson-1-1-exercise-${index + 1}`,
      type: "short_answer" as const,
      prompt: `Question ${index + 1}`,
      correctAnswer: `Answer ${index + 1}`,
      standardsCodes: [],
      writingLines: 3,
    }),
  );
  return parseWorkbookContent(content);
}

describe("Workbook Studio content compatibility", () => {
  test("allows a same-edition revision when wording and page flow may change", () => {
    const previous = validContent();
    const next = structuredClone(previous);
    next.chapters[0].lessons[0].learnBlocks[0] = {
      type: "paragraph",
      text: "This longer correction may move content onto another PDF page.",
    };

    expect(classifyWorkbookContentChange(previous, next)).toEqual({
      classification: "revision",
      addedLessonIds: [],
      removedLessonIds: [],
      pageCountConsidered: false,
    });
    expect(workbookLessonIdFingerprint(next)).toBe(
      workbookLessonIdFingerprint(previous),
    );
  });

  test("requires an edition when a lesson is added", () => {
    const previous = validContent();
    const next = structuredClone(previous);
    next.chapters[0].lessons.push({
      ...structuredClone(next.chapters[0].lessons[0]),
      id: "lesson-1-2",
      title: "A new lesson",
      exercises: next.chapters[0].lessons[0].exercises.map(
        (exercise, index) => ({
          ...exercise,
          id: `lesson-1-2-exercise-${index + 1}`,
        }),
      ),
    });

    expect(classifyWorkbookContentChange(previous, next).classification).toBe(
      "edition",
    );
    expect(
      classifyWorkbookContentChange(previous, next).addedLessonIds,
    ).toEqual(["lesson-1-2"]);
  });

  test("detects a replacement even when the numeric lesson count is unchanged", () => {
    const previous = validContent();
    const next = structuredClone(previous);
    next.chapters[0].lessons[0].id = "replacement-lesson";

    expect(classifyWorkbookContentChange(previous, next)).toMatchObject({
      classification: "edition",
      addedLessonIds: ["replacement-lesson"],
      removedLessonIds: ["lesson-1-1"],
    });
  });
});

describe("Workbook Studio validation", () => {
  test("blocks a required illustration that is missing", () => {
    const content = validContent();
    content.chapters[0].lessons[0].needsIllustration = true;

    expect(validateWorkbookForPublish(content)).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "missing_required_illustration",
      }),
    );
  });

  test("uses the active structured exercise-count policy", () => {
    const content = validContent();

    expect(
      validateWorkbookForPublish(content, {
        standardExerciseCount: 4,
        requireFlaggedIllustrations: true,
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: "nonstandard_exercise_count",
        message: expect.stringContaining("active rule is 4"),
      }),
    );
  });

  test("rejects duplicate stable lesson ids", () => {
    const content = validContent();
    content.chapters[0].lessons.push(
      structuredClone(content.chapters[0].lessons[0]),
    );

    expect(() => parseWorkbookContent(content)).toThrow("duplicated");
  });
});
