export function normalizePlanSubjectLabel(label: string) {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function planSubjectKey(input: {
  subjectId?: string | null;
  subjectLabel?: string | null;
}) {
  if (input.subjectId) return `system:${input.subjectId}`;
  return `custom:${normalizePlanSubjectLabel(input.subjectLabel || "Uncategorized") || "uncategorized"}`;
}
