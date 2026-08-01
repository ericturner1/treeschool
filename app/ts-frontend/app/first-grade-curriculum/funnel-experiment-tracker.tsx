"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent } from "../../lib/analytics/events";
import {
  FIRST_GRADE_CURRICULUM_EXPERIMENT_ID,
  type FirstGradeCurriculumVariant
} from "../../lib/first-grade-curriculum/experiment";

export function FunnelExperimentTracker({
  variant,
  preview,
  visitorId
}: {
  variant: FirstGradeCurriculumVariant;
  preview: boolean;
  visitorId: string | null;
}) {
  useEffect(() => {
    if (preview) return;

    const variantStepSlug = variant === "b"
      ? "variant-b-direct-response-page"
      : "variant-a-concise-visual-page";
    const recordFunnelEvent = (
      eventType: "page_view" | "primary_cta_click" | "checkout_started",
      metadata = {}
    ) => {
      if (!visitorId) return;
      void fetch("/api/funnels/code-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: crypto.randomUUID(),
          funnelSlug: "first-grade-curriculum",
          parentStepSlug: "live-ab-landing-page",
          variantStepSlug,
          visitorId,
          eventType,
          metadata
        }),
        keepalive: true
      }).catch(() => undefined);
    };

    trackAnalyticsEvent("view_promotion", {
      creative_name: `first_grade_curriculum_variant_${variant}`,
      experiment_id: FIRST_GRADE_CURRICULUM_EXPERIMENT_ID,
      funnel_key: "first_grade_curriculum",
      promotion_id: FIRST_GRADE_CURRICULUM_EXPERIMENT_ID,
      promotion_name: "First-grade curriculum landing page",
      variant_id: variant
    });
    recordFunnelEvent("page_view", { variant });

    const trackCta = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const cta = target.closest<HTMLElement>("[data-funnel-cta]");
      if (!cta) return;

      trackAnalyticsEvent("select_promotion", {
        creative_name: `first_grade_curriculum_variant_${variant}`,
        cta_id: cta.dataset.funnelCta || "unknown",
        experiment_id: FIRST_GRADE_CURRICULUM_EXPERIMENT_ID,
        funnel_key: "first_grade_curriculum",
        promotion_id: FIRST_GRADE_CURRICULUM_EXPERIMENT_ID,
        promotion_name: "First-grade curriculum landing page",
        variant_id: variant
      });
      const ctaId = cta.dataset.funnelCta || "unknown";
      recordFunnelEvent("primary_cta_click", {
        variant,
        ctaId
      });
      if (ctaId.startsWith("start-")) {
        recordFunnelEvent("checkout_started", { variant, ctaId });
      }
    };

    document.addEventListener("click", trackCta);
    return () => document.removeEventListener("click", trackCta);
  }, [preview, variant, visitorId]);

  return null;
}
