import { describe, expect, test } from "bun:test";
import {
  normalizeFirstGradeCurriculumVariant,
  normalizeFunnelVisitorId,
  variantForVisitorId
} from "./experiment";

describe("first-grade curriculum experiment", () => {
  test("accepts only supported variants", () => {
    expect(normalizeFirstGradeCurriculumVariant("a")).toBe("a");
    expect(normalizeFirstGradeCurriculumVariant("b")).toBe("b");
    expect(normalizeFirstGradeCurriculumVariant("A")).toBeNull();
    expect(normalizeFirstGradeCurriculumVariant("control")).toBeNull();
  });

  test("accepts UUID visitor identifiers and rejects arbitrary attribution", () => {
    expect(
      normalizeFunnelVisitorId("018f8d3e-8456-7a20-9c1a-10b9b87f6542")
    ).toBe("018f8d3e-8456-7a20-9c1a-10b9b87f6542");
    expect(normalizeFunnelVisitorId("visitor-123")).toBeNull();
  });

  test("assigns the same visitor to the same variant", () => {
    expect(variantForVisitorId("018f8d3e-8456-7a20-9c1a-10b9b87f6542")).toBe(
      "a"
    );
    expect(variantForVisitorId("018f8d3e-8456-7a20-9c1a-10b9b87f6543")).toBe(
      "b"
    );
  });
});
