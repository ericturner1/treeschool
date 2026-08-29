export function learningUnitMinuteEstimates(analysisJson: unknown) {
  const estimates = new Map<string, number>();
  if (!analysisJson || typeof analysisJson !== "object") return estimates;
  const candidates = (analysisJson as { learningUnits?: unknown }).learningUnits;
  if (!Array.isArray(candidates)) return estimates;
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const id = String(record.id ?? "").trim();
    if (!id) continue;
    const rawMinutes = Number(record.estimatedMinutes);
    estimates.set(id, Number.isFinite(rawMinutes) && rawMinutes > 0
      ? Math.max(1, Math.round(rawMinutes))
      : 30);
  }
  return estimates;
}

export function logicalPlanItemKey(item: {
  id: string;
  documentId: string;
  sourceUnitId: string | null;
}) {
  return item.sourceUnitId
    ? `${item.documentId}:${item.sourceUnitId}`
    : `item:${item.id}`;
}

export function estimatePlanItemMinutes(item: {
  sourceUnitId: string | null;
  firstPageIndex: number;
  lastPageIndex: number;
}, unitEstimates: Map<string, number>) {
  if (item.sourceUnitId) return unitEstimates.get(item.sourceUnitId) ?? 30;
  const pageCount = Math.max(1, item.lastPageIndex - item.firstPageIndex + 1);
  return Math.max(15, pageCount * 10);
}
