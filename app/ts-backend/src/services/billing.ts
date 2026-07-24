import { and, asc, desc, eq, gt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import {
  accountPurchases,
  accounts,
  profiles,
  studentProfileCheckouts,
  subjects,
  subscriptions,
  users
} from "ts-db";
import { db, env } from "../db";
import { getPremiumFeatureAccess } from "./entitlements";
import {
  fulfillNativeWorkbookCheckout,
  resolveNativeWorkbookCheckoutSelections
} from "./native-workbooks";
import {
  createStudentProfile,
  requireAccountRole,
  type CreateStudentProfileInput
} from "./accounts";

const CORE_PRODUCT_NAME = "Treeschool Family Plan";
const CORE_PRODUCT_DESCRIPTION = "Homeschool planning for up to three students, with lessons, attendance, grades, and parent tools.";
const PLAN_PACK_PRODUCT_NAME = "Treeschool Printable School-Year Planner";
const PLAN_PACK_PRODUCT_DESCRIPTION =
  "Choose your teaching weeks, upload homeschool workbook PDFs, and generate sequential printable weekly lesson-plan PDFs.";
const PLAN_PACK_UNIT_AMOUNT = 1499;
const CORE_INCLUDED_STUDENT_COUNT = 3;
const CORE_MONTHLY_INTRO_AMOUNT = 600;
const ADDITIONAL_STUDENT_INTRO_AMOUNT = 200;
const CORE_MONTHLY_INTRO_TRIAL_DAYS = 30;
const INTRODUCTORY_OFFER_KEY = "first_month_6_usd";

const CORE_SUBSCRIPTION_PLANS = {
  monthly: {
    label: "Monthly",
    unitAmount: 2000,
    recurringInterval: "month" as const
  },
  yearly: {
    label: "Yearly",
    unitAmount: 20000,
    recurringInterval: "year" as const
  }
};

const ADDITIONAL_STUDENT_PLANS = {
  monthly: {
    unitAmount: 500,
    recurringInterval: "month" as const,
    lookupKey: "treeschool_additional_student_monthly_500_v1"
  },
  yearly: {
    unitAmount: 5000,
    recurringInterval: "year" as const,
    lookupKey: "treeschool_additional_student_yearly_5000_v1"
  }
};

type ParentAccountContext = {
  accountId: string;
  accountCreatedAt: Date;
  accountPlanType: "free" | "premium";
  parentProfileId: string;
  parentFirstName: string;
  parentEmail: string;
};

type BillingInterval = keyof typeof CORE_SUBSCRIPTION_PLANS;

type StudentProfileData = Omit<CreateStudentProfileInput, "parentUserId" | "profileId">;

let stripeClient: Stripe | null = null;

function getStripe() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY to the backend environment.");
  }

  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}

function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}

async function resolveConfiguredSubscriptionPriceId(
  interval: BillingInterval,
  plan: (typeof CORE_SUBSCRIPTION_PLANS)[BillingInterval]
) {
  const priceId = interval === "monthly" ? env.STRIPE_MONTHLY_PRICE_ID : env.STRIPE_YEARLY_PRICE_ID;
  if (!priceId) return undefined;

  try {
    const price = await getStripe().prices.retrieve(priceId);
    const isExpectedPrice =
      price.active &&
      price.currency.toLowerCase() === "usd" &&
      price.unit_amount === plan.unitAmount &&
      price.recurring?.interval === plan.recurringInterval;

    return isExpectedPrice ? priceId : undefined;
  } catch {
    return undefined;
  }
}

function configuredAdditionalStudentPriceId(interval: BillingInterval) {
  return interval === "monthly"
    ? env.STRIPE_ADDITIONAL_STUDENT_MONTHLY_PRICE_ID
    : env.STRIPE_ADDITIONAL_STUDENT_YEARLY_PRICE_ID;
}

function isExpectedRecurringPrice(
  price: Stripe.Price,
  expected: { unitAmount: number; recurringInterval: "month" | "year" }
) {
  return price.active &&
    price.currency.toLowerCase() === "usd" &&
    price.unit_amount === expected.unitAmount &&
    price.recurring?.interval === expected.recurringInterval;
}

