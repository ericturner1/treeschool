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
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/^(?:lesson|unit|chapter)\s+\d+(?:\.\d+)*\s*[-–—:.)]?\s*/i, "")
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

function pageRangesMatch(
  current: LessonManifestEntry["pageRanges"],
  replacement: LessonManifestEntry["pageRanges"]
) {
  return current.length === replacement.length && current.every((range, index) =>
    range.start === replacement[index]?.start && range.end === replacement[index]?.end
  );
}

function normalizedWords(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function wordBagSimilarity(left: string, right: string) {
  const leftWords = normalizedWords(left);
  const rightWords = normalizedWords(right);
  if (leftWords.length < 4 || rightWords.length < 4) return null;
  const leftBag = new Map<string, number>();
  const rightBag = new Map<string, number>();
  for (const word of leftWords) leftBag.set(word, (leftBag.get(word) ?? 0) + 1);
  for (const word of rightWords) rightBag.set(word, (rightBag.get(word) ?? 0) + 1);
  const vocabulary = new Set([...leftBag.keys(), ...rightBag.keys()]);
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const word of vocabulary) {
    const leftCount = leftBag.get(word) ?? 0;
    const rightCount = rightBag.get(word) ?? 0;
    dotProduct += leftCount * rightCount;
    leftMagnitude += leftCount * leftCount;
    rightMagnitude += rightCount * rightCount;
  }
  return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude);
}

function lessonText(pages: string[], lesson: LessonManifestEntry) {
  return lesson.pageRanges.flatMap((range) =>
    pages.slice(range.start - 1, range.end)
  ).join("\n");
}

/**
 * This deliberately compares the indexed lesson contract, not the PDF bytes.
 * Harmless corrections can change bytes, branding, or a small amount of copy,
 * while customer progress depends on lesson order and physical page boundaries.
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
  if (input.currentPageCount !== input.replacementPageCount) {
    reasons.push(
      `The replacement has ${input.replacementPageCount} pages; the published workbook has ${input.currentPageCount}.`
    );
  }

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
        if (!pageRangesMatch(current.pageRanges, replacement.pageRanges)) {
          reasons.push(`Lesson ${index + 1} no longer uses the same physical page range.`);
        }
        if (input.currentPageTexts && input.replacementPageTexts) {
          const contentSimilarity = wordBagSimilarity(
            lessonText(input.currentPageTexts, current),
            lessonText(input.replacementPageTexts, replacement)
          );
          if (contentSimilarity == null) {
            reasons.push(`Lesson ${index + 1} does not contain enough extractable text to verify its content safely.`);
          } else if (contentSimilarity < 0.9) {
            reasons.push(
              `Lesson ${index + 1} content changed too much to verify safely (${Math.round(contentSimilarity * 100)}% similarity).`
            );
          }
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
