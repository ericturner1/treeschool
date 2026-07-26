import { describe, expect, test } from "bun:test";
import {
  CURRICULUM_COVERAGE_FRAMEWORK_VERSION,
  curriculumCoverageRubricForGrade,
  mergeCompetencyCoverage,
  parseCurriculumCoverageProfile,
  scoreCompetencyCoverage,
  type CompetencyCoverage
} from "./curriculum-coverage";

function claim(competencyId: string, strength: number): CompetencyCoverage {
  return {
    competencyId,
    label: competencyId,
    depth: strength === 1 ? "comprehensive" : "practiced",
    strength,
    confidence: "high",
    evidence: [{
      unitId: "unit-1",
      unitTitle: "Evidence unit",
      pdfPageStart: 1,
      pdfPageEnd: 3
    }]
  };
}

describe("curriculum coverage", () => {
  test("uses grade-specific competency identifiers", () => {
    const kindergarten = curriculumCoverageRubricForGrade(0);
    const gradeOne = curriculumCoverageRubricForGrade(1);
    expect(kindergarten).toHaveLength(20);
    expect(gradeOne).toHaveLength(20);
    expect(kindergarten[0]?.id.startsWith("g0.")).toBe(true);
    expect(gradeOne[0]?.id.startsWith("g1.")).toBe(true);
  });

  test("anchors Grade 1 competencies to published U.S. standards", () => {
    const gradeOne = curriculumCoverageRubricForGrade(1);
    const operations = gradeOne.find((item) => item.id.endsWith("mathematics.operations"));
    const reading = gradeOne.find((item) => item.id.endsWith("languageArts.reading_foundations"));
    const physicalScience = gradeOne.find((item) => item.id.endsWith("science.physical_science"));
    const civics = gradeOne.find((item) => item.id.endsWith("socialStudies.civics"));

    expect(operations?.standards).toContain("CCSS.Math.Content.1.OA.A–C");
    expect(reading?.standards).toContain("CCSS.ELA-Literacy.RF.1.1–4");
    expect(physicalScience?.standards).toContain("NGSS 1-PS4-1–4");
    expect(civics?.standards).toContain("C3 D2.Civ.K–2");
  });

  test("calculates scores from rubric weights rather than accepting an AI percentage", () => {
    const math = curriculumCoverageRubricForGrade(1).filter((item) => item.area === "mathematics");
    const scores = scoreCompetencyCoverage(1, [
      claim(math[0]!.id, 1),
      claim(math[1]!.id, 0.5)
    ]);
    expect(scores.mathematics).toBe(43);
    expect(scores.languageArts).toBe(0);
  });

  test("calibrates early-elementary process skills as supporting or enrichment", () => {
    const gradeOne = curriculumCoverageRubricForGrade(1);
    const inquiry = gradeOne.find((item) => item.id.endsWith("science.scientific_inquiry"))!;
    const engineering = gradeOne.find((item) => item.id.endsWith("science.engineering"))!;
    const geometry = gradeOne.find((item) => item.id.endsWith("mathematics.geometry"))!;

    expect(inquiry.priority).toBe("supporting");
    expect(inquiry.weight).toBe(10);
    expect(engineering.priority).toBe("enrichment");
    expect(engineering.weight).toBe(0);
    expect(geometry.priority).toBe("essential");
    expect(geometry.weight).toBe(12);
  });

  test("overlapping material keeps the strongest evidence instead of double-counting", () => {
    const competencyId = curriculumCoverageRubricForGrade(1)[0]!.id;
    const merged = mergeCompetencyCoverage(
      [claim(competencyId, 0.35)],
      [claim(competencyId, 0.8)]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.strength).toBe(0.8);
  });

  test("rejects profiles from an unknown framework version", () => {
    expect(parseCurriculumCoverageProfile({
      frameworkVersion: "other-framework",
      generatedAt: new Date().toISOString(),
      source: "ai_indexing",
      gradeMin: 1,
      gradeMax: 1,
      gradeProfiles: []
    })).toBeNull();
    expect(CURRICULUM_COVERAGE_FRAMEWORK_VERSION).toBe("general-english-core-v2");
  });
});