async function resolveAdditionalStudentPriceId(interval: BillingInterval) {
  const stripe = getStripe();
  const plan = ADDITIONAL_STUDENT_PLANS[interval];
  const configuredPriceId = configuredAdditionalStudentPriceId(interval);

  if (configuredPriceId) {
    try {
      const configuredPrice = await stripe.prices.retrieve(configuredPriceId);
      if (isExpectedRecurringPrice(configuredPrice, plan)) return configuredPriceId;
    } catch {
      // Fall through to the stable lookup key so a stale environment value cannot misbill a family.
    }
  }

  const existingPrices = await stripe.prices.list({
    active: true,
    lookup_keys: [plan.lookupKey],
    limit: 10
  });
  const existingPrice = existingPrices.data.find((price) => isExpectedRecurringPrice(price, plan));
  if (existingPrice) return existingPrice.id;

  const products = await stripe.products.list({ active: true, limit: 100 });
  const product = products.data.find((candidate) =>
    candidate.metadata.treeschoolCatalogKey === "additional_student"
  ) ?? await stripe.products.create({
    name: "Treeschool additional student",
    description: "One student beyond the three included with the Treeschool Family Plan.",
    metadata: { treeschoolCatalogKey: "additional_student" }
  });

  try {
    const price = await stripe.prices.create({
      currency: "usd",
      unit_amount: plan.unitAmount,
      recurring: { interval: plan.recurringInterval },
      product: product.id,
      lookup_key: plan.lookupKey,
      nickname: `Treeschool additional student (${interval})`
    });
    return price.id;
  } catch (error) {
    const racedPrices = await stripe.prices.list({
      active: true,
      lookup_keys: [plan.lookupKey],
      limit: 10
    });
    const racedPrice = racedPrices.data.find((price) => isExpectedRecurringPrice(price, plan));
    if (racedPrice) return racedPrice.id;
    throw error;
  }
}

function buildCoreSubscriptionLineItem(plan: (typeof CORE_SUBSCRIPTION_PLANS)[BillingInterval], priceId?: string) {
  if (priceId) {
    return {
      quantity: 1,
      price: priceId
    };
  }

  return {
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: plan.unitAmount,
      recurring: {
        interval: plan.recurringInterval
      },
      product_data: {
        name: CORE_PRODUCT_NAME,
        description: CORE_PRODUCT_DESCRIPTION
      }
    }
  };
}

function buildAdditionalStudentSubscriptionLineItem(priceId: string, quantity: number) {
  return {
    quantity,
    price: priceId
  };
}

function buildCoreMonthlyIntroLineItem() {
  return {
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: CORE_MONTHLY_INTRO_AMOUNT,
      product_data: {
        name: "Treeschool introductory month",
        description: "First 30 days for up to three students. The Family Plan then renews at $20/month."
      }
    }
  };
}

function buildAdditionalStudentIntroLineItem(quantity: number) {
  return {
    quantity,
    price_data: {
      currency: "usd",
      unit_amount: ADDITIONAL_STUDENT_INTRO_AMOUNT,
      product_data: {
        name: "Additional student — introductory month",
        description: "One initial lesson-plan generation for an additional student during the introductory month."
      }
    }
  };
}

function buildPlanPackLineItem() {
  if (env.STRIPE_PLAN_PACK_PRICE_ID) {
    return {
      quantity: 1,
      price: env.STRIPE_PLAN_PACK_PRICE_ID
    };
  }

  return {
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: PLAN_PACK_UNIT_AMOUNT,
      product_data: {
        name: PLAN_PACK_PRODUCT_NAME,
        description: PLAN_PACK_PRODUCT_DESCRIPTION
      }
    }
  };
}

async function configuredPriceAmount(priceId: string | undefined, fallback: number) {
  if (!priceId || !env.STRIPE_SECRET_KEY) return fallback;
  try {
    const price = await getStripe().prices.retrieve(priceId);
    return price.unit_amount ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getPlanGeneratorPricing() {
  const planPackPriceInCents = await configuredPriceAmount(env.STRIPE_PLAN_PACK_PRICE_ID, PLAN_PACK_UNIT_AMOUNT);
  return {
    currencyCode: "USD",
    planPackPriceInCents,
    subscriptionIntroPriceInCents: CORE_MONTHLY_INTRO_AMOUNT,
    subscriptionMonthlyPriceInCents: CORE_SUBSCRIPTION_PLANS.monthly.unitAmount,
    includedStudentCount: CORE_INCLUDED_STUDENT_COUNT,
    additionalStudentIntroPriceInCents: ADDITIONAL_STUDENT_INTRO_AMOUNT,
    additionalStudentMonthlyPriceInCents: ADDITIONAL_STUDENT_PLANS.monthly.unitAmount,
    introductoryPlanGenerationLimit: CORE_INCLUDED_STUDENT_COUNT
  };
}

function buildNativeWorkbookLineItem(item: {
  title: string;
  description: string;
  currencyCode: string;
  priceInCents: number;
  stripePriceId: string | null;
}) {
  return {
    quantity: 1,
    ...(item.stripePriceId
      ? { price: item.stripePriceId }
      : {
          price_data: {
            currency: item.currencyCode.toLowerCase(),
            unit_amount: item.priceInCents,
            product_data: {
              name: item.title,
              description: item.description.slice(0, 500)
            }
          }
        })
  };
}

function nativeSelectionMetadata(selections: Awaited<ReturnType<typeof resolveNativeWorkbookCheckoutSelections>>, purchasedIds: Set<string>) {
  return {
    nativeItemCount: String(selections.length),
    ...Object.fromEntries(selections.flatMap((item, index) => [
      [`nativeKind${index}`, item.catalogKind],
      [`nativeItem${index}`, item.id],
      [`nativeAmount${index}`, String(purchasedIds.has(item.id) ? item.priceInCents : 0)],
      [`nativePurchased${index}`, String(purchasedIds.has(item.id))]
    ]))
  };
}

function toSubscriptionStatus(status: Stripe.Subscription.Status): "trialing" | "active" | "past_due" | "canceled" {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "canceled") return "canceled";
  return "past_due";
}

function timestampToDate(timestamp?: number | null) {
  return timestamp ? new Date(timestamp * 1000) : null;
}

async function getParentAccountContext(userId: string): Promise<ParentAccountContext> {
  const [row] = await db
    .select({
      accountId: accounts.id,
      accountCreatedAt: accounts.createdAt,
      accountPlanType: accounts.planType,
      parentProfileId: profiles.id,
      parentFirstName: profiles.firstName,
      parentEmail: users.email
    })
    .from(profiles)
    .innerJoin(accounts, eq(accounts.id, profiles.accountId))
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);

  if (!row) {
    throw new Error("Parent account not found.");
  }

  return row;
}

