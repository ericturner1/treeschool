import { cookies } from "next/headers";
import type { ManagedFunnelAttribution } from "./server";

export const FUNNEL_ATTRIBUTION_COOKIE = "treeschool_funnel_attribution";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseFunnelAttribution(value?: string | null): ManagedFunnelAttribution | null {
  if (!value) return null;
  try {
    const input = JSON.parse(value) as Partial<ManagedFunnelAttribution>;
    if (
      !UUID_PATTERN.test(input.funnelId ?? "") ||
      !UUID_PATTERN.test(input.stepId ?? "") ||
      !UUID_PATTERN.test(input.pageId ?? "") ||
      !UUID_PATTERN.test(input.visitorId ?? "") ||
      !/^[a-z0-9-]{1,120}$/i.test(input.funnelSlug ?? "") ||
      !Number.isInteger(input.revisionNumber) ||
      Number(input.revisionNumber) < 1 ||
      (input.experimentId != null && !UUID_PATTERN.test(input.experimentId)) ||
      (input.experimentVariantId != null && !UUID_PATTERN.test(input.experimentVariantId))
    ) {
      return null;
    }
    return {
      funnelId: input.funnelId!,
      funnelSlug: input.funnelSlug!,
      stepId: input.stepId!,
      pageId: input.pageId!,
      revisionNumber: Number(input.revisionNumber),
      visitorId: input.visitorId!,
      experimentId: input.experimentId ?? null,
      experimentVariantId: input.experimentVariantId ?? null
    };
  } catch {
    return null;
  }
}

export function getFunnelAttributionFromCookies() {
  return parseFunnelAttribution(cookies().get(FUNNEL_ATTRIBUTION_COOKIE)?.value);
}
