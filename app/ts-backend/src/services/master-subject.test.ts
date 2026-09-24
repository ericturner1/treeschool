import { describe, expect, test } from "bun:test";
import {
  masterSubjectDisplayLabel,
  masterSubjectStorageKey,
  parseMasterSubjectStorageKey,
} from "./master-subject";

describe("master subjects", () => {
  test("uses a stable standard-qualified storage key", () => {
    const subjectKey = masterSubjectStorageKey({
      academicStandardKey: "japan",
      key: "kokugo",
    });
    expect(subjectKey).toBe("master_subject:japan:kokugo");
    expect(parseMasterSubjectStorageKey(subjectKey)).toEqual({
      academicStandardKey: "japan",
      key: "kokugo",
    });
  });

  test("rejects malformed master subject keys", () => {
    expect(parseMasterSubjectStorageKey("master_subject:japan")).toBeNull();
    expect(parseMasterSubjectStorageKey("master_subject:japan:kokugo:extra")).toBeNull();
    expect(parseMasterSubjectStorageKey("area:language_arts")).toBeNull();
  });

  test("shows the native Japan label while retaining the canonical subject identity", () => {
    expect(masterSubjectDisplayLabel({
      academicStandardKey: "japan",
      key: "kokugo",
      label: "Japanese Language (国語)",
      aliases: ["国語", "japanese language"],
    })).toBe("国語");
  });

  test("keeps the canonical label for non-Japan subjects", () => {
    expect(masterSubjectDisplayLabel({
      academicStandardKey: "us",
      key: "mathematics",
      label: "Mathematics",
      aliases: ["Math"],
    })).toBe("Mathematics");
  });
});
