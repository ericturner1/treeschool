import type {
  DeterministicSchedulerMaterial,
  DeterministicSchedulerUnit
} from "../deterministic-plan-scheduler";

// Metadata-only regression fixture derived from the compact purchased workbook
// archive kept outside Git. The commercial PDFs themselves must not be committed.
export const compactWorkbookScheduleFixture: {
  weekNumbers: number[];
  teachingDaysPerWeek: number;
  materials: DeterministicSchedulerMaterial[];
  units: DeterministicSchedulerUnit[];
} = {
  weekNumbers: [1, 2, 3, 4, 5, 6],
  teachingDaysPerWeek: 3,
  materials: [
    { id: "reader-d", prerequisiteMaterialSetId: null, sortOrder: 0 },
    { id: "reader-e", prerequisiteMaterialSetId: "reader-d", sortOrder: 1 },
    { id: "cursive", prerequisiteMaterialSetId: null, sortOrder: 2 },
    { id: "grammar", prerequisiteMaterialSetId: null, sortOrder: 3 }
  ],
  units: [
    {
      key: "reader-d:penguins",
      documentId: "reader-d.pdf",
      materialSetId: "reader-d",
      subjectKey: "custom:reading",
      subjectLabel: "Reading",
      documentOrder: 0,
      sequenceOrder: 0,
      estimatedMinutes: 35,
      pageCount: 4
    },
    {
      key: "reader-d:milo-and-mary",
      documentId: "reader-d.pdf",
      materialSetId: "reader-d",
      subjectKey: "custom:reading",
      subjectLabel: "Reading",
      documentOrder: 0,
      sequenceOrder: 1,
      estimatedMinutes: 35,
      pageCount: 4
    },
    {
      key: "reader-e:ice-cream-truck",
      documentId: "reader-e.pdf",
      materialSetId: "reader-e",
      subjectKey: "custom:reading",
      subjectLabel: "Reading",
      documentOrder: 1,
      sequenceOrder: 0,
      estimatedMinutes: 35,
      pageCount: 4
    },
    {
      key: "reader-e:fog",
      documentId: "reader-e.pdf",
      materialSetId: "reader-e",
      subjectKey: "custom:reading",
      subjectLabel: "Reading",
      documentOrder: 1,
      sequenceOrder: 1,
      estimatedMinutes: 40,
      pageCount: 5
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      key: `cursive:${String.fromCharCode(97 + index)}`,
      documentId: "cursive.pdf",
      materialSetId: "cursive",
      subjectKey: "custom:cursive",
      subjectLabel: "Cursive",
      documentOrder: 2,
      sequenceOrder: index,
      estimatedMinutes: 20,
      pageCount: 1
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      key: `grammar:unit-${index + 1}`,
      documentId: "grammar.pdf",
      materialSetId: "grammar",
      subjectKey: "custom:grammar",
      subjectLabel: "Grammar",
      documentOrder: 3,
      sequenceOrder: index,
      estimatedMinutes: index >= 8 ? 30 : 20,
      pageCount: index >= 8 ? 2 : 1
    }))
  ]
};
