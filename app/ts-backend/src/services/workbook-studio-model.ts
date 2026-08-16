import { createHash } from "node:crypto";
import { z } from "zod";

const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i,
    "Use a stable letter/number id with dashes or underscores.",
  );

export const workbookBoxStyleSchema = z.object({
  marginTop: z.number().min(-200).max(200).optional(),
  marginRight: z.number().min(-200).max(200).optional(),
  marginBottom: z.number().min(-200).max(200).optional(),
  marginLeft: z.number().min(-200).max(200).optional(),
  paddingTop: z.number().min(0).max(200).optional(),
  paddingRight: z.number().min(0).max(200).optional(),
  paddingBottom: z.number().min(0).max(200).optional(),
  paddingLeft: z.number().min(0).max(200).optional(),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color.")
    .optional(),
  borderColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color.")
    .optional(),
  borderWidth: z.number().min(0).max(20).optional(),
  borderRadius: z.number().min(0).max(200).optional(),
  borderStyle: z.enum(["none", "solid", "dashed", "dotted"]).optional(),
});

const workbookBoxStyleField = {
  boxStyle: workbookBoxStyleSchema.optional(),
};

const illustrationSchema = z.object({
  ...workbookBoxStyleField,
  type: z.literal("illustration"),
  illustrationType: stableIdSchema,
  parameters: z.record(z.unknown()).default({}),
  altText: z.string().trim().min(1),
  caption: z.string().trim().optional(),
});

const learnBlockLeafSchema = z.discriminatedUnion("type", [
  z.object({
    ...workbookBoxStyleField,
    type: z.literal("paragraph"),
    text: z.string().trim().min(1),
  }),
  illustrationSchema,
  z.object({
    ...workbookBoxStyleField,
    type: z.literal("callout"),
    label: z.string().trim().optional(),
    text: z.string().trim().min(1),
    tone: z.enum(["tip", "remember", "example"]).default("tip"),
  }),
  z.object({
    ...workbookBoxStyleField,
    type: z.literal("image_asset"),
    assetId: z.string().uuid().nullable().default(null),
    contentType: z
      .enum(["image/jpeg", "image/png", "image/webp"])
      .nullable()
      .default(null),
    pixelWidth: z.number().int().min(1).max(10_000).nullable().default(null),
    pixelHeight: z.number().int().min(1).max(10_000).nullable().default(null),
    description: z.string().trim().min(1),
    altText: z.string().trim().min(1),
    caption: z.string().trim().optional(),
    widthPercent: z.number().int().min(10).max(100).default(100),
    alignment: z.enum(["left", "center", "right"]).default("center"),
    generationBrief: z.string().trim().optional(),
  }),
  z.object({
    ...workbookBoxStyleField,
    type: z.literal("qr_code"),
    data: z.string().trim().min(1).max(2_048),
    description: z.string().trim().min(1).max(500),
    sizeMm: z.number().int().min(20).max(80).default(35),
  }),
  z.object({
    ...workbookBoxStyleField,
    type: z.literal("sound_asset"),
    assetId: z.string().uuid().nullable().default(null),
    contentType: z
      .enum(["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"])
      .nullable()
      .default(null),
    fileName: z.string().trim().max(255).nullable().default(null),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(30 * 1024 * 1024)
      .nullable()
      .default(null),
    description: z.string().trim().min(1).max(500),
    qrSizeMm: z.number().int().min(20).max(80).default(35),
  }),
  z.object({
    ...workbookBoxStyleField,
    type: z.literal("vocabulary_list"),
    title: z.string().trim().optional(),
    entries: z
      .array(
        z.object({
          term: z.string().trim().min(1),
          pronunciation: z.string().trim().optional(),
          definition: z.string().trim().min(1),
        }),
      )
      .min(1),
  }),
  z.object({
    ...workbookBoxStyleField,
    type: z.literal("reading_passage"),
    title: z.string().trim().optional(),
    paragraphs: z.array(z.string().trim().min(1)).min(1),
    richParagraphs: z
      .array(
        z.object({
          runs: z
            .array(
              z.object({
                text: z.string().min(1),
                bold: z.boolean().default(false),
              }),
            )
            .min(1),
        }),
      )
      .min(1)
      .optional(),
    fontSizePt: z.number().int().min(8).max(36).default(12),
    attribution: z.string().trim().optional(),
  }),
  z.object({
    ...workbookBoxStyleField,
    type: z.literal("character_practice"),
    character: z.string().trim().min(1).max(120),
    pronunciation: z.string().trim().optional(),
    meaning: z.string().trim().optional(),
    traceRows: z.number().int().min(1).max(8).default(3),
    columns: z.number().int().min(1).max(12).default(4),
    fontSizePt: z.number().int().min(8).max(72).default(28),
    layoutStyle: z.enum(["standalone", "compact_row"]).default("standalone"),
    modelWidthPercent: z.number().int().min(15).max(60).default(22),
    boxBackground: z
      .enum(["quadrant", "blank", "handwriting_lines"])
      .default("quadrant"),
    fadeOut: z.boolean().default(true),
    startingOpacityPercent: z.number().int().min(0).max(100).default(35),
    fadeStepPercent: z.number().int().min(0).max(100).default(10),
  }),
]);

