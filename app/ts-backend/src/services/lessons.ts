import { and, asc, eq, sql } from "drizzle-orm";
import {
  curriculumNodes,
  lessonGenerationJobs,
  lessonAttempts,
  lessons,
  nodeTranslations,
  profileCurriculumEnrollments,
  profiles,
  skills
} from "ts-db";
import { db, env } from "../db";
import { getLocaleAssets } from "./locales";
import { evaluateSession } from "./mastery";
import {
  buildLessonAssetPath,
  getSignedLessonAssetUrl,
  uploadFromUrl,
  uploadLessonAsset
} from "./media";
import {
  type GeneratedLessonBlueprint,
  generateLessonBlueprint,
  generateQuizImageAsset,
  generateSlideImageAsset,
  synthesizeNarrationAudio,
  validateTeachingSlide,
  validateQuizQuestion
} from "./lesson-generation";
import { getStreakStatus, recordActivity } from "./streaks";
import { getNodeTechnicalVocabularyContext } from "./vocabulary";

type LessonContext = {
  profile: {
    id: string;
    age: number | null;
    birthDate: string | Date | null;
    gradeLevel: number | null;
    languageCode: string;
    localeId: string | null;
  };
  node: {
    id: string;
    slug: string | null;
    type: string;
    title: string;
    description: string | null;
    objective: string | null;
    standard: string | null;
    introducedInWeek: number | null;
    displayOrder: number;
    difficulty: number | null;
    masteryThreshold: number | null;
  };
  prompt: {
    system: {
      role: string;
      studentAge: number | null;
      studentGradeLevel: number | null;
      pedagogicalTone: string;
      visualConstraint: string | null;
    };
    locale: Awaited<ReturnType<typeof getLocaleAssets>> | null;
    vocabulary: {
      whitelist: string[];
      technicalKeywords: string[];
      missingTechnicalKeywords: Array<{
        word: string;
        definitionSimple: string | null;
        preferredSynonym: string | null;
      }>;
    };
    regionalSubstitutions: Array<{
      name: string;
      displayValue: string;
    }>;
  };
};

type LessonPrompt = {
  systemPrompt: Array<string | null>;
  context: LessonContext;
};

type LessonElementFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RichTextSegment = {
  text: string;
  emphasis?: "normal" | "bold";
};

type StoredLessonSlide = {
  id: string;
  elements: Array<
    | {
        id: string;
        type: "text";
        role: "title" | "body";
        text: string;
        segments: RichTextSegment[];
        frame: LessonElementFrame;
      }
    | {
        id: string;
        type: "image";
        role: "primary";
        frame: LessonElementFrame;
        asset: {
          objectPath: string;
          alt: string;
          prompt: string;
        };
      }
  >;
  narrationSegments: Array<{
    id: string;
    role: "title" | "body";
    objectPath: string;
    transcript: string;
    voiceName: string;
    languageCode: string;
  }>;
  interactions: Array<{
    id: string;
    trigger: {
      type: "tap" | "audioEnded";
      targetId: string;
    };
    actions: Array<
      | {
          type: "playAudio";
          audioId: string;
        }
      | {
          type: "markSlideComplete";
        }
    >;
  }>;
  completionRules: Array<
    | {
        type: "audioEnded";
        audioId: string;
      }
    | {
        type: "interactionCompleted";
        interactionId: string;
      }
  >;
};

type StoredLessonQuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  correctChoiceIndex: number;
  explanation: string;
  audio: {
    prompt: {
      objectPath: string;
      transcript: string;
      voiceName: string;
      languageCode: string;
    };
    choices: Array<{
      objectPath: string;
      transcript: string;
      voiceName: string;
      languageCode: string;
    }>;
  };
  image?: {
    objectPath: string;
    alt: string;
  } | null;
};

type StoredLessonContent = {
  version: "interactive_v8";
  stages: Array<
    | {
        id: string;
        type: "slideDeck";
        slideDeck: {
          title: string;
          objective: string | null;
          summary: string;
          progress: {
            completedSlideIds: string[];
          };
          slides: StoredLessonSlide[];
        };
      }
    | {
        id: string;
        type: "quiz";
        quiz: {
          title: string;
          passingScore: number;
          progress?: {
            completedQuestionIds: string[];
          };
          questions: StoredLessonQuizQuestion[];
        };
      }
  >;
};

type ClientLesson = {
  id: string;
  profileId: string;
  nodeId: string;
  languageCode: string;
  title: string;
  status: string;
  generationLogs: LessonGenerationLogEntry[];
  promptJson: LessonPrompt;
  contentJson: {
    version: "interactive_v8";
    stages: Array<
      | {
          id: string;
          type: "slideDeck";
          slideDeck: {
            title: string;
            objective: string | null;
            summary: string;
            progress: {
              completedSlideIds: string[];
            };
            slides: Array<{
              id: string;
              elements: Array<
                | {
                    id: string;
                    type: "text";
                    role: "title" | "body";
                    text: string;
                    segments: RichTextSegment[];
                    frame: LessonElementFrame;
                  }
                | {
                    id: string;
                    type: "image";
                    role: "primary";
                    frame: LessonElementFrame;
                    asset: {
                      url: string;
                      alt: string;
                      prompt: string;
                    };
                  }
              >;
              narrationSegments: Array<{
                id: string;
                role: "title" | "body";
                url: string;
                transcript: string;
                voiceName: string;
                languageCode: string;
              }>;
              interactions: StoredLessonSlide["interactions"];
              completionRules: StoredLessonSlide["completionRules"];
            }>;
          };
        }
      | {
          id: string;
          type: "quiz";
          quiz: {
            title: string;
            passingScore: number;
            progress?: {
              completedQuestionIds: string[];
            };
            questions: Array<{
              id: string;
              prompt: string;
              choices: string[];
              correctChoiceIndex: number;
              explanation: string;
              audio: {
                prompt: {
                  url: string;
                  transcript: string;
                  voiceName: string;
                  languageCode: string;
                };
                choices: Array<{
                  url: string;
                  transcript: string;
                  voiceName: string;
                  languageCode: string;
                }>;
              };
              image?: {
                url: string;
                alt: string;
              } | null;
            }>;
          };
        }
    >;
  };
  createdAt: Date;
  updatedAt: Date;
};

type LessonRow = {
  id: string;
  profileId: string;
  nodeId: string;
  languageCode: string;
  title: string;
  status: string;
  promptJson: unknown;
  contentJson: unknown;
  generationLogs: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type LessonGenerationLogEntry = {
  timestamp: string;
  stage: string;
  message: string;
};

const MAX_LESSON_GENERATION_ATTEMPTS = 8;

type LessonGenerationJobRow = {
  id: string;
  lessonId: string;
  status: "queued" | "running" | "retry_wait" | "failed" | "completed";
  attemptCount: number;
  availableAt: Date;
  claimedAt: Date | null;
  heartbeatAt: Date | null;
  workerId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function getLatestGenerationStage(generationLogs: unknown) {
  const logs = parseGenerationLogs(generationLogs);
  return logs.at(-1)?.stage ?? "";
}

function calculateLessonGenerationRetryDelayMs(attemptCount: number) {
  const baseMinutes = env.MAINTENANCE_ERROR_RETRY_MINUTES;
  const multiplier = Math.min(2 ** Math.max(0, attemptCount - 1), 12);
  return baseMinutes * multiplier * 60 * 1000;
}

function isLessonGenerationRetryableError(row: LessonRow) {
  if (row.status === "ready") {
    return false;
  }

  if (getLatestGenerationStage(row.generationLogs) !== "error") {
    return false;
  }

  const updatedAtMs = row.updatedAt instanceof Date ? row.updatedAt.getTime() : new Date(row.updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) {
    return false;
  }

  return Date.now() - updatedAtMs > env.MAINTENANCE_ERROR_RETRY_MINUTES * 60 * 1000;
}

function getPedagogicalTone(age: number | null, gradeLevel: number | null, override?: string | null) {
  if (override?.trim()) {
    return override.trim();
  }

  if (age != null && age <= 6) {
    return "Story-based and concrete";
  }

  if ((gradeLevel ?? 0) <= 1) {
    return "Concrete and encouraging";
  }

  if ((gradeLevel ?? 0) <= 3) {
    return "Hands-on and guided";
  }

  if ((gradeLevel ?? 0) <= 5) {
    return "Practical and exploratory";
  }

  if ((gradeLevel ?? 0) <= 8) {
    return "Structured and direct";
  }

  return "First-principles and concise";
}

function buildRichTextSegments(text: string): RichTextSegment[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [{ text: "" }];
  }

  const matches = Array.from(
    normalized.matchAll(/\b(?:[A-Z]{2,})(?:\s+[A-Z]{2,})*\b/g)
  );

  if (matches.length === 0) {
    return [{ text: normalized }];
  }

  const segments: RichTextSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    const start = match.index ?? 0;
    const raw = match[0];
    const end = start + raw.length;

    if (start > cursor) {
      segments.push({
        text: normalized.slice(cursor, start)
      });
    }

    segments.push({
      text: raw.toLowerCase(),
      emphasis: "bold"
    });

    cursor = end;
  }

  if (cursor < normalized.length) {
    segments.push({
      text: normalized.slice(cursor)
    });
  }

  return segments.filter((segment) => segment.text.length > 0);
}

function getAgeFromBirthDate(birthDate: string | Date | null) {
  if (!birthDate) {
    return null;
  }

  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birth.getUTCMonth();
  const dayDelta = today.getUTCDate() - birth.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return Math.max(age, 0);
}

