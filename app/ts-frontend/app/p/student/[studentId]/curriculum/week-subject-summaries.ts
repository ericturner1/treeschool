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

/**
 * Group split page ranges into lessons without changing the sequence stored by
 * the planner. The weekly PDF consumes that same sortOrder sequence, so the UI
 * must not independently sort lessons by their source PDF page numbers.
 */
export function groupWeekLessons(items: PaperPlanWeek["items"]) {
  const lessons = new Map<string, PaperPlanWeek["items"]>();
  const orderedItems = items
    .filter((candidate) => candidate.baseIncludedInPacket)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));

  for (const item of orderedItems) {
    const key = lessonKey(item);
    const group = lessons.get(key) ?? [];
    group.push(item);
    lessons.set(key, group);
  }

  return Array.from(lessons.entries()).map(([key, lessonItems]) => {
    const ordered = lessonItems.slice().sort((left, right) =>
      left.sortOrder - right.sortOrder ||
      left.firstPageIndex - right.firstPageIndex ||
      left.id.localeCompare(right.id)
    );
    const first = ordered[0]!;
    return {
      key,
      first,
      subjectLabel: first.subjectLabel || "Uncategorized",
      pageStart: Math.min(...ordered.map((item) => item.firstPageIndex)) + 1,
      pageEnd: Math.max(...ordered.map((item) => item.lastPageIndex)) + 1,
      days: Array.from(new Set(ordered.map((item) => item.dayNumber).filter((day): day is number => day != null))).sort((a, b) => a - b),
      sortOrder: Math.min(...ordered.map((item) => item.sortOrder))
    };
  }).sort((left, right) =>
    left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)
  );
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
  }));
}

export function workbookLessonSummary(
  workbooks: Array<{ label: string; lessonCount: number }>
) {
  return workbooks.map((workbook) =>
    `${workbook.label} (${workbook.lessonCount} ${workbook.lessonCount === 1 ? "lesson" : "lessons"})`
  ).join(" · ");
}
