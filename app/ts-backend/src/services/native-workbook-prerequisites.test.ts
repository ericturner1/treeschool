import { describe, expect, test } from "bun:test";
import {
  validateWorkbookBundlePrerequisites,
  validateWorkbookPrerequisiteCompatibility
} from "./native-workbook-prerequisites";

const kokugo = (id: string, title: string, prerequisiteWorkbookId: string | null = null) => ({
  id,
  title,
  prerequisiteWorkbookId,
  academicStandardKey: "japan",
  curriculumSubjectId: "subject:kokugo",
  subjectKey: "kokugo",
  languageCode: "ja"
});

describe("native workbook prerequisites", () => {
  test("allows a prerequisite from the same standard, subject, and language", () => {
    expect(() => validateWorkbookPrerequisiteCompatibility(
      kokugo("d", "国語D"),
      kokugo("c", "国語C")
    )).not.toThrow();
  });

  test("rejects the legacy US Japanese workbook as a 国語 prerequisite", () => {
    expect(() => validateWorkbookPrerequisiteCompatibility(
      kokugo("d", "国語D"),
      {
        id: "legacy-c",
        title: "Japanese C",
        academicStandardKey: "us",
        curriculumSubjectId: null,
        subjectKey: "japanese",
        languageCode: "en"
      }
    )).toThrow("different academic standard");
  });

  test("accepts the complete A-D chain in bundle order", () => {
    const members = [
      kokugo("a", "国語A"),
      kokugo("b", "国語B", "a"),
      kokugo("c", "国語C", "b"),
      kokugo("d", "国語D", "c")
    ];
    expect(() => validateWorkbookBundlePrerequisites({
      workbookIds: members.map((member) => member.id),
      members
    })).not.toThrow();
  });

  test("rejects a bundle member whose prerequisite is outside the bundle", () => {
    const members = [
      kokugo("a", "国語A"),
      kokugo("d", "国語D", "legacy-c")
    ];
    expect(() => validateWorkbookBundlePrerequisites({
      workbookIds: members.map((member) => member.id),
      members
    })).toThrow("not included in this bundle");
  });

  test("rejects a dependent workbook placed before its prerequisite", () => {
    const members = [
      kokugo("b", "国語B", "a"),
      kokugo("a", "国語A")
    ];
    expect(() => validateWorkbookBundlePrerequisites({
      workbookIds: members.map((member) => member.id),
      members
    })).toThrow("must appear after its prerequisite");
  });
});
