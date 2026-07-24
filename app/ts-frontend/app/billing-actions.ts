"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { bootstrapParentAccount } from "../lib/accounts/server";
import { getCurrentUser } from "../lib/auth/server";
import {
  createParentBillingCheckout,
  createParentBillingPortal
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

function getTrialDays(formData: FormData) {
  const rawValue = getField(formData, "trialDays");
  const trialDays = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(trialDays) || trialDays <= 0) {
    return undefined;
  }

  return Math.min(trialDays, 30);
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
    redirect("/homeschool-lesson-plan-generator?message=Start%20by%20creating%20your%20first%20lesson%20plan.%20Choose%20the%20Family%20Plan%20before%20checkout.");
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
  const returnPath = getSafePath(getField(formData, "returnPath"), "/pricing");
  const successPath = getSafePath(getField(formData, "successPath"), "/p/billing?checkout=success");
  const currentUser = await requireBillingUser();
  const origin = getRequestOrigin();
  const session = await createParentBillingCheckout({
    userId: currentUser.id,
    interval,
    successUrl: `${origin}${successPath}`,
    cancelUrl: `${origin}${returnPath}?checkout=canceled`,
    trialDays: getTrialDays(formData)
  });

  if (!session.url) {
    redirect(`${returnPath}?error=Stripe checkout is not configured yet.`);
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
