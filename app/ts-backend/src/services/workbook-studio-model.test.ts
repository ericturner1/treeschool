import { describe, expect, test } from "bun:test";
import {
  classifyWorkbookContentChange,
  emptyWorkbookContent,
  flattenWorkbookExercises,
  flattenWorkbookLearnBlocks,
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

  test("persists box styling as a same-edition content revision", () => {
    const previous = validContent();
    const next = structuredClone(previous);
    const lesson = next.chapters[0].lessons[0];
    lesson.boxStyle = { paddingTop: 12, backgroundColor: "#fffaf2" };
    lesson.learnSectionBoxStyle = { marginBottom: 8 };
    lesson.learnBlocks[0].boxStyle = {
      borderColor: "#739e56",
      borderWidth: 2,
      borderRadius: 10,
      borderStyle: "solid",
    };
    lesson.exercises[0].boxStyle = { paddingLeft: 6 };

    const parsed = parseWorkbookContent(next);
    expect(parsed.chapters[0].lessons[0].learnBlocks[0].boxStyle).toEqual(
      lesson.learnBlocks[0].boxStyle,
    );
    expect(classifyWorkbookContentChange(previous, parsed).classification).toBe(
      "revision",
    );
  });

  test("normalizes legacy traceable elements with current guide defaults", () => {
    const content = validContent();
    const raw = structuredClone(content) as unknown as {
      chapters: Array<{
        lessons: Array<{ learnBlocks: unknown[] }>;
      }>;
    };
    raw.chapters[0]!.lessons[0]!.learnBlocks = [
      {
        type: "character_practice",
        character: "木",
        traceRows: 2,
      },
    ];

    const parsed = parseWorkbookContent(raw);
    const traceable = parsed.chapters[0]!.lessons[0]!.learnBlocks[0]!;
    expect(traceable).toMatchObject({
      type: "character_practice",
      columns: 4,
      fontSizePt: 28,
      layoutStyle: "standalone",
      modelWidthPercent: 22,
      boxBackground: "quadrant",
      fadeOut: true,
      startingOpacityPercent: 35,
      fadeStepPercent: 10,
    });
  });

  test("keeps editable traceable content in the practice section", () => {
    const content = validContent();
    const lesson = content.chapters[0].lessons[0];
    lesson.practiceBlocks = [
      { type: "paragraph", text: "Trace, cover, and copy." },
      {
        type: "character_practice",
        character: "こんにちは",
        meaning: "hello",
        traceRows: 1,
        columns: 2,
        fontSizePt: 19,
        layoutStyle: "compact_row",
        modelWidthPercent: 27,
        boxBackground: "blank",
        fadeOut: true,
        startingOpacityPercent: 15,
        fadeStepPercent: 15,
      },
    ];
    lesson.exercises = [];

    const parsed = parseWorkbookContent(content);
    expect(parsed.chapters[0].lessons[0].practiceBlocks).toHaveLength(2);
    expect(parsed.chapters[0].lessons[0].exercises).toEqual([]);
    expect(validateWorkbookForPublish(parsed, {
      standardExerciseCount: null,
      requireFlaggedIllustrations: false,
    })).toEqual([]);
  });

  test("normalizes legacy passages and preserves structured bold text", () => {
    const content = validContent();
    const raw = structuredClone(content) as unknown as {
      chapters: Array<{
        lessons: Array<{ learnBlocks: unknown[] }>;
      }>;
    };
    raw.chapters[0]!.lessons[0]!.learnBlocks = [
      {
        type: "reading_passage",
        paragraphs: ["Read this carefully."],
        richParagraphs: [
          {
            runs: [
              { text: "Read this ", bold: false },
              { text: "carefully", bold: true },
              { text: ".", bold: false },
            ],
          },
        ],
      },
    ];

    const parsed = parseWorkbookContent(raw);
    const passage = parsed.chapters[0]!.lessons[0]!.learnBlocks[0]!;
    expect(passage).toMatchObject({
      type: "reading_passage",
      fontSizePt: 12,
      richParagraphs: [
        {
          runs: [
            { text: "Read this ", bold: false },
            { text: "carefully", bold: true },
            { text: ".", bold: false },
          ],
        },
      ],
    });
  });

  test("persists layout rows without changing lesson compatibility", () => {
    const previous = validContent();
    const next = structuredClone(previous);
    const lesson = next.chapters[0].lessons[0];
    const learnBlock = lesson.learnBlocks[0];
    const exercises = lesson.exercises.slice(0, 2);
    if (learnBlock.type === "layout_row") throw new Error("Unexpected row fixture");
    const leftExercise = exercises[0];
    const rightExercise = exercises[1];
    if (
      !leftExercise ||
      !rightExercise ||
      leftExercise.type === "layout_row" ||
      rightExercise.type === "layout_row"
    ) {
      throw new Error("Unexpected row fixture");
    }
    lesson.learnBlocks = [
      {
        id: "learn-row-1",
        type: "layout_row",
        columns: [
          { id: "learn-column-1", blocks: [learnBlock] },
          { id: "learn-column-2", blocks: [] },
        ],
      },
    ];
    lesson.exercises = [
      {
        id: "practice-row-1",
        type: "layout_row",
        columns: [
          { id: "practice-column-1", exercises: [leftExercise] },
          { id: "practice-column-2", exercises: [rightExercise] },
        ],
      },
      ...lesson.exercises.slice(2),
    ];

    const parsed = parseWorkbookContent(next);
    expect(flattenWorkbookLearnBlocks(parsed.chapters[0].lessons[0].learnBlocks)).toHaveLength(1);
    expect(flattenWorkbookExercises(parsed.chapters[0].lessons[0].exercises)).toHaveLength(5);
    expect(classifyWorkbookContentChange(previous, parsed).classification).toBe(
      "revision",
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

  test("persists an uploaded image and accepts it as a required visual", () => {
    const content = validContent();
    content.chapters[0].lessons[0].needsIllustration = true;
    content.chapters[0].lessons[0].learnBlocks = [
      {
        type: "image_asset",
        assetId: "11111111-1111-4111-8111-111111111111",
        contentType: "image/png",
        pixelWidth: 1200,
        pixelHeight: 800,
        description: "A tree diagram",
        altText: "A labeled tree diagram",
        caption: "Parts of a tree",
        widthPercent: 65,
        alignment: "center",
      },
    ];

    const parsed = parseWorkbookContent(content);
    expect(parsed.chapters[0].lessons[0].learnBlocks[0]).toMatchObject({
      type: "image_asset",
      widthPercent: 65,
      alignment: "center",
    });
    expect(validateWorkbookForPublish(parsed)).not.toContainEqual(
      expect.objectContaining({ code: "missing_required_illustration" }),
    );
  });

  test("persists QR code data, its printed description, and size", () => {
    const content = validContent();
    content.chapters[0].lessons[0].learnBlocks.push({
      type: "qr_code",
      data: "https://www.treehomeschool.com/lessons/guitar-a-1",
      description: "Scan to hear the chord progression.",
      sizeMm: 42,
    });

    const parsed = parseWorkbookContent(content);
    expect(parsed.chapters[0].lessons[0].learnBlocks.at(-1)).toEqual({
      type: "qr_code",
      data: "https://www.treehomeschool.com/lessons/guitar-a-1",
      description: "Scan to hear the chord progression.",
      sizeMm: 42,
    });
  });

  test("persists uploaded sounds and blocks empty sound elements at publish", () => {
    const content = validContent();
    content.chapters[0].lessons[0].learnBlocks.push({
      type: "sound_asset",
      assetId: "22222222-2222-4222-8222-222222222222",
      contentType: "audio/mpeg",
      fileName: "g-major-chord.mp3",
      sizeBytes: 48_000,
      description: "Listen to a G major chord.",
      qrSizeMm: 38,
    });

    const parsed = parseWorkbookContent(content);
    expect(parsed.chapters[0].lessons[0].learnBlocks.at(-1)).toMatchObject({
      type: "sound_asset",
      contentType: "audio/mpeg",
      description: "Listen to a G major chord.",
      qrSizeMm: 38,
    });
    expect(validateWorkbookForPublish(parsed)).not.toContainEqual(
      expect.objectContaining({ code: "missing_sound_asset" }),
    );

    const draft = structuredClone(parsed);
    const sound = draft.chapters[0].lessons[0].learnBlocks.at(-1);
    if (sound?.type !== "sound_asset") throw new Error("Missing sound fixture");
    sound.assetId = null;
    sound.contentType = null;
    sound.fileName = null;
    sound.sizeBytes = null;
    expect(validateWorkbookForPublish(draft)).toContainEqual(
      expect.objectContaining({ code: "missing_sound_asset" }),
    );
  });

  test("rejects incomplete uploaded-image metadata", () => {
    const content = validContent();
    content.chapters[0].lessons[0].learnBlocks = [
      {
        type: "image_asset",
        assetId: "11111111-1111-4111-8111-111111111111",
        description: "A tree diagram",
        altText: "A labeled tree diagram",
      } as never,
    ];

    expect(() => parseWorkbookContent(content)).toThrow(
      "requires both an asset id and content type",
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

  test("rejects unsafe workbook box-style values", () => {
    const content = validContent();
    content.chapters[0].lessons[0].boxStyle = {
      backgroundColor: "url(javascript:alert(1))",
    } as never;

    expect(() => parseWorkbookContent(content)).toThrow(
      "Use a six-digit hex color",
    );
  });
});
