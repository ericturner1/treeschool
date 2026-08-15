import { backendFetch } from "../backend/server";
import type { ManagedFunnelAttribution } from "../funnels/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

export async function getParentBillingOverview(input: { userId: string }) {
  const response = await backendFetch(
    `${getBackendUrl()}/internal/billing/overview?userId=${encodeURIComponent(input.userId)}`,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch billing overview.");
  }

  return (await response.json()) as {
    accountId: string;
    parentProfileId: string;
    parentFirstName: string;
    currentPlan: "free" | "premium";
    displayStatus: "trialing" | "active" | "active_canceling" | "past_due" | "canceled" | "free";
    subscription: null | {
      status: "trialing" | "active" | "past_due" | "canceled";
      planTier: "single" | "standard";
      billingInterval: "monthly" | "yearly" | null;
      introductoryOffer: string | null;
      introductoryMonth: boolean;
      additionalStudentQuantity: number;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    };
    trial: {
      startAt: string | null;
      endAt: string | null;
      daysRemaining: number;
      active: boolean;
    };
    accessRestricted: boolean;
    dataDeletionAt: string | null;
    checkout: {
      monthlyUrl: string | null;
      yearlyUrl: string | null;
      customerPortalUrl: string | null;
    };
    billingGuardEnabled: boolean;
    studentSeats: {
      included: number;
      additional: number;
      active: number;
      additionalMonthlyPriceInCents: number;
      additionalYearlyPriceInCents: number;
    };
    ownedElectiveCount: number;
    featureAccess: {
      allowed: boolean;
      isSubscriber: boolean;
      subscriptionStatus: "trialing" | "active" | "past_due" | "canceled" | null;
      planTier: "single" | "standard" | null;
      introductoryMonth: boolean;
      additionalStudentQuantity: number;
      hasPlanPack: boolean;
      downloadOnly: boolean;
      source: "subscription" | "plan_pack_trial" | "none";
      trial: {
        active: boolean;
        startedAt: string | null;
        endsAt: string | null;
        daysRemaining: number;
      };
    };
  };
}

async function postBillingJson<T>(path: string, body: Record<string, unknown>, fallbackError: string): Promise<T> {
  const response = await backendFetch(`${getBackendUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error ?? fallbackError);
  }

  return payload as T;
}

export async function createParentBillingCheckout(input: {
  userId: string;
  interval: "monthly" | "yearly";
  planTier: "single" | "standard";
  successUrl: string;
  cancelUrl: string;
  funnelKey?: string | null;
  landingVariant?: "a" | "b" | null;
  funnelVisitorId?: string | null;
  nativeCatalogItemIds?: string[];
  funnelAttribution?: ManagedFunnelAttribution | null;
}) {
  return postBillingJson<{ url: string | null }>(
    "/internal/billing/checkout",
    input,
    "Failed to create Stripe checkout session."
  );
}

export async function createPublicParentBillingCheckout(input: {
  interval: "monthly" | "yearly";
  planTier: "single" | "standard";
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
  funnelKey?: string | null;
  landingVariant?: "a" | "b" | null;
  funnelVisitorId?: string | null;
  nativeCatalogItemIds?: string[];
  funnelAttribution?: ManagedFunnelAttribution | null;
}) {
  return postBillingJson<{ url: string | null }>(
    "/internal/billing/public-checkout",
    input,
    "Failed to create Stripe checkout session."
  );
}

export type PostCheckoutWorkbookOfferItem = {
  id: string;
  versionId: string;
  title: string;
  description: string;
  priceInCents: number;
  currencyCode: string;
  thumbnailUrl: string | null;
};

export type PostCheckoutWorkbookOffer = {
  key: string;
  title: string;
  description: string;
  items: PostCheckoutWorkbookOfferItem[];
  priceInCents: number;
  currencyCode: string;
  thumbnailUrl?: string | null;
};

export type FirstGradePostCheckoutOffer = {
  sourceCheckoutSessionId: string;
  offer: {
    full: PostCheckoutWorkbookOffer | null;
    starter: PostCheckoutWorkbookOffer | null;
  };
  state: string;
  selectedVariant: string | null;
  thankYouPath: string;
};

export async function getFirstGradePostCheckoutOffer(input: { sessionId: string }) {
  const response = await backendFetch(
    `${getBackendUrl()}/internal/billing/post-checkout-offer?sessionId=${encodeURIComponent(input.sessionId)}`,
    { cache: "no-store" }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? "Could not load the post-checkout offer.");
  }
  return payload as FirstGradePostCheckoutOffer;
}

export async function decideFirstGradePostCheckoutOffer(input: {
  sourceCheckoutSessionId: string;
  action: "accept_full" | "decline_full" | "accept_starter" | "decline_starter";
  successUrl: string;
  cancelUrl: string;
}) {
  return postBillingJson<
    | { status: "complete"; thankYouPath: string }
    | { status: "downsell" }
    | { status: "redirect"; url: string | null }
  >(
    "/internal/billing/post-checkout-offer/decision",
    input,
    "Could not update the post-checkout offer."
  );
}

export async function decideManagedFunnelOneClickOffer(input: {
  sourceCheckoutSessionId: string;
  funnelStepId: string;
  appBaseUrl: string;
  cancelPath: string;
}) {
  return postBillingJson<
    | { status: "complete"; nextPath: string }
    | { status: "redirect"; url: string | null }
  >(
    "/internal/billing/funnel-one-click-offer",
    input,
    "Could not add this offer."
  );
}

export async function completePublicParentBillingCheckout(input: {
  sessionId: string;
}) {
  return postBillingJson<{ sessionId: string; email: string; accountId: string }>(
    "/internal/billing/public-checkout/complete",
    input,
    "Failed to finish Stripe checkout."
  );
}

export async function createParentBillingPortal(input: {
  userId: string;
  returnUrl: string;
}) {
  return postBillingJson<{ url: string | null }>(
    "/internal/billing/portal",
    input,
    "Failed to create Stripe customer portal session."
  );
}

export async function createParentPlanChange(input: {
  userId: string;
  targetPlanTier: "single" | "standard";
  returnUrl: string;
}) {
  return postBillingJson<{ url: string | null }>(
    "/internal/billing/change-plan",
    input,
    "Failed to open the plan-change confirmation."
  );
}

export async function listParentElectives(input: { userId: string }) {
  const response = await backendFetch(
    `${getBackendUrl()}/internal/billing/electives?userId=${encodeURIComponent(input.userId)}`,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch electives.");
  }

  const payload = (await response.json()) as {
    electives: Array<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      priceInCents: number;
      currencyCode: string;
      checkoutUrl: string | null;
      curriculumNodeId: string | null;
      owned: boolean;
    }>;
  };

  return payload.electives;
}
