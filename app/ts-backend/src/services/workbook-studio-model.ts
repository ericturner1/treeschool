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

const illustrationSchema = z.object({
  type: z.literal("illustration"),
  illustrationType: stableIdSchema,
  parameters: z.record(z.unknown()).default({}),
  altText: z.string().trim().min(1),
  caption: z.string().trim().optional(),
});

const learnBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    text: z.string().trim().min(1),
  }),
  illustrationSchema,
  z.object({
    type: z.literal("callout"),
    label: z.string().trim().optional(),
    text: z.string().trim().min(1),
    tone: z.enum(["tip", "remember", "example"]).default("tip"),
  }),
  z.object({
    type: z.literal("image_asset"),
    assetId: z.string().uuid().nullable().default(null),
    description: z.string().trim().min(1),
    altText: z.string().trim().min(1),
    generationBrief: z.string().trim().optional(),
  }),
  z.object({
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
    type: z.literal("reading_passage"),
    title: z.string().trim().optional(),
    paragraphs: z.array(z.string().trim().min(1)).min(1),
    attribution: z.string().trim().optional(),
  }),
  z.object({
    type: z.literal("character_practice"),
    character: z.string().trim().min(1).max(8),
    pronunciation: z.string().trim().optional(),
    meaning: z.string().trim().optional(),
    traceRows: z.number().int().min(1).max(8).default(3),
  }),
]);

const exerciseBase = {
  id: stableIdSchema,
  prompt: z.string().trim().min(1),
  standardsCodes: z.array(z.string().trim().min(1)).default([]),
};

const exerciseSchema = z.discriminatedUnion("type", [
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

const lessonSchema = z.object({
  id: stableIdSchema,
  title: z.string().trim().min(1),
  subtitle: z.string().trim().optional(),
  standardsCodes: z.array(z.string().trim().min(1)).default([]),
  needsIllustration: z.boolean().default(false),
  learnBlocks: z.array(learnBlockSchema).min(1),
  exercises: z.array(exerciseSchema).min(1),
  notesForParent: z.string().trim().optional(),
});

const chapterSchema = z.object({
  id: stableIdSchema,
  title: z.string().trim().min(1),
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

        lesson.exercises.forEach((exercise, exerciseIndex) => {
          if (exerciseIds.has(exercise.id)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [
                "chapters",
                chapterIndex,
                "lessons",
                lessonIndex,
                "exercises",
                exerciseIndex,
                "id",
              ],
              message: `Exercise id ${exercise.id} is duplicated.`,
            });
          }
          exerciseIds.add(exercise.id);

          if (exercise.type === "matching") {
            const pairIds = exercise.pairs.map((pair) => pair.id);
            if (
              pairIds.length !== exercise.rightOrder.length ||
              pairIds.some((id) => !exercise.rightOrder.includes(id)) ||
              new Set(exercise.rightOrder).size !== exercise.rightOrder.length
            ) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: [
                  "chapters",
                  chapterIndex,
                  "lessons",
                  lessonIndex,
                  "exercises",
                  exerciseIndex,
                  "rightOrder",
                ],
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
              path: [
                "chapters",
                chapterIndex,
                "lessons",
                lessonIndex,
                "exercises",
                exerciseIndex,
                "correctAnswer",
              ],
              message:
                "The correct answer must be one of the exercise options.",
            });
          }
        });
      });
    });
  });

export type WorkbookContent = z.infer<typeof workbookContentSchema>;
export type WorkbookLesson =
  WorkbookContent["chapters"][number]["lessons"][number];

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

  for (const chapter of content.chapters) {
    for (const lesson of chapter.lessons) {
      const illustrations = lesson.learnBlocks.filter(
        (block) => block.type === "illustration",
      );
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
        lesson.exercises.length !== policy.standardExerciseCount
      ) {
        issues.push({
          severity: "warning",
          code: "nonstandard_exercise_count",
          path: `chapters.${chapter.id}.lessons.${lesson.id}.exercises`,
          message: `${lesson.title} has ${lesson.exercises.length} exercises; the active rule is ${policy.standardExerciseCount}.`,
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
