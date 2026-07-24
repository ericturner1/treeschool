import { z } from "zod";
import { env } from "../db";
import { normalizeGeminiUsage } from "./model-providers/gemini-usage";
import { recordModelUsage, type ModelUsageContext } from "./model-usage";
import {
  CORE_CURRICULUM_AREA_KEYS,
  CURRICULUM_COVERAGE_FRAMEWORK_VERSION,
  coverageForGrade,
  coverageStrengthForDepth,
  curriculumCoverageRubricForGrade,
  scoreCompetencyCoverage,
  type CurriculumCoverageProfile
} from "./curriculum-coverage";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CURRICULUM_REVIEW_MAX_ATTEMPTS = 2;

class CurriculumReviewAttemptError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "CurriculumReviewAttemptError";
  }
}

function cappedModelText(maxLength: number) {
  return z.string().trim().min(1).transform((value) => value.slice(0, maxLength));
}

const inputSchema = z.object({
  studentGradeLevel: z.number().int().min(0).max(12).nullable(),
  subjects: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    parentLevel: z.string().trim().max(40).nullable().optional(),
    materials: z.array(z.object({
      title: z.string().trim().max(180),
      summary: z.string().trim().max(1200).nullable().optional(),
      sectionTitles: z.array(z.string().trim().max(180)).max(40).default([]),
      academicLevel: z.object({
        label: z.string().trim().max(120),
        gradeMin: z.number().int().min(0).max(12).nullable(),
        gradeMax: z.number().int().min(0).max(12).nullable(),
        evidence: z.array(z.string().trim().max(240)).max(8),
        confidence: z.enum(["low", "medium", "high"])
      }).nullable().optional()
    })).max(30).default([])
  })).min(1).max(30)
});

const coveredDepthSchema = z.enum(["introduced", "practiced", "assessed", "comprehensive"]);

function omitExplicitlyUncoveredCompetencies(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.filter((item) => {
    if (!item || typeof item !== "object" || !("depth" in item)) return true;
    const depth = typeof item.depth === "string"
      ? item.depth.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
      : "";
    return !["not covered", "no coverage", "none", "absent", "uncovered"].includes(depth);
  });
}

const modelResponseSchema = z.object({
  summary: cappedModelText(600),
  strengths: z.array(cappedModelText(180))
    .transform((items) => Array.from(new Set(items)).slice(0, 6))
    .default([]),
  coreAreas: z.object({
    mathematics: z.object({
      summary: cappedModelText(360)
    }),
    languageArts: z.object({
      summary: cappedModelText(360)
    }),
    science: z.object({
      summary: cappedModelText(360)
    }),
    socialStudies: z.object({
      summary: cappedModelText(360)
    })
  }),
  competencyCoverage: z.preprocess(
    omitExplicitlyUncoveredCompetencies,
    z.array(z.object({
      competencyId: cappedModelText(180),
      depth: coveredDepthSchema,
      confidence: z.enum(["low", "medium", "high"]),
      evidence: z.array(cappedModelText(240))
        .transform((items) => Array.from(new Set(items)).slice(0, 8))
        .default([])
    }))
  ).transform((items) => items.filter((item) => item.evidence.length > 0).slice(0, 80)).default([]),
  concerns: z.array(z.object({
    kind: z.enum(["missing_subject", "level_concern"]),
    subject: cappedModelText(80),
    title: cappedModelText(140),
    explanation: cappedModelText(360),
    priority: z.enum(["essential", "recommended"]),
    competencyIds: z.array(cappedModelText(180))
      .transform((items) => Array.from(new Set(items)).slice(0, 8))
      .default([])
  })).transform((items) => items.slice(0, 10)).default([])
});

export function parseCurriculumCompletenessModelResponse(value: unknown) {
  return modelResponseSchema.parse(value);
}

