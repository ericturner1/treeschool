import type { PaperPlanWeek } from "../../../../../lib/paper-plans/server";

type SubjectSummary = {
  subjectKey: string;
  subjectLabel: string;
  fallbackTitles: Set<string>;
  lessonsByDocument: Map<string, Set<string>>;
  grades: number[];
};

function lessonKey(item: PaperPlanWeek["items"][number]) {
  return item.sourceUnitId
    ? `${item.documentId}:unit:${item.sourceUnitId}`
    : `${item.documentId}:legacy:${item.label}:${item.dayNumber ?? "none"}`;
}

export function weekSubjectSummaries(week: Pick<PaperPlanWeek, "days" | "subjectGrades">) {
  const summaries = new Map<string, SubjectSummary>();
  for (const day of week.days) {
    for (const subject of day.subjects) {
      const summary = summaries.get(subject.subjectKey) ?? {
        subjectKey: subject.subjectKey,
        subjectLabel: subject.subjectLabel,
        fallbackTitles: new Set<string>(),
        lessonsByDocument: new Map<string, Set<string>>(),
        grades: []
      };
      if (subject.title) summary.fallbackTitles.add(subject.title);
      if (subject.grade != null) summary.grades.push(subject.grade);
      for (const item of subject.items) {
        const lessons = summary.lessonsByDocument.get(item.documentLabel) ?? new Set<string>();
        lessons.add(lessonKey(item));
        summary.lessonsByDocument.set(item.documentLabel, lessons);
      }
      summaries.set(subject.subjectKey, summary);
    }
  }
  if (summaries.size === 0) {
    for (const subject of week.subjectGrades) {
      summaries.set(subject.subjectKey, {
        subjectKey: subject.subjectKey,
        subjectLabel: subject.subjectLabel,
        fallbackTitles: new Set(subject.planTitle ? [subject.planTitle] : []),
        lessonsByDocument: new Map(),
        grades: subject.grade == null ? [] : [subject.grade]
      });
    }
  }
  return Array.from(summaries.values()).map((subject) => ({
    subjectKey: subject.subjectKey,
    subjectLabel: subject.subjectLabel,
    title: Array.from(subject.fallbackTitles)[0] ?? null,
    workbooks: Array.from(subject.lessonsByDocument, ([label, lessons]) => ({
      label,
      lessonCount: lessons.size
    })),
    grade: subject.grades.length === 0
      ? null
      : Math.round(subject.grades.reduce((total, grade) => total + grade, 0) / subject.grades.length)
  })).sort((left, right) => left.subjectLabel.localeCompare(right.subjectLabel));
}

export function workbookLessonSummary(
  workbooks: Array<{ label: string; lessonCount: number }>
) {
  return workbooks.map((workbook) =>
    `${workbook.label} (${workbook.lessonCount} ${workbook.lessonCount === 1 ? "lesson" : "lessons"})`
  ).join(" · ");
}
