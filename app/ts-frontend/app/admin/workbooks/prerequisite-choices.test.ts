import { describe, expect, test } from "bun:test";
import { buildPrerequisiteChoices } from "./prerequisite-choices";

describe("admin workbook prerequisite choices", () => {
  test("keeps a newly uploaded prerequisite selectable while it is processing", () => {
    const choices = buildPrerequisiteChoices([{
      id: "kokugo-c",
      title: "国語C",
      subjectLabel: "Japanese Language (国語)",
      academicStandardKey: "japan",
      analysisStatus: "analyzing",
      status: "indexing"
    }]);

    expect(choices).toEqual([{
      id: "kokugo-c",
      title: "国語C — Japanese Language (国語) [JAPAN · PROCESSING]"
    }]);
  });

  test("does not offer failed workbooks as new prerequisites", () => {
    expect(buildPrerequisiteChoices([{
      id: "failed",
      title: "Failed workbook",
      subjectLabel: "Japanese Language (国語)",
      academicStandardKey: "japan",
      analysisStatus: "failed",
      status: "indexing_failed"
    }])).toEqual([]);
  });
});