function validateStoredInteractiveContent(contentJson: unknown) {
  if (!contentJson || typeof contentJson !== "object") {
    return {
      content: null,
      error: "Lesson content is missing."
    } as const;
  }

  const content = contentJson as Partial<StoredLessonContent>;

  if (content.version !== "interactive_v8" || !Array.isArray(content.stages)) {
    return {
      content: null,
      error: "Lesson content shape is invalid."
    } as const;
  }

  const slideDeckStage = content.stages.find(
    (stage): stage is Extract<StoredLessonContent["stages"][number], { type: "slideDeck" }> =>
      !!stage && stage.type === "slideDeck" && !!stage.slideDeck && Array.isArray(stage.slideDeck.slides)
  );
  const quizStage = content.stages.find(
    (stage): stage is Extract<StoredLessonContent["stages"][number], { type: "quiz" }> =>
      !!stage && stage.type === "quiz" && !!stage.quiz && Array.isArray(stage.quiz.questions)
  );

  if (!slideDeckStage || !quizStage) {
    return {
      content: null,
      error: "Lesson stages are incomplete."
    } as const;
  }

  const invalidSlide = slideDeckStage.slideDeck.slides.find(
    (slide) =>
      !slide ||
      typeof slide !== "object" ||
      !Array.isArray(slide.elements) ||
      slide.elements.length === 0 ||
      !Array.isArray(slide.narrationSegments) ||
      slide.narrationSegments.length === 0 ||
      slide.narrationSegments.some(
        (segment) =>
          !segment ||
          typeof segment !== "object" ||
          (segment.role !== "title" && segment.role !== "body") ||
          typeof segment.objectPath !== "string"
      ) ||
      !Array.isArray(slide.completionRules) ||
      !Array.isArray(slide.interactions)
  );

  if (invalidSlide) {
    return {
      content: null,
      error: `Lesson slide is invalid for slide ${(invalidSlide as { id?: string }).id ?? "unknown"}.`
    } as const;
  }

  const invalidQuestion = quizStage.quiz.questions.find(
    (question) =>
      !question ||
      typeof question !== "object" ||
      !Array.isArray(question.choices) ||
      typeof question.correctChoiceIndex !== "number" ||
      question.correctChoiceIndex < 0 ||
      question.correctChoiceIndex >= question.choices.length ||
      !question.audio ||
      typeof question.audio !== "object" ||
      !question.audio.prompt ||
      typeof question.audio.prompt.objectPath !== "string" ||
      !Array.isArray(question.audio.choices) ||
      question.audio.choices.length !== question.choices.length ||
      typeof question.explanation !== "string" ||
      question.explanation.trim().length === 0
  );

  if (invalidQuestion) {
    return {
      content: null,
      error: `Lesson quiz is invalid for question ${(invalidQuestion as { id?: string }).id ?? "unknown"}.`
    } as const;
  }

  return {
    content: content as StoredLessonContent,
    error: null
  } as const;
}

function isLegacyInteractiveV6Content(
  contentJson: unknown
): contentJson is {
  version: "interactive_v6";
  stages: Array<
    | {
        id: string;
        type: "slideDeck";
        slideDeck: {
          title: string;
          objective: string | null;
          summary: string;
          progress: {
            completedSlideIds: string[];
          };
          slides: Array<
            Omit<StoredLessonSlide, "narrationSegments"> & {
              narration: {
                id: string;
                objectPath: string;
                transcript: string;
                voiceName: string;
                languageCode: string;
              };
            }
          >;
        };
      }
    | {
        id: string;
        type: "quiz";
        quiz: {
          title: string;
          passingScore: number;
          questions: StoredLessonQuizQuestion[];
        };
      }
  >;
} {
  if (!contentJson || typeof contentJson !== "object") {
    return false;
  }

  const content = contentJson as { version?: string; stages?: unknown };
  return content.version === "interactive_v6" && Array.isArray(content.stages);
}

async function upgradeLegacyV6LessonContent(row: LessonRow) {
  if (!isLegacyInteractiveV6Content(row.contentJson)) {
    return null;
  }

  const slideDeckStage = row.contentJson.stages.find(
    (stage): stage is Extract<(typeof row.contentJson.stages)[number], { type: "slideDeck" }> =>
      !!stage && stage.type === "slideDeck" && !!stage.slideDeck && Array.isArray(stage.slideDeck.slides)
  );
  const quizStage = row.contentJson.stages.find(
    (stage): stage is Extract<(typeof row.contentJson.stages)[number], { type: "quiz" }> =>
      !!stage && stage.type === "quiz" && !!stage.quiz && Array.isArray(stage.quiz.questions)
  );

  if (!slideDeckStage || !quizStage) {
    return null;
  }

  const upgradedSlides = [] as StoredLessonSlide[];
  let currentLogs =
    (await appendLessonGenerationLog(
      row.id,
      row.generationLogs,
      "audio-upgrade",
      "Upgrading legacy lesson audio into title/body segments."
    ))?.generationLogs ?? parseGenerationLogs(row.generationLogs);

  for (const slide of slideDeckStage.slideDeck.slides) {
    const titleElement = slide.elements.find(
      (element) => element.type === "text" && element.role === "title"
    ) as { text: string } | undefined;
    const bodyElement = slide.elements.find(
      (element) => element.type === "text" && element.role === "body"
    ) as { text: string } | undefined;
    const titleText = titleElement?.text ?? "";
    const bodyText = bodyElement?.text ?? "";

    const titleNarration = await synthesizeStoredAudioSegment({
      profileId: row.profileId,
      nodeId: row.nodeId,
      languageCode: row.languageCode,
      lessonScopedId: `${slide.id}:title`,
      script: titleText
    });
    const bodyNarration = await synthesizeStoredAudioSegment({
      profileId: row.profileId,
      nodeId: row.nodeId,
      languageCode: row.languageCode,
      lessonScopedId: `${slide.id}:body`,
      script: bodyText
    });

    upgradedSlides.push({
      id: slide.id,
      elements: slide.elements.map((element) =>
        element.type === "text"
          ? {
              ...element,
              segments: buildRichTextSegments(element.text)
            }
          : element
      ),
      narrationSegments: [
        { id: `${slide.id}:title`, role: "title", ...titleNarration },
        { id: `${slide.id}:body`, role: "body", ...bodyNarration }
      ],
      interactions: slide.interactions,
      completionRules: slide.completionRules.map((rule) =>
        rule.type === "audioEnded" ? { ...rule, audioId: `${slide.id}:body` } : rule
      )
    });
  }

  currentLogs =
    (await appendLessonGenerationLog(
      row.id,
      currentLogs,
      "audio-upgrade",
      "Legacy lesson audio upgraded."
    ))?.generationLogs ?? currentLogs;

  return {
    version: "interactive_v8" as const,
    stages: [
      {
        id: slideDeckStage.id,
        type: "slideDeck" as const,
        slideDeck: {
          ...slideDeckStage.slideDeck,
          slides: upgradedSlides
        }
      },
      {
        id: quizStage.id,
        type: "quiz" as const,
        quiz: {
          ...quizStage.quiz,
          progress: {
            completedQuestionIds:
              ((quizStage.quiz as { progress?: { completedQuestionIds?: string[] } }).progress
                ?.completedQuestionIds ?? [])
          }
        }
      }
    ],
    generationLogs: currentLogs
  };
}

function getSlideDeckStage(content: StoredLessonContent) {
  return content.stages.find(
    (stage): stage is Extract<StoredLessonContent["stages"][number], { type: "slideDeck" }> =>
      stage.type === "slideDeck"
  );
}

function getQuizStage(content: StoredLessonContent) {
  return content.stages.find(
    (stage): stage is Extract<StoredLessonContent["stages"][number], { type: "quiz" }> =>
      stage.type === "quiz"
  );
}

function parseGenerationLogs(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as LessonGenerationLogEntry[];
  }

  return value
    .filter(
      (entry): entry is LessonGenerationLogEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as LessonGenerationLogEntry).timestamp === "string" &&
        typeof (entry as LessonGenerationLogEntry).stage === "string" &&
        typeof (entry as LessonGenerationLogEntry).message === "string"
    )
    .slice(-20);
}

function isLessonGenerationStale(row: LessonRow) {
  if (row.status === "ready") {
    return false;
  }

  const logs = parseGenerationLogs(row.generationLogs);
  const latest = logs.at(-1);
  if (!latest) {
    return false;
  }

  if (latest.stage === "queued" || latest.stage === "error" || latest.stage === "ready") {
    return false;
  }

  const updatedAtMs = row.updatedAt instanceof Date ? row.updatedAt.getTime() : new Date(row.updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) {
    return false;
  }

  return Date.now() - updatedAtMs > env.MAINTENANCE_STALE_LESSON_MINUTES * 60 * 1000;
}

async function appendLessonGenerationLog(
  lessonId: string,
  existingLogs: unknown,
  stage: string,
  message: string
) {
  const nextLogs = [
    ...parseGenerationLogs(existingLogs),
    {
      timestamp: new Date().toISOString(),
      stage,
      message
    }
  ].slice(-20);

  const [updatedLesson] = await db
    .update(lessons)
    .set({
      generationLogs: nextLogs,
      updatedAt: new Date()
    })
    .where(eq(lessons.id, lessonId))
    .returning({
      id: lessons.id,
      profileId: lessons.profileId,
      nodeId: lessons.nodeId,
      languageCode: lessons.languageCode,
      title: lessons.title,
      status: lessons.status,
      promptJson: lessons.promptJson,
      contentJson: lessons.contentJson,
      generationLogs: lessons.generationLogs,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt
    });

  return (updatedLesson as LessonRow | undefined) ?? null;
}

async function fetchLessonRow(profileId: string, lessonId: string) {
  const [lesson] = await db
    .select({
      id: lessons.id,
      profileId: lessons.profileId,
      nodeId: lessons.nodeId,
      languageCode: lessons.languageCode,
      title: lessons.title,
      status: lessons.status,
      promptJson: lessons.promptJson,
      contentJson: lessons.contentJson,
      generationLogs: lessons.generationLogs,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt
    })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.profileId, profileId)))
    .limit(1);

  return (lesson as LessonRow | undefined) ?? null;
}

async function fetchLessonRowByNode(profileId: string, nodeId: string, languageCode: string) {
  const [lesson] = await db
    .select({
      id: lessons.id,
      profileId: lessons.profileId,
      nodeId: lessons.nodeId,
      languageCode: lessons.languageCode,
      title: lessons.title,
      status: lessons.status,
      promptJson: lessons.promptJson,
      contentJson: lessons.contentJson,
      generationLogs: lessons.generationLogs,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt
    })
    .from(lessons)
    .where(
      and(
        eq(lessons.profileId, profileId),
        eq(lessons.nodeId, nodeId),
        eq(lessons.languageCode, languageCode)
      )
    )
    .limit(1);

  return (lesson as LessonRow | undefined) ?? null;
}