export async function getBillingOverview(userId: string) {
  const context = await getParentAccountContext(userId);
  const [subscription] = await db
    .select({
      status: subscriptions.status,
      billingInterval: subscriptions.billingInterval,
      introductoryOffer: subscriptions.introductoryOffer,
      additionalStudentQuantity: subscriptions.additionalStudentQuantity,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd
    })
    .from(subscriptions)
    .where(eq(subscriptions.accountId, context.accountId))
    .limit(1);

  const electivePurchases = await db
    .select({
      subjectId: accountPurchases.subjectId
    })
    .from(accountPurchases)
    .innerJoin(subjects, eq(subjects.id, accountPurchases.subjectId))
    .where(and(eq(accountPurchases.accountId, context.accountId), eq(subjects.type, "elective")));

  const [studentUsage] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(profiles)
    .where(and(eq(profiles.accountId, context.accountId), eq(profiles.role, "STUDENT")));

  const featureAccess = await getPremiumFeatureAccess(userId);
  const displayStatus = featureAccess.isSubscriber
    ? subscription?.status === "active" && subscription.cancelAtPeriodEnd
      ? "active_canceling"
      : subscription?.status ?? "active"
    : featureAccess.trial.active
      ? "trialing"
      : subscription?.status ?? "free";

  return {
    accountId: context.accountId,
    parentProfileId: context.parentProfileId,
    parentFirstName: context.parentFirstName,
    currentPlan: featureAccess.isSubscriber ? "premium" : "free",
    displayStatus,
    subscription: subscription
      ? {
          status: subscription.status,
          billingInterval: subscription.billingInterval,
          introductoryOffer: subscription.introductoryOffer,
          introductoryMonth: subscription.status === "trialing" && subscription.introductoryOffer === INTRODUCTORY_OFFER_KEY,
          additionalStudentQuantity: subscription.additionalStudentQuantity,
          currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
        }
      : null,
    trial: {
      startAt: featureAccess.trial.startedAt,
      endAt: featureAccess.trial.endsAt,
      daysRemaining: featureAccess.trial.daysRemaining,
      active: featureAccess.trial.active
    },
    accessRestricted: !featureAccess.allowed,
    dataDeletionAt: null,
    checkout: {
      monthlyUrl: env.STRIPE_CHECKOUT_MONTHLY_URL ?? null,
      yearlyUrl: env.STRIPE_CHECKOUT_YEARLY_URL ?? null,
      customerPortalUrl: env.STRIPE_CUSTOMER_PORTAL_URL ?? null
    },
    billingGuardEnabled: true,
    studentSeats: {
      included: CORE_INCLUDED_STUDENT_COUNT,
      additional: subscription?.additionalStudentQuantity ?? 0,
      active: Number(studentUsage?.count ?? 0),
      additionalMonthlyPriceInCents: ADDITIONAL_STUDENT_PLANS.monthly.unitAmount,
      additionalYearlyPriceInCents: ADDITIONAL_STUDENT_PLANS.yearly.unitAmount
    },
    ownedElectiveCount: electivePurchases.length,
    featureAccess
  };
}

