import { z } from "zod";
import { env } from "../db";
import { normalizeGeminiUsage } from "./model-providers/gemini-usage";
import { recordModelUsage, type ModelUsageContext } from "./model-usage";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export const CURRICULUM_COVERAGE_FRAMEWORK_VERSION = "general-english-core-v2";
export const CORE_CURRICULUM_AREA_KEYS = [
  "mathematics",
  "languageArts",
  "science",
  "socialStudies"
] as const;

export type CoreCurriculumAreaKey = typeof CORE_CURRICULUM_AREA_KEYS[number];
export type CoverageDepth = "introduced" | "practiced" | "assessed" | "comprehensive";

const DEPTH_STRENGTH: Record<CoverageDepth, number> = {
  introduced: 0.35,
  practiced: 0.6,
  assessed: 0.8,
  comprehensive: 1
};

export function coverageStrengthForDepth(depth: CoverageDepth) {
  return DEPTH_STRENGTH[depth];
}

export type CoveragePriority = "essential" | "supporting" | "enrichment";

type AreaCompetencyDefinition = {
  key: string;
  label: string;
  description: string;
  earlyElementaryDescription?: string;
  priority: CoveragePriority;
  laterPriority?: CoveragePriority;
  earlyElementaryWeight: number;
  laterWeight: number;
};

const GRADE_ONE_STANDARDS_REFERENCES: Record<
  CoreCurriculumAreaKey,
  Record<string, string[]>
> = {
  mathematics: {
    number_sense: ["CCSS.Math.Content.1.NBT.A–C"],
    operations: ["CCSS.Math.Content.1.OA.A–C"],
    algebraic_reasoning: ["CCSS.Math.Content.1.OA.D"],
    measurement_data: ["CCSS.Math.Content.1.MD.A–C"],
    geometry: ["CCSS.Math.Content.1.G.A"]
  },
  languageArts: {
    reading_foundations: ["CCSS.ELA-Literacy.RF.1.1–4"],
    reading_comprehension: [
      "CCSS.ELA-Literacy.RL.1.1–10",
      "CCSS.ELA-Literacy.RI.1.1–10"
    ],
    writing_composition: ["CCSS.ELA-Literacy.W.1.1–8"],
    language_conventions: ["CCSS.ELA-Literacy.L.1.1–6"],
    communication_research: ["CCSS.ELA-Literacy.SL.1.1–6"]
  },
  science: {
    scientific_inquiry: ["NGSS science and engineering practices embedded in Grade 1 PEs"],
    life_science: ["NGSS 1-LS1-1–2", "NGSS 1-LS3-1"],
    physical_science: ["NGSS 1-PS4-1–4"],
    earth_space: ["NGSS 1-ESS1-1–2"],
    engineering: ["NGSS K-2-ETS1-1–3"]
  },
  socialStudies: {
    civics: ["C3 D2.Civ.K–2"],
    history: ["C3 D2.His.K–2"],
    geography: ["C3 D2.Geo.K–2"],
    economics: ["C3 D2.Eco.K–2"],
    culture_inquiry: ["C3 D1, D3, and D4.K–2"]
  }
};

