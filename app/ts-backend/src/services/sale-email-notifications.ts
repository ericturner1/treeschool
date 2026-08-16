import { createHash } from "node:crypto";
import { and, eq, lt, or, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { saleEmailNotifications } from "ts-db";
import { db, env } from "../db";

type SaleNotificationItem = {
  description: string;
  quantity: number | null;
};

type SaleNotificationInput = {
  notificationKey: string;
  stripeEventId: string;
  livemode: boolean;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  purchaserEmail?: string | null;
  saleSource: string;
  amountTotalCents: number;
  currency: string;
  items: SaleNotificationItem[];
  occurredAt: Date;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizedCurrency(value: string | null | undefined) {
  const currency = String(value || "USD").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

function formatMoney(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

export function saleSourceLabel(metadata: Record<string, string> | null | undefined) {
  const checkoutSource = metadata?.checkoutSource;
  const checkoutKind = metadata?.checkoutKind;
  if (checkoutSource === "funnel_subscription_offer") return "Funnel subscription offer";
  if (checkoutSource === "funnel_one_click_offer") return "Funnel one-click offer";
  if (checkoutSource === "post_checkout_offer") return "Post-purchase offer";
  if (checkoutKind === "native_workbook") return "Workbook";
  if (checkoutKind === "native_workbook_bundle") return "Workbook bundle";
  if (checkoutKind === "native_workbook_cart") return "Workbook purchase";
  if (checkoutKind === "plan_pack") return "Lesson-plan package";
  if (checkoutKind === "core_subscription" || checkoutKind === "public_core_subscription") {
    return "Treeschool subscription";
  }
  if (checkoutKind === "additional_student") return "Additional student subscription";
  return checkoutKind?.replaceAll("_", " ") || checkoutSource?.replaceAll("_", " ") || "Treeschool purchase";
}

function stripePaymentIntentId(
  value: string | Stripe.PaymentIntent | null,
) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function stripeDashboardUrl(input: SaleNotificationInput) {
  const prefix = input.livemode
    ? "https://dashboard.stripe.com"
    : "https://dashboard.stripe.com/test";
  return input.stripePaymentIntentId
    ? `${prefix}/payments/${encodeURIComponent(input.stripePaymentIntentId)}`
    : `${prefix}/payments`;
}

function notificationMessageId(notificationKey: string) {
  const digest = createHash("sha256").update(notificationKey).digest("hex").slice(0, 32);
  return `<treeschool-sale-${digest}@treehomeschool.com>`;
}

async function claimNotification(input: SaleNotificationInput, recipientEmail: string) {
  const now = new Date();
  const values = {
    notificationKey: input.notificationKey,
    stripeEventId: input.stripeEventId,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    recipientEmail,
    purchaserEmail: input.purchaserEmail?.trim().toLowerCase() || null,
    saleSource: input.saleSource,
    amountTotalCents: Math.max(0, Math.round(input.amountTotalCents)),
    currency: normalizedCurrency(input.currency),
    itemsJson: input.items,
    status: "pending",
    updatedAt: now
  };
  const [created] = await db
    .insert(saleEmailNotifications)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: saleEmailNotifications.id });
  if (created) return created;

  const retryBefore = new Date(now.getTime() - 5 * 60 * 1000);
  const [retried] = await db
    .update(saleEmailNotifications)
    .set({
      ...values,
      attempts: sql`${saleEmailNotifications.attempts} + 1`,
      lastError: null
    })
    .where(and(
      eq(saleEmailNotifications.notificationKey, input.notificationKey),
      or(
        eq(saleEmailNotifications.status, "failed"),
        and(
          eq(saleEmailNotifications.status, "pending"),
          lt(saleEmailNotifications.updatedAt, retryBefore)
        )
      )
    ))
    .returning({ id: saleEmailNotifications.id });
  return retried ?? null;
}

export function buildSaleNotificationMessage(input: SaleNotificationInput) {
  const currency = normalizedCurrency(input.currency);
  const amount = formatMoney(Math.max(0, Math.round(input.amountTotalCents)), currency);
  const dashboardUrl = stripeDashboardUrl(input);
  const customer = input.purchaserEmail?.trim().toLowerCase() || "Not supplied";
  const itemLines = input.items.length
    ? input.items.map((item) => `- ${item.description}${item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ""}`)
    : [`- ${input.saleSource}`];
  const modeLabel = input.livemode ? "Live payment" : "TEST payment";
  const text = [
    "A new Treeschool sale completed.",
    "",
    `Amount: ${amount} ${currency}`,
    `Type: ${input.saleSource}`,
    `Customer: ${customer}`,
    `Mode: ${modeLabel}`,
    `Time: ${input.occurredAt.toISOString()}`,
    "",
    "Items:",
    ...itemLines,
    "",
    `View in Stripe: ${dashboardUrl}`,
    ...(input.stripeCheckoutSessionId ? [`Checkout session: ${input.stripeCheckoutSessionId}`] : []),
    ...(input.stripePaymentIntentId ? [`Payment intent: ${input.stripePaymentIntentId}`] : [])
  ].join("\n");
  const itemHtml = input.items.length
    ? input.items.map((item) => `<li>${escapeHtml(item.description)}${item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ""}</li>`).join("")
    : `<li>${escapeHtml(input.saleSource)}</li>`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033;max-width:620px"><p style="margin:0 0 8px;color:#5d7d46;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(modeLabel)}</p><h1 style="margin:0 0 22px;font-size:28px">New Treeschool sale: ${escapeHtml(amount)}</h1><table style="border-collapse:collapse;width:100%;margin-bottom:20px"><tr><td style="padding:7px 12px 7px 0;color:#667085">Type</td><td style="padding:7px 0;font-weight:700">${escapeHtml(input.saleSource)}</td></tr><tr><td style="padding:7px 12px 7px 0;color:#667085">Customer</td><td style="padding:7px 0">${escapeHtml(customer)}</td></tr><tr><td style="padding:7px 12px 7px 0;color:#667085">Time</td><td style="padding:7px 0">${escapeHtml(input.occurredAt.toISOString())}</td></tr></table><h2 style="font-size:17px">Items</h2><ul style="padding-left:20px">${itemHtml}</ul><p style="margin-top:24px"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#76a456;color:white;text-decoration:none;padding:11px 17px;border-radius:9px;font-weight:700">View payment in Stripe</a></p><p style="margin-top:24px;color:#667085;font-size:12px">${input.stripeCheckoutSessionId ? `Checkout: ${escapeHtml(input.stripeCheckoutSessionId)}<br>` : ""}${input.stripePaymentIntentId ? `Payment: ${escapeHtml(input.stripePaymentIntentId)}` : ""}</p></div>`;
  return {
    subject: `New Treeschool sale — ${amount}`,
    text,
    html,
    messageId: notificationMessageId(input.notificationKey)
  };
}

async function sendSaleNotification(input: SaleNotificationInput) {
  const recipientEmail = env.SALES_NOTIFICATION_EMAIL;
  if (!recipientEmail) return { sent: false, reason: "not_configured" as const };
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    throw new Error("Sale notification email requires SMTP_HOST and SMTP_FROM.");
  }
  if ((env.SMTP_USER && !env.SMTP_PASSWORD) || (!env.SMTP_USER && env.SMTP_PASSWORD)) {
    throw new Error("SMTP authentication is incomplete for sale notifications.");
  }
  const claimed = await claimNotification(input, recipientEmail);
  if (!claimed) return { sent: false, reason: "duplicate" as const };

  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.default.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && env.SMTP_PASSWORD
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
        : {})
    });
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: recipientEmail,
      ...buildSaleNotificationMessage(input)
    });
    await db
      .update(saleEmailNotifications)
      .set({ status: "sent", sentAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(saleEmailNotifications.id, claimed.id));
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sale notification error.";
    await db
      .update(saleEmailNotifications)
      .set({ status: "failed", lastError: message.slice(0, 2000), updatedAt: new Date() })
      .where(eq(saleEmailNotifications.id, claimed.id));
    throw error;
  }
}

