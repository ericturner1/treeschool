export const FIRST_GRADE_CURRICULUM_EXPERIMENT_ID =
  "first_grade_curriculum_page_v1";
export const FIRST_GRADE_CURRICULUM_VARIANT_COOKIE =
  "treeschool_fg_curriculum_variant";
export const FIRST_GRADE_CURRICULUM_VISITOR_COOKIE =
  "treeschool_funnel_visitor_id";
export const FIRST_GRADE_CURRICULUM_EXPERIMENT_MAX_AGE_SECONDS =
  60 * 60 * 24 * 180;

export type FirstGradeCurriculumVariant = "a" | "b";

export function normalizeFirstGradeCurriculumVariant(
  value: string | null | undefined
): FirstGradeCurriculumVariant | null {
  return value === "a" || value === "b" ? value : null;
}

export function normalizeFunnelVisitorId(
  value: string | null | undefined
) {
  const candidate = value?.trim() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    candidate
  )
    ? candidate.toLowerCase()
    : null;
}

export function variantForVisitorId(
  visitorId: string
): FirstGradeCurriculumVariant {
  const finalHexDigit = visitorId.replaceAll("-", "").at(-1) ?? "0";
  return Number.parseInt(finalHexDigit, 16) % 2 === 0 ? "a" : "b";
}
