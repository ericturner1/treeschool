import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

export type CurriculumCompletenessResult = {
  status: "broadly_complete" | "needs_attention";
  framework: "general_english_language_homeschool";
  coverageFrameworkVersion: "general-english-core-v2";
  studentGradeLevel: number | null;
  summary: string;
  strengths: string[];
  coreAreas: {
    mathematics: CurriculumCoverageArea;
    languageArts: CurriculumCoverageArea;
    science: CurriculumCoverageArea;
    socialStudies: CurriculumCoverageArea;
  };
  concerns: Array<{
    kind: "missing_subject" | "level_concern";
    subject: string;
    title: string;
    explanation: string;
    priority: "essential" | "recommended";
    competencyIds: string[];
    workbooks?: Array<{
      id: string;
      catalogKind: "workbook" | "bundle";
      memberCount: number;
      slug: string;
      title: string;
      subjectLabel: string;
      gradeMin: number;
      gradeMax: number;
      description: string;
      type: "core" | "elective";
      priceInCents: number;
      currencyCode: string;
      thumbnailUrl: string | null;
      accessState: "owned" | "included" | "purchase_required";
    }>;
  }>;
};

type CurriculumCoverageArea = {
  score: number;
  summary: string;
  competencies: Array<{
    competencyId: string;
    label: string;
    depth: "introduced" | "practiced" | "assessed" | "comprehensive";
    strength: number;
    confidence: "low" | "medium" | "high";
    evidence: string[];
  }>;
};

export type CurriculumCompletenessActionResult =
  | { ok: true; result: CurriculumCompletenessResult }
  | { ok: false; error: string };

export async function evaluatePaperPlanCompleteness(input: {
  parentUserId: string;
  learningYearId: string;
}) {
  const backendUrl = process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
  const response = await backendFetch(`${backendUrl}/internal/paper-plan/completeness`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Could not review curriculum completeness.");
  }
  return (await response.json()) as CurriculumCompletenessResult;
}
