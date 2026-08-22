import { describe, expect, test } from "bun:test";
import type { PaperPlanWeek } from "../../../../../lib/paper-plans/server";
import {
  groupWeekLessons,
  weekSubjectSummaries,
  workbookLessonSummary
} from "./week-subject-summaries";

function item(input: {
  id: string;
  workbook: string;
  sourceUnitId: string;
  label: string;
  sortOrder?: number;
  firstPageIndex?: number;
  subjectLabel?: string;
}): PaperPlanWeek["items"][number] {
  return {
    id: input.id,
    documentId: `document:${input.workbook}`,
    documentLabel: input.workbook,
    subjectId: null,
    subjectLabel: input.subjectLabel ?? "Japanese Language (国語)",
    firstPageIndex: input.firstPageIndex ?? 0,
    lastPageIndex: input.firstPageIndex ?? 0,
    label: input.label,
    dayLabel: null,
    dayNumber: 1,
    pageRangeCategory: "instruction",
    conceptLabels: [],
    conceptRedundant: false,
    redundancyReason: null,
    sourceUnitId: input.sourceUnitId,
    sourceUnitPartIndex: 0,
    baseIncludedInPacket: true,
    includedInPacket: true,
    lessonDisposition: "include",
    sortOrder: input.sortOrder ?? 0
  };
}

describe("weekly subject summaries", () => {
  test("shows every workbook and counts split pages as one lesson", () => {
    const c1 = item({ id: "c1-a", workbook: "国語C", sourceUnitId: "c1", label: "Chapter 6.1" });
    const c1PartTwo = { ...c1, id: "c1-b", firstPageIndex: 1, lastPageIndex: 1 };
    const c2 = item({ id: "c2", workbook: "国語C", sourceUnitId: "c2", label: "Chapter 6.2" });
    const d1 = item({ id: "d1", workbook: "国語D", sourceUnitId: "d1", label: "Chapter 8.2" });
    const summary = weekSubjectSummaries({
      days: [{
        dayNumber: 1,
        status: "not_started",
        attendanceProgress: 0,
        attendanceLogged: false,
        attendanceLoggedToday: false,
        attendedSubjectKeys: [],
        attendanceDates: [],
        subjects: [{
          subjectKey: "custom:japanese-language",
          subjectId: null,
          subjectLabel: "Japanese Language (国語)",
          title: "Chapter 6.1; Chapter 6.2; Chapter 8.2",
          assessmentRecommended: false,
          grade: null,
          items: [c1, c1PartTwo, c2, d1]
        }]
      }],
      subjectGrades: []
    })[0]!;

    expect(summary.workbooks).toEqual([
      { label: "国語C", lessonCount: 2 },
      { label: "国語D", lessonCount: 1 }
    ]);
    expect(workbookLessonSummary(summary.workbooks)).toBe("国語C (2 lessons) · 国語D (1 lesson)");
  });

  test("keeps lessons in the planner sequence instead of sorting by workbook page", () => {
    const scheduledFirst = item({
      id: "workbook-c-late-page",
      workbook: "国語C",
      sourceUnitId: "c6",
      label: "Chapter 6.1",
      sortOrder: 4,
      firstPageIndex: 57
    });
    const scheduledSecond = item({
      id: "workbook-d-early-page",
      workbook: "国語D",
      sourceUnitId: "d1",
      label: "Chapter 1.1",
      sortOrder: 5,
      firstPageIndex: 2
    });

    expect(groupWeekLessons([scheduledSecond, scheduledFirst]).map((lesson) => lesson.first.id))
      .toEqual(["workbook-c-late-page", "workbook-d-early-page"]);
  });

  test("keeps subjects in their first scheduled appearance order", () => {
    const science = item({
      id: "science",
      workbook: "Science",
      sourceUnitId: "science-1",
      label: "Plants",
      sortOrder: 1,
      subjectLabel: "Science"
    });
    const math = item({
      id: "math",
      workbook: "Math",
      sourceUnitId: "math-1",
      label: "Addition",
      sortOrder: 2,
      subjectLabel: "Math"
    });
    const subjects = [
      {
        subjectKey: "science",
        subjectId: null,
        subjectLabel: "Science",
        title: "Plants",
        assessmentRecommended: false,
        grade: null,
        items: [science]
      },
      {
        subjectKey: "math",
        subjectId: null,
        subjectLabel: "Math",
        title: "Addition",
        assessmentRecommended: false,
        grade: null,
        items: [math]
      }
    ];

    const summaries = weekSubjectSummaries({
      days: [{
        dayNumber: 1,
        status: "not_started",
        attendanceProgress: 0,
        attendanceLogged: false,
        attendanceLoggedToday: false,
        attendedSubjectKeys: [],
        attendanceDates: [],
        subjects
      }],
      subjectGrades: []
    });

    expect(summaries.map((summary) => summary.subjectLabel)).toEqual(["Science", "Math"]);
  });
});
