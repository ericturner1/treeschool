"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/server";
import { createNativeWorkbookCartCheckout, createNativeWorkbookCheckout, getNativeWorkbookProduct } from "../../lib/native-workbooks/server";

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100").replace(/\/$/, "");
}

export async function startWorkbookCheckoutAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const addToLearningYearId = String(formData.get("addToLearningYearId") ?? "").trim() || null;
  try {
    const user = await getCurrentUser();
    const workbook = await getNativeWorkbookProduct({ slug, userId: user?.id });
    const base = appUrl();
    const session = await createNativeWorkbookCheckout({
      userId: user?.id,
      email: user?.email || email,
      workbookId: workbook.id,
      addToLearningYearId,
      successUrl: `${base}/bookstore/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/bookstore/${encodeURIComponent(slug)}?checkout=canceled${addToLearningYearId ? `&addToLearningYearId=${encodeURIComponent(addToLearningYearId)}` : ""}`
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link.");
    redirect(session.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "Could not start checkout.";
    redirect(`/bookstore/${encodeURIComponent(slug)}?error=${encodeURIComponent(message)}`);
  }
}

export async function startWorkbookCartCheckoutAction(formData: FormData) {
  const workbookIds = formData.getAll("workbookId").map(String).filter(Boolean);
  const email = String(formData.get("email") ?? "").trim();
  try {
    const user = await getCurrentUser();
    const base = appUrl();
    const session = await createNativeWorkbookCartCheckout({
      userId: user?.id,
      email: user?.email || email,
      workbookIds,
      successUrl: `${base}/bookstore/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/bookstore?checkout=canceled`
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link.");
    redirect(session.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "Could not start checkout.";
    redirect(`/bookstore?error=${encodeURIComponent(message)}`);
  }
}