export async function createCoreSubscriptionCheckout(input: {
  userId: string;
  interval: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  intakeId?: string | null;
  nativeCatalogItemIds?: string[];
}) {
  await requireAccountRole(input.userId, ["OWNER", "ADMIN"]);
  if (!isBillingInterval(input.interval)) {
    throw new Error("Choose monthly or yearly billing.");
  }

  const context = await getParentAccountContext(input.userId);
  const [existingSubscription] = await db
    .select({
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      status: subscriptions.status
    })
    .from(subscriptions)
    .where(eq(subscriptions.accountId, context.accountId))
    .limit(1);
  if (existingSubscription && ["trialing", "active", "past_due"].includes(existingSubscription.status)) {
    throw new Error("This family already has a subscription. Manage it from the parent billing page.");
  }
  const plan = CORE_SUBSCRIPTION_PLANS[input.interval];
  const configuredPriceId = await resolveConfiguredSubscriptionPriceId(input.interval, plan);
  const hasUsedSubscription = Boolean(existingSubscription?.stripeSubscriptionId);
  const includesMonthlyIntro = input.interval === "monthly" && !hasUsedSubscription;
  const requestedTrialDays = input.trialDays && input.trialDays > 0 ? Math.min(input.trialDays, 30) : undefined;
  const trialDays = includesMonthlyIntro ? CORE_MONTHLY_INTRO_TRIAL_DAYS : requestedTrialDays;
  const [studentUsage] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(profiles)
    .where(and(eq(profiles.accountId, context.accountId), eq(profiles.role, "STUDENT")));
  const additionalStudentQuantity = Math.max(
    0,
    Number(studentUsage?.count ?? 0) - CORE_INCLUDED_STUDENT_COUNT
  );
  const additionalStudentPriceId = additionalStudentQuantity > 0
    ? await resolveAdditionalStudentPriceId(input.interval)
    : undefined;
  const nativeSelections = await resolveNativeWorkbookCheckoutSelections({
    ids: input.nativeCatalogItemIds ?? [],
    userId: input.userId
  });
  const paidNativeSelections = nativeSelections.filter((item) =>
    item.type === "elective" && item.accessState === "purchase_required"
  );
  if (nativeSelections.some((item) => item.currencyCode.toUpperCase() !== "USD")) {
    throw new Error("The selected workbook currency cannot be combined with the Family Plan checkout.");
  }
  const paidNativeIds = new Set(paidNativeSelections.map((item) => item.id));
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: existingSubscription?.stripeCustomerId ?? undefined,
    customer_email: existingSubscription?.stripeCustomerId ? undefined : context.parentEmail,
    client_reference_id: context.accountId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: true,
    line_items: [
      buildCoreSubscriptionLineItem(plan, configuredPriceId),
      ...(additionalStudentPriceId
        ? [buildAdditionalStudentSubscriptionLineItem(additionalStudentPriceId, additionalStudentQuantity)]
        : []),
      ...(includesMonthlyIntro ? [buildCoreMonthlyIntroLineItem()] : []),
      ...(includesMonthlyIntro && additionalStudentQuantity > 0
        ? [buildAdditionalStudentIntroLineItem(additionalStudentQuantity)]
        : []),
      ...paidNativeSelections.map(buildNativeWorkbookLineItem)
    ],
    metadata: {
      accountId: context.accountId,
      userId: input.userId,
      billingInterval: input.interval,
      additionalStudentQuantity: String(additionalStudentQuantity),
      checkoutKind: "core_subscription",
      ...(includesMonthlyIntro ? { introductoryOffer: INTRODUCTORY_OFFER_KEY } : {}),
      ...nativeSelectionMetadata(nativeSelections, paidNativeIds),
      ...(input.intakeId ? { intakeId: input.intakeId, checkoutSource: "generator_upsell" } : {})
    },
    subscription_data: {
      trial_period_days: trialDays,
      metadata: {
        accountId: context.accountId,
        userId: input.userId,
        billingInterval: input.interval,
        additionalStudentQuantity: String(additionalStudentQuantity),
        checkoutKind: "core_subscription",
        ...(includesMonthlyIntro ? { introductoryOffer: INTRODUCTORY_OFFER_KEY } : {}),
        ...(input.intakeId ? { intakeId: input.intakeId, checkoutSource: "generator_upsell" } : {})
      }
    }
  });

  return {
    id: session.id,
    url: session.url
  };
}

export async function createPlanPackCheckout(input: {
  userId: string;
  successUrl: string;
  cancelUrl: string;
  intakeId?: string | null;
  nativeCatalogItemIds?: string[];
}) {
  const context = await getParentAccountContext(input.userId);
  const [existingSubscription] = await db
    .select({
      stripeCustomerId: subscriptions.stripeCustomerId
    })
    .from(subscriptions)
    .where(eq(subscriptions.accountId, context.accountId))
    .limit(1);
  const nativeSelections = await resolveNativeWorkbookCheckoutSelections({
    ids: input.nativeCatalogItemIds ?? [],
    userId: input.userId
  });
  if (nativeSelections.some((item) => item.currencyCode.toUpperCase() !== "USD")) {
    throw new Error("The selected workbook currency cannot be combined with this lesson-plan checkout.");
  }
  const paidNativeSelections = nativeSelections.filter((item) => item.accessState === "purchase_required");
  const paidNativeIds = new Set(paidNativeSelections.map((item) => item.id));
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: existingSubscription?.stripeCustomerId ?? undefined,
    customer_email: existingSubscription?.stripeCustomerId ? undefined : context.parentEmail,
    client_reference_id: context.accountId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: true,
    line_items: [buildPlanPackLineItem(), ...paidNativeSelections.map(buildNativeWorkbookLineItem)],
    metadata: {
      accountId: context.accountId,
      userId: input.userId,
      checkoutKind: "plan_pack",
      ...nativeSelectionMetadata(nativeSelections, paidNativeIds),
      ...(input.intakeId ? { intakeId: input.intakeId } : {})
    },
    payment_intent_data: {
      metadata: {
        accountId: context.accountId,
        userId: input.userId,
        checkoutKind: "plan_pack",
        ...nativeSelectionMetadata(nativeSelections, paidNativeIds),
        ...(input.intakeId ? { intakeId: input.intakeId } : {})
      }
    }
  });

  return {
    id: session.id,
    url: session.url
  };
}

