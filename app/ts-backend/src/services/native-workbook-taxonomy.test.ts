import { describe, expect, test } from "bun:test";
import { CURRICULUM_AREA_LABELS, normalizeCurriculumAreaKey } from "./native-workbook-taxonomy";

describe("native workbook curriculum areas", () => {
  test("accepts a canonical curriculum area", () => {
    expect(normalizeCurriculumAreaKey("world_languages")).toBe("world_languages");
    expect(CURRICULUM_AREA_LABELS.world_languages).toBe("World Languages");
    expect(normalizeCurriculumAreaKey("agriculture")).toBe("agriculture");
    expect(CURRICULUM_AREA_LABELS.agriculture).toBe("Agriculture");
    expect(normalizeCurriculumAreaKey("business_and_entrepreneurship")).toBe("business_and_entrepreneurship");
    expect(CURRICULUM_AREA_LABELS.business_and_entrepreneurship).toBe("Business & Entrepreneurship");
  });

  test("rejects free-form curriculum areas", () => {
    expect(() => normalizeCurriculumAreaKey("Languages-ish")).toThrow("Choose a valid curriculum area.");
  });
});