const AREA_COMPETENCIES: Record<CoreCurriculumAreaKey, AreaCompetencyDefinition[]> = {
  mathematics: [
    { key: "number_sense", label: "Number sense", description: "quantities, place value, magnitude, and number relationships", earlyElementaryDescription: "counting, comparing quantities, place value, and number relationships", priority: "essential", earlyElementaryWeight: 28, laterWeight: 22 },
    { key: "operations", label: "Operations", description: "age-appropriate computation and operational fluency", earlyElementaryDescription: "meaningful addition and subtraction with age-appropriate fluency", priority: "essential", earlyElementaryWeight: 30, laterWeight: 25 },
    { key: "algebraic_reasoning", label: "Algebraic reasoning", description: "patterns, equivalence, unknowns, and generalized relationships", earlyElementaryDescription: "patterns, equality, and finding simple unknown values", priority: "essential", earlyElementaryWeight: 14, laterWeight: 18 },
    { key: "measurement_data", label: "Measurement and data", description: "measurement, time, money, data representation, and interpretation", earlyElementaryDescription: "comparing and measuring, telling time, and making or reading simple data displays", priority: "essential", earlyElementaryWeight: 16, laterWeight: 18 },
    { key: "geometry", label: "Geometry and spatial reasoning", description: "shapes, position, spatial relationships, and geometric reasoning", earlyElementaryDescription: "recognizing, describing, composing, and partitioning common two- and three-dimensional shapes", priority: "essential", earlyElementaryWeight: 12, laterWeight: 17 }
  ],
  languageArts: [
    { key: "reading_foundations", label: "Reading foundations", description: "phonological awareness, phonics, decoding, fluency, and vocabulary at the applicable level", priority: "essential", earlyElementaryWeight: 25, laterWeight: 18 },
    { key: "reading_comprehension", label: "Reading comprehension", description: "understanding, interpreting, and responding to literary and informational text", priority: "essential", earlyElementaryWeight: 25, laterWeight: 24 },
    { key: "writing_composition", label: "Writing and composition", description: "communicating ideas through age-appropriate written forms and the writing process", earlyElementaryDescription: "drawing, dictating, and writing words or connected sentences to communicate ideas", priority: "essential", earlyElementaryWeight: 20, laterWeight: 24 },
    { key: "language_conventions", label: "Grammar and conventions", description: "grammar, usage, spelling, capitalization, punctuation, and sentence construction", priority: "essential", earlyElementaryWeight: 20, laterWeight: 20 },
    { key: "communication_research", label: "Speaking, listening, and inquiry", description: "speaking, listening, discussion, information gathering, and source use", earlyElementaryDescription: "participating in conversations, listening, asking questions, and recalling information with adult support", priority: "supporting", earlyElementaryWeight: 10, laterWeight: 14 }
  ],
  science: [
    { key: "scientific_inquiry", label: "Observation and inquiry", description: "asking questions, observing, investigating, using evidence, and communicating findings", earlyElementaryDescription: "making careful observations, asking simple questions, and discussing evidence, often through parent-led hands-on activity", priority: "supporting", earlyElementaryWeight: 10, laterWeight: 15 },
    { key: "life_science", label: "Life science", description: "living things, structures, life cycles, ecosystems, heredity, and adaptation", priority: "essential", earlyElementaryWeight: 30, laterWeight: 25 },
    { key: "physical_science", label: "Physical science", description: "matter, energy, forces, motion, light, sound, and physical interactions", priority: "essential", earlyElementaryWeight: 30, laterWeight: 25 },
    { key: "earth_space", label: "Earth and space science", description: "Earth systems, weather, resources, landforms, space, and observable patterns", priority: "essential", earlyElementaryWeight: 30, laterWeight: 25 },
    { key: "engineering", label: "Engineering connections", description: "designing, testing, improving solutions, and applying scientific ideas", earlyElementaryDescription: "optional, age-appropriate opportunities to build or compare simple solutions", priority: "enrichment", laterPriority: "supporting", earlyElementaryWeight: 0, laterWeight: 10 }
  ],
  socialStudies: [
    { key: "civics", label: "Civics and community", description: "rules, responsibilities, institutions, citizenship, and participation", priority: "essential", earlyElementaryWeight: 20, laterWeight: 20 },
    { key: "history", label: "History", description: "chronology, continuity, change, historical people, events, and evidence", priority: "essential", earlyElementaryWeight: 20, laterWeight: 22 },
    { key: "geography", label: "Geography", description: "location, maps, environments, regions, and relationships between people and places", priority: "essential", earlyElementaryWeight: 25, laterWeight: 22 },
    { key: "economics", label: "Economics", description: "needs, wants, resources, work, exchange, choices, and economic systems", earlyElementaryDescription: "needs, wants, work, goods, services, resources, and simple choices", priority: "essential", earlyElementaryWeight: 20, laterWeight: 20 },
    { key: "culture_inquiry", label: "Culture and perspectives", description: "identity, culture, perspectives, communities, and evaluating social information", earlyElementaryDescription: "families, communities, traditions, similarities, differences, and respectful awareness of perspectives", priority: "supporting", earlyElementaryWeight: 15, laterWeight: 16 }
  ]
};

function gradeExpectationPrefix(gradeLevel: number) {
  if (gradeLevel === 0) return "Kindergarten-level emerging understanding of";
  if (gradeLevel === 1) return "Grade 1 foundational understanding and practice of";
  if (gradeLevel === 2) return "Grade 2 developing fluency and understanding of";
  if (gradeLevel <= 5) return `Upper-elementary Grade ${gradeLevel} understanding and application of`;
  if (gradeLevel <= 8) return `Middle-school Grade ${gradeLevel} analysis and application of`;
  return `Secondary Grade ${gradeLevel} depth, analysis, and independent application of`;
}