export async function getPaidPlanPackCheckoutSession(input: {
  sessionId: string;
  intakeId?: string | null;
}) {
  const session = await getStripe().checkout.sessions.retrieve(input.sessionId);
  const isPaidPlanPack =
    session.mode === "payment" &&
    session.payment_status === "paid" &&
    session.metadata?.checkoutKind === "plan_pack";
  const isCompletedGeneratorSubscription =
    session.mode === "subscription" &&
    session.status === "complete" &&
    ["paid", "no_payment_required"].includes(session.payment_status) &&
    session.metadata?.checkoutKind === "core_subscription" &&
    Boolean(session.metadata?.intakeId);

  if (!isPaidPlanPack && !isCompletedGeneratorSubscription) {
    throw new Error("Checkout has not been completed yet.");
  }

  if (input.intakeId && session.metadata?.intakeId !== input.intakeId) {
    throw new Error("Checkout session does not match this printable plan draft.");
  }

  if (isCompletedGeneratorSubscription) {
    await upsertSubscriptionFromCheckoutSession(session);
  }
  await fulfillNativeWorkbookCheckout(session);

  return {
    sessionId: session.id,
    accountId: session.metadata?.accountId ?? session.client_reference_id ?? null,
    userId: session.metadata?.userId ?? null,
    intakeId: session.metadata?.intakeId ?? null,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    checkoutKind: isCompletedGeneratorSubscription ? "subscription" as const : "one_time" as const
  };
}

export async function createCustomerPortalSession(input: {
  userId: string;
  returnUrl: string;
}) {
  await requireAccountRole(input.userId, ["OWNER", "ADMIN"]);
  const context = await getParentAccountContext(input.userId);
  const [subscription] = await db
    .select({
      stripeCustomerId: subscriptions.stripeCustomerId
    })
    .from(subscriptions)
    .where(eq(subscriptions.accountId, context.accountId))
    .limit(1);

  if (!subscription?.stripeCustomerId) {
    throw new Error("No Stripe customer exists yet.");
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: input.returnUrl
  });

  return {
    url: session.url
  };
}

function getStripeSubscriptionBillingDetails(subscription: Stripe.Subscription) {
  const metadataInterval = subscription.metadata.billingInterval;
  const billingInterval: BillingInterval = metadataInterval === "yearly" ||
    (metadataInterval !== "monthly" && subscription.items.data.some((item) => item.price.recurring?.interval === "year"))
    ? "yearly"
    : "monthly";
  const additionalPlan = ADDITIONAL_STUDENT_PLANS[billingInterval];
  const configuredPriceIds = new Set([
    env.STRIPE_ADDITIONAL_STUDENT_MONTHLY_PRICE_ID,
    env.STRIPE_ADDITIONAL_STUDENT_YEARLY_PRICE_ID
  ].filter((value): value is string => Boolean(value)));
  const additionalItem = subscription.items.data.find((item) =>
    configuredPriceIds.has(item.price.id) ||
    (
      item.price.currency.toLowerCase() === "usd" &&
      item.price.unit_amount === additionalPlan.unitAmount &&
      item.price.recurring?.interval === additionalPlan.recurringInterval
    )
  );
  const coreItem = subscription.items.data.find((item) => item.id !== additionalItem?.id) ?? subscription.items.data[0];

  return {
    billingInterval,
    additionalItem,
    additionalStudentQuantity: additionalItem?.quantity ?? 0,
    currentPeriodStart: timestampToDate(coreItem?.current_period_start),
    currentPeriodEnd: timestampToDate(coreItem?.current_period_end)
  };
}

async function upsertSubscriptionFromStripeSubscription(subscription: Stripe.Subscription) {
  const accountId = subscription.metadata.accountId;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  if (!accountId) {
    throw new Error(`Stripe subscription ${subscription.id} is missing accountId metadata.`);
  }

  const status = toSubscriptionStatus(subscription.status);
  const billing = getStripeSubscriptionBillingDetails(subscription);

  await db.transaction(async (tx) => {
    await tx
      .insert(subscriptions)
      .values({
        accountId,
        status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        billingInterval: billing.billingInterval,
        introductoryOffer: subscription.metadata.introductoryOffer ?? null,
        stripeAdditionalStudentItemId: billing.additionalItem?.id ?? null,
        additionalStudentQuantity: billing.additionalStudentQuantity,
        currentPeriodStart: billing.currentPeriodStart,
        currentPeriodEnd: billing.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: subscriptions.accountId,
        set: {
          status,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          billingInterval: billing.billingInterval,
          introductoryOffer: subscription.metadata.introductoryOffer ?? null,
          stripeAdditionalStudentItemId: billing.additionalItem?.id ?? null,
          additionalStudentQuantity: billing.additionalStudentQuantity,
          currentPeriodStart: billing.currentPeriodStart,
          currentPeriodEnd: billing.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          updatedAt: new Date()
        }
      });

    await tx
      .update(accounts)
      .set({ planType: status === "active" || status === "trialing" ? "premium" : "free" })
      .where(eq(accounts.id, accountId));
  });
}

