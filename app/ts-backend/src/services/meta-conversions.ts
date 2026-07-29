import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { env } from "../db";

const DEFAULT_META_PIXEL_ID = "930584153407646";

const PRIOR_CONSENT_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GB",
  "GR",
  "HR",
  "HU",
  "IE",
  "IS",
  "IT",
  "LI",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK"
]);

const TRACKED_CHECKOUT_KINDS = new Set([
  "core_subscription",
  "native_workbook",
  "native_workbook_bundle",
  "native_workbook_cart",
  "plan_pack",
  "public_core_subscription"
]);

function normalizedText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function hashMetaMatchValue(value: string) {
  return createHash("sha256").update(normalizedText(value)).digest("hex");
}

export function metaCheckoutEventId(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
}

export function canSendMetaServerEvent(countryCode: string | null | undefined) {
  const normalizedCountry = countryCode?.trim().toUpperCase();
  return Boolean(
    normalizedCountry &&
      !PRIOR_CONSENT_COUNTRY_CODES.has(normalizedCountry)
  );
}

function checkoutSourceUrl(checkoutKind: string, funnelKey?: string | null) {
  const appUrl = (env.PUBLIC_APP_URL ?? "https://www.treehomeschool.com").replace(/\/$/, "");
  if (funnelKey === "first_grade_curriculum") {
    return `${appUrl}/first-grade-homeschool-curriculum`;
  }
  if (checkoutKind.includes("workbook")) return `${appUrl}/bookstore`;
  if (checkoutKind === "plan_pack") {
    return `${appUrl}/homeschool-lesson-plan-generator`;
  }
  return `${appUrl}/pricing`;
}

function conversionContent(input: {
  checkoutKind: string;
  metadata: Record<string, string>;
}) {
  if (input.checkoutKind.includes("workbook")) {
    return {
      contentId: "bookstore-order",
      contentName: "Treeschool workbook order",
      contentCategory: "workbook"
    };
  }
  if (input.checkoutKind.includes("subscription")) {
    const planTier = input.metadata.planTier || "membership";
    return {
      contentId: `membership-${planTier}`,
      contentName: `Treeschool ${planTier} membership`,
      contentCategory: "membership"
    };
  }
  return {
    contentId: "lesson-plan-generator",
    contentName: "Treeschool lesson plan",
    contentCategory: "lesson_plan"
  };
}

type MetaServerEvent = {
  event_name: "Purchase";
  event_time: number;
  event_id: string;
  event_source_url: string;
  action_source: "website";
  user_data: {
    em: string[];
    external_id?: string[];
  };
  custom_data: {
    currency: string;
    value: number;
    order_id: string;
    content_ids: string[];
    content_name: string;
    content_category: string;
    content_type: "product";
  };
};

export function buildMetaCheckoutPurchaseEvent(
  session: Pick<
    Stripe.Checkout.Session,
    | "id"
    | "amount_total"
    | "currency"
    | "customer_details"
    | "customer_email"
    | "metadata"
    | "mode"
    | "payment_status"
    | "status"
  >,
  eventTime: number
): MetaServerEvent | null {
  const checkoutKind = session.metadata?.checkoutKind ?? "";
  if (!TRACKED_CHECKOUT_KINDS.has(checkoutKind)) return null;
  if (!["paid", "no_payment_required"].includes(session.payment_status)) {
    return null;
  }

  const amountInCents = session.amount_total ?? 0;
  if (amountInCents <= 0 || !session.currency) return null;

  const email = normalizedText(
    session.customer_details?.email ?? session.customer_email
  );
  const countryCode = session.customer_details?.address?.country;
  if (!email || !canSendMetaServerEvent(countryCode)) return null;

  const metadata = session.metadata ?? {};
  const content = conversionContent({ checkoutKind, metadata });
  const externalId = metadata.accountId || metadata.userId;

  return {
    event_name: "Purchase",
    event_time: eventTime,
    event_id: metaCheckoutEventId(session.id),
    event_source_url: checkoutSourceUrl(checkoutKind, metadata.funnelKey),
    action_source: "website",
    user_data: {
      em: [hashMetaMatchValue(email)],
      ...(externalId
        ? { external_id: [hashMetaMatchValue(externalId)] }
        : {})
    },
    custom_data: {
      currency: session.currency.toUpperCase(),
      value: amountInCents / 100,
      order_id: metaCheckoutEventId(session.id),
      content_ids: [content.contentId],
      content_name: content.contentName,
      content_category: content.contentCategory,
      content_type: "product"
    }
  };
}

async function sendMetaServerEvent(event: MetaServerEvent) {
  if (!env.META_CONVERSIONS_API_ACCESS_TOKEN) return { sent: false as const };

  const pixelId = env.META_PIXEL_ID ?? DEFAULT_META_PIXEL_ID;
  const endpoint = new URL(
    `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${encodeURIComponent(pixelId)}/events`
  );
  endpoint.searchParams.set(
    "access_token",
    env.META_CONVERSIONS_API_ACCESS_TOKEN
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [event],
      ...(env.META_CONVERSIONS_API_TEST_EVENT_CODE
        ? { test_event_code: env.META_CONVERSIONS_API_TEST_EVENT_CODE }
        : {})
    }),
    signal: AbortSignal.timeout(5_000)
  });

  const payload = (await response.json().catch(() => null)) as {
    events_received?: number;
    fbtrace_id?: string;
    error?: { code?: number; error_subcode?: number };
  } | null;

  if (!response.ok || payload?.events_received !== 1) {
    throw new Error(
      `Meta Conversions API rejected the event (${response.status}; code ${payload?.error?.code ?? "unknown"}; subcode ${payload?.error?.error_subcode ?? "none"}).`
    );
  }

  return {
    sent: true as const,
    eventsReceived: payload.events_received,
    traceId: payload.fbtrace_id ?? null
  };
}

export async function reportMetaCheckoutPurchase(
  session: Stripe.Checkout.Session,
  eventTime: number
) {
  const event = buildMetaCheckoutPurchaseEvent(session, eventTime);
  if (!event) return { sent: false as const };
  return sendMetaServerEvent(event);
}