export type CurriculumCoverageCompetency = {
  id: string;
  area: CoreCurriculumAreaKey;
  label: string;
  description: string;
  standards: string[];
  weight: number;
  priority: CoveragePriority;
};

export function curriculumCoverageRubricForGrade(gradeLevel: number) {
  const grade = Math.max(0, Math.min(12, Math.round(gradeLevel)));
  return CORE_CURRICULUM_AREA_KEYS.flatMap((area) => AREA_COMPETENCIES[area].map((competency) => ({
    id: `g${grade}.${area}.${competency.key}`,
    area,
    label: competency.label,
    description: `${gradeExpectationPrefix(grade)} ${grade <= 2 && competency.earlyElementaryDescription ? competency.earlyElementaryDescription : competency.description}.`,
    standards: grade === 1
      ? GRADE_ONE_STANDARDS_REFERENCES[area][competency.key] ?? []
      : [],
    weight: grade <= 2 ? competency.earlyElementaryWeight : competency.laterWeight,
    priority: grade <= 2 ? competency.priority : competency.laterPriority ?? competency.priority
  })));
}

const evidenceSchema = z.object({
  unitId: z.string().trim().min(1).max(180),
  unitTitle: z.string().trim().min(1).max(240),
  pdfPageStart: z.number().int().min(1),
  pdfPageEnd: z.number().int().min(1)
});

const competencyCoverageSchema = z.object({
  competencyId: z.string().trim().min(1).max(180),
  label: z.string().trim().min(1).max(180),
  depth: z.enum(["introduced", "practiced", "assessed", "comprehensive"]),
  strength: z.number().min(0).max(1),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(evidenceSchema).max(12)
});

const gradeCoverageProfileSchema = z.object({
  gradeLevel: z.number().int().min(0).max(12),
  role: z.enum(["core", "supplemental", "remedial", "enrichment"]),
  scores: z.object({
    mathematics: z.number().int().min(0).max(100),
    languageArts: z.number().int().min(0).max(100),
    science: z.number().int().min(0).max(100),
    socialStudies: z.number().int().min(0).max(100)
  }),
  competencies: z.array(competencyCoverageSchema).max(80)
});

export const curriculumCoverageProfileSchema = z.object({
  frameworkVersion: z.literal(CURRICULUM_COVERAGE_FRAMEWORK_VERSION),
  generatedAt: z.string().datetime(),
  source: z.enum(["ai_indexing", "ai_backfill"]),
  gradeMin: z.number().int().min(0).max(12),
  gradeMax: z.number().int().min(0).max(12),
  gradeProfiles: z.array(gradeCoverageProfileSchema).min(1).max(13)
});

export type CurriculumCoverageProfile = z.infer<typeof curriculumCoverageProfileSchema>;
export type GradeCoverageProfile = z.infer<typeof gradeCoverageProfileSchema>;
export type CompetencyCoverage = z.infer<typeof competencyCoverageSchema>;