async function upsertSubscriptionFromCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription") {
    return;
  }

  const accountId = session.metadata?.accountId ?? session.client_reference_id;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (!accountId || !subscriptionId || !customerId) {
    throw new Error(`Stripe checkout session ${session.id} is missing billing identifiers.`);
  }

  const stripeSubscription = await getStripe().subscriptions.retrieve(subscriptionId);
  await upsertSubscriptionFromStripeSubscription(stripeSubscription);
}

async function updateSubscriptionFromStripeEvent(subscription: Stripe.Subscription) {
  if (subscription.metadata.accountId) {
    await upsertSubscriptionFromStripeSubscription(subscription);
    return;
  }

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const [existing] = await db
    .select({
      accountId: subscriptions.accountId
    })
    .from(subscriptions)
    .where(or(eq(subscriptions.stripeSubscriptionId, subscription.id), eq(subscriptions.stripeCustomerId, customerId)))
    .limit(1);

  if (!existing) {
    throw new Error(`No local subscription row found for Stripe subscription ${subscription.id}.`);
  }

  subscription.metadata.accountId = existing.accountId;
  await upsertSubscriptionFromStripeSubscription(subscription);
}

async function countStudentProfiles(accountId: string) {
  const [usage] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(profiles)
    .where(and(eq(profiles.accountId, accountId), eq(profiles.role, "STUDENT")));
  return Number(usage?.count ?? 0);
}

function proratedSeatAmount(
  recurringAmountInCents: number,
  periodStart: Date | null,
  periodEnd: Date | null,
  now = new Date()
) {
  if (!periodStart || !periodEnd || periodEnd <= now || periodEnd <= periodStart) {
    return recurringAmountInCents;
  }
  const periodDuration = periodEnd.getTime() - periodStart.getTime();
  const remainingDuration = periodEnd.getTime() - now.getTime();
  return Math.max(50, Math.min(
    recurringAmountInCents,
    Math.ceil(recurringAmountInCents * remainingDuration / periodDuration)
  ));
}

function formatUsd(amountInCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amountInCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amountInCents / 100);
}

function formatBillingDate(value: Date | null) {
  if (!value) return "your next renewal";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
}

