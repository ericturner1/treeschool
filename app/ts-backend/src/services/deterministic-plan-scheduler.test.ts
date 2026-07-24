import { describe, expect, test } from "bun:test";
import { buildDeterministicPlanSchedule } from "./deterministic-plan-scheduler";
import { compactWorkbookScheduleFixture } from "./fixtures/compact-workbook-schedule.fixture";

describe("deterministic lesson-plan scheduler", () => {
  test("balances the compact workbook set and unlocks Reader E immediately after Reader D", () => {
    const result = buildDeterministicPlanSchedule(compactWorkbookScheduleFixture);
    const assignmentByUnit = new Map(
      result.assignments.map((assignment) => [assignment.unitKey, assignment])
    );
    const weeksForMaterial = (materialSetId: string) =>
      compactWorkbookScheduleFixture.units
        .filter((unit) => unit.materialSetId === materialSetId)
        .map((unit) => assignmentByUnit.get(unit.key)!.weekNumber);

    const readerDWeeks = weeksForMaterial("reader-d");
    const readerEWeeks = weeksForMaterial("reader-e");
    expect(Math.min(...readerEWeeks)).toBe(Math.max(...readerDWeeks) + 1);
    expect(Math.max(...readerDWeeks)).toBeLessThan(Math.min(...readerEWeeks));
    expect(new Set(weeksForMaterial("cursive"))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(new Set(weeksForMaterial("grammar"))).toEqual(new Set([1, 2, 3, 4, 5, 6]));

    for (const weekNumber of compactWorkbookScheduleFixture.weekNumbers) {
      const weekAssignments = result.assignments.filter(
        (assignment) => assignment.weekNumber === weekNumber
      );
      const expectedDayCount = Math.min(
        compactWorkbookScheduleFixture.teachingDaysPerWeek,
        weekAssignments.length
      );
      expect(new Set(weekAssignments.map((assignment) => assignment.dayNumber))).toEqual(
        new Set(Array.from({ length: expectedDayCount }, (_, index) => index + 1))
      );
    }
  });

  test("returns byte-for-byte stable assignments for identical metadata", () => {
    const first = buildDeterministicPlanSchedule(compactWorkbookScheduleFixture);
    const second = buildDeterministicPlanSchedule(compactWorkbookScheduleFixture);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("carries deferred lessons into the earliest legal weeks without changing source order", () => {
    const units = Array.from({ length: 6 }, (_, index) => ({
      key: `reader:${index}`,
      documentId: "reader.pdf",
      materialSetId: "reader",
      subjectKey: "custom:reading",
      subjectLabel: "Reading",
      documentOrder: 0,
      sequenceOrder: index,
      estimatedMinutes: 30,
      pageCount: 4,
      progressPriority: index < 3 ? "deferred" as const : null
    }));
    const result = buildDeterministicPlanSchedule({
      weekNumbers: Array.from({ length: 12 }, (_, index) => index + 1),
      teachingDaysPerWeek: 5,
      materials: [{ id: "reader", prerequisiteMaterialSetId: null, sortOrder: 0 }],
      units
    });
    const weeks = result.assignments.map((assignment) => assignment.weekNumber);
    expect(weeks.slice(0, 3)).toEqual([1, 2, 3]);
    expect(weeks.every((week, index) => index === 0 || week >= weeks[index - 1]!)).toBe(true);
    expect(Math.min(...weeks.slice(3))).toBeGreaterThan(3);
  });

  test("does not leave a Cursive-only gap between larger Reader D and Reader E workbooks", () => {
    const readingUnit = (materialSetId: string, documentOrder: number, sequenceOrder: number) => ({
      key: `${materialSetId}:${sequenceOrder}`,
      documentId: `${materialSetId}.pdf`,
      materialSetId,
      subjectKey: "custom:reading",
      subjectLabel: "Reading",
      documentOrder,
      sequenceOrder,
      estimatedMinutes: 35,
      pageCount: 4
    });
    const result = buildDeterministicPlanSchedule({
      weekNumbers: Array.from({ length: 36 }, (_, index) => index + 1),
      teachingDaysPerWeek: 5,
      materials: [
        { id: "reader-d", prerequisiteMaterialSetId: null, sortOrder: 0 },
        { id: "reader-e", prerequisiteMaterialSetId: "reader-d", sortOrder: 1 },
        { id: "cursive", prerequisiteMaterialSetId: null, sortOrder: 2 }
      ],
      units: [
        ...Array.from({ length: 20 }, (_, index) => readingUnit("reader-d", 0, index)),
        ...Array.from({ length: 20 }, (_, index) => readingUnit("reader-e", 1, index)),
        ...Array.from({ length: 101 }, (_, index) => ({
          key: `cursive:${index}`,
          documentId: "cursive.pdf",
          materialSetId: "cursive",
          subjectKey: "custom:cursive",
          subjectLabel: "Cursive",
          documentOrder: 2,
          sequenceOrder: index,
          estimatedMinutes: 15,
          pageCount: 1
        }))
      ]
    });
    const materialForUnit = new Map<string, string>([
      ...Array.from({ length: 20 }, (_, index) => [`reader-d:${index}`, "reader-d"] as const),
      ...Array.from({ length: 20 }, (_, index) => [`reader-e:${index}`, "reader-e"] as const)
    ]);
    const readingByWeek = new Map<number, string[]>();
    for (const assignment of result.assignments) {
      const materialSetId = materialForUnit.get(assignment.unitKey);
      if (!materialSetId) continue;
      readingByWeek.set(assignment.weekNumber, [
        ...(readingByWeek.get(assignment.weekNumber) ?? []),
        materialSetId
      ]);
    }

    expect(Math.max(...Array.from(readingByWeek.entries())
      .filter(([, materials]) => materials.includes("reader-d"))
      .map(([weekNumber]) => weekNumber))).toBe(18);
    expect(Math.min(...Array.from(readingByWeek.entries())
      .filter(([, materials]) => materials.includes("reader-e"))
      .map(([weekNumber]) => weekNumber))).toBe(19);
    expect(new Set(readingByWeek.keys())).toEqual(
      new Set(Array.from({ length: 36 }, (_, index) => index + 1))
    );
  });

  test("honors an explicit subject cadence without splitting learning units", () => {
    const result = buildDeterministicPlanSchedule({
      weekNumbers: [1],
      teachingDaysPerWeek: 5,
      materials: [{ id: "math", prerequisiteMaterialSetId: null, sortOrder: 0 }],
      subjectPreferences: [{ subjectKey: "custom:math", daysPerWeek: 2 }],
      units: Array.from({ length: 4 }, (_, index) => ({
        key: `math:${index}`,
        documentId: "math.pdf",
        materialSetId: "math",
        subjectKey: "custom:math",
        subjectLabel: "Math",
        documentOrder: 0,
        sequenceOrder: index,
        estimatedMinutes: 20,
        pageCount: 2
      }))
    });

    expect(new Set(result.assignments.map((assignment) => assignment.dayNumber)).size).toBe(2);
    expect(result.assignments).toHaveLength(4);
  });

  test("fills every week when independent subject sequences collectively contain enough units", () => {
    const materialLengths = [
      ["reader-e", 6, null],
      ["reader-f", 6, "reader-e"],
      ["reader-g", 6, "reader-f"],
      ["reader-h", 6, "reader-g"],
      ["reader-i", 6, "reader-h"],
      ["math", 19, null],
      ["social-studies", 19, null],
      ["science", 14, null],
      ["phonics", 18, null]
    ] as const;
    const materials = materialLengths.map(([id, , prerequisiteMaterialSetId], sortOrder) => ({
      id,
      prerequisiteMaterialSetId,
      sortOrder
    }));
    const units = materialLengths.flatMap(([materialSetId, unitCount], documentOrder) =>
      Array.from({ length: unitCount }, (_, sequenceOrder) => ({
        key: `${materialSetId}:${sequenceOrder}`,
        documentId: `${materialSetId}.pdf`,
        materialSetId,
        subjectKey: `custom:${materialSetId}`,
        subjectLabel: materialSetId,
        documentOrder,
        sequenceOrder,
        estimatedMinutes: 20,
        pageCount: 2
      }))
    );

    const result = buildDeterministicPlanSchedule({
      weekNumbers: Array.from({ length: 36 }, (_, index) => index + 1),
      teachingDaysPerWeek: 5,
      materials,
      units
    });

    expect(new Set(result.assignments.map((assignment) => assignment.weekNumber))).toEqual(
      new Set(Array.from({ length: 36 }, (_, index) => index + 1))
    );
    const weeklyLessonCounts = Array.from({ length: 36 }, (_, index) =>
      result.assignments.filter((assignment) => assignment.weekNumber === index + 1).length
    );
    expect(Math.max(...weeklyLessonCounts) - Math.min(...weeklyLessonCounts)).toBeLessThanOrEqual(1);
    for (const material of materials.filter((candidate) => candidate.prerequisiteMaterialSetId)) {
      const prerequisiteWeeks = result.assignments
        .filter((assignment) => assignment.unitKey.startsWith(`${material.prerequisiteMaterialSetId}:`))
        .map((assignment) => assignment.weekNumber);
      const dependentWeeks = result.assignments
        .filter((assignment) => assignment.unitKey.startsWith(`${material.id}:`))
        .map((assignment) => assignment.weekNumber);
      expect(Math.min(...dependentWeeks)).toBeGreaterThan(Math.max(...prerequisiteWeeks));
    }
  });

  test("staggers independent subject cadences instead of clustering them in alternating weeks", () => {
    const materialLengths = [
      ["reading", 36],
      ["math", 18],
      ["science", 18],
      ["social-studies", 18]
    ] as const;
    const result = buildDeterministicPlanSchedule({
      weekNumbers: Array.from({ length: 36 }, (_, index) => index + 1),
      teachingDaysPerWeek: 5,
      materials: materialLengths.map(([id], sortOrder) => ({
        id,
        prerequisiteMaterialSetId: null,
        sortOrder
      })),
      units: materialLengths.flatMap(([materialSetId, unitCount], documentOrder) =>
        Array.from({ length: unitCount }, (_, sequenceOrder) => ({
          key: `${materialSetId}:${sequenceOrder}`,
          documentId: `${materialSetId}.pdf`,
          materialSetId,
          subjectKey: `custom:${materialSetId}`,
          subjectLabel: materialSetId,
          documentOrder,
          sequenceOrder,
          estimatedMinutes: 20,
          pageCount: 2
        }))
      )
    });

    const lessonCounts = Array.from({ length: 36 }, (_, index) =>
      result.assignments.filter((assignment) => assignment.weekNumber === index + 1).length
    );
    expect(Math.max(...lessonCounts) - Math.min(...lessonCounts)).toBeLessThanOrEqual(1);
    expect(lessonCounts.every((count) => count === 2 || count === 3)).toBe(true);
  });

  test("uses safe cross-subject swaps to prevent a final-week page balloon", () => {
    const materialDefinitions = [
      ["reader-d", 6, null, 5],
      ["reader-e", 6, "reader-d", 5],
      ["reader-f", 6, "reader-e", 5],
      ["reader-g", 6, "reader-f", 5],
      ["reader-h", 6, "reader-g", 5],
      ["reader-i", 6, "reader-h", 5],
      ["math", 24, null, 3],
      ["science", 14, null, 3],
      ["social-studies", 19, null, 3],
      ["phonics", 18, null, 2],
      ["spelling", 15, null, 1],
      ["writing-grammar", 26, null, 3]
    ] as const;
    const materials = materialDefinitions.map(([id, , prerequisiteMaterialSetId], sortOrder) => ({
      id,
      prerequisiteMaterialSetId,
      sortOrder
    }));
    const units = materialDefinitions.flatMap(([materialSetId, unitCount, , normalPages], documentOrder) =>
      Array.from({ length: unitCount }, (_, sequenceOrder) => ({
        key: `${materialSetId}:${sequenceOrder}`,
        documentId: `${materialSetId}.pdf`,
        materialSetId,
        subjectKey: `custom:${materialSetId}`,
        subjectLabel: materialSetId,
        documentOrder,
        sequenceOrder,
        estimatedMinutes: 30,
        pageCount: materialSetId === "phonics" && sequenceOrder === unitCount - 1
          ? 8
          : normalPages
      }))
    );
    const result = buildDeterministicPlanSchedule({
      weekNumbers: Array.from({ length: 36 }, (_, index) => index + 1),
      teachingDaysPerWeek: 5,
      materials,
      units
    });
    const pageCountByUnit = new Map(units.map((unit) => [unit.key, unit.pageCount]));
    const pagesByWeek = Array.from({ length: 36 }, (_, index) =>
      result.assignments
        .filter((assignment) => assignment.weekNumber === index + 1)
        .reduce((total, assignment) => total + pageCountByUnit.get(assignment.unitKey)!, 0)
    );
    const finalThreeWeeks = pagesByWeek.slice(-3);

    expect(Math.max(...finalThreeWeeks) - Math.min(...finalThreeWeeks)).toBeLessThanOrEqual(6);
    expect(pagesByWeek[35]).toBeLessThanOrEqual(18);
  });

  test("rejects circular prerequisites before assigning content", () => {
    expect(() => buildDeterministicPlanSchedule({
      weekNumbers: [1, 2],
      teachingDaysPerWeek: 2,
      materials: [
        { id: "a", prerequisiteMaterialSetId: "b", sortOrder: 0 },
        { id: "b", prerequisiteMaterialSetId: "a", sortOrder: 1 }
      ],
      units: [{
        key: "a:1",
        documentId: "a.pdf",
        materialSetId: "a",
        subjectKey: "custom:a",
        subjectLabel: "A",
        documentOrder: 0,
        sequenceOrder: 0,
        estimatedMinutes: 20,
        pageCount: 1
      }]
    })).toThrow("cycle");
  });
});
