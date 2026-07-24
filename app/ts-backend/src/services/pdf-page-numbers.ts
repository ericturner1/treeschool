export type PageNumberMappingSegment = {
  pdfPageStart: number;
  pdfPageEnd: number;
  contentPageStart: number;
  contentPageEnd: number;
};

export type PageNumberMapping = {
  source: "pdf_page_labels" | "embedded_text_corners" | "ai_visual_ocr" | "ai_detected" | "manual";
  confidence: "low" | "medium" | "high";
  segments: PageNumberMappingSegment[];
  globalFormat?: {
    style: "arabic_numeric" | "roman_numeral" | "mixed" | "unknown";
    location: "top_left" | "top_center" | "top_right" | "bottom_left" | "bottom_center" | "bottom_right" | "varies" | "unknown";
    pattern: string | null;
    detectionMethod: "pdf_page_labels" | "embedded_text_corners" | "ai_visual_ocr" | "manual";
    sampledPdfPages: number[];
  };
  detectionAudit?: Array<{
    method: "pdf_page_labels" | "embedded_text_corners" | "ai_visual_ocr" | "manual";
    attempted: boolean;
    succeeded: boolean;
    sampledPdfPages: number[];
    note: string;
  }>;
};

export type PageSelectionAudit = {
  utility: "treeschool.page-number-converter";
  utilityVersion: 2;
  direction: "pdf_to_content";
  used: true;
  mappingAvailable: boolean;
  mappingSource: PageNumberMapping["source"] | null;
  mappingConfidence: PageNumberMapping["confidence"] | null;
  pdfPageStart: number;
  pdfPageEnd: number;
  contentPageStart: number | null;
  contentPageEnd: number | null;
  startConversionStatus: "resolved" | "unmapped";
  endConversionStatus: "resolved" | "unmapped";
};

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function normalizePageNumberMapping(
  value: unknown,
  pdfPageCount: number
): PageNumberMapping | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    source?: unknown;
    confidence?: unknown;
    segments?: unknown;
    globalFormat?: unknown;
    detectionAudit?: unknown;
  };
  if (!Array.isArray(raw.segments)) return null;

  const segments = raw.segments.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const segment = candidate as Record<string, unknown>;
    const pdfPageStart = integer(segment.pdfPageStart);
    const pdfPageEnd = integer(segment.pdfPageEnd);
    const contentPageStart = integer(segment.contentPageStart);
    const contentPageEnd = integer(segment.contentPageEnd);
    if (
      pdfPageStart == null ||
      pdfPageEnd == null ||
      contentPageStart == null ||
      contentPageEnd == null ||
      pdfPageStart < 1 ||
      pdfPageEnd < pdfPageStart ||
      pdfPageEnd > pdfPageCount ||
      contentPageStart < 0 ||
      contentPageEnd < contentPageStart ||
      pdfPageEnd - pdfPageStart !== contentPageEnd - contentPageStart
    ) {
      return [];
    }
    return [{ pdfPageStart, pdfPageEnd, contentPageStart, contentPageEnd }];
  }).sort((left, right) => left.pdfPageStart - right.pdfPageStart);

  if (segments.length === 0) return null;
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    if (
      !previous ||
      !current ||
      current.pdfPageStart <= previous.pdfPageEnd ||
      current.contentPageStart <= previous.contentPageEnd
    ) {
      return null;
    }
  }

  const source = ["pdf_page_labels", "embedded_text_corners", "ai_visual_ocr", "ai_detected", "manual"].includes(String(raw.source))
    ? raw.source as PageNumberMapping["source"]
    : "ai_detected";
  const confidence = ["low", "medium", "high"].includes(String(raw.confidence))
    ? raw.confidence as PageNumberMapping["confidence"]
    : "low";
  const rawFormat = raw.globalFormat && typeof raw.globalFormat === "object"
    ? raw.globalFormat as Record<string, unknown>
    : null;
  const allowedLocations = ["top_left", "top_center", "top_right", "bottom_left", "bottom_center", "bottom_right", "varies", "unknown"];
  const allowedStyles = ["arabic_numeric", "roman_numeral", "mixed", "unknown"];
  const globalFormat = rawFormat ? {
    style: allowedStyles.includes(String(rawFormat.style))
      ? rawFormat.style as NonNullable<PageNumberMapping["globalFormat"]>["style"]
      : "unknown" as const,
    location: allowedLocations.includes(String(rawFormat.location))
      ? rawFormat.location as NonNullable<PageNumberMapping["globalFormat"]>["location"]
      : "unknown" as const,
    pattern: String(rawFormat.pattern ?? "").trim().slice(0, 120) || null,
    detectionMethod: ["pdf_page_labels", "embedded_text_corners", "ai_visual_ocr", "manual"].includes(String(rawFormat.detectionMethod))
      ? rawFormat.detectionMethod as NonNullable<PageNumberMapping["globalFormat"]>["detectionMethod"]
      : source === "ai_detected" ? "ai_visual_ocr" as const : source,
    sampledPdfPages: Array.isArray(rawFormat.sampledPdfPages)
      ? Array.from(new Set(rawFormat.sampledPdfPages.map(integer).filter((page): page is number => page != null && page >= 1 && page <= pdfPageCount))).slice(0, 40)
      : []
  } : undefined;
  const detectionAudit = Array.isArray(raw.detectionAudit)
    ? raw.detectionAudit.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const candidate = entry as Record<string, unknown>;
        const method = String(candidate.method);
        if (!["pdf_page_labels", "embedded_text_corners", "ai_visual_ocr", "manual"].includes(method)) return [];
        return [{
          method: method as NonNullable<PageNumberMapping["detectionAudit"]>[number]["method"],
          attempted: candidate.attempted !== false,
          succeeded: candidate.succeeded === true,
          sampledPdfPages: Array.isArray(candidate.sampledPdfPages)
            ? Array.from(new Set(candidate.sampledPdfPages.map(integer).filter((page): page is number => page != null && page >= 1 && page <= pdfPageCount))).slice(0, 40)
            : [],
          note: String(candidate.note ?? "").trim().slice(0, 300)
        }];
      })
    : undefined;
  return { source, confidence, segments, ...(globalFormat ? { globalFormat } : {}), ...(detectionAudit ? { detectionAudit } : {}) };
}

