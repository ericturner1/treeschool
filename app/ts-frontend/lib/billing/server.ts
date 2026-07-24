import { backendFetch } from "../backend/server";

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
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}) {
  return postBillingJson<{ url: string | null }>(
    "/internal/billing/checkout",
    input,
    "Failed to create Stripe checkout session."
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
