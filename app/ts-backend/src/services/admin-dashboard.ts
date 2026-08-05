import { and, eq, gte, sql } from "drizzle-orm";
import {
  accounts,
  funnelEvents,
  funnelLeads,
  funnelSales,
  nativeWorkbookPurchases,
  profiles,
  subscriptions,
  users
} from "ts-db";
import { db } from "../db";
import { CORE_MONTHLY_INTRO_AMOUNT, ADDITIONAL_STUDENT_INTRO_AMOUNT, isIntroductoryOfferActive } from "./billing-introductory-offer";
import { getMembershipPlan } from "./membership-plans";

const RECENT_WINDOW_DAYS = 30;
const ADDITIONAL_STUDENT_MONTHLY_CENTS = 500;
const ADDITIONAL_STUDENT_YEARLY_CENTS = 5000;

async function requireAdmin(userId: string) {
  const [admin] = await db
    .select({ id: profiles.id, isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!admin?.isAdmin) throw new Error("Administrator access is required.");
}

function monthlyRecurringCents(subscription: typeof subscriptions.$inferSelect, now: Date) {
  const plan = getMembershipPlan(subscription.planTier);
  const additionalStudents = Math.max(0, subscription.additionalStudentQuantity);
  if (isIntroductoryOfferActive(subscription, now)) {
    return CORE_MONTHLY_INTRO_AMOUNT + additionalStudents * ADDITIONAL_STUDENT_INTRO_AMOUNT;
  }
  if (subscription.billingInterval === "yearly") {
    return Math.round(
      (plan.prices.yearly.unitAmount + additionalStudents * ADDITIONAL_STUDENT_YEARLY_CENTS) / 12
    );
  }
  return plan.prices.monthly.unitAmount + additionalStudents * ADDITIONAL_STUDENT_MONTHLY_CENTS;
}

type RecentSale = {
  checkoutSessionId: string;
  email: string | null;
  orderKind: string;
  amountTotalCents: number;
  currency: string;
  purchasedAt: Date;
};

function consolidateRecentSales(
  attributed: Array<typeof funnelSales.$inferSelect>,
  workbooks: Array<typeof nativeWorkbookPurchases.$inferSelect>
) {
  const sales = new Map<string, RecentSale>();
  const workbookCheckouts = new Map<string, Array<typeof nativeWorkbookPurchases.$inferSelect>>();
  for (const purchase of workbooks) {
    if (purchase.status !== "paid" || purchase.refundedAt) continue;
    const checkout = workbookCheckouts.get(purchase.stripeCheckoutSessionId) ?? [];
    checkout.push(purchase);
    workbookCheckouts.set(purchase.stripeCheckoutSessionId, checkout);
  }
  for (const sale of attributed) {
    if (sale.status !== "paid" || sale.metadataJson.test === true) continue;
    sales.set(sale.stripeCheckoutSessionId, {
      checkoutSessionId: sale.stripeCheckoutSessionId,
      email: sale.email,
      orderKind: sale.orderKind,
      amountTotalCents: sale.amountTotalCents,
      currency: sale.currency.toUpperCase(),
      purchasedAt: sale.purchasedAt
    });
  }
  for (const [checkoutSessionId, checkout] of workbookCheckouts) {
    if (sales.has(checkoutSessionId)) continue;
    const representative = checkout[0];
    sales.set(checkoutSessionId, {
      checkoutSessionId,
      email: representative.email,
      orderKind: checkout.length > 1 ? "workbook_bundle" : "workbook",
      amountTotalCents: checkout.reduce((sum, item) => sum + item.amountInCents, 0),
      currency: representative.currencyCode.toUpperCase(),
      purchasedAt: representative.purchasedAt
    });
  }
  return Array.from(sales.values()).sort(
    (left, right) => right.purchasedAt.getTime() - left.purchasedAt.getTime()
  );
}

export async function getAdminDashboardMetrics(userId: string) {
  await requireAdmin(userId);
  const now = new Date();
  const recentSince = new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recentSinceIso = recentSince.toISOString();

  const [
    subscriptionRows,
    userCounts,
    accountCounts,
    recentAttributedSales,
    recentWorkbookPurchases,
    recentLeadCounts,
    recentFunnelEventRows
  ] = await Promise.all([
    db.select().from(subscriptions),
    db.select({
      total: sql<number>`count(*)::integer`,
      recent: sql<number>`count(*) filter (where ${users.createdAt} >= ${recentSinceIso}::timestamptz)::integer`
    }).from(users),
    db.select({ total: sql<number>`count(*)::integer` }).from(accounts),
    db.select().from(funnelSales).where(gte(funnelSales.purchasedAt, recentSince)),
    db.select().from(nativeWorkbookPurchases).where(gte(nativeWorkbookPurchases.purchasedAt, recentSince)),
    db.select({ total: sql<number>`count(*)::integer` })
      .from(funnelLeads)
      .where(gte(funnelLeads.createdAt, recentSince)),
    db.select({ visitorId: funnelEvents.visitorId })
      .from(funnelEvents)
      .where(and(
        gte(funnelEvents.occurredAt, recentSince),
        eq(funnelEvents.eventType, "page_view")
      ))
  ]);

  const activeSubscriptions = subscriptionRows.filter((row) => row.status === "active");
  const trialingSubscriptions = subscriptionRows.filter((row) => row.status === "trialing");
  const recentCancellations = subscriptionRows.filter((row) =>
    row.status === "canceled" && row.updatedAt >= recentSince
  );
  const churnDenominator = activeSubscriptions.length + trialingSubscriptions.length + recentCancellations.length;
  const mrrCents = activeSubscriptions.reduce(
    (sum, subscription) => sum + monthlyRecurringCents(subscription, now),
    0
  );

  const recentSales = consolidateRecentSales(recentAttributedSales, recentWorkbookPurchases);
  const salesByCurrency = new Map<string, number>();
  for (const sale of recentSales) {
    salesByCurrency.set(
      sale.currency,
      (salesByCurrency.get(sale.currency) ?? 0) + sale.amountTotalCents
    );
  }
  const primaryCurrency = salesByCurrency.has("USD")
    ? "USD"
    : Array.from(salesByCurrency.keys())[0] ?? "USD";
  const recentRevenueCents = salesByCurrency.get(primaryCurrency) ?? 0;
  const primaryCurrencySales = recentSales.filter((sale) => sale.currency === primaryCurrency);
  const pageViewVisitors = new Set(recentFunnelEventRows.map((event) => event.visitorId));
  const payingVisitors = new Set(
    recentAttributedSales
      .filter((sale) =>
        sale.status === "paid" &&
        sale.metadataJson.test !== true &&
        pageViewVisitors.has(sale.visitorId)
      )
      .map((sale) => sale.visitorId)
  );

  return {
    generatedAt: now.toISOString(),
    windowDays: RECENT_WINDOW_DAYS,
    mrr: {
      amountCents: mrrCents,
      currency: "USD"
    },
    subscriptions: {
      active: activeSubscriptions.length,
      trialing: trialingSubscriptions.length,
      canceling: activeSubscriptions.filter((row) => row.cancelAtPeriodEnd).length
    },
    churn: {
      canceled: recentCancellations.length,
      rate: churnDenominator > 0
        ? Math.round((recentCancellations.length / churnDenominator) * 10_000) / 100
        : null
    },
    users: {
      total: Number(userCounts[0]?.total ?? 0),
      newInWindow: Number(userCounts[0]?.recent ?? 0),
      accounts: Number(accountCounts[0]?.total ?? 0)
    },
    leads: {
      newInWindow: Number(recentLeadCounts[0]?.total ?? 0)
    },
    sales: {
      count: primaryCurrencySales.length,
      revenueCents: recentRevenueCents,
      currency: primaryCurrency,
      averageOrderValueCents: primaryCurrencySales.length
        ? Math.round(recentRevenueCents / primaryCurrencySales.length)
        : 0,
      otherCurrencies: Array.from(salesByCurrency.entries())
        .filter(([currency]) => currency !== primaryCurrency)
        .map(([currency, amountCents]) => ({ currency, amountCents })),
      recent: recentSales.slice(0, 5).map((sale) => ({
        id: sale.checkoutSessionId,
        email: sale.email,
        orderKind: sale.orderKind,
        amountTotalCents: sale.amountTotalCents,
        currency: sale.currency,
        purchasedAt: sale.purchasedAt.toISOString()
      }))
    },
    funnelConversion: {
      visitors: pageViewVisitors.size,
      customers: payingVisitors.size,
      rate: pageViewVisitors.size
        ? Math.round((payingVisitors.size / pageViewVisitors.size) * 10_000) / 100
        : null
    }
  };
}
