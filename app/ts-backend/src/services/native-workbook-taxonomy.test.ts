import { describe, expect, test } from "bun:test";
import {
  CURRICULUM_AREA_LABELS,
  curriculumAreaLabel,
  inferCurriculumAreaKey,
  normalizeCurriculumAreaKey,
  resolveCurriculumAreaKey
} from "./native-workbook-taxonomy";

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

  test("maps common parent-entered subject names into stable areas", () => {
    expect(inferCurriculumAreaKey("Math")).toBe("mathematics");
    expect(inferCurriculumAreaKey("Arithmetic practice")).toBe("mathematics");
    expect(inferCurriculumAreaKey("Japanese")).toBe("world_languages");
    expect(inferCurriculumAreaKey("Japanese Language (国語)")).toBe("language_arts");
    expect(inferCurriculumAreaKey("Natural history museum")).toBe("social_studies");
    expect(inferCurriculumAreaKey("Something unusual")).toBe("other");
  });

  test("returns the canonical display label", () => {
    expect(curriculumAreaLabel("mathematics")).toBe("Mathematics");
    expect(resolveCurriculumAreaKey("mathematics", "Science")).toBe("mathematics");
    expect(resolveCurriculumAreaKey(null, "Science")).toBe("science");
  });
});
