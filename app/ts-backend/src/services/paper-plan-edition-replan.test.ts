import { describe, expect, test } from "bun:test";
import { createPageSelectionAudit } from "./pdf-page-numbers";
import { repairStagedPlanMetadata } from "./paper-plans";

function atomicAnalysis(prefix: string) {
  return {
    structureVersion: 3,
    documentQuality: { status: "passed" },
    learningUnits: [1, 2].map((pageNumber, index) => ({
      id: `${prefix}-unit-${pageNumber}`,
      title: `Lesson ${pageNumber}`,
      sequenceOrder: index,
      components: [{
        pdfPageStart: pageNumber,
        pdfPageEnd: pageNumber,
        category: "concept_practice",
        role: "practice",
        includeInPacket: true,
        pageNumberConversionAudit: createPageSelectionAudit(null, pageNumber, pageNumber)
      }],
      splittable: false,
      approvedSplitPoints: [],
      estimatedMinutes: 30,
      conceptLabels: [`Lesson ${pageNumber}`],
      boundaryConfidence: "high",
      boundaryEvidence: []
    }))
  };
}

describe("edition replanning", () => {
  test("does not schedule a retained old document alongside the active document with the same fingerprint", () => {
    const result = repairStagedPlanMetadata({
      weeks: [1, 2].map((weekNumber) => ({
        weekNumber,
        title: `Week ${weekNumber}`,
        summary: null,
        subjectTitles: [],
        items: [],
        normalizationRepairs: []
      })),
      teachingDaysPerWeek: 1,
      subjectPreferences: [],
      documents: [{
        id: "retained-document",
        label: "Workbook, retained edition",
        pageCount: 2,
        subjectId: null,
        subjectLabel: "Language",
        materialSetId: "workbook-material",
        documentRole: "student",
        analysisJson: atomicAnalysis("retained"),
        contentFingerprint: "same-pdf"
      }, {
        id: "active-document",
        label: "Workbook, active edition",
        pageCount: 2,
        subjectId: null,
        subjectLabel: "Language",
        materialSetId: "workbook-material",
        documentRole: "student",
        analysisJson: atomicAnalysis("active"),
        contentFingerprint: "same-pdf"
      }],
      preservedItems: [{
        weekNumber: 1,
        documentId: "retained-document",
        firstPageIndex: 0,
        lastPageIndex: 0,
        sourceUnitId: "retained-unit-1",
        sourceUnitPartIndex: 0
      }],
      schedulableDocumentIds: ["active-document"]
    });

    const scheduledItems = result.weeks.flatMap((week) => week.items);
    expect(scheduledItems).toHaveLength(1);
    expect(scheduledItems[0]?.documentId).toBe("active-document");
    expect(scheduledItems[0]?.firstPageIndex).toBe(1);
    expect(scheduledItems[0]?.lastPageIndex).toBe(1);
  });
});
