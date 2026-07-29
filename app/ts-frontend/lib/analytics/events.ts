"use client";

import { shouldEnablePublicAnalytics } from "./public-routes";

export type AnalyticsEventParameters = Record<
  string,
  string | number | boolean | null | undefined | Array<Record<string, unknown>>
>;

type QueuedAnalyticsEvent = {
  name: string;
  parameters: AnalyticsEventParameters;
};

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  loaded?: boolean;
  push?: MetaPixelFunction;
  queue?: unknown[][];
  version?: string;
};

declare global {
  interface Window {
    _fbq?: MetaPixelFunction;
    dataLayer?: unknown[];
    fbq?: MetaPixelFunction;
    gtag?: (...args: unknown[]) => void;
    treeschoolAnalyticsCanQueue?: boolean;
    treeschoolAnalyticsQueue?: QueuedAnalyticsEvent[];
  }
}

const META_EVENT_NAMES: Record<string, string> = {
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  page_view: "PageView",
  purchase: "Purchase",
  select_promotion: "SelectPromotion",
  view_item: "ViewContent",
  view_promotion: "ViewPromotion"
};

function metaEventParameters(parameters: AnalyticsEventParameters) {
  const items = Array.isArray(parameters.items) ? parameters.items : [];
  const firstItem = items[0];
  const contents = items.flatMap((item) => {
    const id = item.item_id;
    if (typeof id !== "string" && typeof id !== "number") return [];

    return [
      {
        id: String(id),
        quantity:
          typeof item.quantity === "number" ? item.quantity : 1,
        item_price:
          typeof item.price === "number" ? item.price : undefined
      }
    ];
  });

  return {
    content_ids: contents.map((item) => item.id),
    content_name:
      typeof firstItem?.item_name === "string"
        ? firstItem.item_name
        : undefined,
    content_category:
      typeof firstItem?.item_category === "string"
        ? firstItem.item_category
        : undefined,
    content_type: contents.length ? "product" : undefined,
    contents: contents.length ? contents : undefined,
    currency:
      typeof parameters.currency === "string"
        ? parameters.currency
        : undefined,
    value:
      typeof parameters.value === "number" ? parameters.value : undefined
  };
}

function sendAnalyticsEvent({
  name,
  parameters
}: QueuedAnalyticsEvent) {
  const { event_id: eventId, ...googleParameters } = parameters;

  window.gtag?.("event", name, googleParameters);

  const metaEventName = META_EVENT_NAMES[name];
  if (!window.fbq || !metaEventName) return;

  const metaParameters = metaEventParameters(parameters);
  const eventOptions =
    typeof eventId === "string" && eventId
      ? { eventID: eventId }
      : undefined;

  window.fbq(
    "track",
    metaEventName,
    metaParameters,
    eventOptions
  );
}

export function trackAnalyticsEvent(
  name: string,
  parameters: AnalyticsEventParameters = {}
) {
  if (typeof window === "undefined") {
    return;
  }

  const canQueue =
    window.treeschoolAnalyticsCanQueue ??
    shouldEnablePublicAnalytics(
      window.location.pathname,
      window.location.hostname
    );
  if (!canQueue) return;

  if (window.gtag && window.fbq) {
    sendAnalyticsEvent({ name, parameters });
    return;
  }

  window.treeschoolAnalyticsQueue ??= [];
  window.treeschoolAnalyticsQueue.push({ name, parameters });
}

export function flushQueuedAnalyticsEvents() {
  if (
    !window.gtag ||
    !window.fbq ||
    !window.treeschoolAnalyticsQueue?.length
  ) {
    return;
  }

  const queued = window.treeschoolAnalyticsQueue.splice(0);
  for (const event of queued) {
    sendAnalyticsEvent(event);
  }
}
