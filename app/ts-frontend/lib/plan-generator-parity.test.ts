import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLAN_GENERATOR_PARITY_FIELDS } from "./plan-generator-contract";
import {
  applySchoolYearStartDateChange,
  compactSchoolYearPeriod,
  defaultSchoolYearEnd,
  restoreSchoolYearPeriod
} from "./plan-generator-dates";
import { expandSelectedNativeWorkbookCards } from "./native-workbooks/catalog-selection";
import { hideCatalogItemsCoveredBySelection } from "./native-workbooks/catalog-visibility";

const implementations = [
  {
    name: "public marketing funnel",
    source: readFileSync(resolve(import.meta.dir, "../app/pack/plan-pack-intake-form.tsx"), "utf8")
  },
  {
    name: "authenticated subscriber planner",
    source: readFileSync(
      resolve(import.meta.dir, "../app/p/student/[studentId]/curriculum/authenticated-plan-generator.tsx"),
      "utf8"
    )
  }
];

describe("lesson-plan generator parity contract", () => {
  test("the shared school-year helper ends the year one day before its next anniversary", () => {
    expect(defaultSchoolYearEnd("2026-04-01")).toBe("2027-03-31");
    expect(defaultSchoolYearEnd("2024-02-29")).toBe("2025-02-28");
    expect(defaultSchoolYearEnd("")).toBe("");
  });

  test("the end date follows intermediate date-input changes until the start field is committed", () => {
    const intermediateChange = applySchoolYearStartDateChange({
      nextStartDate: "2026-06-20",
      currentEndDate: "",
      endDateSuggestionLocked: false
    });
    expect(intermediateChange).toEqual({
      endDate: "2027-06-19",
      endDateSuggestionLocked: false
    });

    const finalChange = applySchoolYearStartDateChange({
      nextStartDate: "2026-04-01",
      currentEndDate: intermediateChange.endDate,
      endDateSuggestionLocked: intermediateChange.endDateSuggestionLocked
    });
    expect(finalChange).toEqual({
      endDate: "2027-03-31",
      endDateSuggestionLocked: false
    });

    expect(applySchoolYearStartDateChange({
      nextStartDate: "2026-09-01",
      currentEndDate: "2027-04-15",
      endDateSuggestionLocked: true
    })).toEqual({
      endDate: "2027-04-15",
      endDateSuggestionLocked: true
    });
  });

  test("school-year periods use a compact, readable label", () => {
    expect(compactSchoolYearPeriod("2026-04-01", "2027-03-31")).toBe("Apr 1, 2026–Mar 31, 2027");
    expect(compactSchoolYearPeriod("", "")).toBe("Dates needed");
  });

  test("a stale end date cannot survive when no start date was restored", () => {
    expect(restoreSchoolYearPeriod("", "2026-07-20")).toEqual({
      startDate: "",
      endDate: "",
      endDateSuggestionLocked: false
    });
    expect(restoreSchoolYearPeriod("2026-04-01", "")).toEqual({
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      endDateSuggestionLocked: true
    });
  });

  test("selected bundles expand into their individual workbook cards", () => {
    const reading = { id: "reading", catalogKind: "workbook" as const, memberWorkbookIds: ["reading"] };
    const math = { id: "math", catalogKind: "workbook" as const, memberWorkbookIds: ["math"] };
    const bundle = { id: "grade-one", catalogKind: "bundle" as const, memberWorkbookIds: ["reading", "math"] };
    expect(expandSelectedNativeWorkbookCards([reading, math, bundle], [bundle.id])).toEqual([
      { workbook: reading, selection: bundle },
      { workbook: math, selection: bundle }
    ]);
  });

  test("the public picker hides workbooks already represented by a selected bundle", () => {
    const reading = { id: "reading", memberWorkbookIds: ["reading"] };
    const math = { id: "math", memberWorkbookIds: ["math"] };
    const science = { id: "science", memberWorkbookIds: ["science"] };
    const bundle = { id: "grade-one", memberWorkbookIds: ["reading", "math"] };

    expect(hideCatalogItemsCoveredBySelection(
      [reading, math, science, bundle],
      [bundle.id]
    )).toEqual([science, bundle]);
  });

  for (const implementation of implementations) {
    test(`${implementation.name} keeps the shared planning surface`, () => {
      expect(implementation.source).toContain("PLAN_GENERATOR_ACCEPTED_FILE_TYPES");
      expect(implementation.source).toContain("PLAN_GENERATOR_MAX_INPUT_PAGE_COUNT");
      expect(implementation.source).not.toMatch(/2,000|2000-page/i);
      expect(implementation.source).toContain("NativeWorkbook");
      for (const field of PLAN_GENERATOR_PARITY_FIELDS) {
        expect(implementation.source).toContain(field);
      }
    });
  }

  test("context-specific responsibilities remain intentionally separate", () => {
    const publicSource = implementations[0].source;
    const subscriberSource = implementations[1].source;

    expect(publicSource).toContain("startPlanPackSetupAction");
    expect(publicSource).toContain("Parent email");
    expect(publicSource).toContain("subscriptionCheckoutTotalInCents");
    expect(publicSource).toContain("schoolYearEndSuggestionLockedRef");
    expect(publicSource).toContain("onBlur");
    expect(publicSource).toContain("disabled={!schoolYearStartDate}");
    expect(publicSource).toContain("expandSelectedNativeWorkbookCards");

    expect(subscriberSource).toContain("CurriculumCompletenessDialog");
    expect(subscriberSource).toContain("existingDocuments");
    expect(subscriberSource).toContain("planningProgress");
    expect(subscriberSource).not.toContain('type="date"');
    expect(subscriberSource).toContain('type="hidden" name="startDate"');
  });
});
