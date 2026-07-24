import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../db";

const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
const GEMINI_TEXT_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent`;
const GEMINI_IMAGE_MODELS = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"] as const;
const MAX_LOVO_SYNC_CHARACTERS = 450;
const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;

const LOVO_VOICE_BY_LANGUAGE: Record<
  string,
  { speaker: string; speakerStyle: string; displayName: string }
> = {
  "en-US": {
    speaker: "64e2f75136fe21ca612f160f",
    speakerStyle: "64ed9790b847e8e88006f01d",
    displayName: "Ava Gomez"
  },
  "ja-JP": {
    speaker: "63b40935241a82001d51c5c6",
    speakerStyle: "63b40935241a82001d51c5c7",
    displayName: "Ayaka Musashi"
  }
};

type LessonGenerationContext = {
  profile: {
    age: number | null;
    gradeLevel: number | null;
    languageCode: string;
  };
  node: {
    title: string;
    objective: string | null;
    description: string | null;
    standard: string | null;
  };
  prompt: {
    system: {
      pedagogicalTone: string;
      visualConstraint: string | null;
    };
    vocabulary: {
      whitelist: string[];
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
    locale: {
      countryCode: string;
      languageCode: string;
      currencyCode: string;
      denominations: Array<{
        name: string;
        displayValue: string;
      }>;
    } | null;
  };
};

type SlidePlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GeneratedImageSpec = {
  prompt: string;
  alt: string;
  placement: SlidePlacement;
};

type ImageQcResult = {
  pass: boolean;
  reason: string;
};

type QuizQuestionQcResult = {
  pass: boolean;
  reason: string;
};

type SlidePedagogyQcResult = {
  pass: boolean;
  reason: string;
};

export type GeneratedLessonBlueprint = {
  title: string;
  summary: string;
  slides: Array<{
    id: string;
    title: string;
    body: string;
    visualDependency: "required" | "helpful" | "none";
    imageSpec: GeneratedImageSpec;
  }>;
  quiz: {
    passingScore: number;
    questions: Array<{
      id: string;
      prompt: string;
      choices: string[];
      correctChoiceIndex: number;
      explanation: string;
      imageSpec?: {
        prompt: string;
        alt: string;
      } | null;
    }>;
  };
};

const promptCache = new Map<string, string>();

function loadPrompt(relativePath: string) {
  const cached = promptCache.get(relativePath);
  if (cached) {
    return cached;
  }

  const candidates = [
    resolve(process.cwd(), "app/ts-backend/prompts", relativePath),
    resolve(process.cwd(), "prompts", relativePath),
    resolve(import.meta.dir, "../../prompts", relativePath),
    resolve(import.meta.dir, "../prompts", relativePath)
  ];

  const foundPath = candidates.find((candidate) => existsSync(candidate));

  if (!foundPath) {
    throw new Error(`Prompt template not found: ${relativePath}`);
  }

  const value = readFileSync(foundPath, "utf8");
  promptCache.set(relativePath, value);
  return value;
}

function renderPromptTemplate(relativePath: string, values: Record<string, string>) {
  let template = loadPrompt(relativePath);

  for (const [key, value] of Object.entries(values)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }

  return template;
}

function getJsonText(response: unknown) {
  if (!response || typeof response !== "object") {
    throw new Error("Gemini returned an empty response.");
  }

  const candidates = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates;
  const text = candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("")?.trim();

  if (!text) {
    throw new Error("Gemini did not return lesson JSON.");
  }

  return text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
}

function parseGeminiJson<T>(response: unknown): T {
  const text = getJsonText(response);

  try {
    return JSON.parse(text) as T;
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const trimmed = text.slice(firstBrace, lastBrace + 1);
      return JSON.parse(trimmed) as T;
    }

    throw new Error("Gemini returned invalid JSON.");
  }
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function hasTemplatePlaceholder(text: string) {
  return /\{\{[^}]+\}\}/.test(text);
}

function isLowQualityGeneratedTitle(text: string) {
  const normalized = normalizeWhitespace(text);
  return normalized.length < 4 || hasTemplatePlaceholder(normalized);
}

function containsUnsupportedSlideInstruction(text: string) {
  const normalized = text.toLowerCase();

  return [
    /\b(click|tap|drag|drop|move|select|choose|pick|press|touch|point to|circle|draw|write|type|place|put)\b/,
    /\bcount\s+(the|these|this)\b/,
    /\bnow\s+(count|move|drag|choose|click|tap|point|circle|draw|write)\b/,
    /\blet'?s\s+(count|move|drag|choose|click|tap|point|circle|draw|write)\b/
  ].some((pattern) => pattern.test(normalized));
}

function textLikelyRequiresImage(text: string) {
  const normalized = text.toLowerCase();

  return [
    /\blook at\b/,
    /\bin the image\b/,
    /\bin the picture\b/,
    /\bpictured\b/,
    /\bshown\b/,
    /\bon the left\b/,
    /\bon the right\b/,
    /\bleft group\b/,
    /\bright group\b/,
    /\bhow many\b/,
    /\bcount\b/
  ].some((pattern) => pattern.test(normalized));
}

function preprocessTextForLovo(script: string) {
  return normalizeWhitespace(
    script
      // Expand inline math operators into spoken words.
      .replace(/(\S)\s*\+\s*(\S)/g, "$1 plus $2")
      .replace(/(\S)\s*-\s*(\S)/g, "$1 minus $2")
      // LOVO tends to speak colons awkwardly in educational copy.
      .replace(/:/g, " ")
      // Prevent acronyms or all-caps tokens from being spelled letter-by-letter.
      .replace(/\b([A-Z]{2,})\b/g, (match) => match.toLowerCase())
  );
}

function clampNarrationForLovo(script: string) {
  const normalized = preprocessTextForLovo(script);

  if (normalized.length <= MAX_LOVO_SYNC_CHARACTERS) {
    return normalized;
  }

  const sentences = normalized.match(/[^.!?]+[.!?]*/g) ?? [normalized];
  const kept: string[] = [];
  let total = 0;

  for (const sentence of sentences) {
    const next = normalizeWhitespace(sentence);
    if (!next) {
      continue;
    }

    const separator = kept.length > 0 ? 1 : 0;
    if (total + separator + next.length > MAX_LOVO_SYNC_CHARACTERS) {
      break;
    }

    kept.push(next);
    total += separator + next.length;
  }

  const joined = normalizeWhitespace(kept.join(" "));

  if (joined.length >= 120) {
    return joined;
  }

  return `${normalized.slice(0, MAX_LOVO_SYNC_CHARACTERS - 1).trimEnd()}...`;
}

function clampPlacement(input: SlidePlacement): SlidePlacement {
  const width = Math.max(220, Math.min(SLIDE_WIDTH - 80, Math.round(input.width)));
  const height = Math.max(220, Math.min(SLIDE_HEIGHT - 120, Math.round(input.height)));
  const x = Math.max(40, Math.min(SLIDE_WIDTH - width - 40, Math.round(input.x)));
  const y = Math.max(40, Math.min(SLIDE_HEIGHT - height - 40, Math.round(input.y)));

  return { x, y, width, height };
}

function validateBlueprint(value: unknown): GeneratedLessonBlueprint {
  const parsed = value as GeneratedLessonBlueprint;

  if (!parsed?.title || !parsed?.summary || !Array.isArray(parsed?.slides) || !Array.isArray(parsed?.quiz?.questions)) {
    throw new Error("Gemini returned lesson JSON in an unexpected shape.");
  }

  if (parsed.slides.length !== 3 || parsed.quiz.questions.length !== 3) {
    throw new Error("Gemini did not return the expected number of slides or quiz questions.");
  }

  for (const slide of parsed.slides) {
    if (
      !slide?.id ||
      !slide?.title ||
      !slide?.body ||
      !slide?.visualDependency ||
      !slide?.imageSpec?.prompt ||
      !slide?.imageSpec?.alt ||
      !slide?.imageSpec?.placement
    ) {
      throw new Error("Gemini returned an invalid slide.");
    }

    slide.body = normalizeWhitespace(slide.body);
    if (containsUnsupportedSlideInstruction(`${slide.title} ${slide.body}`)) {
      throw new Error("Gemini returned a non-interactive slide with unsupported student instructions.");
    }
    if (!["required", "helpful", "none"].includes(slide.visualDependency)) {
      throw new Error("Gemini returned an invalid visualDependency.");
    }
    slide.imageSpec.placement = clampPlacement(slide.imageSpec.placement);
  }

  if (isLowQualityGeneratedTitle(parsed.title)) {
    throw new Error("Gemini returned an invalid lesson title.");
  }

  for (const question of parsed.quiz.questions) {
    if (
      !question?.id ||
      !question?.prompt ||
      !Array.isArray(question?.choices) ||
      question.choices.length !== 3 ||
      typeof question?.correctChoiceIndex !== "number" ||
      !question?.explanation
    ) {
      throw new Error("Gemini returned an invalid quiz question.");
    }

    if (question.correctChoiceIndex < 0 || question.correctChoiceIndex > 2) {
      throw new Error("Gemini returned an invalid correctChoiceIndex.");
    }

    if (textLikelyRequiresImage(question.prompt) && !question.imageSpec?.prompt) {
      throw new Error("Gemini returned a visual quiz question without an image spec.");
    }
  }

  return parsed;
}

function buildBlueprintSchema() {
  return JSON.stringify(
    {
      title: "string",
      summary: "string",
      slides: [
        {
          id: "slide-1",
          title: "string",
          body: "string",
          visualDependency: "required | helpful | none",
          imageSpec: {
            prompt: "string",
            alt: "string",
            placement: {
              x: 980,
              y: 180,
              width: 760,
              height: 640
            }
          }
        }
      ],
      quiz: {
        passingScore: 80,
        questions: [
          {
            id: "q1",
            prompt: "string",
            choices: ["string", "string", "string"],
            correctChoiceIndex: 0,
            explanation: "string",
            imageSpec: {
              prompt: "string",
              alt: "string"
            }
          }
        ]
      }
    },
    null,
    2
  );
}

export async function generateLessonBlueprint(context: LessonGenerationContext) {
  if (!env.GOOGLE_AI_API_KEY) {
    throw new Error("Missing GOOGLE_AI_API_KEY for lesson generation.");
  }

  const systemPrompt = loadPrompt("lessons/slide-blueprint-system.txt");
  const userPrompt = renderPromptTemplate("lessons/slide-blueprint-user.txt", {
    SCHEMA_JSON: buildBlueprintSchema(),
    KNOWN_WORDS:
      context.prompt.vocabulary.whitelist.length > 0
        ? context.prompt.vocabulary.whitelist.slice(0, 120).join(", ")
        : "None provided.",
    UNKNOWN_WORDS:
      context.prompt.vocabulary.missingTechnicalKeywords.length > 0
        ? context.prompt.vocabulary.missingTechnicalKeywords
            .map((item) => {
              const details = [item.word];
              if (item.preferredSynonym) {
                details.push(`preferred synonym: ${item.preferredSynonym}`);
              }
              if (item.definitionSimple) {
                details.push(`simple definition: ${item.definitionSimple}`);
              }
              return details.join(" | ");
            })
            .join("\n")
        : "None provided.",
    REGIONAL_SUBSTITUTIONS:
      context.prompt.regionalSubstitutions.length > 0
        ? context.prompt.regionalSubstitutions.map((item) => `${item.name}: ${item.displayValue}`).join("\n")
        : "None provided.",
    CONTEXT_JSON: JSON.stringify(context, null, 2)
  });

  const response = await fetch(`${GEMINI_TEXT_ENDPOINT}?key=${env.GOOGLE_AI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.5
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${systemPrompt}\n\n${userPrompt}`
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini lesson generation failed with status ${response.status}: ${body}`);
  }

  const payload = await response.json();
  return validateBlueprint(parseGeminiJson<GeneratedLessonBlueprint>(payload));
}