export async function createStudentProfileWithBilling(input: {
  parentUserId: string;
  student: StudentProfileData;
  successUrl: string;
  cancelUrl: string;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const context = await getParentAccountContext(input.parentUserId);
  const [subscription] = await db
    .select({
      status: subscriptions.status,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      billingInterval: subscriptions.billingInterval,
      introductoryOffer: subscriptions.introductoryOffer,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      additionalStudentQuantity: subscriptions.additionalStudentQuantity
    })
    .from(subscriptions)
    .where(eq(subscriptions.accountId, context.accountId))
    .limit(1);
  const studentCount = await countStudentProfiles(context.accountId);

  const paidStudentCapacity = CORE_INCLUDED_STUDENT_COUNT + (subscription?.additionalStudentQuantity ?? 0);
  if (!subscription?.stripeSubscriptionId || studentCount < paidStudentCapacity) {
    const profile = await createStudentProfile({
      ...input.student,
      parentUserId: input.parentUserId
    });
    return { kind: "created" as const, profile };
  }

  if (!subscription.stripeCustomerId || !["trialing", "active"].includes(subscription.status)) {
    throw new Error("Restore the Family Plan before adding another student.");
  }
  if (subscription.cancelAtPeriodEnd) {
    throw new Error("Resume the Family Plan before adding another student seat.");
  }

  const now = new Date();
  const [openCheckout] = await db
    .select({
      checkoutUrl: studentProfileCheckouts.checkoutUrl,
      profileData: studentProfileCheckouts.profileData,
      amountInCents: studentProfileCheckouts.amountInCents,
      recurringAmountInCents: studentProfileCheckouts.recurringAmountInCents,
      recurringInterval: studentProfileCheckouts.recurringInterval,
      expiresAt: studentProfileCheckouts.expiresAt
    })
    .from(studentProfileCheckouts)
    .where(and(
      eq(studentProfileCheckouts.accountId, context.accountId),
      eq(studentProfileCheckouts.status, "pending"),
      gt(studentProfileCheckouts.expiresAt, now)
    ))
    .orderBy(desc(studentProfileCheckouts.createdAt))
    .limit(1);
  if (openCheckout?.checkoutUrl) {
    const recurringLabel = openCheckout.recurringInterval === "year" ? "year" : "month";
    return {
      kind: "checkout" as const,
      url: openCheckout.checkoutUrl,
      paymentCopy: `A secure checkout is already open for ${openCheckout.profileData.firstName}. Complete ${formatUsd(openCheckout.amountInCents)} today, then ${formatUsd(openCheckout.recurringAmountInCents)}/${recurringLabel}.`
    };
  }

  const billingInterval: BillingInterval = subscription.billingInterval === "yearly" ? "yearly" : "monthly";
  const additionalPlan = ADDITIONAL_STUDENT_PLANS[billingInterval];
  const isIntroductoryMonth = subscription.status === "trialing" &&
    subscription.introductoryOffer === INTRODUCTORY_OFFER_KEY;
  const amountInCents = isIntroductoryMonth
    ? ADDITIONAL_STUDENT_INTRO_AMOUNT
    : proratedSeatAmount(
        additionalPlan.unitAmount,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        now
      );
  const targetAdditionalStudentQuantity = Math.max(
    subscription.additionalStudentQuantity + 1,
    studentCount + 1 - CORE_INCLUDED_STUDENT_COUNT
  );
  const plannedProfileId = randomUUID();
  const [pendingCheckout] = await db.insert(studentProfileCheckouts).values({
    accountId: context.accountId,
    requestedByUserId: input.parentUserId,
    plannedProfileId,
    profileData: input.student,
    amountInCents,
    recurringAmountInCents: additionalPlan.unitAmount,
    recurringInterval: additionalPlan.recurringInterval,
    targetAdditionalStudentQuantity,
    status: "pending"
  }).returning({ id: studentProfileCheckouts.id });

  const renewalLabel = formatBillingDate(subscription.currentPeriodEnd);
  const recurringLabel = additionalPlan.recurringInterval === "year" ? "year" : "month";
  const chargeDescription = isIntroductoryMonth
    ? `Introductory access and one initial lesson plan for ${input.student.firstName}. Renews at ${formatUsd(additionalPlan.unitAmount)}/${recurringLabel} on ${renewalLabel}.`
    : `Prorated access for ${input.student.firstName} through ${renewalLabel}. Then ${formatUsd(additionalPlan.unitAmount)}/${recurringLabel}.`;

  try {
    const stripeSession = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer: subscription.stripeCustomerId,
      client_reference_id: context.accountId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountInCents,
          product_data: {
            name: `Add ${input.student.firstName} to Treeschool`,
            description: chargeDescription.slice(0, 500)
          }
        }
      }],
      metadata: {
        accountId: context.accountId,
        userId: input.parentUserId,
        checkoutKind: "additional_student",
        studentProfileCheckoutId: pendingCheckout.id,
        plannedProfileId,
        targetAdditionalStudentQuantity: String(targetAdditionalStudentQuantity)
      },
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: {
          accountId: context.accountId,
          userId: input.parentUserId,
          checkoutKind: "additional_student",
          studentProfileCheckoutId: pendingCheckout.id,
          plannedProfileId
        }
      }
    });
    const expiresAt = timestampToDate(stripeSession.expires_at);
    await db.update(studentProfileCheckouts).set({
      stripeCheckoutSessionId: stripeSession.id,
      checkoutUrl: stripeSession.url,
      expiresAt,
      updatedAt: new Date()
    }).where(eq(studentProfileCheckouts.id, pendingCheckout.id));

    if (!stripeSession.url) throw new Error("Stripe did not return an additional-student checkout link.");
    return {
      kind: "checkout" as const,
      url: stripeSession.url,
      paymentCopy: isIntroductoryMonth
        ? `Your Family Plan includes three students. Add ${input.student.firstName} for ${formatUsd(amountInCents)} today, then ${formatUsd(additionalPlan.unitAmount)}/${recurringLabel} starting ${renewalLabel}. The profile appears after payment succeeds.`
        : `Your Family Plan includes three students. Add ${input.student.firstName} for ${formatUsd(amountInCents)} today (prorated), then ${formatUsd(additionalPlan.unitAmount)}/${recurringLabel} starting ${renewalLabel}. The profile appears after payment succeeds.`
    };
  } catch (error) {
    await db.update(studentProfileCheckouts).set({
      status: "expired",
      updatedAt: new Date()
    }).where(eq(studentProfileCheckouts.id, pendingCheckout.id));
    throw error;
  }
}

