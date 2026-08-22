type LessonComponent = {
  pdfPageStart: number;
  pdfPageEnd: number;
  includeInPacket: boolean;
};

type LessonManifestEntry = {
  title: string;
  pageRanges: Array<{ start: number; end: number }>;
};

export type WorkbookReplacementCompatibility = {
  compatible: boolean;
  reasons: string[];
  currentLessonCount: number;
  replacementLessonCount: number;
};

function normalizeLessonTitle(value: unknown) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .toLowerCase();
  const withoutNumberedPrefix = normalized.replace(
    /^(?:lesson|unit|chapter)\s+\d+(?:\.\d+)*\s*[-–—:.)]?\s*/i,
    ""
  );
  // A title such as "Chapter 1.1" consists entirely of the prefix above.
  // Preserve its numeric identity instead of turning a valid manifest entry
  // into an empty title and rejecting the whole published manifest.
  const comparableTitle = withoutNumberedPrefix.trim()
    ? withoutNumberedPrefix
    : normalized.replace(/^(?:lesson|unit|chapter)\s+/i, "");
  return comparableTitle
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function readComponents(value: unknown): LessonComponent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const component = candidate as {
      pdfPageStart?: unknown;
      pdfPageEnd?: unknown;
      includeInPacket?: unknown;
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
    return [{
      pdfPageStart,
      pdfPageEnd,
      includeInPacket: component.includeInPacket !== false
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

export function readLessonManifest(analysis: unknown): LessonManifestEntry[] | null {
  if (!analysis || typeof analysis !== "object") return null;
  const learningUnits = (analysis as { learningUnits?: unknown }).learningUnits;
  if (!Array.isArray(learningUnits) || learningUnits.length === 0) return null;
  const manifest = learningUnits.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const unit = candidate as { title?: unknown; components?: unknown };
    const title = normalizeLessonTitle(unit.title);
    const pageRanges = mergePageRanges(readComponents(unit.components));
    return title && pageRanges.length ? [{ title, pageRanges }] : [];
  });
  return manifest.length === learningUnits.length ? manifest : null;
}

/**
 * A revision may reflow pages or correct wording without becoming a new
 * edition. Customer progress remains compatible while the normalized lesson
 * titles, count, and sequence stay the same. Added, deleted, renamed, or
 * reordered lessons require a new edition.
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

  const currentManifest = readLessonManifest(input.currentAnalysis);
  const replacementManifest = readLessonManifest(input.replacementAnalysis);
  if (!currentManifest) {
    reasons.push("The published workbook does not have a complete lesson manifest to compare.");
  }
  if (!replacementManifest) {
    reasons.push("Treeschool could not build a complete lesson manifest from the replacement.");
  }

  if (currentManifest && replacementManifest) {
    if (currentManifest.length !== replacementManifest.length) {
      reasons.push(
        `The replacement contains ${replacementManifest.length} lessons; the published workbook contains ${currentManifest.length}.`
      );
    } else {
      for (let index = 0; index < currentManifest.length; index += 1) {
        const current = currentManifest[index]!;
        const replacement = replacementManifest[index]!;
        if (current.title !== replacement.title) {
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