async function synthesizeStoredAudioSegment(input: {
  profileId: string;
  nodeId: string;
  languageCode: string;
  lessonScopedId: string;
  script: string;
}) {
  const narration = await synthesizeNarrationAudio({
    languageCode: input.languageCode,
    script: input.script
  });

  const audioExtension = (() => {
    const match = narration.sourceUrl.match(/\.(mp3|wav|m4a)(?:\?|$)/i);
    return match?.[1]?.toLowerCase() ?? "mp3";
  })();
  const audioContentType =
    audioExtension === "wav" ? "audio/wav" : audioExtension === "m4a" ? "audio/mp4" : "audio/mpeg";
  const objectPath = buildLessonAssetPath({
    profileId: input.profileId,
    nodeId: input.nodeId,
    languageCode: input.languageCode,
    kind: "audio",
    content: `${input.lessonScopedId}:${input.script}`,
    extension: audioExtension
  });

  await uploadFromUrl({
    objectPath,
    contentType: audioContentType,
    sourceUrl: narration.sourceUrl
  });

  return {
    objectPath,
    transcript: narration.script,
    voiceName: narration.voice.displayName,
    languageCode: input.languageCode
  };
}

async function createInteractiveLessonContent(
  lessonId: string,
  profileId: string,
  nodeId: string,
  languageCode: string,
  prompt: LessonPrompt,
  existingLogs: unknown
) {
  const loggedBlueprintStart = await appendLessonGenerationLog(
    lessonId,
    existingLogs,
    "blueprint",
    "Requesting lesson blueprint from Gemini."
  );
  const blueprint = await generateLessonBlueprint(prompt.context);
  const blueprintLogs = loggedBlueprintStart?.generationLogs ?? [];
  const loggedBlueprintReady = await appendLessonGenerationLog(
    lessonId,
    blueprintLogs,
    "blueprint",
    "Lesson blueprint generated."
  );
  let currentLogs = loggedBlueprintReady?.generationLogs ?? blueprintLogs;

  const slides = [] as StoredLessonSlide[];
  for (const [index, slide] of blueprint.slides.slice(0, 3).entries()) {
    let slideImageObjectPath: string | null = null;
    let slideImageMimeType: string | null = null;
    let slideImageDataBase64: string | null = null;
    try {
      currentLogs =
        (await appendLessonGenerationLog(
          lessonId,
          currentLogs,
          "slide-image",
          `Generating slide ${index + 1} image with Gemini.`
        ))?.generationLogs ?? currentLogs;

      const slideImage = await generateSlideImageAsset({
        lessonTitle: blueprint.title,
        slideTitle: slide.title,
        slideBody: slide.body,
        imagePrompt: slide.imageSpec.prompt,
        imageAlt: slide.imageSpec.alt
      });

      slideImageObjectPath = buildLessonAssetPath({
        profileId,
        nodeId,
        languageCode,
        kind: "image",
        content: `${slide.id}:${slide.imageSpec.prompt}`,
        extension: slideImage.extension
      });

      await uploadLessonAsset({
        objectPath: slideImageObjectPath,
        contentType: slideImage.mimeType,
        data: Buffer.from(slideImage.data, "base64")
      });
      slideImageMimeType = slideImage.mimeType;
      slideImageDataBase64 = slideImage.data;
      currentLogs =
        (await appendLessonGenerationLog(
          lessonId,
          currentLogs,
          "slide-image",
          `Uploaded slide ${index + 1} image.`
        ))?.generationLogs ?? currentLogs;
    } catch (error) {
      currentLogs =
        (await appendLessonGenerationLog(
          lessonId,
          currentLogs,
          "slide-image-fallback",
          `Slide ${index + 1} image skipped: ${error instanceof Error ? error.message : "unknown error"}.`
        ))?.generationLogs ?? currentLogs;
    }

    currentLogs =
      (await appendLessonGenerationLog(
        lessonId,
        currentLogs,
        "slide-validation",
        `Validating slide ${index + 1}.`
      ))?.generationLogs ?? currentLogs;

    const slideValidation = await validateTeachingSlide({
      lessonTitle: blueprint.title,
      slideTitle: slide.title,
      slideBody: slide.body,
      hasInteractiveComponent: false,
      imageMimeType: slideImageMimeType,
      imageDataBase64: slideImageDataBase64
    });

    if (!slideValidation.pass) {
      currentLogs =
        (await appendLessonGenerationLog(
          lessonId,
          currentLogs,
          "slide-validation",
          `Slide ${index + 1} failed validation: ${slideValidation.reason}`
        ))?.generationLogs ?? currentLogs;
      throw new Error(`Generated slide ${slide.id || index + 1} failed validation: ${slideValidation.reason}`);
    }

    currentLogs =
      (await appendLessonGenerationLog(
        lessonId,
        currentLogs,
        "slide-validation",
        `Slide ${index + 1} passed validation.`
      ))?.generationLogs ?? currentLogs;

    const titleNarration = await synthesizeStoredAudioSegment({
      profileId,
      nodeId,
      languageCode,
      lessonScopedId: `${slide.id}:title`,
      script: slide.title
    });
    const bodyNarration = await synthesizeStoredAudioSegment({
      profileId,
      nodeId,
      languageCode,
      lessonScopedId: `${slide.id}:body`,
      script: slide.body
    });
    currentLogs =
      (await appendLessonGenerationLog(
        lessonId,
        currentLogs,
        "audio",
        `Generated narration for slide ${index + 1}.`
      ))?.generationLogs ?? currentLogs;
    currentLogs =
      (await appendLessonGenerationLog(
        lessonId,
        currentLogs,
        "audio",
        `Uploaded narration for slide ${index + 1}.`
      ))?.generationLogs ?? currentLogs;

    slides.push({
      id: slide.id || `slide-${index + 1}`,
      elements: [
        {
          id: `${slide.id || `slide-${index + 1}`}:title`,
          type: "text",
          role: "title",
          text: slide.title,
          segments: buildRichTextSegments(slide.title),
          frame: {
            x: 86,
            y: 27,
            width: 614,
            height: 160
          }
        },
        {
          id: `${slide.id || `slide-${index + 1}`}:body`,
          type: "text",
          role: "body",
          text: slide.body,
          segments: buildRichTextSegments(slide.body),
          frame: {
            x: 86,
            y: 760,
            width: 691,
            height: 240
          }
        },
        ...(slideImageObjectPath
          ? [
              {
                id: `${slide.id || `slide-${index + 1}`}:image`,
                type: "image" as const,
                role: "primary" as const,
                frame: slide.imageSpec.placement,
                asset: {
                  objectPath: slideImageObjectPath,
                  alt: slide.imageSpec.alt,
                  prompt: slide.imageSpec.prompt
                }
              }
            ]
          : [])
      ],
      narrationSegments: [
        {
          id: `${slide.id || `slide-${index + 1}`}:title`,
          role: "title",
          ...titleNarration
        },
        {
          id: `${slide.id || `slide-${index + 1}`}:body`,
          role: "body",
          ...bodyNarration
        }
      ],
      interactions: [],
      completionRules: [
        {
          type: "audioEnded",
          audioId: `${slide.id || `slide-${index + 1}`}:body`
        }
      ]
    });
  }

  const quizQuestions = [] as StoredLessonQuizQuestion[];
  for (const [index, question] of blueprint.quiz.questions.slice(0, 3).entries()) {
    let image: StoredLessonQuizQuestion["image"] = null;
    let quizImageMimeType: string | null = null;
    let quizImageDataBase64: string | null = null;

    if (question.imageSpec?.prompt && question.imageSpec?.alt) {
      try {
        currentLogs =
          (await appendLessonGenerationLog(
            lessonId,
            currentLogs,
            "quiz-image",
            `Generating quiz image ${index + 1} with Gemini.`
          ))?.generationLogs ?? currentLogs;

        const quizImage = await generateQuizImageAsset({
          questionPrompt: question.prompt,
          imagePrompt: question.imageSpec.prompt,
          imageAlt: question.imageSpec.alt
        });
        const quizImageObjectPath = buildLessonAssetPath({
          profileId,
          nodeId,
          languageCode,
          kind: "image",
          content: `quiz-${question.id}:${question.imageSpec.prompt}`,
          extension: quizImage.extension
        });
        await uploadLessonAsset({
          objectPath: quizImageObjectPath,
          contentType: quizImage.mimeType,
          data: Buffer.from(quizImage.data, "base64")
        });
        currentLogs =
          (await appendLessonGenerationLog(
            lessonId,
            currentLogs,
            "quiz-image",
            `Uploaded quiz image ${index + 1}.`
          ))?.generationLogs ?? currentLogs;

        image = {
          objectPath: quizImageObjectPath,
          alt: question.imageSpec.alt
        };
        quizImageMimeType = quizImage.mimeType;
        quizImageDataBase64 = quizImage.data;
      } catch (error) {
        currentLogs =
          (await appendLessonGenerationLog(
            lessonId,
            currentLogs,
            "quiz-image-fallback",
            `Quiz image ${index + 1} skipped: ${error instanceof Error ? error.message : "unknown error"}.`
          ))?.generationLogs ?? currentLogs;
      }
    }

    if (
      !Number.isInteger(question.correctChoiceIndex) ||
      question.correctChoiceIndex < 0 ||
      question.correctChoiceIndex >= question.choices.length
    ) {
      throw new Error(`Generated quiz question ${question.id || index + 1} has no valid correct answer.`);
    }

    currentLogs =
      (await appendLessonGenerationLog(
        lessonId,
        currentLogs,
        "quiz-validation",
        `Validating quiz question ${index + 1}.`
      ))?.generationLogs ?? currentLogs;

    const quizValidation = await validateQuizQuestion({
      questionPrompt: question.prompt,
      choices: question.choices.slice(0, 3),
      correctChoiceIndex: question.correctChoiceIndex,
      explanation: question.explanation,
      imageMimeType: quizImageMimeType,
      imageDataBase64: quizImageDataBase64
    });

    if (!quizValidation.pass) {
      currentLogs =
        (await appendLessonGenerationLog(
          lessonId,
          currentLogs,
          "quiz-validation",
          `Quiz question ${index + 1} failed validation: ${quizValidation.reason}`
        ))?.generationLogs ?? currentLogs;
      throw new Error(
        `Generated quiz question ${question.id || index + 1} failed validation: ${quizValidation.reason}`
      );
    }

    currentLogs =
      (await appendLessonGenerationLog(
        lessonId,
        currentLogs,
        "quiz-validation",
        `Quiz question ${index + 1} passed validation.`
      ))?.generationLogs ?? currentLogs;

    currentLogs =
      (await appendLessonGenerationLog(
        lessonId,
        currentLogs,
        "quiz-audio",
        `Generating quiz audio ${index + 1}.`
      ))?.generationLogs ?? currentLogs;

    const questionPromptAudio = await synthesizeNarrationAudio({
      languageCode,
      script: question.prompt
    });

    const questionPromptAudioExtension = (() => {
      const match = questionPromptAudio.sourceUrl.match(/\.(mp3|wav|m4a)(?:\?|$)/i);
      return match?.[1]?.toLowerCase() ?? "mp3";
    })();

    const questionPromptAudioContentType =
      questionPromptAudioExtension === "wav"
        ? "audio/wav"
        : questionPromptAudioExtension === "m4a"
          ? "audio/mp4"
          : "audio/mpeg";

    const questionPromptAudioObjectPath = buildLessonAssetPath({
      profileId,
      nodeId,
      languageCode,
      kind: "audio",
      content: `quiz-${question.id}:prompt:${question.prompt}`,
      extension: questionPromptAudioExtension
    });

    await uploadFromUrl({
      objectPath: questionPromptAudioObjectPath,
      contentType: questionPromptAudioContentType,
      sourceUrl: questionPromptAudio.sourceUrl
    });

    const choiceAudios = [] as StoredLessonQuizQuestion["audio"]["choices"];
    for (const [choiceIndex, choice] of question.choices.slice(0, 3).entries()) {
      const choiceAudio = await synthesizeNarrationAudio({
        languageCode,
        script: choice
      });

      const choiceAudioExtension = (() => {
        const match = choiceAudio.sourceUrl.match(/\.(mp3|wav|m4a)(?:\?|$)/i);
        return match?.[1]?.toLowerCase() ?? "mp3";
      })();

      const choiceAudioContentType =
        choiceAudioExtension === "wav"
          ? "audio/wav"
          : choiceAudioExtension === "m4a"
            ? "audio/mp4"
            : "audio/mpeg";

      const choiceAudioObjectPath = buildLessonAssetPath({
        profileId,
        nodeId,
        languageCode,
        kind: "audio",
        content: `quiz-${question.id}:choice-${choiceIndex}:${choice}`,
        extension: choiceAudioExtension
      });

      await uploadFromUrl({
        objectPath: choiceAudioObjectPath,
        contentType: choiceAudioContentType,
        sourceUrl: choiceAudio.sourceUrl
      });

      choiceAudios.push({
        objectPath: choiceAudioObjectPath,
        transcript: choiceAudio.script,
        voiceName: choiceAudio.voice.displayName,
        languageCode
      });
    }

    currentLogs =
      (await appendLessonGenerationLog(
        lessonId,
        currentLogs,
        "quiz-audio",
        `Uploaded quiz audio ${index + 1}.`
      ))?.generationLogs ?? currentLogs;

    quizQuestions.push({
      id: question.id || `q${index + 1}`,
      prompt: question.prompt,
      choices: question.choices.slice(0, 3),
      correctChoiceIndex: question.correctChoiceIndex,
      explanation: question.explanation,
      audio: {
        prompt: {
          objectPath: questionPromptAudioObjectPath,
          transcript: questionPromptAudio.script,
          voiceName: questionPromptAudio.voice.displayName,
          languageCode
        },
        choices: choiceAudios
      },
      image
    });
  }

  return {
    title: blueprint.title,
    content: {
      version: "interactive_v8",
      stages: [
        {
          id: "stage-slide-deck",
          type: "slideDeck",
          slideDeck: {
            title: blueprint.title,
            objective: prompt.context.node.objective,
            summary: blueprint.summary,
            progress: {
              completedSlideIds: []
            },
            slides
          }
        },
        {
          id: "stage-quiz",
          type: "quiz",
          quiz: {
            title: `${blueprint.title} Quiz`,
            passingScore: blueprint.quiz.passingScore,
            progress: {
              completedQuestionIds: []
            },
            questions: quizQuestions
          }
        }
      ]
    } satisfies StoredLessonContent
  };
}