export async function notifyCheckoutSale(input: {
  stripe: Stripe;
  stripeEventId: string;
  eventCreated: number;
  session: Stripe.Checkout.Session;
}) {
  if (!input.session.payment_status || input.session.payment_status === "unpaid") {
    return { sent: false, reason: "not_paid" as const };
  }
  const lineItems = await input.stripe.checkout.sessions
    .listLineItems(input.session.id, { limit: 100 })
    .then((result) => result.data.map((item) => ({
      description: item.description || "Treeschool purchase",
      quantity: item.quantity
    })))
    .catch(() => [] as SaleNotificationItem[]);
  return sendSaleNotification({
    notificationKey: `checkout:${input.session.id}`,
    stripeEventId: input.stripeEventId,
    livemode: input.session.livemode,
    stripeCheckoutSessionId: input.session.id,
    stripePaymentIntentId: stripePaymentIntentId(input.session.payment_intent),
    purchaserEmail:
      input.session.customer_details?.email ??
      input.session.customer_email ??
      input.session.metadata?.deliveryEmail ??
      null,
    saleSource: saleSourceLabel(input.session.metadata),
    amountTotalCents: input.session.amount_total ?? 0,
    currency: normalizedCurrency(input.session.currency),
    items: lineItems,
    occurredAt: new Date(input.eventCreated * 1000)
  });
}

export async function notifyDirectPaymentIntentSale(input: {
  stripeEventId: string;
  eventCreated: number;
  paymentIntent: Stripe.PaymentIntent;
}) {
  if (
    input.paymentIntent.status !== "succeeded" ||
    input.paymentIntent.metadata.directTreeschoolSale !== "true"
  ) {
    return { sent: false, reason: "not_direct_sale" as const };
  }
  return sendSaleNotification({
    notificationKey: `payment_intent:${input.paymentIntent.id}`,
    stripeEventId: input.stripeEventId,
    livemode: input.paymentIntent.livemode,
    stripePaymentIntentId: input.paymentIntent.id,
    purchaserEmail: input.paymentIntent.metadata.deliveryEmail ?? null,
    saleSource: saleSourceLabel(input.paymentIntent.metadata),
    amountTotalCents: input.paymentIntent.amount_received || input.paymentIntent.amount,
    currency: normalizedCurrency(input.paymentIntent.currency),
    items: input.paymentIntent.description
      ? [{ description: input.paymentIntent.description.replace(/^Treeschool\s+/i, ""), quantity: 1 }]
      : [],
    occurredAt: new Date(input.eventCreated * 1000)
  });
}