export type CurriculumCompletenessInput = z.infer<typeof inputSchema>;
const resultCompetencySchema = z.object({
  competencyId: z.string().trim().min(1).max(180),
  label: z.string().trim().min(1).max(180),
  depth: z.enum(["introduced", "practiced", "assessed", "comprehensive"]),
  strength: z.number().min(0).max(1),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string().trim().min(1).max(240)).max(12)
});
const resultCoreAreaSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(360),
  competencies: z.array(resultCompetencySchema).max(80)
});
const curriculumCompletenessResultSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  strengths: z.array(z.string().trim().min(1).max(180)).max(6).default([]),
  coreAreas: z.object({
    mathematics: resultCoreAreaSchema,
    languageArts: resultCoreAreaSchema,
    science: resultCoreAreaSchema,
    socialStudies: resultCoreAreaSchema
  }),
  concerns: modelResponseSchema.shape.concerns,
  status: z.enum(["broadly_complete", "needs_attention"]),
  framework: z.literal("general_english_language_homeschool"),
  coverageFrameworkVersion: z.literal(CURRICULUM_COVERAGE_FRAMEWORK_VERSION),
  studentGradeLevel: z.number().int().min(0).max(12).nullable()
});
export type CurriculumCompletenessResult = z.infer<typeof curriculumCompletenessResultSchema>;

export function parsePersistedCurriculumCompletenessResult(value: unknown) {
  const parsed = curriculumCompletenessResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function concernCoreArea(subject: string) {
  const normalized = subject.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (/math/.test(normalized)) return "mathematics" as const;
  if (/language|english|reading|writing|grammar|spelling|phonics/.test(normalized)) return "languageArts" as const;
  if (/science/.test(normalized)) return "science" as const;
  if (/social|history|geography|civics|econom/.test(normalized)) return "socialStudies" as const;
  return null;
}

export function applyCurriculumCoverageProfiles(
  current: CurriculumCompletenessResult,
  profiles: CurriculumCoverageProfile[]
) {
  if (current.studentGradeLevel == null || current.coverageFrameworkVersion !== CURRICULUM_COVERAGE_FRAMEWORK_VERSION) {
    return current;
  }
  const gradeLevel = current.studentGradeLevel;
  const rubric = curriculumCoverageRubricForGrade(gradeLevel);
  const rubricById = new Map(rubric.map((item) => [item.id, item]));
  const additions = profiles.flatMap((profile) => {
    const gradeProfile = coverageForGrade(profile, gradeLevel);
    return gradeProfile?.competencies.flatMap((claim) => {
      const competency = rubricById.get(claim.competencyId);
      return competency ? [{
        competencyId: claim.competencyId,
        label: competency.label,
        depth: claim.depth,
        strength: claim.strength,
        confidence: claim.confidence,
        evidence: claim.evidence.map((item) => `${item.unitTitle} (PDF pages ${item.pdfPageStart}–${item.pdfPageEnd})`)
      }] : [];
    }) ?? [];
  });
  if (!additions.length) return current;

  const existing = CORE_CURRICULUM_AREA_KEYS.flatMap((area) => current.coreAreas[area].competencies);
  const strongest = new Map<string, typeof existing[number]>();
  for (const claim of [...existing, ...additions]) {
    const present = strongest.get(claim.competencyId);
    if (!present || claim.strength > present.strength) strongest.set(claim.competencyId, claim);
  }
  const merged = Array.from(strongest.values());
  const scores = scoreCompetencyCoverage(gradeLevel, merged);
  const changedAreas = CORE_CURRICULUM_AREA_KEYS.filter((area) => scores[area] > current.coreAreas[area].score);
  if (!changedAreas.length) return current;

  const remainingConcerns = current.concerns.filter((concern) => {
    if (concern.competencyIds.length) {
      return !concern.competencyIds.every((competencyId) => (strongest.get(competencyId)?.strength ?? 0) >= 0.6);
    }
    const area = concernCoreArea(concern.subject);
    return !area || scores[area] < 70 || scores[area] <= current.coreAreas[area].score;
  });
  const result = {
    ...current,
    summary: remainingConcerns.length
      ? "Estimated curriculum coverage has been updated using the indexed material you added. Review the remaining possible gaps below."
      : "Estimated curriculum coverage has been updated using the indexed material you added. The four core areas now appear broadly represented.",
    coreAreas: Object.fromEntries(CORE_CURRICULUM_AREA_KEYS.map((area) => [area, {
      score: scores[area],
      summary: scores[area] > current.coreAreas[area].score
        ? `Estimated coverage increased from ${current.coreAreas[area].score}% to ${scores[area]}% using evidence from the added indexed material.`
        : current.coreAreas[area].summary,
      competencies: merged.filter((claim) => rubricById.get(claim.competencyId)?.area === area)
    }])),
    concerns: remainingConcerns,
    status: remainingConcerns.length ? "needs_attention" as const : "broadly_complete" as const
  };
  return curriculumCompletenessResultSchema.parse(result);
}

function parseJsonResponse(payload: unknown) {
  const text = (
    payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }
  ).candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

  if (!text) throw new Error("The curriculum review returned an empty response.");
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as unknown;
}