export function buildPageNumberMappingFromPdfLabels(
  labels: string[] | null,
  pdfPageCount: number
): PageNumberMapping | null {
  if (!labels?.length) return null;
  const points = labels.slice(0, pdfPageCount).flatMap((label, index) => {
    const normalized = String(label ?? "").trim();
    if (!/^\d+$/.test(normalized)) return [];
    return [{ pdfPageNumber: index + 1, contentPageNumber: Number(normalized) }];
  });
  if (points.length === 0) return null;

  const segments: PageNumberMappingSegment[] = [];
  for (const point of points) {
    const previous = segments[segments.length - 1];
    if (
      previous &&
      point.pdfPageNumber === previous.pdfPageEnd + 1 &&
      point.contentPageNumber === previous.contentPageEnd + 1
    ) {
      previous.pdfPageEnd = point.pdfPageNumber;
      previous.contentPageEnd = point.contentPageNumber;
    } else {
      segments.push({
        pdfPageStart: point.pdfPageNumber,
        pdfPageEnd: point.pdfPageNumber,
        contentPageStart: point.contentPageNumber,
        contentPageEnd: point.contentPageNumber
      });
    }
  }
  return normalizePageNumberMapping(
    {
      source: "pdf_page_labels",
      confidence: "high",
      segments,
      globalFormat: {
        style: "arabic_numeric",
        location: "unknown",
        pattern: "PDF page label",
        detectionMethod: "pdf_page_labels",
        sampledPdfPages: points.map((point) => point.pdfPageNumber)
      },
      detectionAudit: [{
        method: "pdf_page_labels",
        attempted: true,
        succeeded: true,
        sampledPdfPages: points.map((point) => point.pdfPageNumber),
        note: "Numeric page labels were read from the PDF catalog."
      }]
    },
    pdfPageCount
  );
}