async function fulfillAdditionalStudentCheckout(session: Stripe.Checkout.Session) {
  if (
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.metadata?.checkoutKind !== "additional_student"
  ) return;

  const checkoutId = session.metadata.studentProfileCheckoutId;
  if (!checkoutId) throw new Error(`Stripe session ${session.id} is missing studentProfileCheckoutId metadata.`);
  const [checkout] = await db
    .select()
    .from(studentProfileCheckouts)
    .where(eq(studentProfileCheckouts.id, checkoutId))
    .limit(1);
  if (!checkout) throw new Error(`Additional-student checkout ${checkoutId} was not found.`);
  if (checkout.status === "completed") return;
  if (checkout.accountId !== (session.metadata.accountId ?? session.client_reference_id)) {
    throw new Error(`Stripe session ${session.id} does not match its Treeschool account.`);
  }

  const profile = await createStudentProfile({
    ...checkout.profileData,
    profileId: checkout.plannedProfileId,
    parentUserId: checkout.requestedByUserId
  });
  if (!profile) throw new Error(`Student profile ${checkout.plannedProfileId} could not be created.`);

  const [localSubscription] = await db
    .select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .where(eq(subscriptions.accountId, checkout.accountId))
    .limit(1);
  if (!localSubscription?.stripeSubscriptionId) {
    throw new Error(`Account ${checkout.accountId} has no Stripe subscription for its additional student.`);
  }

  let updatedSubscription: Stripe.Subscription | null = null;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`student-seat:${checkout.accountId}`}))`);
    const stripe = getStripe();
    const stripeSubscription = await stripe.subscriptions.retrieve(localSubscription.stripeSubscriptionId!);
    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
    const paymentIntent = paymentIntentId ? await stripe.paymentIntents.retrieve(paymentIntentId) : null;
    const paymentMethodId = typeof paymentIntent?.payment_method === "string"
      ? paymentIntent.payment_method
      : paymentIntent?.payment_method?.id;
    const details = getStripeSubscriptionBillingDetails(stripeSubscription);
    const desiredQuantity = Math.max(
      details.additionalStudentQuantity,
      checkout.targetAdditionalStudentQuantity
    );

    if (details.additionalItem) {
      if ((details.additionalItem.quantity ?? 0) < desiredQuantity) {
        await stripe.subscriptionItems.update(
          details.additionalItem.id,
          { quantity: desiredQuantity, proration_behavior: "none" },
          { idempotencyKey: `student-seat-item-update-${checkout.id}` }
        );
      }
    } else {
      const interval: BillingInterval = checkout.recurringInterval === "year" ? "yearly" : "monthly";
      const priceId = await resolveAdditionalStudentPriceId(interval);
      await stripe.subscriptionItems.create(
        {
          subscription: stripeSubscription.id,
          price: priceId,
          quantity: desiredQuantity,
          proration_behavior: "none"
        },
        { idempotencyKey: `student-seat-item-create-${checkout.id}` }
      );
    }

    await stripe.subscriptions.update(stripeSubscription.id, {
      metadata: { additionalStudentQuantity: String(desiredQuantity) },
      ...(paymentMethodId ? { default_payment_method: paymentMethodId } : {})
    });
    updatedSubscription = await stripe.subscriptions.retrieve(stripeSubscription.id);
  });

  if (!updatedSubscription) throw new Error(`Stripe subscription for ${checkout.accountId} was not updated.`);
  await upsertSubscriptionFromStripeSubscription(updatedSubscription);
  await db.update(studentProfileCheckouts).set({
    status: "completed",
    completedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(studentProfileCheckouts.id, checkout.id));
}

async function expireAdditionalStudentCheckout(session: Stripe.Checkout.Session) {
  if (session.metadata?.checkoutKind !== "additional_student") return;
  const checkoutId = session.metadata.studentProfileCheckoutId;
  if (!checkoutId) return;
  await db.update(studentProfileCheckouts).set({
    status: "expired",
    updatedAt: new Date()
  }).where(and(
    eq(studentProfileCheckouts.id, checkoutId),
    eq(studentProfileCheckouts.status, "pending")
  ));
}

export async function handleStripeWebhook(input: {
  body: string;
  signature: string | null;
}) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("Stripe webhook handling is not configured. Add STRIPE_WEBHOOK_SECRET.");
  }

  if (!input.signature) {
    throw new Error("Missing Stripe signature.");
  }

  const stripe = getStripe();
  const event = await stripe.webhooks.constructEventAsync(input.body, input.signature, env.STRIPE_WEBHOOK_SECRET);

  if (event.type === "checkout.session.completed") {
    await upsertSubscriptionFromCheckoutSession(event.data.object);
    await fulfillAdditionalStudentCheckout(event.data.object);
    await fulfillNativeWorkbookCheckout(event.data.object);
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    await fulfillAdditionalStudentCheckout(event.data.object);
  }

  if (event.type === "checkout.session.expired") {
    await expireAdditionalStudentCheckout(event.data.object);
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await updateSubscriptionFromStripeEvent(event.data.object);
  }

  return {
    received: true,
    eventType: event.type
  };
}

export async function listElectiveCatalog(userId: string) {
  const context = await getParentAccountContext(userId);
  const purchases = await db
    .select({
      subjectId: accountPurchases.subjectId
    })
    .from(accountPurchases)
    .where(eq(accountPurchases.accountId, context.accountId));
  const ownedSubjectIds = new Set(purchases.map((purchase) => purchase.subjectId));

  const rows = await db
    .select({
      id: subjects.id,
      slug: subjects.slug,
      name: subjects.name,
      description: subjects.description,
      priceInCents: subjects.priceInCents,
      currencyCode: subjects.currencyCode,
      checkoutUrl: subjects.checkoutUrl,
      curriculumNodeId: subjects.curriculumNodeId
    })
    .from(subjects)
    .where(and(eq(subjects.type, "elective"), eq(subjects.active, true)))
    .orderBy(asc(subjects.displayOrder), asc(subjects.name));

  return rows.map((subject) => ({
    ...subject,
    owned: ownedSubjectIds.has(subject.id)
  }));
}
