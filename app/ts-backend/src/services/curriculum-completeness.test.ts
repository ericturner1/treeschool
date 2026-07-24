import { describe, expect, test } from "bun:test";
import {
  applyCurriculumCoverageProfiles,
  normalizeCurriculumCompletenessConcerns,
  parseCurriculumCompletenessModelResponse,
  type CurriculumCompletenessResult
} from "./curriculum-completeness";
import {
  CURRICULUM_COVERAGE_FRAMEWORK_VERSION,
  curriculumCoverageRubricForGrade,
  type CurriculumCoverageProfile
} from "./curriculum-coverage";

describe("deterministic ACC updates", () => {
  test("deduplicates and caps verbose AI evidence before validation", () => {
    const parsed = parseCurriculumCompletenessModelResponse({
      summary: "The proposed materials cover the four core areas.",
      strengths: [],
      coreAreas: {
        mathematics: { summary: "Math is represented." },
        languageArts: { summary: "Language arts is represented." },
        science: { summary: "Science is represented." },
        socialStudies: { summary: "Social studies is represented." }
      },
      competencyCoverage: [{
        competencyId: "g1.languageArts.reading_comprehension",
        depth: "practiced",
        confidence: "high",
        evidence: [
          "Reader A",
          "Reader A",
          "Reader B",
          "Reader C",
          "Reader D",
          "Reader E",
          "Reader F",
          "Reader G",
          "Reader H",
          "Reader I"
        ]
      }, {
        competencyId: "g1.science.engineering",
        depth: "introduced",
        confidence: "low",
        evidence: []
      }],
      concerns: []
    });

    expect(parsed.competencyCoverage[0]?.evidence).toEqual([
      "Reader A",
      "Reader B",
      "Reader C",
      "Reader D",
      "Reader E",
      "Reader F",
      "Reader G",
      "Reader H"
    ]);
    expect(parsed.competencyCoverage).toHaveLength(1);
    expect(parseCurriculumCompletenessModelResponse({
      ...{
        summary: "A".repeat(700),
        strengths: [],
        coreAreas: {
          mathematics: { summary: "Math is represented." },
          languageArts: { summary: "Language arts is represented." },
          science: { summary: "Science is represented." },
          socialStudies: { summary: "Social studies is represented." }
        },
        competencyCoverage: [],
        concerns: []
      }
    }).summary).toHaveLength(600);
  });

  test("omits competencies the model explicitly marks as not covered", () => {
    const parsed = parseCurriculumCompletenessModelResponse({
      summary: "The proposed materials cover several core competencies.",
      strengths: [],
      coreAreas: {
        mathematics: { summary: "Math is partially represented." },
        languageArts: { summary: "Language arts is represented." },
        science: { summary: "Science is represented." },
        socialStudies: { summary: "Social studies is represented." }
      },
      competencyCoverage: [{
        competencyId: "g1.mathematics.geometry",
        depth: "not covered",
        confidence: "high",
        evidence: ["No geometry lessons found"]
      }, {
        competencyId: "g1.science.inquiry",
        depth: "not_covered",
        confidence: "medium",
        evidence: ["No inquiry lessons found"]
      }, {
        competencyId: "g1.languageArts.reading_comprehension",
        depth: "practiced",
        confidence: "high",
        evidence: ["Reader A"]
      }],
      concerns: []
    });

    expect(parsed.competencyCoverage).toHaveLength(1);
    expect(parsed.competencyCoverage[0]?.competencyId).toBe("g1.languageArts.reading_comprehension");
  });

  test("applies indexed workbook evidence without another AI review", () => {
    const competency = curriculumCoverageRubricForGrade(1)
      .find((item) => item.id.endsWith("languageArts.writing_composition"))!;
    const emptyArea = (summary: string) => ({ score: 0, summary, competencies: [] });
    const current: CurriculumCompletenessResult = {
      status: "needs_attention",
      framework: "general_english_language_homeschool",
      coverageFrameworkVersion: CURRICULUM_COVERAGE_FRAMEWORK_VERSION,
      studentGradeLevel: 1,
      summary: "Writing may be missing.",
      strengths: [],
      coreAreas: {
        mathematics: emptyArea("No evidence."),
        languageArts: emptyArea("Writing is not represented."),
        science: emptyArea("No evidence."),
        socialStudies: emptyArea("No evidence.")
      },
      concerns: [{
        kind: "missing_subject",
        subject: "languageArts",
        title: "Writing",
        explanation: "Writing may be missing.",
        priority: "essential",
        competencyIds: [competency.id]
      }]
    };
    const profile: CurriculumCoverageProfile = {
      frameworkVersion: CURRICULUM_COVERAGE_FRAMEWORK_VERSION,
      generatedAt: new Date().toISOString(),
      source: "ai_indexing",
      gradeMin: 1,
      gradeMax: 1,
      gradeProfiles: [{
        gradeLevel: 1,
        role: "core",
        scores: { mathematics: 0, languageArts: 20, science: 0, socialStudies: 0 },
        competencies: [{
          competencyId: competency.id,
          label: competency.label,
          depth: "comprehensive",
          strength: 1,
          confidence: "high",
          evidence: [{ unitId: "writing-1", unitTitle: "Writing sentences", pdfPageStart: 5, pdfPageEnd: 20 }]
        }]
      }]
    };

    const updated = applyCurriculumCoverageProfiles(current, [profile]);
    expect(updated.coreAreas.languageArts.score).toBe(20);
    expect(updated.coreAreas.languageArts.competencies[0]?.evidence[0]).toContain("PDF pages 5–20");
    expect(updated.concerns).toHaveLength(0);
    expect(updated.status).toBe("broadly_complete");
  });

  test("does not turn early-grade supporting or enrichment skills into gaps", () => {
    const rubric = curriculumCoverageRubricForGrade(1);
    const inquiry = rubric.find((item) => item.id.endsWith("science.scientific_inquiry"))!;
    const engineering = rubric.find((item) => item.id.endsWith("science.engineering"))!;
    const geometry = rubric.find((item) => item.id.endsWith("mathematics.geometry"))!;
    const concerns = normalizeCurriculumCompletenessConcerns({
      gradeLevel: 1,
      competencies: [],
      scores: { mathematics: 60, languageArts: 80, science: 70, socialStudies: 80 },
      concerns: [
        { kind: "missing_subject", subject: "Science", title: "Inquiry", explanation: "Inquiry may be missing.", priority: "recommended", competencyIds: [inquiry.id] },
        { kind: "missing_subject", subject: "Science", title: "Engineering", explanation: "Engineering may be missing.", priority: "recommended", competencyIds: [engineering.id] },
        { kind: "missing_subject", subject: "Mathematics", title: "Geometry", explanation: "Geometry may be missing.", priority: "essential", competencyIds: [geometry.id] }
      ]
    });

    expect(concerns).toHaveLength(1);
    expect(concerns[0]?.title).toBe("Geometry");
  });
});
