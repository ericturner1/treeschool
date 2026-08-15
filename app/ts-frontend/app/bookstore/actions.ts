"use server";

import { redirect } from "next/navigation";
import { bootstrapParentAccount } from "../../lib/accounts/server";
import { getCurrentUser } from "../../lib/auth/server";
import {
  createParentBillingCheckout,
  createPublicParentBillingCheckout
} from "../../lib/billing/server";
import {
  normalizeFirstGradeCurriculumVariant,
  normalizeFunnelVisitorId
} from "../../lib/first-grade-curriculum/experiment";
import { createNativeWorkbookCartCheckout, createNativeWorkbookCheckout, getNativeWorkbookProduct } from "../../lib/native-workbooks/server";
import { getFunnelAttributionFromCookies } from "../../lib/funnels/attribution";
import { parseFunnelSubscriptionProductId } from "../../lib/funnels/products";

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100").replace(/\/$/, "");
}

function safeReturnPath(value: FormDataEntryValue | null) {
  const path = String(value ?? "").trim();
  return path.startsWith("/") && !path.startsWith("//")
    ? path
    : "/first-grade-homeschool-curriculum";
}

function optionalSafePath(value: FormDataEntryValue | null) {
  const path = String(value ?? "").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

function appendCheckoutSession(path: string) {
  return `${path}${path.includes("?") ? "&" : "?"}source_session_id={CHECKOUT_SESSION_ID}`;
}

export async function startWorkbookCheckoutAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const addToLearningYearId = String(formData.get("addToLearningYearId") ?? "").trim() || null;
  const funnelKey = String(formData.get("funnelKey") ?? "") === "first_grade_curriculum"
    ? "first_grade_curriculum"
    : null;
  const isExperimentPreview =
    String(formData.get("experimentPreview") ?? "") === "true";
  const landingVariant = isExperimentPreview
    ? null
    : normalizeFirstGradeCurriculumVariant(
      String(formData.get("landingVariant") ?? "")
    );
  const funnelVisitorId = isExperimentPreview
    ? null
    : normalizeFunnelVisitorId(
      String(formData.get("funnelVisitorId") ?? "")
    );
  const returnPath = safeReturnPath(formData.get("returnPath"));
  const managedFunnelAttribution = getFunnelAttributionFromCookies();
  try {
    const user = await getCurrentUser();
    const workbook = await getNativeWorkbookProduct({ slug, userId: user?.id });
    const base = appUrl();
    const session = await createNativeWorkbookCheckout({
      userId: user?.id,
      email: user?.email || email,
      workbookId: workbook.id,
      addToLearningYearId,
      successUrl: funnelKey
        ? `${base}/offers/us/first-grade-japanese?session_id={CHECKOUT_SESSION_ID}`
        : `${base}/bookstore/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: funnelKey
        ? `${base}${returnPath}?checkout=canceled`
        : `${base}/bookstore/${encodeURIComponent(slug)}?checkout=canceled${addToLearningYearId ? `&addToLearningYearId=${encodeURIComponent(addToLearningYearId)}` : ""}`,
      funnelKey,
      landingVariant,
      funnelVisitorId,
      funnelAttribution: managedFunnelAttribution
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link.");
    redirect(session.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "Could not start checkout.";
    redirect(
      funnelKey
        ? `${returnPath}?error=${encodeURIComponent(message)}`
        : `/bookstore/${encodeURIComponent(slug)}?error=${encodeURIComponent(message)}`
    );
  }
}

export async function startWorkbookCartCheckoutAction(formData: FormData) {
  const workbookIds = formData.getAll("workbookId").map(String).filter(Boolean);
  const email = String(formData.get("email") ?? "").trim();
  const managedFunnelAttribution = getFunnelAttributionFromCookies();
  try {
    const user = await getCurrentUser();
    const base = appUrl();
    const session = await createNativeWorkbookCartCheckout({
      userId: user?.id,
      email: user?.email || email,
      workbookIds,
      successUrl: `${base}/bookstore/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/bookstore?checkout=canceled`,
      funnelAttribution: managedFunnelAttribution
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link.");
    redirect(session.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "Could not start checkout.";
    redirect(`/bookstore?error=${encodeURIComponent(message)}`);
  }
}

export async function startFunnelOrderCheckoutAction(formData: FormData) {
  const workbookIds = Array.from(new Set(formData.getAll("workbookId").map(String).filter(Boolean)));
  const subscription = parseFunnelSubscriptionProductId(formData.get("primaryProductId"));
  const email = String(formData.get("email") ?? "").trim();
  const isExperimentPreview = String(formData.get("experimentPreview") ?? "") === "true";
  const landingVariant = isExperimentPreview ? null : normalizeFirstGradeCurriculumVariant(String(formData.get("landingVariant") ?? ""));
  const funnelVisitorId = isExperimentPreview ? null : normalizeFunnelVisitorId(String(formData.get("funnelVisitorId") ?? ""));
  const returnPath = safeReturnPath(formData.get("returnPath"));
  const successPath = optionalSafePath(formData.get("successPath"));
  const managedFunnelAttribution = getFunnelAttributionFromCookies();
  const rawFunnelKey = String(formData.get("funnelKey") ?? "").trim();
  const funnelKey = /^[a-z0-9_-]{1,80}$/.test(rawFunnelKey) ? rawFunnelKey : null;
  try {
    const user = await getCurrentUser();
    const userId = user?.id;
    const userEmail = user?.email;
    const base = appUrl();
    if (subscription) {
      const successUrl = successPath
        ? `${base}${appendCheckoutSession(successPath)}`
        : funnelKey === "first_grade_curriculum"
          ? `${base}/offers/us/first-grade-japanese?session_id={CHECKOUT_SESSION_ID}`
          : userId
            ? `${base}/p/dashboard?checkout=success`
            : `${base}/membership/complete?session_id={CHECKOUT_SESSION_ID}`;
      const shared = {
        interval: subscription.billingInterval,
        planTier: subscription.planTier,
        nativeCatalogItemIds: workbookIds,
        successUrl,
        cancelUrl: `${base}${returnPath}?checkout=canceled`,
        funnelKey: funnelKey === "first_grade_curriculum" ? funnelKey : null,
        landingVariant,
        funnelVisitorId,
        funnelAttribution: managedFunnelAttribution
      } as const;
      const session = userId && userEmail
        ? await (async () => {
            await bootstrapParentAccount({
              userId,
              email: userEmail,
              firstName:
                user.user_metadata?.first_name ??
                user.user_metadata?.full_name ??
                user.user_metadata?.name
            });
            return createParentBillingCheckout({ userId, ...shared });
          })()
        : await createPublicParentBillingCheckout({ email, ...shared });
      if (!session.url) throw new Error("Stripe did not return a checkout link.");
      redirect(session.url);
    }
    const session = await createNativeWorkbookCartCheckout({
      userId: user?.id,
      email: user?.email || email,
      workbookIds,
      successUrl: successPath
        ? `${base}${appendCheckoutSession(successPath)}`
        : `${base}/bookstore/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}${returnPath}?checkout=canceled`,
      funnelKey,
      landingVariant,
      funnelVisitorId,
      funnelAttribution: managedFunnelAttribution
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link.");
    redirect(session.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "Could not start checkout.";
    redirect(`${returnPath}?error=${encodeURIComponent(message)}`);
  }
}