function structuredOutputIssueSummary(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message
    }));
  }
  return [{
    path: "response",
    code: error instanceof SyntaxError ? "invalid_json" : "invalid_output",
    message: error instanceof Error ? error.message : "Unknown structured-output error"
  }];
}

function isDeferredLearningAreaConcern(concern: z.infer<typeof modelResponseSchema>["concerns"][number]) {
  const normalizedSubject = concern.subject
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (normalizedSubject.includes("language arts")) return false;
  return /(^|\s)(art|arts|music|health)(\s|$)/.test(normalizedSubject)
    || normalizedSubject.includes("physical education")
    || /(^|\s)p e($|\s)/.test(normalizedSubject);
}

export function normalizeCurriculumCompletenessConcerns(input: {
  concerns: z.infer<typeof modelResponseSchema>["concerns"];
  gradeLevel: number;
  competencies: Array<{ competencyId: string; strength: number }>;
  scores: Record<(typeof CORE_CURRICULUM_AREA_KEYS)[number], number>;
}) {
  const rubric = curriculumCoverageRubricForGrade(input.gradeLevel);
  const rubricById = new Map(rubric.map((competency) => [competency.id, competency]));
  const strengthById = new Map(input.competencies.map((claim) => [claim.competencyId, claim.strength]));

  return input.concerns.flatMap((concern) => {
    if (isDeferredLearningAreaConcern(concern)) return [];
    const validIds = concern.competencyIds.filter((competencyId) => rubricById.has(competencyId));
    if (concern.kind === "level_concern") return [{ ...concern, competencyIds: validIds }];

    const underCoveredEssentialIds = validIds.filter((competencyId) => {
      const competency = rubricById.get(competencyId);
      return competency?.priority === "essential" && (strengthById.get(competencyId) ?? 0) < 0.6;
    });
    if (underCoveredEssentialIds.length) {
      return [{ ...concern, priority: "essential" as const, competencyIds: underCoveredEssentialIds }];
    }

    // A model can occasionally identify a completely absent core subject without
    // returning competency IDs. Preserve that useful warning only when the
    // deterministic area score confirms that the area is genuinely sparse.
    const area = concernCoreArea(concern.subject);
    if (!validIds.length && area && input.scores[area] < 35) {
      return [{ ...concern, priority: "essential" as const, competencyIds: [] }];
    }
    return [];
  });
}

