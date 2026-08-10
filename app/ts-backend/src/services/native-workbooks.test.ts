import { describe, expect, test } from "bun:test";
import {
  isByteIdenticalWorkbookUpload,
  nativeWorkbookErrorReference
} from "./native-workbooks";

describe("native workbook processing errors", () => {
  test("creates a short support reference without exposing internal details", () => {
    expect(nativeWorkbookErrorReference("3b463b20-44a8-45a3-8af8-f79ce1cbf7f5"))
      .toBe("NW-3B463B20");
  });
});

describe("native workbook identical-upload guard", () => {
  test("recognizes the same SHA-256 fingerprint before AI indexing", () => {
    expect(isByteIdenticalWorkbookUpload({
      candidateFingerprint: "ABC123",
      publishedFingerprint: "abc123"
    })).toBe(true);
  });

  test("does not reject a genuinely changed PDF", () => {
    expect(isByteIdenticalWorkbookUpload({
      candidateFingerprint: "candidate",
      publishedFingerprint: "published"
    })).toBe(false);
    expect(isByteIdenticalWorkbookUpload({
      candidateFingerprint: "candidate",
      publishedFingerprint: null
    })).toBe(false);
  });
});
