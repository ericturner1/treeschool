"use server";

import { redirect } from "next/navigation";
import { bootstrapParentAccount } from "../lib/accounts/server";
import { getCurrentUser } from "../lib/auth/server";
import {
  normalizeFirstGradeCurriculumVariant,
  normalizeFunnelVisitorId
} from "../lib/first-grade-curriculum/experiment";
import {
  createPublicParentBillingCheckout,
  createParentBillingCheckout,
  createParentBillingPortal,
  createParentPlanChange,
  getParentBillingOverview
} from "../lib/billing/server";
import { getFunnelAttributionFromCookies } from "../lib/funnels/attribution";
import { getPublicAppOrigin } from "../lib/security/public-origin";

function getRequestOrigin() {
  return getPublicAppOrigin();
}

function getField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getBillingInterval(formData: FormData): "monthly" | "yearly" {
  const interval = getField(formData, "interval");

  if (interval === "monthly" || interval === "yearly") {
    return interval;
  }

  redirect("/pricing?error=Choose a billing interval.");
}

function getMembershipTier(formData: FormData): "single" | "standard" {
  return getField(formData, "planTier") === "single" ? "single" : "standard";
}

function getFunnelKey(formData: FormData) {
  return getField(formData, "funnelKey") === "first_grade_curriculum"
    ? "first_grade_curriculum"
    : null;
}

function getFunnelAttribution(formData: FormData) {
  if (getField(formData, "experimentPreview") === "true") {
    return {
      landingVariant: null,
      funnelVisitorId: null
    };
  }

  return {
    landingVariant: normalizeFirstGradeCurriculumVariant(
      getField(formData, "landingVariant")
    ),
    funnelVisitorId: normalizeFunnelVisitorId(
      getField(formData, "funnelVisitorId")
    )
  };
}

function getSafePath(path: string, fallback: string) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }

  return path;
}

async function requireBillingUser() {
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser.email) {
    redirect("/homeschool-lesson-plan-generator?message=Start%20by%20creating%20your%20first%20lesson%20plan.%20Choose%20a%20membership%20before%20checkout.");
  }

  await bootstrapParentAccount({
    userId: currentUser.id,
    email: currentUser.email,
    firstName:
      currentUser.user_metadata?.first_name ??
      currentUser.user_metadata?.full_name ??
      currentUser.user_metadata?.name
  });

  return currentUser as {
    id: string;
    email: string;
  };
}

export async function startCoreSubscriptionCheckoutAction(formData: FormData) {
  const interval = getBillingInterval(formData);
  const planTier = getMembershipTier(formData);
  const returnPath = getSafePath(getField(formData, "returnPath"), "/pricing");
  const successPath = getSafePath(getField(formData, "successPath"), "/p/billing?checkout=success");
  const currentUser = await requireBillingUser();
  const origin = getRequestOrigin();
  const managedFunnelAttribution = getFunnelAttributionFromCookies();
  let session: { url: string | null };
  try {
    session = await createParentBillingCheckout({
      userId: currentUser.id,
      interval,
      planTier,
      successUrl: `${origin}${successPath}`,
      cancelUrl: `${origin}${returnPath}?checkout=canceled`,
      funnelAttribution: managedFunnelAttribution
    });
  } catch {
    redirect(`${returnPath}?error=${encodeURIComponent("We couldn’t open secure checkout. Please try again.")}`);
  }

  if (!session.url) {
    redirect(`${returnPath}?error=Stripe checkout is not configured yet.`);
  }

  redirect(session.url);
}

export async function startPricingSubscriptionCheckoutAction(formData: FormData) {
  const interval = getBillingInterval(formData);
  const planTier = getMembershipTier(formData);
  const returnPath = getSafePath(getField(formData, "returnPath"), "/pricing");
  const funnelKey = getFunnelKey(formData);
  const funnelAttribution = getFunnelAttribution(formData);
  const origin = getRequestOrigin();
  const currentUser = await getCurrentUser();
  const managedFunnelAttribution = getFunnelAttributionFromCookies();

  if (currentUser?.id && currentUser.email) {
    await bootstrapParentAccount({
      userId: currentUser.id,
      email: currentUser.email,
      firstName:
        currentUser.user_metadata?.first_name ??
        currentUser.user_metadata?.full_name ??
        currentUser.user_metadata?.name
    });
    let billing: Awaited<ReturnType<typeof getParentBillingOverview>>;
    try {
      billing = await getParentBillingOverview({ userId: currentUser.id });
    } catch {
      redirect(`${returnPath}?error=${encodeURIComponent("We couldn’t verify your membership. Please try again.")}`);
    }
    if (["trialing", "active", "active_canceling", "past_due"].includes(billing.displayStatus)) {
      redirect("/p/billing?message=Your%20Treeschool%20membership%20is%20already%20set%20up.");
    }

    let session: { url: string | null };
    try {
      session = await createParentBillingCheckout({
        userId: currentUser.id,
        interval,
        planTier,
        successUrl: funnelKey
          ? `${origin}/offers/us/first-grade-japanese?session_id={CHECKOUT_SESSION_ID}`
          : `${origin}/p/dashboard?checkout=success`,
        cancelUrl: `${origin}${returnPath}?checkout=canceled`,
        funnelKey,
        ...funnelAttribution,
        funnelAttribution: managedFunnelAttribution
      });
    } catch {
      redirect(`${returnPath}?error=${encodeURIComponent("We couldn’t open secure checkout. Please try again.")}`);
    }
    if (!session.url) {
      redirect(`${returnPath}?error=${encodeURIComponent("Secure checkout is not available yet.")}`);
    }
    redirect(session.url);
  }

  let session: { url: string | null };
  try {
    session = await createPublicParentBillingCheckout({
      interval,
      planTier,
      successUrl: funnelKey
        ? `${origin}/offers/us/first-grade-japanese?session_id={CHECKOUT_SESSION_ID}`
        : `${origin}/membership/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}${returnPath}?checkout=canceled`,
      funnelKey,
      ...funnelAttribution,
      funnelAttribution: managedFunnelAttribution
    });
  } catch {
    redirect(`${returnPath}?error=${encodeURIComponent("We couldn’t open secure checkout. Please try again.")}`);
  }
  if (!session.url) {
    redirect(`${returnPath}?error=${encodeURIComponent("Secure checkout is not available yet.")}`);
  }
  redirect(session.url);
}

export async function openBillingPortalAction() {
  const currentUser = await requireBillingUser();
  const origin = getRequestOrigin();
  const session = await createParentBillingPortal({
    userId: currentUser.id,
    returnUrl: `${origin}/p/billing`
  });

  if (!session.url) {
    redirect("/p/billing?error=Stripe customer portal is not available yet.");
  }

  redirect(session.url);
}

export async function changeMembershipPlanAction(formData: FormData) {
  const targetPlanTier = getMembershipTier(formData);
  const currentUser = await requireBillingUser();
  const origin = getRequestOrigin();
  let session: { url: string | null };
  try {
    session = await createParentPlanChange({
      userId: currentUser.id,
      targetPlanTier,
      returnUrl: `${origin}/p/billing`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn’t open the plan change.";
    redirect(`/p/billing?error=${encodeURIComponent(message)}`);
  }
  if (!session.url) {
    redirect("/p/billing?error=The plan-change confirmation is not available yet.");
  }
  redirect(session.url);
}
