"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { bootstrapParentAccount } from "../lib/accounts/server";
import { getCurrentUser } from "../lib/auth/server";
import {
  createPublicParentBillingCheckout,
  createParentBillingCheckout,
  createParentBillingPortal,
  createParentPlanChange,
  getParentBillingOverview
} from "../lib/billing/server";

function getRequestOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const headerStore = headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3100";
  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${host}`;
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
  let session: { url: string | null };
  try {
    session = await createParentBillingCheckout({
      userId: currentUser.id,
      interval,
      planTier,
      successUrl: `${origin}${successPath}`,
      cancelUrl: `${origin}${returnPath}?checkout=canceled`
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
  const origin = getRequestOrigin();
  const currentUser = await getCurrentUser();

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
        successUrl: `${origin}/p/dashboard?checkout=success`,
        cancelUrl: `${origin}${returnPath}?checkout=canceled`
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
      successUrl: `${origin}/membership/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}${returnPath}?checkout=canceled`
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
