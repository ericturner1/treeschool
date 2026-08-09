import { describe, expect, test } from "bun:test";
import { parseWorkbookCatalogPlan } from "./workbook-generation-provider";

const validPlan = {
  schemaVersion: 2,
  curriculumName: "US Grade 2",
  courses: [
    {
      stableKey: "mathematics",
      curriculumSubjectId: null,
      subjectKey: "mathematics",
      subjectLabel: "Mathematics",
      status: "modified",
      academicStandardOverrideKey: null,
      standardCode: "CCSS",
      standardLabel: "US Common Core",
      themeOverrideVersionId: null,
      boundaryNotes: "Money arithmetic belongs here.",
      coverageNotes: "Covers 2.OA, 2.NBT, 2.MD, and 2.G.",
      pipelineKey: "math",
      workbooks: [
        {
          stableKey: "2-math",
          title: "Grade 2 Mathematics",
          domains: ["Arithmetic", "Geometry"],
          languageCode: "en",
          localeCode: null,
          layoutProfile: "standard",
          scriptProfile: "latin",
        },
      ],
    },
  ],
} as const;

describe("Workbook Studio grade catalog plans", () => {
  test("parses courses with nested workbook variants", () => {
    const parsed = parseWorkbookCatalogPlan(validPlan);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.courses[0]?.subjectKey).toBe("mathematics");
    expect(parsed.courses[0]?.workbooks[0]?.stableKey).toBe("2-math");
  });

  test("allows an inherited course with no new workbook", () => {
    const parsed = parseWorkbookCatalogPlan({
      ...validPlan,
      courses: [
        {
          ...validPlan.courses[0],
          stableKey: "phonics",
          subjectKey: "phonics",
          subjectLabel: "Phonics",
          status: "inherited",
          workbooks: [],
        },
      ],
    });
    expect(parsed.courses[0]?.workbooks).toEqual([]);
  });

  test("rejects duplicate workbook keys across courses", () => {
    expect(() =>
      parseWorkbookCatalogPlan({
        ...validPlan,
        courses: [
          validPlan.courses[0],
          {
            ...validPlan.courses[0],
            stableKey: "reading",
            subjectKey: "reading",
            subjectLabel: "Reading",
          },
        ],
      }),
    ).toThrow("Duplicate workbook stableKey: 2-math");
  });
});