async function buildLessonShell(profileId: string, nodeId: string, languageCode: string) {
  const prompt = await buildLessonPrompt(profileId, nodeId);

  return {
    title: prompt.context.node.title,
    prompt,
    draftContent: {
      version: "interactive_v8",
      state: "pending"
    }
  };
}

async function ensureLessonShell(profileId: string, nodeId: string, languageCode: string) {
  const existingLesson = await fetchLessonRowByNode(profileId, nodeId, languageCode);

  if (existingLesson) {
    return existingLesson;
  }

  const shell = await buildLessonShell(profileId, nodeId, languageCode);

  const [createdLesson] = await db
    .insert(lessons)
    .values({
      profileId,
      nodeId,
      languageCode,
      title: shell.title,
      status: "draft",
      promptJson: shell.prompt,
      contentJson: shell.draftContent,
      generationLogs: [
        {
          timestamp: new Date().toISOString(),
          stage: "queued",
          message: "Lesson queued for generation."
        }
      ]
    })
    .returning({
      id: lessons.id,
      profileId: lessons.profileId,
      nodeId: lessons.nodeId,
      languageCode: lessons.languageCode,
      title: lessons.title,
      status: lessons.status,
      promptJson: lessons.promptJson,
      contentJson: lessons.contentJson,
      generationLogs: lessons.generationLogs,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt
    });

  return createdLesson as LessonRow;
}

async function markLessonAsDraft(row: LessonRow) {
  const [updatedLesson] = await db
    .update(lessons)
    .set({
      status: "draft",
      generationLogs: parseGenerationLogs(row.generationLogs),
      updatedAt: new Date()
    })
    .where(eq(lessons.id, row.id))
    .returning({
      id: lessons.id,
      profileId: lessons.profileId,
      nodeId: lessons.nodeId,
      languageCode: lessons.languageCode,
      title: lessons.title,
      status: lessons.status,
      promptJson: lessons.promptJson,
      contentJson: lessons.contentJson,
      generationLogs: lessons.generationLogs,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt
    });

  return (updatedLesson as LessonRow | undefined) ?? row;
}

async function fetchLessonGenerationJob(lessonId: string) {
  const [job] = await db
    .select({
      id: lessonGenerationJobs.id,
      lessonId: lessonGenerationJobs.lessonId,
      status: lessonGenerationJobs.status,
      attemptCount: lessonGenerationJobs.attemptCount,
      availableAt: lessonGenerationJobs.availableAt,
      claimedAt: lessonGenerationJobs.claimedAt,
      heartbeatAt: lessonGenerationJobs.heartbeatAt,
      workerId: lessonGenerationJobs.workerId,
      lastError: lessonGenerationJobs.lastError,
      createdAt: lessonGenerationJobs.createdAt,
      updatedAt: lessonGenerationJobs.updatedAt
    })
    .from(lessonGenerationJobs)
    .where(eq(lessonGenerationJobs.lessonId, lessonId))
    .limit(1);

  return (job as LessonGenerationJobRow | undefined) ?? null;
}

async function upsertLessonGenerationJob(
  lessonId: string,
  status: LessonGenerationJobRow["status"],
  options?: {
    availableAt?: Date;
    claimedAt?: Date | null;
    heartbeatAt?: Date | null;
    workerId?: string | null;
    lastError?: string | null;
    incrementAttempt?: boolean;
  }
) {
  const existingJob = await fetchLessonGenerationJob(lessonId);

  if (!existingJob) {
    const [createdJob] = await db
      .insert(lessonGenerationJobs)
      .values({
        lessonId,
        status,
        attemptCount: options?.incrementAttempt ? 1 : 0,
        availableAt: options?.availableAt ?? new Date(),
        claimedAt: options?.claimedAt ?? null,
        heartbeatAt: options?.heartbeatAt ?? null,
        workerId: options?.workerId ?? null,
        lastError: options?.lastError ?? null
      })
      .returning();

    return (createdJob as LessonGenerationJobRow | undefined) ?? null;
  }

  const [updatedJob] = await db
    .update(lessonGenerationJobs)
    .set({
      status,
      attemptCount: options?.incrementAttempt ? existingJob.attemptCount + 1 : existingJob.attemptCount,
      availableAt: options?.availableAt ?? existingJob.availableAt,
      claimedAt: options?.claimedAt ?? null,
      heartbeatAt: options?.heartbeatAt ?? null,
      workerId: options?.workerId ?? null,
      lastError: options?.lastError ?? null,
      updatedAt: new Date()
    })
    .where(eq(lessonGenerationJobs.lessonId, lessonId))
    .returning();

  return (updatedJob as LessonGenerationJobRow | undefined) ?? existingJob;
}

function getDisplayGenerationLogs(row: LessonRow) {
  const logs = parseGenerationLogs(row.generationLogs);

  if (isLessonGenerationStale(row)) {
    return [
      ...logs,
      {
        timestamp: new Date().toISOString(),
        stage: "queued",
        message: "Lesson generation was interrupted and has been re-queued."
      }
    ].slice(-20);
  }

  return logs;
}

async function triggerLessonGeneration(row: LessonRow) {
  const existingJob = await fetchLessonGenerationJob(row.id);
  if (existingJob && ["queued", "running", "retry_wait"].includes(existingJob.status)) {
    return existingJob;
  }

  const latestStage = getLatestGenerationStage(row.generationLogs);
  const loggedRow =
    latestStage === "queued"
      ? row
      : ((await appendLessonGenerationLog(
          row.id,
          row.generationLogs,
          "queued",
          "Lesson generation has been queued."
        )) ?? row);

  return upsertLessonGenerationJob(loggedRow.id, "queued", {
    availableAt: new Date(),
    claimedAt: null,
    heartbeatAt: null,
    workerId: null,
    lastError: null
  });
}

async function claimNextLessonGenerationJob(workerId: string) {
  const [claimedJob] = await db.execute<LessonGenerationJobRow>(sql`
    WITH next_job AS (
      SELECT id
      FROM lesson_generation_jobs
      WHERE status IN ('queued', 'retry_wait')
        AND available_at <= NOW()
      ORDER BY available_at ASC, updated_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE lesson_generation_jobs lgj
    SET
      status = 'running',
      claimed_at = NOW(),
      heartbeat_at = NOW(),
      worker_id = ${workerId},
      updated_at = NOW()
    FROM next_job
    WHERE lgj.id = next_job.id
    RETURNING
      lgj.id,
      lgj.lesson_id AS "lessonId",
      lgj.status,
      lgj.attempt_count AS "attemptCount",
      lgj.available_at AS "availableAt",
      lgj.claimed_at AS "claimedAt",
      lgj.heartbeat_at AS "heartbeatAt",
      lgj.worker_id AS "workerId",
      lgj.last_error AS "lastError",
      lgj.created_at AS "createdAt",
      lgj.updated_at AS "updatedAt"
  `);

  return claimedJob ?? null;
}