const learnLayoutRowSchema = z.object({
  ...workbookBoxStyleField,
  id: stableIdSchema,
  type: z.literal("layout_row"),
  columnGap: z.number().min(0).max(100).optional(),
  columns: z
    .array(
      z.object({
        id: stableIdSchema,
        blocks: z.array(learnBlockLeafSchema).max(30).default([]),
      }),
    )
    .min(1)
    .max(4),
});

const learnBlockSchema = z.union([learnBlockLeafSchema, learnLayoutRowSchema]);

const exerciseBase = {
  ...workbookBoxStyleField,
  id: stableIdSchema,
  prompt: z.string().trim().min(1),
  answerKeyText: z.string().trim().min(1).optional(),
  standardsCodes: z.array(z.string().trim().min(1)).default([]),
};

const exerciseLeafSchema = z.discriminatedUnion("type", [
  z.object({
    ...exerciseBase,
    type: z.literal("circle_choice"),
    options: z.array(z.string().trim().min(1)).min(2),
    correctAnswer: z.string().trim().min(1),
  }),
  z.object({
    ...exerciseBase,
    type: z.literal("multiple_choice"),
    options: z.array(z.string().trim().min(1)).min(2),
    correctAnswer: z.string().trim().min(1),
  }),
  z.object({
    ...exerciseBase,
    type: z.literal("matching"),
    leftLabel: z.string().trim().min(1).default("Item"),
    rightLabel: z.string().trim().min(1).default("Match"),
    pairs: z
      .array(
        z.object({
          id: stableIdSchema,
          left: z.string().trim().min(1),
          right: z.string().trim().min(1),
        }),
      )
      .min(2),
    rightOrder: z.array(stableIdSchema).min(2),
  }),
  z.object({
    ...exerciseBase,
    type: z.literal("fill_in_blank"),
    correctAnswer: z.string().trim().min(1),
  }),
  z.object({
    ...exerciseBase,
    type: z.literal("short_answer"),
    correctAnswer: z.union([
      z.string().trim().min(1),
      z.array(z.string().trim().min(1)).min(1),
    ]),
    writingLines: z.number().int().min(1).max(12).default(3),
  }),
  z.object({
    ...exerciseBase,
    type: z.literal("write"),
    sampleAnswer: z.string().trim().min(1),
    writingLines: z.number().int().min(1).max(12).default(5),
  }),
  z.object({
    ...exerciseBase,
    type: z.literal("draw_box"),
    sampleAnswer: z.string().trim().min(1),
    boxHeightMm: z.number().min(20).max(160).default(60),
  }),
]);