function extractInlineImage(response: unknown) {
  if (!response || typeof response !== "object") {
    return null;
  }

  const candidates = (response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            data?: string;
            mimeType?: string;
          };
        }>;
      };
    }>;
  }).candidates;

  const parts = candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data && part.inlineData?.mimeType) {
      return {
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      };
    }
  }

  return null;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  return "png";
}

async function requestGeminiImage(prompt: string) {
  if (!env.GOOGLE_AI_API_KEY) {
    throw new Error("Missing GOOGLE_AI_API_KEY for image generation.");
  }

  let lastError: Error | null = null;

  for (const model of GEMINI_IMAGE_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await fetch(`${endpoint}?key=${env.GOOGLE_AI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.4,
          responseModalities: ["TEXT", "IMAGE"]
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      lastError = new Error(`Gemini image generation failed for ${model} with status ${response.status}: ${body}`);
      continue;
    }

    const payload = await response.json();
    const image = extractInlineImage(payload);

    if (!image) {
      lastError = new Error(`Gemini image generation returned no inline image for ${model}.`);
      continue;
    }

    return {
      ...image,
      extension: extensionForMimeType(image.mimeType)
    };
  }

  throw lastError ?? new Error("Gemini image generation failed.");
}

async function evaluateGeneratedImage(input: {
  promptPath: string;
  values: Record<string, string>;
  imageMimeType: string;
  imageDataBase64: string;
}) {
  if (!env.GOOGLE_AI_API_KEY) {
    throw new Error("Missing GOOGLE_AI_API_KEY for image quality control.");
  }

  const prompt = renderPromptTemplate(input.promptPath, input.values);
  const response = await fetch(`${GEMINI_TEXT_ENDPOINT}?key=${env.GOOGLE_AI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: input.imageMimeType,
                data: input.imageDataBase64
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini image QA failed with status ${response.status}: ${body}`);
  }

  const payload = parseGeminiJson<Partial<ImageQcResult>>(await response.json());
  return {
    pass: payload.pass === true,
    reason: typeof payload.reason === "string" ? payload.reason : "No QA reason returned."
  } satisfies ImageQcResult;
}

export async function generateSlideImageAsset(input: {
  lessonTitle: string;
  slideTitle: string;
  slideBody: string;
  imagePrompt: string;
  imageAlt: string;
}) {
  const prompt = renderPromptTemplate("images/slide-image-generation.txt", {
    LESSON_TITLE: input.lessonTitle,
    SLIDE_TITLE: input.slideTitle,
    SLIDE_BODY: input.slideBody,
    IMAGE_PROMPT: input.imagePrompt,
    IMAGE_ALT: input.imageAlt
  });

  let lastFailure: string | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const asset = await requestGeminiImage(prompt);
    const qc = await evaluateGeneratedImage({
      promptPath: "images/slide-image-qc.txt",
      values: {
        LESSON_TITLE: input.lessonTitle,
        SLIDE_TITLE: input.slideTitle,
        SLIDE_BODY: input.slideBody,
        IMAGE_PROMPT: input.imagePrompt,
        IMAGE_ALT: input.imageAlt
      },
      imageMimeType: asset.mimeType,
      imageDataBase64: asset.data
    });

    if (qc.pass) {
      return asset;
    }

    lastFailure = qc.reason;
  }

  throw new Error(`Slide image failed QA after retries: ${lastFailure ?? "Unknown reason."}`);
}

export async function generateQuizImageAsset(input: {
  questionPrompt: string;
  imagePrompt: string;
  imageAlt: string;
}) {
  const prompt = renderPromptTemplate("images/quiz-image-generation.txt", {
    QUESTION_PROMPT: input.questionPrompt,
    IMAGE_PROMPT: input.imagePrompt,
    IMAGE_ALT: input.imageAlt
  });

  let lastFailure: string | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const asset = await requestGeminiImage(prompt);
    const qc = await evaluateGeneratedImage({
      promptPath: "images/quiz-image-qc.txt",
      values: {
        QUESTION_PROMPT: input.questionPrompt,
        IMAGE_PROMPT: input.imagePrompt,
        IMAGE_ALT: input.imageAlt
      },
      imageMimeType: asset.mimeType,
      imageDataBase64: asset.data
    });

    if (qc.pass) {
      return asset;
    }

    lastFailure = qc.reason;
  }

  throw new Error(`Quiz image failed QA after retries: ${lastFailure ?? "Unknown reason."}`);
}

export async function validateQuizQuestion(input: {
  questionPrompt: string;
  choices: string[];
  correctChoiceIndex: number;
  explanation: string;
  imageMimeType?: string | null;
  imageDataBase64?: string | null;
}) {
  if (!env.GOOGLE_AI_API_KEY) {
    throw new Error("Missing GOOGLE_AI_API_KEY for quiz validation.");
  }

  const prompt = [
    "You are validating an elementary quiz question for correctness.",
    "Return strict JSON only:",
    '{ "pass": true, "reason": "short string" }',
    "Pass only if all of these are true:",
    "- Exactly one answer choice is supported by the question and image (if present).",
    "- The configured correctChoiceIndex matches that supported answer.",
    "- The explanation is consistent with the supported answer.",
    "- If the wording depends on counting or seeing objects, the image must actually support the count/question.",
    "- Fail if the image is missing but the question wording clearly depends on a visual count or a pictured object set.",
    "- Fail if the image leaks the answer by showing the matching numeral, duplicate number, highlighted option, or an arrangement that makes the answer obvious without reasoning.",
    "",
    `Question: ${input.questionPrompt}`,
    `Choices: ${input.choices.map((choice, index) => `${index}: ${choice}`).join(" | ")}`,
    `Configured correctChoiceIndex: ${input.correctChoiceIndex}`,
    `Configured correct choice: ${input.choices[input.correctChoiceIndex] ?? "MISSING"}`,
    `Explanation: ${input.explanation}`,
    input.imageDataBase64 ? "An image is attached." : "No image is attached."
  ].join("\n");

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: prompt }];

  if (input.imageDataBase64 && input.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: input.imageMimeType,
        data: input.imageDataBase64
      }
    });
  }

  const response = await fetch(`${GEMINI_TEXT_ENDPOINT}?key=${env.GOOGLE_AI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      },
      contents: [
        {
          role: "user",
          parts
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini quiz validation failed with status ${response.status}: ${body}`);
  }

  const payload = parseGeminiJson<Partial<QuizQuestionQcResult>>(await response.json());
  return {
    pass: payload.pass === true,
    reason: typeof payload.reason === "string" ? payload.reason : "No quiz QA reason returned."
  } satisfies QuizQuestionQcResult;
}

export async function validateTeachingSlide(input: {
  lessonTitle: string;
  slideTitle: string;
  slideBody: string;
  hasInteractiveComponent: boolean;
  imageMimeType?: string | null;
  imageDataBase64?: string | null;
}) {
  if (!env.GOOGLE_AI_API_KEY) {
    throw new Error("Missing GOOGLE_AI_API_KEY for slide validation.");
  }

  if (!input.hasInteractiveComponent && containsUnsupportedSlideInstruction(`${input.slideTitle} ${input.slideBody}`)) {
    return {
      pass: false,
      reason: "Slide contains unsupported student instructions for a non-interactive slide."
    } satisfies SlidePedagogyQcResult;
  }

  const prompt = renderPromptTemplate("lessons/slide-pedagogy-qc.txt", {
    LESSON_TITLE: input.lessonTitle,
    SLIDE_TITLE: input.slideTitle,
    SLIDE_BODY: input.slideBody,
    HAS_INTERACTIVE_COMPONENT: input.hasInteractiveComponent ? "true" : "false"
  });

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: prompt }];

  if (input.imageDataBase64 && input.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: input.imageMimeType,
        data: input.imageDataBase64
      }
    });
  }

  const response = await fetch(`${GEMINI_TEXT_ENDPOINT}?key=${env.GOOGLE_AI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      },
      contents: [
        {
          role: "user",
          parts
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini slide validation failed with status ${response.status}: ${body}`);
  }

  const payload = parseGeminiJson<Partial<SlidePedagogyQcResult>>(await response.json());
  return {
    pass: payload.pass === true,
    reason: typeof payload.reason === "string" ? payload.reason : "No slide QA reason returned."
  } satisfies SlidePedagogyQcResult;
}

function getLovoVoice(languageCode: string) {
  return LOVO_VOICE_BY_LANGUAGE[languageCode] ?? LOVO_VOICE_BY_LANGUAGE["en-US"];
}

function extractAudioUrl(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return /^https?:\/\//.test(value) && /\.(mp3|wav|m4a)(\?|$)/i.test(value) ? value : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = extractAudioUrl(item);
      if (match) {
        return match;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const match = extractAudioUrl(nested);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

async function retrieveLovoJob(jobId: string) {
  const response = await fetch(`https://api.genny.lovo.ai/api/v1/tts/${jobId}`, {
    headers: {
      accept: "application/json",
      "X-API-KEY": env.GENNY_LOVO_API_KEY as string
    }
  });

  if (!response.ok) {
    throw new Error(`LOVO job retrieval failed with status ${response.status}.`);
  }

  return response.json();
}

export async function synthesizeNarrationAudio(input: {
  languageCode: string;
  script: string;
}) {
  if (!env.GENNY_LOVO_API_KEY) {
    throw new Error("Missing GENNY_LOVO_API_KEY for narration synthesis.");
  }

  const safeScript = clampNarrationForLovo(input.script);
  const voice = getLovoVoice(input.languageCode);
  let payload: unknown = null;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch("https://api.genny.lovo.ai/api/v1/tts/sync", {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "X-API-KEY": env.GENNY_LOVO_API_KEY
      },
      body: JSON.stringify({
        speed: 1,
        text: safeScript,
        speaker: voice.speaker,
        speakerStyle: voice.speakerStyle
      })
    });

    if (response.ok) {
      payload = await response.json();
      lastError = null;
      break;
    }

    const message = await response.text().catch(() => "");
    lastError = new Error(`LOVO sync TTS failed with status ${response.status}: ${message}`);

    if (response.status !== 429 || attempt === 3) {
      break;
    }

    await Bun.sleep(1200 * (attempt + 1));
  }

  if (lastError || !payload) {
    throw lastError ?? new Error("LOVO sync TTS failed.");
  }

  let sourceUrl = extractAudioUrl(payload);

  if (!sourceUrl) {
    const jobId =
      (payload as { id?: string; jobId?: string; data?: { id?: string; jobId?: string } }).jobId ??
      (payload as { id?: string }).id ??
      (payload as { data?: { id?: string; jobId?: string } }).data?.jobId ??
      (payload as { data?: { id?: string; jobId?: string } }).data?.id;

    if (!jobId) {
      throw new Error("LOVO did not return an audio URL or job id.");
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await Bun.sleep(1500);
      const jobPayload = await retrieveLovoJob(jobId);
      sourceUrl = extractAudioUrl(jobPayload);
      if (sourceUrl) {
        break;
      }
    }
  }

  if (!sourceUrl) {
    throw new Error("LOVO audio generation did not finish in time.");
  }

  return {
    sourceUrl,
    voice,
    script: safeScript
  };
}
