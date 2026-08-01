"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent } from "../lib/analytics/events";

export function ManagedFunnelPageTracker({
  funnelId,
  funnelSlug,
  stepId,
  stepSlug,
  stepName,
  pageId,
  revisionNumber,
  visitorId,
  experiment,
  isThankYou,
  preview
}: {
  funnelId: string;
  funnelSlug: string;
  stepId: string;
  stepSlug: string;
  stepName: string;
  pageId: string;
  revisionNumber: number;
  visitorId?: string | null;
  experiment: {
    id: string;
    variantId: string;
  } | null;
  isThankYou: boolean;
  preview: boolean;
}) {
  useEffect(() => {
    if (preview) return;

    const record = (
      eventType:
        | "page_view"
        | "primary_cta_click"
        | "secondary_cta_click"
        | "checkout_started"
        | "thank_you_view",
      metadata: Record<string, string | number | boolean | null> = {}
    ) => {
      if (!visitorId) return;
      void fetch("/api/funnels/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: crypto.randomUUID(),
          funnelId,
          stepId,
          pageId,
          revisionNumber,
          experimentId: experiment?.id ?? null,
          experimentVariantId: experiment?.variantId ?? null,
          visitorId,
          eventType,
          metadata
        }),
        keepalive: true
      }).catch(() => undefined);
    };

    record("page_view");
    if (isThankYou) record("thank_you_view");

    trackAnalyticsEvent("view_promotion", {
      creative_name: `${funnelSlug}_${stepSlug}_r${revisionNumber}`,
      funnel_key: funnelSlug,
      funnel_step: stepSlug,
      promotion_id: `${funnelSlug}:${stepSlug}`,
      promotion_name: stepName,
      revision_number: revisionNumber
    });

    const trackCta = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const cta = target.closest<HTMLElement>("[data-funnel-cta]");
      if (!cta) return;
      const ctaId = cta.dataset.funnelCta || "unknown";
      const href = cta.dataset.funnelTarget ||
        (cta instanceof HTMLAnchorElement ? cta.href : "");
      record(
        ctaId === "secondary" ? "secondary_cta_click" : "primary_cta_click",
        { ctaId, href }
      );
      if (/checkout|buy\.stripe\.com|stripe\.com/i.test(href)) {
        record("checkout_started", { ctaId, href });
      }

      trackAnalyticsEvent("select_promotion", {
        creative_name: `${funnelSlug}_${stepSlug}_r${revisionNumber}`,
        cta_id: ctaId,
        funnel_key: funnelSlug,
        funnel_step: stepSlug,
        promotion_id: `${funnelSlug}:${stepSlug}`,
        promotion_name: stepName,
        revision_number: revisionNumber
      });
    };

    document.addEventListener("click", trackCta);
    return () => document.removeEventListener("click", trackCta);
  }, [
    experiment?.id,
    experiment?.variantId,
    funnelId,
    funnelSlug,
    isThankYou,
    pageId,
    preview,
    revisionNumber,
    stepId,
    stepName,
    stepSlug,
    visitorId
  ]);

  return null;
}