async function markLessonGenerationJobHeartbeat(jobId: string, workerId: string) {
  await db
    .update(lessonGenerationJobs)
    .set({
      heartbeatAt: new Date(),
      workerId,
      updatedAt: new Date()
    })
    .where(eq(lessonGenerationJobs.id, jobId));
}

async function markLessonGenerationJobCompleted(job: LessonGenerationJobRow, workerId: string) {
  await upsertLessonGenerationJob(job.lessonId, "completed", {
    availableAt: new Date(),
    claimedAt: new Date(),
    heartbeatAt: new Date(),
    workerId,
    lastError: null
  });
}

async function markLessonGenerationJobFailed(
  job: LessonGenerationJobRow,
  workerId: string,
  errorMessage: string
) {
  const nextAttemptCount = job.attemptCount + 1;
  const shouldRetry = nextAttemptCount < MAX_LESSON_GENERATION_ATTEMPTS;

  await upsertLessonGenerationJob(job.lessonId, shouldRetry ? "retry_wait" : "failed", {
    availableAt: new Date(Date.now() + calculateLessonGenerationRetryDelayMs(nextAttemptCount)),
    claimedAt: null,
    heartbeatAt: null,
    workerId: shouldRetry ? null : workerId,
    lastError: errorMessage,
    incrementAttempt: true
  });
}

export async function runNextLessonGenerationJob(workerId: string) {
  const job = await claimNextLessonGenerationJob(workerId);

  if (!job) {
    return null;
  }

  try {
    await markLessonGenerationJobHeartbeat(job.id, workerId);

    const lesson = await db
      .select({
        id: lessons.id,
        profileId: lessons.profileId,
        nodeId: lessons.nodeId,
        languageCode: lessons.languageCode,
        title: lessons.title,
        status: lessons.status,
        promptJson: lessons.promptJson,
        contentJson: lessons.contentJson,
        generationLogs: lessons.generationLogs,
        createdAt: lessons.createdAt,
        updatedAt: lessons.updatedAt
      })
      .from(lessons)
      .where(eq(lessons.id, job.lessonId))
      .limit(1);

    const row = (lesson[0] as LessonRow | undefined) ?? null;
    if (!row) {
      await upsertLessonGenerationJob(job.lessonId, "failed", {
        availableAt: new Date(),
        claimedAt: null,
        heartbeatAt: null,
        workerId,
        lastError: "Lesson row not found."
      });
      return {
        jobId: job.id,
        lessonId: job.lessonId,
        outcome: "missing"
      };
    }

    const validation = validateStoredInteractiveContent(row.contentJson);
    if (row.status === "ready" && validation.content) {
      await markLessonGenerationJobCompleted(job, workerId);
      return {
        jobId: job.id,
        lessonId: job.lessonId,
        outcome: "already-ready"
      };
    }

    await ensureInteractiveLessonRow(row);
    await markLessonGenerationJobCompleted(job, workerId);

    return {
      jobId: job.id,
      lessonId: job.lessonId,
      outcome: "completed"
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown lesson generation failure.";
    console.error(`Failed to generate lesson ${job.lessonId}:`, error);
    const freshRow = await fetchLessonRowForLessonId(job.lessonId);
    const updatedRow = freshRow ? await markLessonAsDraft(freshRow) : null;
    if (updatedRow) {
      await appendLessonGenerationLog(job.lessonId, updatedRow.generationLogs, "error", errorMessage);
    }
    await markLessonGenerationJobFailed(job, workerId, errorMessage);

    return {
      jobId: job.id,
      lessonId: job.lessonId,
      outcome: "failed",
      error: errorMessage
    };
  }
}

async function fetchLessonRowForLessonId(lessonId: string) {
  const rows = await db
    .select({
      id: lessons.id,
      profileId: lessons.profileId,
      nodeId: lessons.nodeId,
      languageCode: lessons.languageCode,
      title: lessons.title,
      status: lessons.status,
      promptJson: lessons.promptJson,
      contentJson: lessons.contentJson,
      generationLogs: lessons.generationLogs,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt
    })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);

  return (rows[0] as LessonRow | undefined) ?? null;
}

export async function requeueStaleLessonGenerations() {
  const draftLessons = await db
    .select({
      id: lessons.id,
      profileId: lessons.profileId,
      nodeId: lessons.nodeId,
      languageCode: lessons.languageCode,
      title: lessons.title,
      status: lessons.status,
      promptJson: lessons.promptJson,
      contentJson: lessons.contentJson,
      generationLogs: lessons.generationLogs,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt
    })
    .from(lessons)
    .where(eq(lessons.status, "draft"));

  const staleLessons = draftLessons.filter((row) => isLessonGenerationStale(row as LessonRow)) as LessonRow[];

  for (const lesson of staleLessons) {
    const reloggedLesson =
      (await appendLessonGenerationLog(
        lesson.id,
        lesson.generationLogs,
        "queued",
        "Lesson generation was interrupted and has been re-queued."
      )) ?? lesson;
    await triggerLessonGeneration(reloggedLesson);
  }

  let resumedQueuedLessonId: string | null = null;
  let retriedErrorLessonId: string | null = null;

  const staleRunningJobs = await db.execute<{ lessonId: string }>(sql`
    UPDATE lesson_generation_jobs
    SET
      status = 'queued',
      claimed_at = NULL,
      heartbeat_at = NULL,
      worker_id = NULL,
      updated_at = NOW()
    WHERE status = 'running'
      AND COALESCE(heartbeat_at, claimed_at, updated_at) < NOW() - (${env.MAINTENANCE_STALE_LESSON_MINUTES} || ' minutes')::interval
    RETURNING lesson_id AS "lessonId"
  `);

  const hasActiveRunningJob = (
    await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count
      FROM lesson_generation_jobs
      WHERE status = 'running'
    `)
  )[0]?.count !== "0";

  if (!hasActiveRunningJob) {
    const oldestQueuedLesson = draftLessons
      .filter((row) => getLatestGenerationStage(row.generationLogs) === "queued")
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())[0] as LessonRow | undefined;

    if (oldestQueuedLesson) {
      await triggerLessonGeneration(oldestQueuedLesson);
      resumedQueuedLessonId = oldestQueuedLesson.id;
    } else {
      const oldestRetryableErrorLesson = draftLessons
        .filter((row) => isLessonGenerationRetryableError(row as LessonRow))
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())[0] as LessonRow | undefined;

      if (oldestRetryableErrorLesson) {
        const reloggedLesson =
          (await appendLessonGenerationLog(
            oldestRetryableErrorLesson.id,
            oldestRetryableErrorLesson.generationLogs,
            "queued",
            "Lesson generation is being retried after a prior error."
          )) ?? oldestRetryableErrorLesson;
        await triggerLessonGeneration(reloggedLesson);
        retriedErrorLessonId = oldestRetryableErrorLesson.id;
      }
    }
  }

  return {
    scanned: draftLessons.length,
    requeued: staleLessons.length,
    resumedQueuedLessonId,
    retriedErrorLessonId,
    recoveredRunningLessonIds: staleRunningJobs.map((job) => job.lessonId),
    lessonIds: staleLessons.map((lesson) => lesson.id)
  };
}

async function getFirstLessonNodeForSubject(subjectId: string) {
  const rows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE curriculum_tree AS (
      SELECT
        cn.id,
        cn.parent_id,
        cn.introduced_in_week,
        cn.display_order,
        cn."order"
      FROM curriculum_nodes cn
      WHERE cn.id = ${subjectId}

      UNION ALL

      SELECT
        child.id,
        child.parent_id,
        child.introduced_in_week,
        child.display_order,
        child."order"
      FROM curriculum_nodes child
      INNER JOIN curriculum_tree parent
        ON child.parent_id = parent.id
    )
    SELECT ct.id
    FROM curriculum_tree ct
    INNER JOIN skills s
      ON s.node_id = ct.id
    ORDER BY
      COALESCE(ct.introduced_in_week, 2147483647),
      ct.display_order,
      ct."order",
      ct.id
    LIMIT 1
  `);

  return rows[0]?.id ?? null;
}