const practiceLayoutRowSchema = z.object({
  ...workbookBoxStyleField,
  id: stableIdSchema,
  type: z.literal("layout_row"),
  columnGap: z.number().min(0).max(100).optional(),
  columns: z
    .array(
      z.object({
        id: stableIdSchema,
        exercises: z.array(exerciseLeafSchema).max(30).default([]),
      }),
    )
    .min(1)
    .max(4),
});

const practiceItemSchema = z.union([
  exerciseLeafSchema,
  practiceLayoutRowSchema,
]);

const lessonSchema = z.object({
  id: stableIdSchema,
  title: z.string().trim().min(1),
  subtitle: z.string().trim().optional(),
  boxStyle: workbookBoxStyleSchema.optional(),
  learnSectionBoxStyle: workbookBoxStyleSchema.optional(),
  practiceSectionBoxStyle: workbookBoxStyleSchema.optional(),
  standardsCodes: z.array(z.string().trim().min(1)).default([]),
  needsIllustration: z.boolean().default(false),
  learnBlocks: z.array(learnBlockSchema).min(1),
  practiceBlocks: z.array(learnBlockSchema).default([]),
  exercises: z.array(practiceItemSchema).default([]),
  notesForParent: z.string().trim().optional(),
});

const chapterSchema = z.object({
  id: stableIdSchema,
  title: z.string().trim().min(1),
  tocTitle: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  lessons: z.array(lessonSchema).min(1),
});

export const workbookContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1),
    subtitle: z.string().trim().optional(),
    editionLabel: z.string().trim().min(1),
    gradeLabel: z.string().trim().min(1),
    subjectLabel: z.string().trim().min(1),
    isCore: z.boolean().default(true),
    introduction: z.array(learnBlockSchema).default([]),
    chapters: z.array(chapterSchema).min(1),
  })
  .superRefine((content, context) => {
    const chapterIds = new Set<string>();
    const lessonIds = new Set<string>();
    const exerciseIds = new Set<string>();
    const validateLearnBlock = (
      block: (typeof content.introduction)[number],
      path: Array<string | number>,
    ) => {
      if (block.type === "layout_row") {
        block.columns.forEach((column, columnIndex) => {
          column.blocks.forEach((child, childIndex) =>
            validateLearnBlock(child, [
              ...path,
              "columns",
              columnIndex,
              "blocks",
              childIndex,
            ]),
          );
        });
        return;
      }
      if (
        block.type === "image_asset" &&
        (block.assetId === null) !== (block.contentType === null)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "assetId"],
          message:
            "An uploaded workbook image requires both an asset id and content type.",
        });
      }
      if (
        block.type === "sound_asset" &&
        ((block.assetId === null) !== (block.contentType === null) ||
          (block.assetId === null) !== (block.sizeBytes === null))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "assetId"],
          message:
            "An uploaded workbook sound requires an asset id, content type, and file size.",
        });
      }
    };

    content.introduction.forEach((block, blockIndex) =>
      validateLearnBlock(block, ["introduction", blockIndex]),
    );

    content.chapters.forEach((chapter, chapterIndex) => {
      if (chapterIds.has(chapter.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["chapters", chapterIndex, "id"],
          message: `Chapter id ${chapter.id} is duplicated.`,
        });
      }
      chapterIds.add(chapter.id);

      chapter.lessons.forEach((lesson, lessonIndex) => {
        if (lessonIds.has(lesson.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["chapters", chapterIndex, "lessons", lessonIndex, "id"],
            message: `Lesson id ${lesson.id} is duplicated.`,
          });
        }
        lessonIds.add(lesson.id);
        lesson.learnBlocks.forEach((block, blockIndex) =>
          validateLearnBlock(block, [
            "chapters",
            chapterIndex,
            "lessons",
            lessonIndex,
            "learnBlocks",
            blockIndex,
          ]),
        );
        lesson.practiceBlocks.forEach((block, blockIndex) =>
          validateLearnBlock(block, [
            "chapters",
            chapterIndex,
            "lessons",
            lessonIndex,
            "practiceBlocks",
            blockIndex,
          ]),
        );

        const validateExercise = (
          exercise: (typeof lesson.exercises)[number],
          exercisePath: Array<string | number>,
        ) => {
          if (exerciseIds.has(exercise.id)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...exercisePath, "id"],
              message: `Exercise id ${exercise.id} is duplicated.`,
            });
          }
          exerciseIds.add(exercise.id);

          if (exercise.type === "layout_row") {
            exercise.columns.forEach((column, columnIndex) => {
              column.exercises.forEach((child, childIndex) =>
                validateExercise(child, [
                  ...exercisePath,
                  "columns",
                  columnIndex,
                  "exercises",
                  childIndex,
                ]),
              );
            });
            return;
          }

          if (exercise.type === "matching") {
            const pairIds = exercise.pairs.map((pair) => pair.id);
            if (
              pairIds.length !== exercise.rightOrder.length ||
              pairIds.some((id) => !exercise.rightOrder.includes(id)) ||
              new Set(exercise.rightOrder).size !== exercise.rightOrder.length
            ) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: [...exercisePath, "rightOrder"],
                message:
                  "Matching rightOrder must contain every pair id exactly once.",
              });
            }
          }

          if (
            (exercise.type === "circle_choice" ||
              exercise.type === "multiple_choice") &&
            !exercise.options.includes(exercise.correctAnswer)
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...exercisePath, "correctAnswer"],
              message:
                "The correct answer must be one of the exercise options.",
            });
          }
        };

        lesson.exercises.forEach((exercise, exerciseIndex) =>
          validateExercise(exercise, [
            "chapters",
            chapterIndex,
            "lessons",
            lessonIndex,
            "exercises",
            exerciseIndex,
          ]),
        );
      });
    });
  });