export function parseCurriculumCoverageProfile(value: unknown) {
  const parsed = curriculumCoverageProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function scoreCompetencyCoverage(
  gradeLevel: number,
  claims: Array<Pick<CompetencyCoverage, "competencyId" | "strength">>
) {
  const rubric = curriculumCoverageRubricForGrade(gradeLevel);
  const strongest = new Map<string, number>();
  for (const claim of claims) {
    strongest.set(claim.competencyId, Math.max(strongest.get(claim.competencyId) ?? 0, claim.strength));
  }
  return Object.fromEntries(CORE_CURRICULUM_AREA_KEYS.map((area) => {
    const competencies = rubric.filter((item) => item.area === area);
    const possible = competencies.reduce((sum, item) => sum + item.weight, 0);
    const earned = competencies.reduce((sum, item) => sum + item.weight * (strongest.get(item.id) ?? 0), 0);
    return [area, possible > 0 ? Math.round((earned / possible) * 100) : 0];
  })) as Record<CoreCurriculumAreaKey, number>;
}

export function mergeCompetencyCoverage(...groups: CompetencyCoverage[][]) {
  const strongest = new Map<string, CompetencyCoverage>();
  for (const claim of groups.flat()) {
    const current = strongest.get(claim.competencyId);
    if (!current || claim.strength > current.strength) strongest.set(claim.competencyId, claim);
  }
  return Array.from(strongest.values()).sort((left, right) => left.competencyId.localeCompare(right.competencyId));
}

export function coverageForGrade(profile: CurriculumCoverageProfile | null, gradeLevel: number) {
  return profile?.gradeProfiles.find((candidate) => candidate.gradeLevel === gradeLevel) ?? null;
}

type WorkbookAnalysisUnit = {
  id: string;
  title: string;
  concepts: string[];
  pdfPageStart: number;
  pdfPageEnd: number;
};

function workbookAnalysisUnits(analysis: unknown) {
  if (!analysis || typeof analysis !== "object") return [];
  const units = (analysis as { learningUnits?: unknown }).learningUnits;
  if (!Array.isArray(units)) return [];
  return units.flatMap<WorkbookAnalysisUnit>((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const unit = candidate as Record<string, unknown>;
    const id = String(unit.id ?? "").trim();
    const title = String(unit.title ?? "").trim();
    const components = Array.isArray(unit.components) ? unit.components : [];
    const starts = components.flatMap((component) => component && typeof component === "object"
      ? [Number((component as Record<string, unknown>).pdfPageStart)] : []).filter(Number.isFinite);
    const ends = components.flatMap((component) => component && typeof component === "object"
      ? [Number((component as Record<string, unknown>).pdfPageEnd)] : []).filter(Number.isFinite);
    if (!id || !title || !starts.length || !ends.length) return [];
    return [{
      id,
      title,
      concepts: Array.isArray(unit.conceptLabels)
        ? unit.conceptLabels.map((value) => String(value).trim()).filter(Boolean).slice(0, 10)
        : [],
      pdfPageStart: Math.min(...starts),
      pdfPageEnd: Math.max(...ends)
    }];
  }).slice(0, 180);
}

const modelGradeProfileSchema = z.object({
  gradeLevel: z.number().int().min(0).max(12),
  role: z.enum(["core", "supplemental", "remedial", "enrichment"]),
  competencies: z.array(z.object({
    competencyId: z.string().trim().min(1).max(180),
    depth: z.enum(["introduced", "practiced", "assessed", "comprehensive"]),
    confidence: z.enum(["low", "medium", "high"]),
    evidenceUnitIds: z.array(z.string().trim().min(1).max(180)).min(1).transform((items) => items.slice(0, 12))
  })).max(80)
});

const modelResponseSchema = z.preprocess((value) => Array.isArray(value) ? { gradeProfiles: value } : value, z.object({
  gradeProfiles: z.array(z.object({
    ...modelGradeProfileSchema.shape
  })).max(13)
}));

function parseJsonResponse(payload: unknown) {
  const text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("The curriculum coverage profiler returned an empty response.");
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as unknown;
}

export async function generateCurriculumCoverageProfile(input: {
  title: string;
  subjectLabel: string;
  curriculumAreaKey: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  analysis: unknown;
  source?: "ai_indexing" | "ai_backfill";
  usageContext?: ModelUsageContext;
}) {
  if (!env.GOOGLE_AI_API_KEY) throw new Error("Curriculum coverage profiling is not configured.");
  const gradeMin = Math.max(0, Math.min(12, Math.round(input.gradeMin)));
  const gradeMax = Math.max(gradeMin, Math.min(12, Math.round(input.gradeMax)));
  const gradeLevels = Array.from({ length: gradeMax - gradeMin + 1 }, (_, index) => gradeMin + index);
  const units = workbookAnalysisUnits(input.analysis);
  if (!units.length) throw new Error("Curriculum coverage profiling requires indexed learning units.");
  const rubrics = gradeLevels.map((gradeLevel) => ({
    gradeLevel,
    competencies: curriculumCoverageRubricForGrade(gradeLevel).map(({
      id,
      area,
      label,
      description,
      standards,
      priority
    }) => ({ id, area, label, description, standards, priority }))
  }));
  const prompt = `Map an indexed homeschool workbook to Treeschool's fixed curriculum-coverage rubric.

The catalog grade range is authoritative. Produce one profile for every supplied grade. Do not invent grades, competencies, learning units, or page ranges. A match requires direct evidence in at least one indexed learning unit. Use only competency IDs listed in that grade's rubric.

Depth meanings:
- introduced: a concept is briefly introduced (strength 0.35)
- practiced: meaningful instruction or repeated practice is present (strength 0.60)
- assessed: the workbook meaningfully teaches/practices and checks the competency (strength 0.80)
- comprehensive: broad, sustained treatment across multiple learning units (strength 1.00)

Choose the workbook's role separately for every grade: core, supplemental, remedial, or enrichment. A grade-range label alone does not prove comprehensive coverage. World-language instruction must not count as primary English language arts unless the material explicitly teaches English literacy. Be conservative and evidence-based. Supporting competencies add useful breadth but are not necessarily expected to be taught from a printable workbook. Enrichment competencies do not affect the core score.

WORKBOOK:
${JSON.stringify({
  title: input.title,
  subject: input.subjectLabel,
  curriculumArea: input.curriculumAreaKey,
  catalogGrades: { min: gradeMin, max: gradeMax },
  language: input.languageCode,
  indexedUnits: units
})}

RUBRICS:
${JSON.stringify(rubrics)}

Return JSON only:
{"gradeProfiles":[{"gradeLevel":1,"role":"core|supplemental|remedial|enrichment","competencies":[{"competencyId":"exact listed id","depth":"introduced|practiced|assessed|comprehensive","confidence":"low|medium|high","evidenceUnitIds":["exact indexed unit id"]}]}]}`;

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${env.GOOGLE_AI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" }
      })
    });
  } catch (error) {
    await recordModelUsage({
      context: input.usageContext ?? {},
      operation: "native_workbook.curriculum_coverage_profile",
      provider: "google",
      model: GEMINI_MODEL,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof Error ? error.name : "network_error"
    });
    throw error;
  }
  const providerRequestId = response.headers.get("x-goog-request-id") ?? response.headers.get("x-request-id");
  if (!response.ok) {
    await recordModelUsage({
      context: input.usageContext ?? {},
      operation: "native_workbook.curriculum_coverage_profile",
      provider: "google",
      model: GEMINI_MODEL,
      status: "failed",
      providerRequestId,
      durationMs: Date.now() - startedAt,
      errorCode: `http_${response.status}`
    });
    throw new Error(`Curriculum coverage profiling failed (${response.status}).`);
  }
  const payload = await response.json();
  const usage = normalizeGeminiUsage(payload);
  let parsed: z.infer<typeof modelResponseSchema>;
  try {
    parsed = modelResponseSchema.parse(parseJsonResponse(payload));
  } catch (error) {
    await recordModelUsage({
      context: input.usageContext ?? {},
      operation: "native_workbook.curriculum_coverage_profile",
      provider: "google",
      model: GEMINI_MODEL,
      status: "invalid_response",
      providerRequestId,
      durationMs: Date.now() - startedAt,
      errorCode: "invalid_structured_output",
      usage
    });
    throw error;
  }
  await recordModelUsage({
    context: input.usageContext ?? {},
    operation: "native_workbook.curriculum_coverage_profile",
    provider: "google",
    model: GEMINI_MODEL,
    status: "succeeded",
    providerRequestId,
    durationMs: Date.now() - startedAt,
    usage
  });

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const responseByGrade = new Map(parsed.gradeProfiles.map((profile) => [profile.gradeLevel, profile]));
  const gradeProfiles = gradeLevels.map((gradeLevel) => {
    const rubric = curriculumCoverageRubricForGrade(gradeLevel);
    const rubricById = new Map(rubric.map((item) => [item.id, item]));
    const responseProfile = responseByGrade.get(gradeLevel);
    const competencies = (responseProfile?.competencies ?? []).flatMap<CompetencyCoverage>((claim) => {
      const competency = rubricById.get(claim.competencyId);
      if (!competency) return [];
      const evidence = Array.from(new Set(claim.evidenceUnitIds)).flatMap((unitId) => {
        const unit = unitById.get(unitId);
        return unit ? [{
          unitId: unit.id,
          unitTitle: unit.title,
          pdfPageStart: unit.pdfPageStart,
          pdfPageEnd: unit.pdfPageEnd
        }] : [];
      });
      if (!evidence.length) return [];
      return [{
        competencyId: competency.id,
        label: competency.label,
        depth: claim.depth,
        strength: DEPTH_STRENGTH[claim.depth],
        confidence: claim.confidence,
        evidence
      }];
    });
    const merged = mergeCompetencyCoverage(competencies);
    return {
      gradeLevel,
      role: responseProfile?.role ?? "supplemental" as const,
      scores: scoreCompetencyCoverage(gradeLevel, merged),
      competencies: merged
    };
  });

  return curriculumCoverageProfileSchema.parse({
    frameworkVersion: CURRICULUM_COVERAGE_FRAMEWORK_VERSION,
    generatedAt: new Date().toISOString(),
    source: input.source ?? "ai_indexing",
    gradeMin,
    gradeMax,
    gradeProfiles
  });
}