async function getNextSkillNodeAfterNode(nodeId: string) {
  const rows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, type
      FROM curriculum_nodes
      WHERE id = ${nodeId}

      UNION ALL

      SELECT parent.id, parent.parent_id, parent.type
      FROM curriculum_nodes parent
      INNER JOIN ancestors child
        ON child.parent_id = parent.id
    ),
    subject_root AS (
      SELECT id
      FROM ancestors
      WHERE type = 'subject'
      LIMIT 1
    ),
    curriculum_tree AS (
      SELECT
        cn.id,
        cn.parent_id,
        cn.introduced_in_week,
        cn.display_order,
        cn."order"
      FROM curriculum_nodes cn
      WHERE cn.id = (SELECT id FROM subject_root)

      UNION ALL

      SELECT
        child.id,
        child.parent_id,
        child.introduced_in_week,
        child.display_order,
        child."order"
      FROM curriculum_nodes child
      INNER JOIN curriculum_tree parent
        ON child.parent_id = parent.id
    ),
    ordered_skills AS (
      SELECT
        ct.id,
        COALESCE(ct.introduced_in_week, 2147483647) AS introduced_in_week,
        ct.display_order,
        ct."order"
      FROM curriculum_tree ct
      INNER JOIN skills s
        ON s.node_id = ct.id
      ORDER BY
        COALESCE(ct.introduced_in_week, 2147483647),
        ct.display_order,
        ct."order",
        ct.id
    ),
    current_skill AS (
      SELECT introduced_in_week, display_order, "order", id
      FROM ordered_skills
      WHERE id = ${nodeId}
      LIMIT 1
    )
    SELECT os.id
    FROM ordered_skills os
    CROSS JOIN current_skill cs
    WHERE (os.introduced_in_week, os.display_order, os."order", os.id) >
          (cs.introduced_in_week, cs.display_order, cs."order", cs.id)
    ORDER BY os.introduced_in_week, os.display_order, os."order", os.id
    LIMIT 1
  `);

  return rows[0]?.id ?? null;
}

async function prepareLessonShellForNode(profileId: string, nodeId: string, languageCode: string) {
  const lesson = await ensureLessonShell(profileId, nodeId, languageCode);

  if (lesson.status !== "ready") {
    await triggerLessonGeneration(lesson);
  }

  return lesson;
}

export async function prepareFirstLessonForSubject(
  profileId: string,
  subjectId: string,
  languageCode: string
) {
  const firstNodeId = await getFirstLessonNodeForSubject(subjectId);

  if (!firstNodeId) {
    return null;
  }

  return prepareLessonShellForNode(profileId, firstNodeId, languageCode);
}

async function prepareNextLessonAfterCurrent(
  profileId: string,
  nodeId: string,
  languageCode: string
) {
  const nextNodeId = await getNextSkillNodeAfterNode(nodeId);

  if (!nextNodeId) {
    return null;
  }

  return prepareLessonShellForNode(profileId, nextNodeId, languageCode);
}

async function ensureInteractiveLessonRow(row: LessonRow) {
  const { content } = validateStoredInteractiveContent(row.contentJson);

  if (content && row.status === "ready") {
    return {
      ...row,
      promptJson: row.promptJson as LessonPrompt,
      contentJson: content
    };
  }

  if (row.status === "ready") {
    const upgradedContent = await upgradeLegacyV6LessonContent(row);

    if (upgradedContent) {
      const [updatedLesson] = await db
        .update(lessons)
        .set({
          contentJson: upgradedContent,
          generationLogs: upgradedContent.generationLogs,
          updatedAt: new Date()
        })
        .where(eq(lessons.id, row.id))
        .returning({
          id: lessons.id,
          profileId: lessons.profileId,
          nodeId: lessons.nodeId,
          languageCode: lessons.languageCode,
          title: lessons.title,
          status: lessons.status,
          promptJson: lessons.promptJson,
          contentJson: lessons.contentJson,
          generationLogs: lessons.generationLogs,
          createdAt: lessons.createdAt,
          updatedAt: lessons.updatedAt
        });

      return {
        ...(updatedLesson as LessonRow),
        promptJson: (updatedLesson as LessonRow).promptJson as LessonPrompt,
        contentJson: upgradedContent
      };
    }
  }

  const prompt = (row.promptJson as LessonPrompt | null) ?? (await buildLessonPrompt(row.profileId, row.nodeId));
  const generated = await createInteractiveLessonContent(
    row.id,
    row.profileId,
    row.nodeId,
    row.languageCode,
    prompt,
    row.generationLogs
  );

  const [updatedLesson] = await db
    .update(lessons)
    .set({
      title: generated.title,
      status: "ready",
      promptJson: prompt,
      contentJson: generated.content,
      generationLogs: [
        ...parseGenerationLogs(row.generationLogs),
        {
          timestamp: new Date().toISOString(),
          stage: "ready",
          message: "Lesson is ready."
        }
      ].slice(-20),
      updatedAt: new Date()
    })
    .where(eq(lessons.id, row.id))
    .returning({
      id: lessons.id,
      profileId: lessons.profileId,
      nodeId: lessons.nodeId,
      languageCode: lessons.languageCode,
      title: lessons.title,
      status: lessons.status,
      promptJson: lessons.promptJson,
      contentJson: lessons.contentJson,
      generationLogs: lessons.generationLogs,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt
    });

  return {
    ...(updatedLesson as LessonRow),
    promptJson: prompt,
    contentJson: generated.content
  };
}

async function serializeLessonForClient(row: LessonRow) {
  const lesson = await ensureInteractiveLessonRow(row);
  const slideDeckStage = getSlideDeckStage(lesson.contentJson);
  const quizStage = getQuizStage(lesson.contentJson);

  if (!slideDeckStage || !quizStage) {
    throw new Error("Lesson content is missing required stages.");
  }

  const slides = await Promise.all(
    slideDeckStage.slideDeck.slides.map(async (slide) => ({
      id: slide.id,
      elements: await Promise.all(
        slide.elements.map(async (element) => {
          if (element.type === "text") {
            return {
              ...element,
              segments:
                Array.isArray((element as { segments?: unknown }).segments) &&
                (element as { segments?: unknown[] }).segments?.length
                  ? (element as { segments: RichTextSegment[] }).segments
                  : buildRichTextSegments(element.text)
            };
          }

          return {
            ...element,
            asset: {
              url: await getSignedLessonAssetUrl(element.asset.objectPath),
              alt: element.asset.alt,
              prompt: element.asset.prompt
            }
          };
        })
      ),
      narrationSegments: await Promise.all(
        slide.narrationSegments.map(async (segment) => ({
          id: segment.id,
          role: segment.role,
          url: await getSignedLessonAssetUrl(segment.objectPath),
          transcript: segment.transcript,
          voiceName: segment.voiceName,
          languageCode: segment.languageCode
        }))
      ),
      interactions: slide.interactions,
      completionRules: slide.completionRules
    }))
  );

  const questions = await Promise.all(
    quizStage.quiz.questions.map(async (question) => ({
      id: question.id,
      prompt: question.prompt,
      choices: question.choices,
      correctChoiceIndex: question.correctChoiceIndex,
      explanation: question.explanation,
      audio: {
        prompt: {
          url: await getSignedLessonAssetUrl(question.audio.prompt.objectPath),
          transcript: question.audio.prompt.transcript,
          voiceName: question.audio.prompt.voiceName,
          languageCode: question.audio.prompt.languageCode
        },
        choices: await Promise.all(
          question.audio.choices.map(async (choiceAudio) => ({
            url: await getSignedLessonAssetUrl(choiceAudio.objectPath),
            transcript: choiceAudio.transcript,
            voiceName: choiceAudio.voiceName,
            languageCode: choiceAudio.languageCode
          }))
        )
      },
      image: question.image
        ? {
            url: await getSignedLessonAssetUrl(question.image.objectPath),
            alt: question.image.alt
          }
        : null
    }))
  );

  return {
    id: lesson.id,
    profileId: lesson.profileId,
    nodeId: lesson.nodeId,
    languageCode: lesson.languageCode,
    title: lesson.title,
    status: lesson.status,
    generationLogs: parseGenerationLogs(lesson.generationLogs),
    promptJson: lesson.promptJson,
    contentJson: {
      version: "interactive_v8",
      stages: [
        {
          id: slideDeckStage.id,
          type: "slideDeck",
          slideDeck: {
            title: slideDeckStage.slideDeck.title,
            objective: slideDeckStage.slideDeck.objective,
            summary: slideDeckStage.slideDeck.summary,
            progress: {
              completedSlideIds: slideDeckStage.slideDeck.progress?.completedSlideIds ?? []
            },
            slides
          }
        },
        {
          id: quizStage.id,
          type: "quiz",
          quiz: {
            title: quizStage.quiz.title,
            passingScore: quizStage.quiz.passingScore,
            progress: {
              completedQuestionIds: quizStage.quiz.progress?.completedQuestionIds ?? []
            },
            questions
          }
        }
      ]
    },
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt
  } satisfies ClientLesson;
}

export async function getLessonContext(profileId: string, nodeId: string) {
  const [profile] = await db
    .select({
      id: profiles.id,
      birthDate: profiles.birthDate,
      gradeLevel: profiles.gradeLevel,
      languagePreference: profiles.languagePreference,
      localeId: profiles.localeId
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    throw new Error(`Profile ${profileId} not found.`);
  }

  const [node] = await db
    .select({
      id: curriculumNodes.id,
      slug: curriculumNodes.slug,
      type: curriculumNodes.type,
      title: curriculumNodes.title,
      skillObjective: curriculumNodes.skillObjective,
      externalReference: curriculumNodes.externalReference,
      technicalKeywords: curriculumNodes.technicalKeywords,
      introducedInWeek: curriculumNodes.introducedInWeek,
      displayOrder: curriculumNodes.displayOrder,
      learningObjectives: skills.learningObjectives,
      masteryThreshold: skills.masteryThreshold,
      difficulty: skills.difficulty,
      pedagogicalTone: skills.pedagogicalTone,
      visualConstraint: skills.visualConstraint
    })
    .from(curriculumNodes)
    .leftJoin(skills, eq(skills.nodeId, curriculumNodes.id))
    .where(eq(curriculumNodes.id, nodeId))
    .limit(1);

  if (!node) {
    throw new Error(`Curriculum node ${nodeId} not found.`);
  }

  const [translation] = await db
    .select({
      title: nodeTranslations.title,
      description: nodeTranslations.description
    })
    .from(nodeTranslations)
    .where(
      and(
        eq(nodeTranslations.nodeId, nodeId),
        eq(nodeTranslations.languageCode, profile.languagePreference)
      )
    )
    .limit(1);

  const age = getAgeFromBirthDate(profile.birthDate);
  const vocabulary = await getNodeTechnicalVocabularyContext(
    profileId,
    nodeId,
    profile.languagePreference
  );
  const localeAssets = profile.localeId ? await getLocaleAssets(profile.localeId) : null;
  const useMoneyAssets = /money|coin|coins|bill|bills|currency/i.test(
    [node.skillObjective, node.learningObjectives, ...(node.technicalKeywords ?? [])]
      .filter(Boolean)
      .join(" ")
  );

  return {
    profile: {
      id: profile.id,
      age,
      birthDate: profile.birthDate,
      gradeLevel: profile.gradeLevel,
      languageCode: profile.languagePreference,
      localeId: profile.localeId
    },
    node: {
      id: node.id,
      slug: node.slug,
      type: node.type,
      title: translation?.title ?? node.title,
      description: translation?.description ?? null,
      objective: node.skillObjective ?? node.learningObjectives,
      standard: node.externalReference,
      introducedInWeek: node.introducedInWeek,
      displayOrder: node.displayOrder,
      difficulty: node.difficulty,
      masteryThreshold: node.masteryThreshold
    },
    prompt: {
      system: {
        role: "You are a curriculum-aware tutor generating just-in-time lesson content.",
        studentAge: age,
        studentGradeLevel: profile.gradeLevel,
        pedagogicalTone: getPedagogicalTone(age, profile.gradeLevel, node.pedagogicalTone),
        visualConstraint: node.visualConstraint ?? null
      },
      locale: localeAssets,
      vocabulary: {
        whitelist: vocabulary.knownWords,
        technicalKeywords: vocabulary.technicalKeywords,
        missingTechnicalKeywords: vocabulary.missingKeywords
      },
      regionalSubstitutions: useMoneyAssets ? localeAssets?.denominations ?? [] : []
    }
  } satisfies LessonContext;
}

export async function getLessonGenerationContext(skillId: string, profileId: string) {
  return getLessonContext(profileId, skillId);
}

export async function buildLessonPrompt(profileId: string, nodeId: string) {
  const context = await getLessonContext(profileId, nodeId);

  return {
    systemPrompt: [
      "You are a Grade-appropriate tutor generating an interactive lesson with image, narration, and quiz.",
      context.prompt.system.studentAge != null
        ? `The student is ${context.prompt.system.studentAge} years old.`
        : null,
      context.profile.gradeLevel != null
        ? `Current grade level: ${context.profile.gradeLevel}.`
        : null,
      context.prompt.locale
        ? `Locale: ${context.prompt.locale.countryCode} / ${context.prompt.locale.languageCode} / ${context.prompt.locale.currencyCode}.`
        : `Language: ${context.profile.languageCode}.`,
      `Pedagogical tone: ${context.prompt.system.pedagogicalTone}.`,
      context.prompt.system.visualConstraint
        ? `Visual constraint: ${context.prompt.system.visualConstraint}.`
        : null,
      context.node.objective ? `Objective: ${context.node.objective}.` : null,
      context.node.standard ? `Standard: ${context.node.standard}.` : null,
      context.prompt.vocabulary.whitelist.length > 0
        ? `Use only familiar words unless you define a new technical term: ${context.prompt.vocabulary.whitelist.join(", ")}.`
        : null,
      context.prompt.vocabulary.missingTechnicalKeywords.length > 0
        ? `These terms are new and need simple definitions or substitutions: ${context.prompt.vocabulary.missingTechnicalKeywords
            .map((keyword) =>
              keyword.preferredSynonym
                ? `${keyword.word} -> ${keyword.preferredSynonym}`
                : keyword.word
            )
            .join(", ")}.`
        : null,
      context.prompt.regionalSubstitutions.length > 0
        ? `If the lesson involves money, use: ${context.prompt.regionalSubstitutions
            .map((denomination) => `${denomination.name} (${denomination.displayValue})`)
            .join(", ")}.`
        : null
    ],
    context
  } satisfies LessonPrompt;
}

export async function getOrCreateLessonForNode(profileId: string, nodeId: string) {
  const [profile] = await db
    .select({
      languagePreference: profiles.languagePreference
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    throw new Error(`Profile ${profileId} not found.`);
  }

  const lesson = await ensureLessonShell(profileId, nodeId, profile.languagePreference);

  if (lesson.status !== "ready") {
    await triggerLessonGeneration(lesson);
  }

  return {
    id: lesson.id,
    profileId: lesson.profileId,
    nodeId: lesson.nodeId,
    languageCode: lesson.languageCode,
    title: lesson.title,
    status: lesson.status,
    generationLogs: getDisplayGenerationLogs(lesson),
    promptJson: lesson.promptJson,
    contentJson: lesson.status === "ready" ? lesson.contentJson : null,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt
  };
}

export async function getLessonById(profileId: string, lessonId: string) {
  const lesson = await fetchLessonRow(profileId, lessonId);

  if (!lesson) {
    return null;
  }

  if (isLessonGenerationStale(lesson)) {
    const reloggedLesson =
      (await appendLessonGenerationLog(
        lesson.id,
        lesson.generationLogs,
        "queued",
        "Lesson generation was interrupted and has been re-queued."
      )) ?? lesson;
    await triggerLessonGeneration(reloggedLesson);

    return {
      id: reloggedLesson.id,
      profileId: reloggedLesson.profileId,
      nodeId: reloggedLesson.nodeId,
      languageCode: reloggedLesson.languageCode,
      title: reloggedLesson.title,
      status: reloggedLesson.status,
      generationLogs: getDisplayGenerationLogs(reloggedLesson),
      promptJson: reloggedLesson.promptJson as LessonPrompt,
      contentJson: null,
      createdAt: reloggedLesson.createdAt,
      updatedAt: reloggedLesson.updatedAt
    };
  }

  if (lesson.status !== "ready") {
    await triggerLessonGeneration(lesson);
  }

  if (lesson.status !== "ready") {
    return {
      id: lesson.id,
      profileId: lesson.profileId,
      nodeId: lesson.nodeId,
      languageCode: lesson.languageCode,
      title: lesson.title,
      status: lesson.status,
      generationLogs: getDisplayGenerationLogs(lesson),
      promptJson: lesson.promptJson as LessonPrompt,
      contentJson: null,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt
    };
  }

  const validation = validateStoredInteractiveContent(lesson.contentJson);
  if (!validation.content && !isLegacyInteractiveV6Content(lesson.contentJson)) {
    const fallbackLesson = await markLessonAsDraft(lesson);
    const reloggedLesson =
      (await appendLessonGenerationLog(
        fallbackLesson.id,
        fallbackLesson.generationLogs,
        "invalid-quiz",
        `${validation.error} Regenerating lesson content.`
      )) ?? fallbackLesson;
    await triggerLessonGeneration(reloggedLesson);

    return {
      id: reloggedLesson.id,
      profileId: reloggedLesson.profileId,
      nodeId: reloggedLesson.nodeId,
      languageCode: reloggedLesson.languageCode,
      title: reloggedLesson.title,
      status: reloggedLesson.status,
      generationLogs: getDisplayGenerationLogs(reloggedLesson),
      promptJson: reloggedLesson.promptJson as LessonPrompt,
      contentJson: null,
      createdAt: reloggedLesson.createdAt,
      updatedAt: reloggedLesson.updatedAt
    };
  }

  try {
    const serializedLesson = await serializeLessonForClient(lesson);
    void prepareNextLessonAfterCurrent(
      serializedLesson.profileId,
      serializedLesson.nodeId,
      serializedLesson.languageCode
    ).catch((error) => {
      console.error(`Failed to prepare next lesson after ${serializedLesson.id}:`, error);
    });

    return serializedLesson;
  } catch (error) {
    console.error(`Failed to serialize lesson ${lesson.id}:`, error);
    const fallbackLesson = await markLessonAsDraft(lesson);
    await triggerLessonGeneration(fallbackLesson);

    return {
      id: fallbackLesson.id,
      profileId: fallbackLesson.profileId,
      nodeId: fallbackLesson.nodeId,
      languageCode: fallbackLesson.languageCode,
      title: fallbackLesson.title,
      status: fallbackLesson.status,
      generationLogs: getDisplayGenerationLogs(fallbackLesson),
      promptJson: fallbackLesson.promptJson as LessonPrompt,
      contentJson: null,
      createdAt: fallbackLesson.createdAt,
      updatedAt: fallbackLesson.updatedAt
    };
  }
}

export async function markLessonSlideCompleted(input: {
  profileId: string;
  lessonId: string;
  slideId: string;
}) {
  const row = await fetchLessonRow(input.profileId, input.lessonId);

  if (!row) {
    throw new Error("Lesson not found.");
  }

  const lesson = await ensureInteractiveLessonRow(row);
  const slideDeckStage = getSlideDeckStage(lesson.contentJson);

  if (!slideDeckStage) {
    throw new Error("Lesson slide deck not found.");
  }

  const completedSlideIds = new Set(slideDeckStage.slideDeck.progress?.completedSlideIds ?? []);

  if (!slideDeckStage.slideDeck.slides.some((slide) => slide.id === input.slideId)) {
    throw new Error("Slide not found.");
  }

  completedSlideIds.add(input.slideId);

  const nextContent = {
    ...lesson.contentJson,
    stages: lesson.contentJson.stages.map((stage) =>
      stage.type === "slideDeck"
        ? {
            ...stage,
            slideDeck: {
              ...stage.slideDeck,
              progress: {
                completedSlideIds: Array.from(completedSlideIds)
              }
            }
          }
        : stage
    )
  } satisfies StoredLessonContent;

  await db
    .update(lessons)
    .set({
      contentJson: nextContent,
      updatedAt: new Date()
    })
    .where(eq(lessons.id, lesson.id));

  const streak = await recordActivity(input.profileId);

  return {
    lessonId: lesson.id,
    slideId: input.slideId,
    completedSlideIds: Array.from(completedSlideIds),
    streak
  };
}

export async function submitLessonQuiz(input: {
  profileId: string;
  lessonId: string;
  answers: Array<{
    questionId: string;
    choiceIndex: number;
  }>;
}) {
  const row = await fetchLessonRow(input.profileId, input.lessonId);

  if (!row) {
    throw new Error("Lesson not found.");
  }

  const lesson = await ensureInteractiveLessonRow(row);
  const quizStage = getQuizStage(lesson.contentJson);

  if (!quizStage) {
    throw new Error("Lesson quiz not found.");
  }

  const answerMap = new Map(input.answers.map((answer) => [answer.questionId, answer.choiceIndex]));
  const results = quizStage.quiz.questions.map((question) => {
    const selectedChoiceIndex = answerMap.get(question.id);
    const isCorrect = selectedChoiceIndex === question.correctChoiceIndex;

    return {
      questionId: question.id,
      prompt: question.prompt,
      selectedChoiceIndex: selectedChoiceIndex ?? null,
      selectedChoice:
        selectedChoiceIndex != null && selectedChoiceIndex >= 0
          ? question.choices[selectedChoiceIndex] ?? null
          : null,
      correctChoiceIndex: question.correctChoiceIndex,
      correctChoice: question.choices[question.correctChoiceIndex] ?? null,
      isCorrect,
      explanation: question.explanation
    };
  });

  const correctCount = results.filter((result) => result.isCorrect).length;
  const score = Math.round((correctCount / results.length) * 100);
  const passed = score >= quizStage.quiz.passingScore;
  const mastery = await evaluateSession(input.profileId, lesson.nodeId, score);
  const streak = await recordActivity(input.profileId);

  await db.insert(lessonAttempts).values({
    lessonId: lesson.id,
    profileId: input.profileId,
    nodeId: lesson.nodeId,
    score,
    correctCount,
    totalQuestions: results.length,
    passed
  });

  await db
    .update(lessons)
    .set({
      updatedAt: new Date(),
      contentJson: {
        ...lesson.contentJson,
        stages: lesson.contentJson.stages.map((stage) =>
          stage.type === "quiz"
            ? {
                ...stage,
                quiz: {
                  ...stage.quiz,
                  progress: {
                    completedQuestionIds: stage.quiz.questions.map((question) => question.id)
                  }
                }
              }
            : stage
        )
      }
    })
    .where(eq(lessons.id, lesson.id));

  return {
    lessonId: lesson.id,
    nodeId: lesson.nodeId,
    score,
    correctCount,
    totalQuestions: results.length,
    passed,
    passingScore: quizStage.quiz.passingScore,
    results,
    mastery,
    streak
  };
}

export async function getOrCreateNextLessonForSubject(profileId: string, subjectId: string) {
  const candidateSkillId = await getNextLessonNodeForSubject(profileId, subjectId);

  if (!candidateSkillId) {
    throw new Error("No lesson candidate available for this curriculum.");
  }

  return getOrCreateLessonForNode(profileId, candidateSkillId);
}

export async function listLessonsForProfile(profileId: string) {
  return db
    .select({
      id: lessons.id,
      nodeId: lessons.nodeId,
      title: lessons.title,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt
    })
    .from(lessons)
    .where(eq(lessons.profileId, profileId))
    .orderBy(asc(lessons.createdAt));
}

type ClassroomSubjectCard = {
  id: string;
  slug: string | null;
  title: string | null;
  fallbackTitle: string;
  description: string | null;
  progress: {
    completedCount: number;
    totalCount: number;
    percentDone: number;
  };
  nextLesson: null | {
    lessonId: string | null;
    nodeId: string;
    title: string;
    summary: string | null;
    status: string | null;
    domainTitle: string | null;
    clusterTitle: string | null;
    progress: {
      completedCount: number;
      totalCount: number;
      percentDone: number;
    };
  };
};

function extractLessonSummary(contentJson: unknown) {
  if (!contentJson || typeof contentJson !== "object") {
    return null;
  }

  const content = contentJson as Partial<StoredLessonContent>;
  if (!Array.isArray(content.stages)) {
    return null;
  }

  const slideDeckStage = content.stages.find((stage) => stage.type === "slideDeck");
  return slideDeckStage?.type === "slideDeck" ? slideDeckStage.slideDeck.summary : null;
}

function extractLessonItemProgress(contentJson: unknown) {
  if (!contentJson || typeof contentJson !== "object") {
    return { completedCount: 0, totalCount: 0, percentDone: 0 };
  }

  const content = contentJson as Partial<StoredLessonContent>;
  if (!Array.isArray(content.stages)) {
    return { completedCount: 0, totalCount: 0, percentDone: 0 };
  }

  const slideDeckStage = content.stages.find((stage) => stage.type === "slideDeck");
  const quizStage = content.stages.find((stage) => stage.type === "quiz");

  if (slideDeckStage?.type !== "slideDeck" || quizStage?.type !== "quiz") {
    return { completedCount: 0, totalCount: 0, percentDone: 0 };
  }

  const slideIds = new Set(slideDeckStage.slideDeck.slides.map((slide) => slide.id));
  const completedSlideIds = new Set(
    (slideDeckStage.slideDeck.progress?.completedSlideIds ?? []).filter((slideId) => slideIds.has(slideId))
  );
  const questionIds = new Set(quizStage.quiz.questions.map((question) => question.id));
  const completedQuestionIds = new Set(
    (quizStage.quiz.progress?.completedQuestionIds ?? []).filter((questionId) =>
      questionIds.has(questionId)
    )
  );

  const completedCount = completedSlideIds.size + completedQuestionIds.size;
  const totalCount = slideIds.size + questionIds.size;
  const percentDone = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return { completedCount, totalCount, percentDone };
}

async function getNextLessonPreview(
  profileId: string,
  subjectId: string,
  languageCode = "en-US"
) {
  const nextNodeId = await getNextLessonNodeForSubject(profileId, subjectId);

  if (!nextNodeId) {
    return null;
  }

  const [nodeRow] = await db.execute<{
    nodeId: string;
    title: string;
    fallbackTitle: string;
    description: string | null;
    skillObjective: string | null;
  }>(sql`
    SELECT
      cn.id AS "nodeId",
      COALESCE(nt.title, cn.title) AS title,
      cn.title AS "fallbackTitle",
      nt.description,
      cn.skill_objective AS "skillObjective"
    FROM curriculum_nodes cn
    LEFT JOIN node_translations nt
      ON nt.node_id = cn.id
     AND nt.language_code = ${languageCode}
    WHERE cn.id = ${nextNodeId}
    LIMIT 1
  `);

  if (!nodeRow) {
    return null;
  }

  const lineageRows = await db.execute<{
    id: string;
    type: string;
    title: string;
    depth: number;
  }>(sql`
    WITH RECURSIVE parent_chain AS (
      SELECT
        cn.id,
        cn.parent_id,
        cn.type,
        COALESCE(nt.title, cn.title) AS title,
        0::int AS depth
      FROM curriculum_nodes cn
      LEFT JOIN node_translations nt
        ON nt.node_id = cn.id
       AND nt.language_code = ${languageCode}
      WHERE cn.id = ${nextNodeId}

      UNION ALL

      SELECT
        parent.id,
        parent.parent_id,
        parent.type,
        COALESCE(nt.title, parent.title) AS title,
        child.depth + 1 AS depth
      FROM curriculum_nodes parent
      LEFT JOIN node_translations nt
        ON nt.node_id = parent.id
       AND nt.language_code = ${languageCode}
      INNER JOIN parent_chain child
        ON child.parent_id = parent.id
    )
    SELECT id, type, title, depth
    FROM parent_chain
    ORDER BY depth DESC
  `);

  const domainTitle = lineageRows.find((row) => row.type === "domain")?.title ?? null;
  const clusterTitle = lineageRows.find((row) => row.type === "cluster")?.title ?? null;

  const [lessonRow] = await db
    .select({
      id: lessons.id,
      status: lessons.status,
      title: lessons.title,
      contentJson: lessons.contentJson
    })
    .from(lessons)
    .where(and(eq(lessons.profileId, profileId), eq(lessons.nodeId, nextNodeId)))
    .limit(1);

  return {
    lessonId: lessonRow?.id ?? null,
    nodeId: nextNodeId,
    title: lessonRow?.title ?? nodeRow.title ?? nodeRow.fallbackTitle,
    summary:
      extractLessonSummary(lessonRow?.contentJson) ??
      nodeRow.description ??
      nodeRow.skillObjective ??
      null,
    status: lessonRow?.status ?? null,
    domainTitle,
    clusterTitle,
    progress: extractLessonItemProgress(lessonRow?.contentJson)
  };
}

export async function getStudentClassroomData(profileId: string, languageCode = "en-US") {
  const enrolledSubjects = await listEnrolledSubjectsForProfile(profileId, languageCode);
  const lessonsForProfile = await listLessonsForProfile(profileId);
  const streak = await getStreakStatus(profileId);

  const enrichedSubjects: ClassroomSubjectCard[] = await Promise.all(
    enrolledSubjects.map(async (subject) => {
      const nextLesson = await getNextLessonPreview(profileId, subject.id, languageCode);

      return {
        ...subject,
        progress: nextLesson?.progress ?? {
          completedCount: 0,
          totalCount: 0,
          percentDone: 0
        },
        nextLesson
      };
    })
  );

  return {
    enrolledSubjects: enrichedSubjects,
    streak,
    lessons: lessonsForProfile
  };
}

async function getNextLessonNodeForSubject(profileId: string, subjectId: string) {
  const rows = await db.execute<{
    id: string;
  }>(sql`
    WITH RECURSIVE curriculum_tree AS (
      SELECT
        cn.id,
        cn.parent_id,
        cn.introduced_in_week,
        cn.display_order,
        cn."order"
      FROM curriculum_nodes cn
      WHERE cn.id = ${subjectId}

      UNION ALL

      SELECT
        child.id,
        child.parent_id,
        child.introduced_in_week,
        child.display_order,
        child."order"
      FROM curriculum_nodes child
      INNER JOIN curriculum_tree parent
        ON child.parent_id = parent.id
    )
    SELECT ct.id
    FROM curriculum_tree ct
    INNER JOIN skills s
      ON s.node_id = ct.id
    LEFT JOIN student_mastery sm
      ON sm.profile_id = ${profileId}
     AND sm.node_id = ct.id
    WHERE COALESCE(sm.status, 'UNLOCKED') <> 'MASTERED'
    ORDER BY
      CASE COALESCE(sm.status, 'UNLOCKED')
        WHEN 'UNLOCKED' THEN 0
        WHEN 'REAFFIRMING' THEN 1
        WHEN 'LOCKED' THEN 2
        ELSE 3
      END,
      COALESCE(ct.introduced_in_week, 2147483647),
      ct.display_order,
      ct."order",
      ct.id
    LIMIT 1
  `);

  return rows[0]?.id ?? null;
}

export async function getNodeAncestors(nodeId: string) {
  return db.execute<{
    id: string;
    parentId: string | null;
    type: string;
    title: string;
    depth: number;
  }>(sql`
    WITH RECURSIVE parent_chain AS (
      SELECT
        cn.id,
        cn.parent_id AS "parentId",
        cn.type,
        cn.title,
        0::int AS depth
      FROM curriculum_nodes cn
      WHERE cn.id = ${nodeId}

      UNION ALL

      SELECT
        parent.id,
        parent.parent_id AS "parentId",
        parent.type,
        parent.title,
        child.depth + 1 AS depth
      FROM curriculum_nodes parent
      INNER JOIN parent_chain child
        ON child."parentId" = parent.id
    )
    SELECT * FROM parent_chain
    ORDER BY depth DESC
  `);
}

export async function listEnrolledSubjectsForProfile(profileId: string, languageCode = "en-US") {
  return db
    .select({
      id: curriculumNodes.id,
      slug: curriculumNodes.slug,
      title: nodeTranslations.title,
      fallbackTitle: curriculumNodes.title,
      description: nodeTranslations.description
    })
    .from(profileCurriculumEnrollments)
    .innerJoin(curriculumNodes, eq(profileCurriculumEnrollments.nodeId, curriculumNodes.id))
    .leftJoin(
      nodeTranslations,
      and(
        eq(nodeTranslations.nodeId, curriculumNodes.id),
        eq(nodeTranslations.languageCode, languageCode)
      )
    )
    .where(eq(profileCurriculumEnrollments.profileId, profileId))
    .orderBy(asc(curriculumNodes.displayOrder), asc(curriculumNodes.order));
}