export function buildPageNumberMappingFromObservedPoints(input: {
  points: Array<{ pdfPageNumber: number; contentPageNumber: number }>;
  pdfPageCount: number;
  source: "embedded_text_corners" | "ai_visual_ocr";
  confidence: PageNumberMapping["confidence"];
  location: NonNullable<PageNumberMapping["globalFormat"]>["location"];
  sampledPdfPages: number[];
  note: string;
}) {
  const points = input.points
    .filter((point) =>
      Number.isInteger(point.pdfPageNumber) &&
      Number.isInteger(point.contentPageNumber) &&
      point.pdfPageNumber >= 1 &&
      point.pdfPageNumber <= input.pdfPageCount &&
      point.contentPageNumber >= 0
    )
    .sort((left, right) => left.pdfPageNumber - right.pdfPageNumber);
  const segments: PageNumberMappingSegment[] = [];
  for (const point of points) {
    const previous = segments[segments.length - 1];
    const offset = point.pdfPageNumber - point.contentPageNumber;
    const previousOffset = previous ? previous.pdfPageEnd - previous.contentPageEnd : null;
    if (previous && previousOffset === offset) {
      previous.pdfPageEnd = point.pdfPageNumber;
      previous.contentPageEnd = point.contentPageNumber;
    } else {
      segments.push({
        pdfPageStart: point.pdfPageNumber,
        pdfPageEnd: point.pdfPageNumber,
        contentPageStart: point.contentPageNumber,
        contentPageEnd: point.contentPageNumber
      });
    }
  }
  return normalizePageNumberMapping({
    source: input.source,
    confidence: input.confidence,
    segments,
    globalFormat: {
      style: "arabic_numeric",
      location: input.location,
      pattern: "numeric page number",
      detectionMethod: input.source,
      sampledPdfPages: input.sampledPdfPages
    },
    detectionAudit: [{
      method: input.source,
      attempted: true,
      succeeded: segments.length > 0,
      sampledPdfPages: input.sampledPdfPages,
      note: input.note
    }]
  }, input.pdfPageCount);
}

export function contentPageNumberToPdfPageNumber(
  mapping: PageNumberMapping | null | undefined,
  contentPageNumber: number
) {
  if (!mapping || !Number.isInteger(contentPageNumber)) return null;
  const segment = mapping.segments.find((candidate) =>
    contentPageNumber >= candidate.contentPageStart &&
    contentPageNumber <= candidate.contentPageEnd
  );
  return segment
    ? segment.pdfPageStart + (contentPageNumber - segment.contentPageStart)
    : null;
}

export function pdfPageNumberToContentPageNumber(
  mapping: PageNumberMapping | null | undefined,
  pdfPageNumber: number
) {
  if (!mapping || !Number.isInteger(pdfPageNumber)) return null;
  const segment = mapping.segments.find((candidate) =>
    pdfPageNumber >= candidate.pdfPageStart && pdfPageNumber <= candidate.pdfPageEnd
  );
  return segment
    ? segment.contentPageStart + (pdfPageNumber - segment.pdfPageStart)
    : null;
}

export function createPageSelectionAudit(
  mapping: PageNumberMapping | null | undefined,
  pdfPageStart: number,
  pdfPageEnd: number
): PageSelectionAudit {
  const contentPageStart = pdfPageNumberToContentPageNumber(mapping, pdfPageStart);
  const contentPageEnd = pdfPageNumberToContentPageNumber(mapping, pdfPageEnd);
  return {
    utility: "treeschool.page-number-converter",
    utilityVersion: 2,
    direction: "pdf_to_content",
    used: true,
    mappingAvailable: Boolean(mapping),
    mappingSource: mapping?.source ?? null,
    mappingConfidence: mapping?.confidence ?? null,
    pdfPageStart,
    pdfPageEnd,
    contentPageStart,
    contentPageEnd,
    startConversionStatus: contentPageStart == null ? "unmapped" : "resolved",
    endConversionStatus: contentPageEnd == null ? "unmapped" : "resolved"
  };
}