export async function evaluateCurriculumCompleteness(
  rawInput: CurriculumCompletenessInput,
  usageContext: ModelUsageContext = {}
): Promise<CurriculumCompletenessResult> {
  const input = inputSchema.parse(rawInput);
  if (!env.GOOGLE_AI_API_KEY) throw new Error("Curriculum review is not configured.");

  const gradeLabel = input.studentGradeLevel === 0
    ? "Kindergarten"
    : input.studentGradeLevel == null ? "Not supplied" : `Grade ${input.studentGradeLevel}`;
  const coverageGradeLevel = input.studentGradeLevel ?? 1;
  const coverageRubric = curriculumCoverageRubricForGrade(coverageGradeLevel);
  const prompt = `You are a careful, practical educational planner reviewing a proposed homeschool learning year.

Evaluate only the broad academic completeness of the subjects and levels supplied below for the student's grade. This is general English-language homeschool guidance, not a review against any country's laws, accreditation rules, or official standards.

Use these principles:
- Treat mathematics; language arts (reading, writing, grammar/language); science; and social studies/history/geography as the main academic areas. A single well-named subject can cover several related areas.
- For this version of the review, evaluate and recommend only mathematics, language arts, science, and social studies/history/geography. Do not flag, recommend, or mention missing arts, music, physical education, or health, even when those areas are absent.
- The list describes materials uploaded to Treeschool, not necessarily everything the parent teaches. Phrase concerns as possible gaps, never as definitive failures.
- Determine each material's academic level primarily from its extracted title-page, introductory-page, table-of-contents, summary, and section evidence. Give explicit publisher grade/age statements the greatest weight, then scope and sequence. Do not infer a precise grade merely from subject name.
- "parentLevel" is optional and often only a parent-defined sequencing label such as "a", "1", or "101". Treat it as secondary evidence for ordering, not the material's academic level. Never flag a missing or opaque parentLevel. Raise a level_concern only when the material evidence clearly indicates that it is substantially above or below the student's supplied grade.
- Consolidate aliases and duplicates. Be concise, supportive, and specific.
- Map the supplied evidence to Treeschool's fixed competency rubric below. Use only exact listed competency IDs. A competency requires direct evidence in the supplied material metadata. Do not invent coverage merely from a broad subject name.
- For every mapped competency, choose a depth: introduced for brief exposure, practiced for meaningful instruction or repetition, assessed when the material also checks the competency, or comprehensive for broad sustained treatment. Treeschool calculates percentages deterministically after your response; do not calculate or invent percentages.
- If a competency is not covered, omit it from competencyCoverage entirely. Never return "not covered", "none", or any other uncovered value as a depth.
- The rubric labels each competency essential, supporting, or enrichment. Only return a missing_subject concern for an essential competency that has no meaningful evidence or is below practiced depth. Do not create gap warnings or purchase suggestions for supporting or enrichment competencies. A printable workbook is not expected to contain every parent-led speaking, discussion, inquiry, or hands-on activity.
- For Kindergarten through Grade 2, engineering connections are enrichment, not a required standalone subject. Do not flag them as a gap. Treat observation and inquiry as useful supporting practice that may happen outside the uploaded books.
- Return no more than 8 concise evidence entries for any one competency. Prefer the strongest representative evidence instead of listing every matching section.
- Do not claim legal compliance. Do not recommend a particular country, curriculum system, company, product, URL, or seller.
- Return no more than 6 concerns. Essential concerns come before recommended ones.

Return JSON with exactly this shape:
{
  "summary": "one or two concise sentences",
  "strengths": ["short strength"],
  "coreAreas": {
    "mathematics": { "summary": "short evidence-based assessment" },
    "languageArts": { "summary": "short evidence-based assessment" },
    "science": { "summary": "short evidence-based assessment" },
    "socialStudies": { "summary": "short evidence-based assessment" }
  },
  "competencyCoverage": [{
    "competencyId": "exact rubric competency id",
    "depth": "introduced" | "practiced" | "assessed" | "comprehensive",
    "confidence": "low" | "medium" | "high",
    "evidence": ["specific material or section evidence"]
  }],
  "concerns": [{
    "kind": "missing_subject" | "level_concern",
    "subject": "canonical subject area",
    "title": "short parent-friendly heading",
    "explanation": "why this may matter for this grade",
    "priority": "essential" | "recommended",
    "competencyIds": ["exact missing or under-covered rubric competency id"]
  }]
}

Student grade: ${gradeLabel}
Treeschool coverage framework: ${CURRICULUM_COVERAGE_FRAMEWORK_VERSION}
Fixed rubric for this student:
${JSON.stringify(coverageRubric, null, 2)}

Proposed subjects, extracted material evidence, and secondary parent-supplied levels:
${JSON.stringify(input.subjects, null, 2)}`;

  let parsed: z.infer<typeof modelResponseSchema> | null = null;
  let lastAttemptError: unknown = null;

  for (let attempt = 1; attempt <= CURRICULUM_REVIEW_MAX_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    const attemptPrompt = attempt === 1
      ? prompt
      : `${prompt}\n\nThis is a retry after the previous response could not be validated. Follow the exact JSON shape and enum values above. Omit uncovered competencies instead of assigning an uncovered depth.`;

    try {
      let response: Response;
      try {
        response = await fetch(`${GEMINI_ENDPOINT}?key=${env.GOOGLE_AI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: attemptPrompt }] }],
            generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
          })
        });
      } catch (error) {
        await recordModelUsage({
          context: usageContext,
          operation: "curriculum.completeness_review",
          provider: "google",
          model: GEMINI_MODEL,
          status: "failed",
          durationMs: Date.now() - startedAt,
          errorCode: `attempt_${attempt}_${error instanceof Error ? error.name : "network_error"}`
        });
        throw new CurriculumReviewAttemptError("Curriculum review request failed.", true, { cause: error });
      }

      const providerRequestId = response.headers.get("x-goog-request-id")
        ?? response.headers.get("x-request-id");

      if (!response.ok) {
        await recordModelUsage({
          context: usageContext,
          operation: "curriculum.completeness_review",
          provider: "google",
          model: GEMINI_MODEL,
          status: "failed",
          providerRequestId,
          durationMs: Date.now() - startedAt,
          errorCode: `attempt_${attempt}_http_${response.status}`
        });
        throw new CurriculumReviewAttemptError(
          "Curriculum review provider request failed.",
          response.status === 429 || response.status >= 500
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        await recordModelUsage({
          context: usageContext,
          operation: "curriculum.completeness_review",
          provider: "google",
          model: GEMINI_MODEL,
          status: "invalid_response",
          providerRequestId,
          durationMs: Date.now() - startedAt,
          errorCode: `attempt_${attempt}_invalid_json_response`
        });
        throw new CurriculumReviewAttemptError("Curriculum review returned invalid JSON.", true, { cause: error });
      }

      const usage = normalizeGeminiUsage(payload);
      try {
        parsed = parseCurriculumCompletenessModelResponse(parseJsonResponse(payload));
      } catch (error) {
        console.error("Curriculum completeness model response validation failed.", {
          attempt,
          providerRequestId,
          issues: structuredOutputIssueSummary(error)
        });
        await recordModelUsage({
          context: usageContext,
          operation: "curriculum.completeness_review",
          provider: "google",
          model: GEMINI_MODEL,
          status: "invalid_response",
          providerRequestId,
          durationMs: Date.now() - startedAt,
          errorCode: `attempt_${attempt}_invalid_structured_output`,
          usage
        });
        throw new CurriculumReviewAttemptError("Curriculum review returned invalid structured output.", true, { cause: error });
      }

      await recordModelUsage({
        context: usageContext,
        operation: "curriculum.completeness_review",
        provider: "google",
        model: GEMINI_MODEL,
        status: "succeeded",
        providerRequestId,
        durationMs: Date.now() - startedAt,
        usage
      });
      break;
    } catch (error) {
      lastAttemptError = error;
      const shouldRetry = error instanceof CurriculumReviewAttemptError
        && error.retryable
        && attempt < CURRICULUM_REVIEW_MAX_ATTEMPTS;
      if (shouldRetry) continue;
      break;
    }
  }

  if (!parsed) {
    throw new Error(
      "Treeschool hit a temporary problem while reviewing your materials. Your work is safe. Please try the review again.",
      { cause: lastAttemptError }
    );
  }
  const rubricById = new Map(coverageRubric.map((competency) => [competency.id, competency]));
  const competencies = parsed.competencyCoverage.flatMap((claim) => {
    const competency = rubricById.get(claim.competencyId);
    return competency ? [{
      competencyId: competency.id,
      label: competency.label,
      depth: claim.depth,
      strength: coverageStrengthForDepth(claim.depth),
      confidence: claim.confidence,
      evidence: claim.evidence
    }] : [];
  });
  const scores = scoreCompetencyCoverage(coverageGradeLevel, competencies);
  const normalizedConcerns = normalizeCurriculumCompletenessConcerns({
    concerns: parsed.concerns,
    gradeLevel: coverageGradeLevel,
    competencies,
    scores
  });
  return {
    summary: parsed.summary,
    strengths: parsed.strengths,
    coreAreas: Object.fromEntries(CORE_CURRICULUM_AREA_KEYS.map((area) => [area, {
      score: scores[area],
      summary: parsed.coreAreas[area].summary,
      competencies: competencies.filter((competency) => rubricById.get(competency.competencyId)?.area === area)
    }])) as CurriculumCompletenessResult["coreAreas"],
    concerns: normalizedConcerns,
    status: normalizedConcerns.length > 0 ? "needs_attention" : "broadly_complete",
    framework: "general_english_language_homeschool",
    coverageFrameworkVersion: CURRICULUM_COVERAGE_FRAMEWORK_VERSION,
    studentGradeLevel: input.studentGradeLevel
  };
}