export type WorkbookContent = z.infer<typeof workbookContentSchema>;
export type WorkbookLesson =
  WorkbookContent["chapters"][number]["lessons"][number];
export type WorkbookLearnBlock = WorkbookLesson["learnBlocks"][number];
export type WorkbookLearnBlockLeaf = Exclude<
  WorkbookLearnBlock,
  { type: "layout_row" }
>;
export type WorkbookPracticeItem = WorkbookLesson["exercises"][number];
export type WorkbookExercise = Exclude<
  WorkbookPracticeItem,
  { type: "layout_row" }
>;

export function flattenWorkbookLearnBlocks(
  blocks: WorkbookLearnBlock[],
): WorkbookLearnBlockLeaf[] {
  return blocks.flatMap((block) =>
    block.type === "layout_row"
      ? block.columns.flatMap((column) => column.blocks)
      : [block],
  );
}

export function flattenWorkbookExercises(
  items: WorkbookPracticeItem[],
): WorkbookExercise[] {
  return items.flatMap((item) =>
    item.type === "layout_row"
      ? item.columns.flatMap((column) => column.exercises)
      : [item],
  );
}

export type WorkbookValidationIssue = {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

export function parseWorkbookContent(value: unknown) {
  return workbookContentSchema.parse(value);
}

export function workbookLessonIds(content: WorkbookContent) {
  return content.chapters.flatMap((chapter) =>
    chapter.lessons.map((lesson) => lesson.id),
  );
}

export function workbookLessonIdFingerprint(content: WorkbookContent) {
  const ids = [...workbookLessonIds(content)].sort();
  return createHash("sha256").update(JSON.stringify(ids)).digest("hex");
}

export function classifyWorkbookContentChange(
  previous: WorkbookContent | null,
  next: WorkbookContent,
) {
  if (!previous) {
    return {
      classification: "first_release" as const,
      addedLessonIds: workbookLessonIds(next),
      removedLessonIds: [],
      pageCountConsidered: false,
    };
  }

  const previousIds = new Set(workbookLessonIds(previous));
  const nextIds = new Set(workbookLessonIds(next));
  const addedLessonIds = [...nextIds]
    .filter((id) => !previousIds.has(id))
    .sort();
  const removedLessonIds = [...previousIds]
    .filter((id) => !nextIds.has(id))
    .sort();

  return {
    classification:
      addedLessonIds.length || removedLessonIds.length
        ? ("edition" as const)
        : ("revision" as const),
    addedLessonIds,
    removedLessonIds,
    pageCountConsidered: false,
  };
}

export type WorkbookValidationPolicy = {
  standardExerciseCount: number | null;
  requireFlaggedIllustrations: boolean;
};

const defaultWorkbookValidationPolicy: WorkbookValidationPolicy = {
  standardExerciseCount: 5,
  requireFlaggedIllustrations: true,
};

export function validateWorkbookForPublish(
  content: WorkbookContent,
  policy: WorkbookValidationPolicy = defaultWorkbookValidationPolicy,
): WorkbookValidationIssue[] {
  const issues: WorkbookValidationIssue[] = [];

  for (const block of flattenWorkbookLearnBlocks(content.introduction)) {
    if (block.type === "sound_asset" && !block.assetId) {
      issues.push({
        severity: "error",
        code: "missing_sound_asset",
        path: "introduction",
        message: "An introduction sound element needs an uploaded sound file.",
      });
    }
  }

  for (const chapter of content.chapters) {
    for (const lesson of chapter.lessons) {
      const learnBlocks = [
        ...flattenWorkbookLearnBlocks(lesson.learnBlocks),
        ...flattenWorkbookLearnBlocks(lesson.practiceBlocks),
      ];
      const illustrations = learnBlocks.filter(
        (block) =>
          block.type === "illustration" ||
          (block.type === "image_asset" && block.assetId !== null),
      );
      for (const block of learnBlocks) {
        if (block.type === "sound_asset" && !block.assetId) {
          issues.push({
            severity: "error",
            code: "missing_sound_asset",
            path: `chapters.${chapter.id}.lessons.${lesson.id}.learnBlocks`,
            message: `${lesson.title} has a sound element without an uploaded sound file.`,
          });
        }
      }
      if (
        policy.requireFlaggedIllustrations &&
        lesson.needsIllustration &&
        illustrations.length === 0
      ) {
        issues.push({
          severity: "error",
          code: "missing_required_illustration",
          path: `chapters.${chapter.id}.lessons.${lesson.id}.learnBlocks`,
          message: `${lesson.title} is marked as needing an illustration but has none.`,
        });
      }
      if (
        policy.standardExerciseCount !== null &&
        flattenWorkbookExercises(lesson.exercises).length !==
          policy.standardExerciseCount
      ) {
        issues.push({
          severity: "warning",
          code: "nonstandard_exercise_count",
          path: `chapters.${chapter.id}.lessons.${lesson.id}.exercises`,
          message: `${lesson.title} has ${flattenWorkbookExercises(lesson.exercises).length} exercises; the active rule is ${policy.standardExerciseCount}.`,
        });
      }
    }
  }

  return issues;
}

export function emptyWorkbookContent(input: {
  title: string;
  editionLabel: string;
  gradeLabel: string;
  subjectLabel: string;
  isCore?: boolean;
}): WorkbookContent {
  return {
    schemaVersion: 1,
    title: input.title,
    editionLabel: input.editionLabel,
    gradeLabel: input.gradeLabel,
    subjectLabel: input.subjectLabel,
    isCore: input.isCore ?? true,
    introduction: [],
    chapters: [
      {
        id: "chapter-1",
        title: "Chapter 1",
        lessons: [
          {
            id: "lesson-1-1",
            title: "New lesson",
            standardsCodes: [],
            needsIllustration: false,
            learnBlocks: [
              { type: "paragraph", text: "Add the lesson introduction here." },
            ],
            practiceBlocks: [],
            exercises: [
              {
                id: "lesson-1-1-exercise-1",
                type: "short_answer",
                prompt: "Add the first question here.",
                correctAnswer: "Add the answer here.",
                standardsCodes: [],
                writingLines: 3,
              },
            ],
          },
        ],
      },
    ],
  };
}
