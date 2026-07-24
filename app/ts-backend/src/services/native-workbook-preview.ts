export type NativeWorkbookLessonPageRange = {
  pdfPageStart: number;
  pdfPageEnd: number;
};

export type NativeWorkbookLessonSummary = {
  id: string;
  kind: "lesson" | "section";
  title: string;
  summary: string;
  estimatedMinutes: number;
  conceptLabels: string[];
  pageRanges: NativeWorkbookLessonPageRange[];
  pageCount: number;
};

function normalizedText(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function mergePageRanges(ranges: NativeWorkbookLessonPageRange[]) {
  const merged: NativeWorkbookLessonPageRange[] = [];
  for (const range of [...ranges].sort((left, right) =>
    left.pdfPageStart - right.pdfPageStart || left.pdfPageEnd - right.pdfPageEnd
  )) {
    const previous = merged.at(-1);
    if (previous && range.pdfPageStart <= previous.pdfPageEnd + 1) {
      previous.pdfPageEnd = Math.max(previous.pdfPageEnd, range.pdfPageEnd);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function formatList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function lessonSummary(input: {
  title: string;
  kind: "lesson" | "section";
  conceptLabels: string[];
  roles: string[];
  sectionNotes: string[];
}) {
  const usefulNotes = input.sectionNotes.filter((note) => !/(?:physical page|page range|table of contents|\bTOC\b|title match|page mapping|conversion utility|extracted outline)/i.test(note));
  if (usefulNotes.length) return usefulNotes.join(" ").slice(0, 480);
  const normalizedTitle = input.title.toLocaleLowerCase();
  const distinctConcepts = input.conceptLabels.filter((label) => label.toLocaleLowerCase() !== normalizedTitle);
  if (distinctConcepts.length) return `Covers ${formatList(distinctConcepts)}.`;
  const topic = input.title
    .replace(/^(?:lesson|chapter|unit|part)\s+[a-z0-9.]+\s*(?:[—–:-]\s*)?/i, "")
    .trim();
  if (topic) return `${input.kind === "section" ? "Introduces" : "Focuses on"} ${topic}.`;
  const roleLabels = Array.from(new Set(input.roles.map((role) => ({
    instruction: "instruction",
    passage: "reading",
    worked_example: "worked examples",
    practice: "practice",
    assessment: "assessment",
    answer_key: "answer-key material",
    teacher_support: "teacher support",
    reference: "reference material"
  })[role] ?? "lesson material")));
  return `Includes ${formatList(roleLabels)}.`;
}

export function buildNativeWorkbookLessonSummaries(
  analysis: unknown,
  pageCount: number
): NativeWorkbookLessonSummary[] {
  if (!analysis || typeof analysis !== "object") return [];
  const record = analysis as {
    structureVersion?: unknown;
    learningUnits?: unknown;
    sections?: unknown;
  };
  if (Number(record.structureVersion) < 3 || !Array.isArray(record.learningUnits)) return [];

  const sections = Array.isArray(record.sections)
    ? record.sections.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const section = candidate as Record<string, unknown>;
        const startPage = Math.round(Number(section.startPage));
        const endPage = Math.round(Number(section.endPage));
        const notes = normalizedText(section.notes, 320);
        return Number.isInteger(startPage) && Number.isInteger(endPage) && startPage >= 1 && endPage >= startPage
          ? [{ startPage, endPage, notes }]
          : [];
      })
    : [];

  return record.learningUnits.flatMap((candidate, unitIndex) => {
    if (!candidate || typeof candidate !== "object") return [];
    const unit = candidate as Record<string, unknown>;
    const id = normalizedText(unit.id, 180);
    const title = normalizedText(unit.title, 240);
    if (!id || !title || !Array.isArray(unit.components)) return [];

    const components = unit.components.flatMap((componentCandidate) => {
      if (!componentCandidate || typeof componentCandidate !== "object") return [];
      const component = componentCandidate as Record<string, unknown>;
      const pdfPageStart = Math.round(Number(component.pdfPageStart));
      const pdfPageEnd = Math.round(Number(component.pdfPageEnd));
      if (
        component.includeInPacket !== true ||
        !Number.isInteger(pdfPageStart) ||
        !Number.isInteger(pdfPageEnd) ||
        pdfPageStart < 1 ||
        pdfPageEnd < pdfPageStart ||
        pdfPageEnd > pageCount
      ) return [];
      return [{
        pdfPageStart,
        pdfPageEnd,
        role: normalizedText(component.role, 40)
      }];
    });
    if (!components.length || components.length !== unit.components.length) return [];

    const pageRanges = mergePageRanges(components.map(({ pdfPageStart, pdfPageEnd }) => ({
      pdfPageStart,
      pdfPageEnd
    })));
    const firstPage = pageRanges[0]!.pdfPageStart;
    const lastPage = pageRanges.at(-1)!.pdfPageEnd;
    const conceptLabels = Array.isArray(unit.conceptLabels)
      ? Array.from(new Set(unit.conceptLabels.map((label) => normalizedText(label, 120)).filter(Boolean))).slice(0, 8)
      : [];
    const sectionNotes = Array.from(new Set(sections
      .filter((section) => section.endPage >= firstPage && section.startPage <= lastPage)
      .map((section) => section.notes)
      .filter(Boolean))).slice(0, 3);

    const pageCountForUnit = pageRanges.reduce(
      (total, range) => total + range.pdfPageEnd - range.pdfPageStart + 1,
      0
    );
    const kind: NativeWorkbookLessonSummary["kind"] = /^(?:chapter|unit|part)\b/i.test(title) && pageCountForUnit <= 2
      ? "section"
      : "lesson";

    return [{
      id,
      kind,
      title,
      summary: lessonSummary({
        title,
        kind,
        conceptLabels,
        roles: components.map((component) => component.role),
        sectionNotes
      }),
      estimatedMinutes: Math.max(1, Math.round(Number(unit.estimatedMinutes) || 30)),
      conceptLabels,
      pageRanges,
      pageCount: pageCountForUnit,
      sequenceOrder: Number.isFinite(Number(unit.sequenceOrder))
        ? Number(unit.sequenceOrder)
        : unitIndex
    }];
  }).sort((left, right) => left.sequenceOrder - right.sequenceOrder)
    .map(({ sequenceOrder: _sequenceOrder, ...lesson }) => lesson);
}

export function nativeWorkbookLessonPageIndexes(lesson: NativeWorkbookLessonSummary) {
  return lesson.pageRanges.flatMap((range) => Array.from(
    { length: range.pdfPageEnd - range.pdfPageStart + 1 },
    (_, offset) => range.pdfPageStart - 1 + offset
  ));
}
