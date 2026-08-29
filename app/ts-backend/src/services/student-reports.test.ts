import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import {
  buildAttendanceReportPdf,
  buildReportCardPdf,
} from "./student-report-pdfs";
import {
  estimatePlanItemMinutes,
  learningUnitMinuteEstimates,
  logicalPlanItemKey,
} from "./learning-time-estimates";
import { reportLearningUnits } from "./student-reports";

describe("student report PDFs", () => {
  test("estimates unique logical lesson time without double-counting split components", () => {
    const estimates = learningUnitMinuteEstimates({
      learningUnits: [
        { id: "lesson-a", estimatedMinutes: 35 },
        { id: "lesson-b" },
      ],
    });
    const firstPart = {
      id: "part-a",
      documentId: "workbook-a",
      sourceUnitId: "lesson-a",
      firstPageIndex: 2,
      lastPageIndex: 3,
    };
    const secondPart = { ...firstPart, id: "part-b", firstPageIndex: 4, lastPageIndex: 4 };

    expect(estimatePlanItemMinutes(firstPart, estimates)).toBe(35);
    expect(logicalPlanItemKey(firstPart)).toBe(logicalPlanItemKey(secondPart));
    expect(estimates.get("lesson-b")).toBe(30);
    expect(estimatePlanItemMinutes({
      sourceUnitId: null,
      firstPageIndex: 0,
      lastPageIndex: 1,
    }, estimates)).toBe(20);
  });

  test("uses stable workbook unit ids and sequence order for progress", () => {
    expect(reportLearningUnits({
      learningUnits: [
        { id: "lesson-b", title: "Lesson B", sequenceOrder: 2 },
        { id: "lesson-a", title: "Lesson A", sequenceOrder: 1 },
        { id: "lesson-a", title: "Duplicate", sequenceOrder: 3 },
        { title: "Missing id" },
      ],
    })).toEqual([
      { id: "lesson-a", title: "Duplicate", sequenceOrder: 3 },
      { id: "lesson-b", title: "Lesson B", sequenceOrder: 2 },
    ].sort((left, right) => left.sequenceOrder - right.sequenceOrder));
  });

  test("builds a paginated attendance report with Unicode workbook labels", async () => {
    const bytes = await buildAttendanceReportPdf({
      studentName: "Gajou",
      yearTitle: "2026-2027 Learning Year",
      yearStatus: "active",
      dateFrom: "2026-08-01",
      dateTo: "2027-05-31",
      printPageSize: "letter",
      generatedAt: "2026-08-29T00:00:00.000Z",
      summary: { learningDays: 34, lessonsCompleted: 88, otherActivities: 4, minutes: 360 },
      workbooks: [
        {
          courseLabel: "Japanese Language (国語)",
          workbookTitle: "国語A",
          completedLessons: 8,
          totalLessons: 10,
          progressPercent: 80,
          lastLessonCompleted: "第8章 - ものがたり",
        },
      ],
      days: Array.from({ length: 34 }, (_, index) => ({
        date: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
        subjectLabels: ["Japanese Language (国語)", "Math"],
        lessonsCompleted: [`Chapter ${index + 1}.1`, `Practice ${index + 1}`],
        otherActivities: [],
        minutes: 45,
      })),
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(bytes.byteLength).toBeGreaterThan(20_000);
  });

  test("builds a current-year report card", async () => {
    const bytes = await buildReportCardPdf({
      studentName: "Gajou",
      gradeLevel: 1,
      yearTitle: "2026-2027 Learning Year",
      yearStatus: "active",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-29",
      printPageSize: "letter",
      generatedAt: "2026-08-29T00:00:00.000Z",
      gradingSchemeName: "US letter grades",
      overallAverage: 91.5,
      overallGrade: "A-",
      gradedEntries: 12,
      completedWeeks: 4,
      totalWeeks: 36,
      learningDays: 18,
      subjects: [
        { subjectLabel: "Math", gradedEntries: 4, averageScore: 94.25, grade: "A" },
        { subjectLabel: "Japanese Language (国語)", gradedEntries: 5, averageScore: 89.5, grade: "B+" },
        { subjectLabel: "Science", gradedEntries: 3, averageScore: 91, grade: "A-" },
      ],
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(15_000);
  });
});
