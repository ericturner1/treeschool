type LessonComponent = {
  pdfPageStart: number;
  pdfPageEnd: number;
  includeInPacket: boolean;
  role: string | null;
};

type LessonManifestEntry = {
  title: string;
  stableNumber: string | null;
  pageRanges: Array<{ start: number; end: number }>;
};

type RawLessonManifestEntry = LessonManifestEntry & {
  sourceTitle: string;
  subject: string;
  components: LessonComponent[];
};

type RawLessonManifest = {
  entries: RawLessonManifestEntry[];
  rolesComplete: boolean;
};

export type WorkbookReplacementCompatibility = {
  compatible: boolean;
  reasons: string[];
  currentLessonCount: number;
  replacementLessonCount: number;
};

const LEARNING_UNIT_ROLES = new Set([
  "instruction",
  "passage",
  "worked_example",
  "practice",
  "assessment",
  "answer_key",
  "teacher_support",
  "reference"
]);

function canonicalizeTitle(value: string) {
  return value
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedSourceTitle(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .trim();
}

function numberedTitle(value: unknown) {
  const source = normalizedSourceTitle(value);
  const labeled = source.match(
    /^\s*(?:lesson|unit|chapter|ch\.?)(?:\s+|\s*#\s*)(\d+(?:\.\d+)*)\b/i
  );
  const bareHierarchical = source.match(/^\s*(\d+(?:\.\d+)+)\b/);
  const match = labeled ?? bareHierarchical;
  if (!match?.[1]) return null;
  return match[1]
    .split(".")
    .map((part) => String(Number(part)))
    .join(".");
}

function normalizeLessonTitle(value: unknown) {
  const normalized = normalizedSourceTitle(value);
  const withoutNumberedPrefix = normalized.replace(
    /^(?:lesson|unit|chapter|ch\.?)\s*(?:#\s*)?\d+(?:\.\d+)*\s*[-–—:.)]?\s*/i,
    ""
  );
  // A title such as "Chapter 1.1" consists entirely of the prefix above.
  // Preserve its numeric identity instead of turning a valid manifest entry
  // into an empty title and rejecting the whole published manifest.
  const comparableTitle = withoutNumberedPrefix.trim()
    ? withoutNumberedPrefix
    : normalized.replace(/^(?:lesson|unit|chapter|ch\.?)\s+/i, "");
  return canonicalizeTitle(comparableTitle);
}

function normalizeLessonSubject(value: unknown) {
  let subject = normalizedSourceTitle(value).replace(
    /^(?:lesson|unit|chapter|ch\.?)\s*(?:#\s*)?\d+(?:\.\d+)*\s*[-–—:.)]?\s*/i,
    ""
  );
  const genericRole = /^(?:(?:answer\s*key|answers?|practice|exercises?|questions?|worksheet|kanji\s+introduction|concept\s+introduction|lesson\s+introduction|introduction)\s*[-–—:]?\s*)/i;
  while (genericRole.test(subject)) subject = subject.replace(genericRole, "");
  return canonicalizeTitle(subject);
}

function readComponents(value: unknown): LessonComponent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const component = candidate as {
      pdfPageStart?: unknown;
      pdfPageEnd?: unknown;
      includeInPacket?: unknown;
      role?: unknown;
    };
    const pdfPageStart = Number(component.pdfPageStart);
    const pdfPageEnd = Number(component.pdfPageEnd);
    if (
      !Number.isInteger(pdfPageStart) ||
      !Number.isInteger(pdfPageEnd) ||
      pdfPageStart < 1 ||
      pdfPageEnd < pdfPageStart
    ) {
      return [];
    }
    const role = String(component.role ?? "");
    return [{
      pdfPageStart,
      pdfPageEnd,
      includeInPacket: component.includeInPacket !== false,
      role: LEARNING_UNIT_ROLES.has(role) ? role : null
    }];
  });
}

function mergePageRanges(components: LessonComponent[]) {
  const ranges = components
    .filter((component) => component.includeInPacket)
    .map((component) => ({ start: component.pdfPageStart, end: component.pdfPageEnd }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function readRawLessonManifest(analysis: unknown): RawLessonManifest | null {
  if (!analysis || typeof analysis !== "object") return null;
  const learningUnits = (analysis as { learningUnits?: unknown }).learningUnits;
  if (!Array.isArray(learningUnits) || learningUnits.length === 0) return null;
  const entries = learningUnits.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const unit = candidate as { title?: unknown; components?: unknown };
    const sourceTitle = String(unit.title ?? "").trim();
    const title = normalizeLessonTitle(sourceTitle);
    const components = readComponents(unit.components);
    const pageRanges = mergePageRanges(components);
    return title && pageRanges.length ? [{
      sourceTitle,
      title,
      subject: normalizeLessonSubject(sourceTitle),
      stableNumber: numberedTitle(sourceTitle),
      pageRanges,
      components
    }] : [];
  });
  if (entries.length !== learningUnits.length) return null;
  return {
    entries,
    rolesComplete: entries.every((entry) =>
      entry.components
        .filter((component) => component.includeInPacket)
        .every((component) => component.role != null)
    )
  };
}

function buildLogicalLessonManifest(raw: RawLessonManifest): LessonManifestEntry[] | null {
  if (!raw.rolesComplete) return null;
  const numberedParents = new Set(
    raw.entries.flatMap((entry) => {
      if (!entry.stableNumber) return [];
      return raw.entries.some((candidate) =>
        candidate.stableNumber?.startsWith(`${entry.stableNumber}.`)
      ) ? [entry.stableNumber] : [];
    })
  );
  const schedulable = raw.entries.filter((entry) => {
    const roles = entry.components
      .filter((component) => component.includeInPacket)
      .flatMap((component) => component.role ? [component.role] : []);
    const referenceOnly = roles.length > 0 && roles.every((role) =>
      role === "reference" || role === "teacher_support"
    );
    return !referenceOnly && !(entry.stableNumber && numberedParents.has(entry.stableNumber));
  });
  if (!schedulable.length) return null;

  type LogicalLessonDraft = {
    title: string;
    stableNumber: string | null;
    subjects: Set<string>;
    components: LessonComponent[];
  };
  const lessons: LogicalLessonDraft[] = [];
  const lessonByNumber = new Map<string, LogicalLessonDraft>();
  let previous: LogicalLessonDraft | null = null;

  const attach = (lesson: LogicalLessonDraft, entry: RawLessonManifestEntry) => {
    lesson.components.push(...entry.components);
    if (entry.subject) lesson.subjects.add(entry.subject);
    if (entry.stableNumber) lessonByNumber.set(entry.stableNumber, lesson);
    return lesson;
  };

  for (const entry of schedulable) {
    const roles = entry.components
      .filter((component) => component.includeInPacket)
      .flatMap((component) => component.role ? [component.role] : []);
    const answerOnly = roles.length > 0 && roles.every((role) => role === "answer_key");
    const practiceWithOptionalAnswers = roles.some((role) => role === "practice") &&
      roles.every((role) => role === "practice" || role === "answer_key");
    const numberedMatch = entry.stableNumber
      ? lessonByNumber.get(entry.stableNumber) ?? null
      : null;
    const previousSubjectMatch = Boolean(
      entry.subject && previous?.subjects.has(entry.subject)
    );

    if (numberedMatch) {
      previous = attach(numberedMatch, entry);
      continue;
    }
    if (answerOnly) {
      if (previous) previous = attach(previous, entry);
      continue;
    }
    if (practiceWithOptionalAnswers && previousSubjectMatch && previous) {
      previous = attach(previous, entry);
      continue;
    }

    const lesson: LogicalLessonDraft = {
      title: entry.title,
      stableNumber: entry.stableNumber,
      subjects: new Set(entry.subject ? [entry.subject] : []),
      components: []
    };
    lessons.push(lesson);
    previous = attach(lesson, entry);
  }

  return lessons.map((lesson) => ({
    title: lesson.title,
    stableNumber: lesson.stableNumber,
    pageRanges: mergePageRanges(lesson.components)
  }));
}

export function readLessonManifest(analysis: unknown): LessonManifestEntry[] | null {
  const raw = readRawLessonManifest(analysis);
  if (!raw) return null;
  return buildLogicalLessonManifest(raw) ?? raw.entries;
}

/**
 * A revision may reflow pages or correct wording without becoming a new
 * edition. For structured Studio books, stable content ids are checked by the
 * caller. Legacy PDFs do not have author-provided ids, so this comparison
 * deterministically groups AI page fragments (instruction, practice, and
 * answer-key ranges) into logical lessons before comparing the lesson count.
 * Stable printed lesson numbers are also compared when both analyses expose
 * them. Added, deleted, or reordered numbered lessons require a new edition.
 */
export function checkWorkbookReplacementCompatibility(input: {
  currentPageCount: number;
  replacementPageCount: number;
  currentAnalysis: unknown;
  replacementAnalysis: unknown;
  currentPageTexts?: string[];
  replacementPageTexts?: string[];
}): WorkbookReplacementCompatibility {
  const reasons: string[] = [];
  const currentRaw = readRawLessonManifest(input.currentAnalysis);
  const replacementRaw = readRawLessonManifest(input.replacementAnalysis);
  const useLogicalLessons = Boolean(currentRaw?.rolesComplete && replacementRaw?.rolesComplete);
  const currentManifest = currentRaw
    ? useLogicalLessons ? buildLogicalLessonManifest(currentRaw) : currentRaw.entries
    : null;
  const replacementManifest = replacementRaw
    ? useLogicalLessons ? buildLogicalLessonManifest(replacementRaw) : replacementRaw.entries
    : null;

  if (!currentManifest) {
    reasons.push("The published workbook does not have a complete logical lesson manifest to compare.");
  }
  if (!replacementManifest) {
    reasons.push("Treeschool could not build a complete logical lesson manifest from the replacement.");
  }

  if (currentManifest && replacementManifest) {
    if (currentManifest.length !== replacementManifest.length) {
      reasons.push(
        `The replacement contains ${replacementManifest.length} logical lessons; the published workbook contains ${currentManifest.length}.`
      );
    } else if (useLogicalLessons) {
      const bothHaveStableNumbers = currentManifest.every((lesson) => lesson.stableNumber) &&
        replacementManifest.every((lesson) => lesson.stableNumber);
      if (bothHaveStableNumbers) {
        for (let index = 0; index < currentManifest.length; index += 1) {
          if (currentManifest[index]!.stableNumber !== replacementManifest[index]!.stableNumber) {
            reasons.push(`Logical lesson ${index + 1} no longer has the same printed number or sequence position.`);
          }
          if (reasons.length >= 5) break;
        }
      }
    } else {
      for (let index = 0; index < currentManifest.length; index += 1) {
        if (currentManifest[index]!.title !== replacementManifest[index]!.title) {
          reasons.push(`Lesson ${index + 1} no longer has the same title or sequence position.`);
        }
        if (reasons.length >= 5) break;
      }
    }
  }

  return {
    compatible: reasons.length === 0,
    reasons,
    currentLessonCount: currentManifest?.length ?? 0,
    replacementLessonCount: replacementManifest?.length ?? 0
  };
}
