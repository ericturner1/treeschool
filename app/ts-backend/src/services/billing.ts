import { and, asc, desc, eq, gt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import {
  accountPurchases,
  accountInvitations,
  accounts,
  postCheckoutOffers,
  profiles,
  studentProfileCheckouts,
  subjects,
  subscriptions,
  users
} from "ts-db";
import { db, env } from "../db";
import { getPremiumFeatureAccess } from "./entitlements";
import {
  fulfillNativeWorkbookPaymentIntent,
  fulfillNativeWorkbookCheckout,
  resolveJapanesePostCheckoutWorkbookOffer,
  resolveNativeWorkbookCheckoutSelections
} from "./native-workbooks";
import {
  createStudentProfile,
  ensureProvisionalParentAccountForEmail,
  requireAccountRole,
  type CreateStudentProfileInput
} from "./accounts";
import {
  ADDITIONAL_STUDENT_INTRO_AMOUNT,
  CORE_MONTHLY_INTRO_AMOUNT,
  getIntroductoryCouponId,
  getIntroductoryDiscountAmount,
  INTRODUCTORY_OFFER_KEY,
  isIntroductoryOfferActive
} from "./billing-introductory-offer";
import {
  getMembershipPlan,
  getSinglePlanDowngradeBlocker,
  inferMembershipTierFromAmount,
  isMembershipTier,
  MEMBERSHIP_PLANS,
  normalizeMembershipTier,
  type BillingInterval,
  type MembershipTier
} from "./membership-plans";
import {
  getFunnelMembershipProduct,
  type FunnelMembershipProduct
} from "./funnel-products";
import { withTreeschoolCheckoutBranding } from "./stripe-checkout";
import { reportMetaCheckoutPurchase } from "./meta-conversions";
import {
  notifyCheckoutSale,
  notifyDirectPaymentIntentSale
} from "./sale-email-notifications";
import {
  funnelCheckoutMetadata,
  recordStripeFunnelSale,
  resolvePublicFunnelOneClickOffer,
  type FunnelCheckoutAttribution
} from "./funnels";

const PLAN_PACK_PRODUCT_NAME = "Treeschool Printable School-Year Planner";
const PLAN_PACK_PRODUCT_DESCRIPTION =
  "Choose your teaching weeks, upload homeschool workbook PDFs, and generate sequential printable weekly lesson-plan PDFs.";
const PLAN_PACK_UNIT_AMOUNT = 1499;
const MEMBERSHIP_CHECKOUT_CUSTOM_TEXT = {
  submit: {
    message: "Cancel anytime—it’s easy to manage your membership from your Treeschool billing settings."
  }
};
const FIRST_GRADE_FUNNEL_KEY = "first_grade_curriculum";
const FIRST_GRADE_JAPANESE_OFFER_KEY = "first_grade_japanese";

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
  tier: MembershipTier,
  interval: BillingInterval,
  plan: (typeof MEMBERSHIP_PLANS)[MembershipTier]["prices"][BillingInterval]
) {
  const stripe = getStripe();
  const configuredPriceId = tier === "single"
    ? interval === "monthly"
      ? env.STRIPE_SINGLE_MONTHLY_PRICE_ID
      : env.STRIPE_SINGLE_YEARLY_PRICE_ID
    : interval === "monthly"
      ? env.STRIPE_MONTHLY_PRICE_ID
      : env.STRIPE_YEARLY_PRICE_ID;

  if (configuredPriceId) {
    try {
      const price = await stripe.prices.retrieve(configuredPriceId);
      if (isExpectedRecurringPrice(price, plan)) return configuredPriceId;
    } catch {
      // Fall through to the stable lookup key so stale configuration cannot misbill a parent.
    }
  }

  const existingPrices = await stripe.prices.list({
    active: true,
    lookup_keys: [plan.lookupKey],
    limit: 10
  });
  const existingPrice = existingPrices.data.find((price) => isExpectedRecurringPrice(price, plan));
  if (existingPrice) return existingPrice.id;

  const membership = getMembershipPlan(tier);
  const products = await stripe.products.list({ active: true, limit: 100 });
  const product = products.data.find((candidate) =>
    candidate.metadata.treeschoolCatalogKey === membership.catalogKey
  ) ?? await stripe.products.create({
    name: membership.productName,
    description: membership.productDescription,
    metadata: {
      treeschoolCatalogKey: membership.catalogKey,
      treeschoolPlanTier: tier
    }
  });

  try {
    const price = await stripe.prices.create({
      currency: "usd",
      unit_amount: plan.unitAmount,
      recurring: { interval: plan.recurringInterval },
      product: product.id,
      lookup_key: plan.lookupKey,
      nickname: `${membership.productName} (${interval})`
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
    description: "One student beyond the three included with Treeschool Standard.",
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

function buildCoreSubscriptionLineItem(
  tier: MembershipTier,
  plan: (typeof MEMBERSHIP_PLANS)[MembershipTier]["prices"][BillingInterval],
  priceId?: string
) {
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
        name: getMembershipPlan(tier).productName,
        description: getMembershipPlan(tier).productDescription,
        metadata: {
          treeschoolCatalogKey: getMembershipPlan(tier).catalogKey,
          treeschoolPlanTier: tier
        }
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

function isMissingStripeResource(error: unknown) {
  return error instanceof Stripe.errors.StripeInvalidRequestError &&
    (error.statusCode === 404 || error.code === "resource_missing");
}

async function resolveIntroductoryCouponId(input: {
  planTier: MembershipTier;
  monthlyPlanAmount: number;
  additionalStudentQuantity: number;
}) {
  const stripe = getStripe();
  const id = getIntroductoryCouponId({
    planTier: input.planTier,
    additionalStudentQuantity: input.additionalStudentQuantity
  });
  const amountOff = getIntroductoryDiscountAmount({
    monthlyPlanAmount: input.monthlyPlanAmount,
    additionalStudentQuantity: input.additionalStudentQuantity
  });

  try {
    const existing = await stripe.coupons.retrieve(id);
    if (
      existing.valid &&
      existing.duration === "once" &&
      existing.currency?.toLowerCase() === "usd" &&
      existing.amount_off === amountOff
    ) {
      return id;
    }
    throw new Error("The configured introductory offer does not match the expected first-month price.");
  } catch (error) {
    if (!isMissingStripeResource(error)) throw error;
  }

  try {
    await stripe.coupons.create({
      id,
      name: "Treeschool paid introductory month",
      duration: "once",
      currency: "usd",
      amount_off: amountOff,
      metadata: {
        treeschoolOffer: INTRODUCTORY_OFFER_KEY,
        planTier: input.planTier,
        additionalStudentQuantity: String(Math.max(0, Math.floor(input.additionalStudentQuantity)))
      }
    });
    return id;
  } catch (error) {
    if (!isMissingStripeResource(error)) {
      try {
        const racedCoupon = await stripe.coupons.retrieve(id);
        if (
          racedCoupon.valid &&
          racedCoupon.duration === "once" &&
          racedCoupon.currency?.toLowerCase() === "usd" &&
          racedCoupon.amount_off === amountOff
        ) {
          return id;
        }
      } catch {
        // Surface the original creation error below.
      }
    }
    throw error;
  }
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
  const membership = getMembershipPlan("single");
  const planPackPriceInCents = await configuredPriceAmount(env.STRIPE_PLAN_PACK_PRICE_ID, PLAN_PACK_UNIT_AMOUNT);
  return {
    currencyCode: "USD",
    planPackPriceInCents,
    subscriptionIntroPriceInCents: CORE_MONTHLY_INTRO_AMOUNT,
    subscriptionMonthlyPriceInCents: membership.prices.monthly.unitAmount,
    subscriptionYearlyPriceInCents: membership.prices.yearly.unitAmount,
    subscriptionPlanTier: "single" as const,
    includedStudentCount: membership.includedStudentCount,
    additionalStudentIntroPriceInCents: ADDITIONAL_STUDENT_INTRO_AMOUNT,
    additionalStudentMonthlyPriceInCents: ADDITIONAL_STUDENT_PLANS.monthly.unitAmount,
    introductoryPlanGenerationLimit: membership.includedStudentCount
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
      ...(item.catalogKind === "bundle"
        ? [[`versions${index}`, item.memberVersionIds.join("|")]]
        : [[`version${index}`, item.activeVersionId!]]),
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
      planTier: subscriptions.planTier,
      billingInterval: subscriptions.billingInterval,
      introductoryOffer: subscriptions.introductoryOffer,
      introductoryOfferEndsAt: subscriptions.introductoryOfferEndsAt,
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
          planTier: subscription.planTier,
          billingInterval: subscription.billingInterval,
          introductoryOffer: subscription.introductoryOffer,
          introductoryMonth: isIntroductoryOfferActive(subscription),
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
      included: getMembershipPlan(subscription?.planTier ?? "standard").includedStudentCount,
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
  planTier?: string;
  successUrl: string;
  cancelUrl: string;
  intakeId?: string | null;
  nativeCatalogItemIds?: string[];
  funnelKey?: string | null;
  landingVariant?: string | null;
  funnelVisitorId?: string | null;
  funnelAttribution?: FunnelCheckoutAttribution | null;
}) {
  await requireAccountRole(input.userId, ["OWNER", "ADMIN"]);
  if (!isBillingInterval(input.interval)) {
    throw new Error("Choose monthly or yearly billing.");
  }
  const planTier = normalizeMembershipTier(input.planTier);
  const membership = getMembershipPlan(planTier);

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
  const plan = membership.prices[input.interval];
  const configuredPriceId = await resolveConfiguredSubscriptionPriceId(planTier, input.interval, plan);
  const hasUsedSubscription = Boolean(existingSubscription?.stripeSubscriptionId);
  const includesMonthlyIntro = input.interval === "monthly" && !hasUsedSubscription;
  const [studentUsage] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(profiles)
    .where(and(eq(profiles.accountId, context.accountId), eq(profiles.role, "STUDENT")));
  const activeStudentCount = Number(studentUsage?.count ?? 0);
  if (planTier === "single" && activeStudentCount > membership.includedStudentCount) {
    throw new Error(
      `${membership.label} supports ${membership.includedStudentCount === 1 ? "one student" : `up to ${membership.includedStudentCount} students`}. Choose Standard for this account.`
    );
  }
  const additionalStudentQuantity = Math.max(
    0,
    activeStudentCount - membership.includedStudentCount
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
    throw new Error("The selected workbook currency cannot be combined with membership checkout.");
  }
  const paidNativeIds = new Set(paidNativeSelections.map((item) => item.id));
  const introductoryCouponId = includesMonthlyIntro
    ? await resolveIntroductoryCouponId({
        planTier,
        monthlyPlanAmount: membership.prices.monthly.unitAmount,
        additionalStudentQuantity
      })
    : undefined;
  const stripe = getStripe();
  const funnelKey = input.funnelKey === FIRST_GRADE_FUNNEL_KEY ? FIRST_GRADE_FUNNEL_KEY : null;
  const landingVariant =
    funnelKey && (input.landingVariant === "a" || input.landingVariant === "b")
      ? input.landingVariant
      : null;
  const funnelVisitorId =
    funnelKey &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.funnelVisitorId ?? ""
    )
      ? input.funnelVisitorId!.toLowerCase()
      : null;
  const session = await stripe.checkout.sessions.create(withTreeschoolCheckoutBranding({
    mode: "subscription",
    customer: existingSubscription?.stripeCustomerId ?? undefined,
    customer_email: existingSubscription?.stripeCustomerId ? undefined : context.parentEmail,
    client_reference_id: context.accountId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: introductoryCouponId ? undefined : true,
    discounts: introductoryCouponId ? [{ coupon: introductoryCouponId }] : undefined,
    custom_text: MEMBERSHIP_CHECKOUT_CUSTOM_TEXT,
    line_items: [
      buildCoreSubscriptionLineItem(planTier, plan, configuredPriceId),
      ...(additionalStudentPriceId
        ? [buildAdditionalStudentSubscriptionLineItem(additionalStudentPriceId, additionalStudentQuantity)]
        : []),
      ...paidNativeSelections.map(buildNativeWorkbookLineItem)
    ],
    metadata: {
      accountId: context.accountId,
      userId: input.userId,
      planTier,
      billingInterval: input.interval,
      additionalStudentQuantity: String(additionalStudentQuantity),
      checkoutKind: "core_subscription",
      ...(funnelKey ? { funnelKey } : {}),
      ...(landingVariant ? { landingVariant } : {}),
      ...(funnelVisitorId ? { funnelVisitorId } : {}),
      ...funnelCheckoutMetadata(input.funnelAttribution),
      ...(includesMonthlyIntro ? { introductoryOffer: INTRODUCTORY_OFFER_KEY } : {}),
      ...nativeSelectionMetadata(nativeSelections, paidNativeIds),
      ...(input.intakeId ? { intakeId: input.intakeId, checkoutSource: "generator_upsell" } : {})
    },
    subscription_data: {
      metadata: {
        accountId: context.accountId,
        userId: input.userId,
        planTier,
        billingInterval: input.interval,
        additionalStudentQuantity: String(additionalStudentQuantity),
        checkoutKind: "core_subscription",
        ...(funnelKey ? { funnelKey } : {}),
        ...(landingVariant ? { landingVariant } : {}),
        ...(funnelVisitorId ? { funnelVisitorId } : {}),
        ...funnelCheckoutMetadata(input.funnelAttribution),
        ...(includesMonthlyIntro ? { introductoryOffer: INTRODUCTORY_OFFER_KEY } : {}),
        ...(input.intakeId ? { intakeId: input.intakeId, checkoutSource: "generator_upsell" } : {})
      }
    }
  }));

  return {
    id: session.id,
    url: session.url
  };
}

export async function createPublicCoreSubscriptionCheckout(input: {
  interval: string;
  planTier?: string;
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
  funnelKey?: string | null;
  landingVariant?: string | null;
  funnelVisitorId?: string | null;
  nativeCatalogItemIds?: string[];
  funnelAttribution?: FunnelCheckoutAttribution | null;
}) {
  if (!isBillingInterval(input.interval)) {
    throw new Error("Choose monthly or yearly billing.");
  }
  const planTier = normalizeMembershipTier(input.planTier);
  const membership = getMembershipPlan(planTier);

  const plan = membership.prices[input.interval];
  const configuredPriceId = await resolveConfiguredSubscriptionPriceId(planTier, input.interval, plan);
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !email.includes("@")) throw new Error("Enter a valid email address.");
  const nativeSelections = await resolveNativeWorkbookCheckoutSelections({
    ids: input.nativeCatalogItemIds ?? [],
    userId: null
  });
  const paidNativeSelections = nativeSelections.filter((item) => item.type === "elective");
  if (nativeSelections.some((item) => item.currencyCode.toUpperCase() !== "USD")) {
    throw new Error("The selected workbook currency cannot be combined with membership checkout.");
  }
  const paidNativeIds = new Set(paidNativeSelections.map((item) => item.id));
  const includesMonthlyIntro = input.interval === "monthly";
  const introductoryCouponId = includesMonthlyIntro
    ? await resolveIntroductoryCouponId({
        planTier,
        monthlyPlanAmount: membership.prices.monthly.unitAmount,
        additionalStudentQuantity: 0
      })
    : undefined;
  const funnelKey = input.funnelKey === FIRST_GRADE_FUNNEL_KEY ? FIRST_GRADE_FUNNEL_KEY : null;
  const landingVariant =
    funnelKey && (input.landingVariant === "a" || input.landingVariant === "b")
      ? input.landingVariant
      : null;
  const funnelVisitorId =
    funnelKey &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.funnelVisitorId ?? ""
    )
      ? input.funnelVisitorId!.toLowerCase()
      : null;
  const session = await getStripe().checkout.sessions.create(withTreeschoolCheckoutBranding({
    mode: "subscription",
    customer_email: email ?? undefined,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: introductoryCouponId ? undefined : true,
    discounts: introductoryCouponId ? [{ coupon: introductoryCouponId }] : undefined,
    custom_text: MEMBERSHIP_CHECKOUT_CUSTOM_TEXT,
    line_items: [
      buildCoreSubscriptionLineItem(planTier, plan, configuredPriceId),
      ...paidNativeSelections.map(buildNativeWorkbookLineItem)
    ],
    metadata: {
      planTier,
      billingInterval: input.interval,
      additionalStudentQuantity: "0",
      checkoutKind: "public_core_subscription",
      ...(funnelKey ? { funnelKey } : {}),
      ...(landingVariant ? { landingVariant } : {}),
      ...(funnelVisitorId ? { funnelVisitorId } : {}),
      ...funnelCheckoutMetadata(input.funnelAttribution),
      ...(includesMonthlyIntro ? { introductoryOffer: INTRODUCTORY_OFFER_KEY } : {}),
      ...nativeSelectionMetadata(nativeSelections, paidNativeIds)
    },
    subscription_data: {
      metadata: {
        planTier,
        billingInterval: input.interval,
        additionalStudentQuantity: "0",
        checkoutKind: "public_core_subscription",
        ...(funnelKey ? { funnelKey } : {}),
        ...(landingVariant ? { landingVariant } : {}),
        ...(funnelVisitorId ? { funnelVisitorId } : {}),
        ...funnelCheckoutMetadata(input.funnelAttribution),
        ...(includesMonthlyIntro ? { introductoryOffer: INTRODUCTORY_OFFER_KEY } : {})
      }
    }
  }));

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
  const session = await stripe.checkout.sessions.create(withTreeschoolCheckoutBranding({
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
  }));

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

  const stripe = getStripe();
  const configuration = await resolveAccountManagementPortalConfiguration();
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    configuration,
    return_url: input.returnUrl
  });

  return {
    url: session.url
  };
}

async function findPortalConfiguration(kind: string) {
  const configurations = await getStripe().billingPortal.configurations.list({
    active: true,
    limit: 100
  });
  return configurations.data.find((configuration) =>
    configuration.metadata?.treeschoolPortalKind === kind
  );
}

async function resolveAccountManagementPortalConfiguration() {
  const stripe = getStripe();
  const kind = "account_management_v1";
  const existing = await findPortalConfiguration(kind);
  if (existing) return existing.id;

  const origin = env.PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://www.treehomeschool.com";
  const configuration = await stripe.billingPortal.configurations.create({
    name: "Treeschool account management",
    default_return_url: `${origin}/p/billing`,
    business_profile: {
      headline: "Manage your Treeschool membership.",
      privacy_policy_url: `${origin}/privacy`,
      terms_of_service_url: `${origin}/terms`
    },
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "name"]
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        cancellation_reason: {
          enabled: true,
          options: ["too_expensive", "unused", "missing_features", "other"]
        }
      },
      subscription_update: { enabled: false }
    },
    metadata: { treeschoolPortalKind: kind }
  });
  return configuration.id;
}

async function resolvePlanChangePortalConfiguration() {
  const stripe = getStripe();
  const kind = "plan_change_v1";
  const membershipPrices = await Promise.all(
    (["single", "standard"] as const).flatMap((tier) =>
      (["monthly", "yearly"] as const).map(async (interval) => {
        const plan = getMembershipPlan(tier).prices[interval];
        const id = await resolveConfiguredSubscriptionPriceId(tier, interval, plan);
        const price = await stripe.prices.retrieve(id);
        const productId = typeof price.product === "string" ? price.product : price.product.id;
        return { id, productId };
      })
    )
  );
  const products = Array.from(
    membershipPrices.reduce((grouped, price) => {
      grouped.set(price.productId, [...(grouped.get(price.productId) ?? []), price.id]);
      return grouped;
    }, new Map<string, string[]>())
  ).map(([product, prices]) => ({ product, prices }));
  const features = {
    customer_update: { enabled: false },
    invoice_history: { enabled: false },
    payment_method_update: { enabled: false },
    subscription_cancel: { enabled: false },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price" as const],
      proration_behavior: "create_prorations" as const,
      products
    }
  };
  const existing = await findPortalConfiguration(kind);
  if (existing) {
    const updated = await stripe.billingPortal.configurations.update(existing.id, {
      features
    });
    return updated.id;
  }

  const origin = env.PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://www.treehomeschool.com";
  const configuration = await stripe.billingPortal.configurations.create({
    name: "Treeschool plan changes",
    default_return_url: `${origin}/p/billing`,
    business_profile: {
      headline: "Confirm your Treeschool plan change.",
      privacy_policy_url: `${origin}/privacy`,
      terms_of_service_url: `${origin}/terms`
    },
    features,
    metadata: { treeschoolPortalKind: kind }
  });
  return configuration.id;
}

export async function createMembershipPlanChangeSession(input: {
  userId: string;
  targetPlanTier: string;
  returnUrl: string;
}) {
  await requireAccountRole(input.userId, ["OWNER", "ADMIN"]);
  if (!isMembershipTier(input.targetPlanTier)) {
    throw new Error("Choose Single or Standard.");
  }

  const context = await getParentAccountContext(input.userId);
  const [subscription] = await db
    .select({
      status: subscriptions.status,
      planTier: subscriptions.planTier,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      additionalStudentQuantity: subscriptions.additionalStudentQuantity
    })
    .from(subscriptions)
    .where(eq(subscriptions.accountId, context.accountId))
    .limit(1);
  if (
    !subscription?.stripeCustomerId ||
    !subscription.stripeSubscriptionId ||
    !["trialing", "active"].includes(subscription.status)
  ) {
    throw new Error("An active Treeschool subscription is required to change plans.");
  }
  if (subscription.planTier === input.targetPlanTier) {
    throw new Error(`This account is already on ${getMembershipPlan(input.targetPlanTier).label}.`);
  }

  const [studentCount, teacherUserCount] = await Promise.all([
    countStudentProfiles(context.accountId),
    countReservedTeacherUsers(context.accountId)
  ]);
  const singleDowngradeBlocker = input.targetPlanTier === "single"
    ? getSinglePlanDowngradeBlocker({
        studentCount,
        additionalStudentQuantity: subscription.additionalStudentQuantity,
        teacherUserCount
      })
    : null;
  if (singleDowngradeBlocker) {
    throw new Error(singleDowngradeBlocker);
  }

  const stripe = getStripe();
  const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
  const billing = getStripeSubscriptionBillingDetails(stripeSubscription);
  if (!billing.coreItem) throw new Error("The current Treeschool subscription price could not be identified.");
  const targetPlan = getMembershipPlan(input.targetPlanTier).prices[billing.billingInterval];
  const targetPriceId = await resolveConfiguredSubscriptionPriceId(
    input.targetPlanTier,
    billing.billingInterval,
    targetPlan
  );
  const configuration = await resolvePlanChangePortalConfiguration();
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    configuration,
    return_url: input.returnUrl,
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: subscription.stripeSubscriptionId,
        items: [{
          id: billing.coreItem.id,
          price: targetPriceId,
          quantity: 1
        }]
      },
      after_completion: {
        type: "redirect",
        redirect: {
          return_url: `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}planChanged=1`
        }
      }
    }
  });
  return { url: session.url };
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
  const coreInterval = coreItem?.price.recurring?.interval;
  const coreAmount = coreItem?.price.unit_amount;
  const recognizedSinglePrice =
    (coreInterval === "month" && coreAmount === MEMBERSHIP_PLANS.single.prices.monthly.unitAmount) ||
    (coreInterval === "year" && coreAmount === MEMBERSHIP_PLANS.single.prices.yearly.unitAmount);
  const recognizedStandardPrice =
    (coreInterval === "month" && coreAmount === MEMBERSHIP_PLANS.standard.prices.monthly.unitAmount) ||
    (coreInterval === "year" && coreAmount === MEMBERSHIP_PLANS.standard.prices.yearly.unitAmount);
  const planTier = recognizedSinglePrice
    ? "single"
    : recognizedStandardPrice
      ? "standard"
      : isMembershipTier(subscription.metadata.planTier)
        ? subscription.metadata.planTier
        : inferMembershipTierFromAmount(coreAmount, coreInterval);

  return {
    planTier,
    billingInterval,
    coreItem,
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
  const introductoryOffer = subscription.metadata.introductoryOffer ?? null;
  const introductoryOfferEndsAt = (
    introductoryOffer === INTRODUCTORY_OFFER_KEY ||
    (introductoryOffer === "first_month_6_usd" && status === "trialing")
  )
    ? billing.currentPeriodEnd
    : null;

  await db.transaction(async (tx) => {
    await tx
      .insert(subscriptions)
      .values({
        accountId,
        status,
        planTier: billing.planTier,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        billingInterval: billing.billingInterval,
        introductoryOffer,
        introductoryOfferEndsAt,
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
          planTier: billing.planTier,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          billingInterval: billing.billingInterval,
          introductoryOffer,
          introductoryOfferEndsAt: sql`coalesce(
            ${subscriptions.introductoryOfferEndsAt},
            excluded.introductory_offer_ends_at
          )`,
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

async function provisionPublicCoreSubscriptionFromCheckoutSession(session: Stripe.Checkout.Session) {
  if (
    session.mode !== "subscription" ||
    session.metadata?.checkoutKind !== "public_core_subscription"
  ) {
    throw new Error("This is not a public Treeschool membership checkout.");
  }
  if (
    session.status !== "complete" ||
    !["paid", "no_payment_required"].includes(session.payment_status)
  ) {
    throw new Error("Checkout has not been completed yet.");
  }

  const email = session.customer_details?.email ?? session.customer_email;
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;
  if (!email || !subscriptionId) {
    throw new Error("The completed checkout is missing its customer details.");
  }

  const parent = await ensureProvisionalParentAccountForEmail(email);
  const stripe = getStripe();
  const existingSubscription = await stripe.subscriptions.retrieve(subscriptionId);
  const metadata = {
    ...existingSubscription.metadata,
    accountId: parent.accountId,
    userId: parent.userId,
    checkoutKind: "core_subscription"
  };
  const updatedSubscription = await stripe.subscriptions.update(subscriptionId, { metadata });
  await stripe.checkout.sessions.update(session.id, {
    metadata: {
      ...session.metadata,
      accountId: parent.accountId,
      userId: parent.userId,
      checkoutKind: "core_subscription",
      checkoutSource: "public_pricing"
    }
  });
  await upsertSubscriptionFromStripeSubscription(updatedSubscription);

  return {
    sessionId: session.id,
    email: parent.email,
    accountId: parent.accountId
  };
}

export async function completePublicCoreSubscriptionCheckout(sessionId: string) {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.checkoutSource === "public_pricing" && session.metadata?.accountId) {
    const email = session.customer_details?.email ?? session.customer_email;
    if (!email) throw new Error("The completed checkout is missing its customer email.");
    return {
      sessionId: session.id,
      email,
      accountId: session.metadata.accountId
    };
  }
  return provisionPublicCoreSubscriptionFromCheckoutSession(session);
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
    if (subscription.metadata.checkoutKind === "public_core_subscription") {
      // The checkout.session.completed event has the purchaser email needed to
      // create and link the local parent account. Stripe will send another
      // subscription update after that link is established.
      return;
    }
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

async function countReservedTeacherUsers(accountId: string) {
  const now = new Date();
  const [[activeTeacherUsers], [pendingTeacherUsers]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::integer` })
      .from(profiles)
      .where(and(
        eq(profiles.accountId, accountId),
        eq(profiles.role, "PARENT"),
        eq(profiles.accountRole, "TEACHER")
      )),
    db
      .select({ count: sql<number>`count(*)::integer` })
      .from(accountInvitations)
      .where(and(
        eq(accountInvitations.accountId, accountId),
        eq(accountInvitations.status, "PENDING"),
        gt(accountInvitations.expiresAt, now)
      ))
  ]);
  return Number(activeTeacherUsers?.count ?? 0) + Number(pendingTeacherUsers?.count ?? 0);
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
      planTier: subscriptions.planTier,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      billingInterval: subscriptions.billingInterval,
      introductoryOffer: subscriptions.introductoryOffer,
      introductoryOfferEndsAt: subscriptions.introductoryOfferEndsAt,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      additionalStudentQuantity: subscriptions.additionalStudentQuantity
    })
    .from(subscriptions)
    .where(eq(subscriptions.accountId, context.accountId))
    .limit(1);
  const studentCount = await countStudentProfiles(context.accountId);

  const membership = getMembershipPlan(subscription?.planTier ?? "standard");
  const paidStudentCapacity = membership.includedStudentCount + (subscription?.additionalStudentQuantity ?? 0);
  if (!subscription?.stripeSubscriptionId || studentCount < paidStudentCapacity) {
    const profile = await createStudentProfile({
      ...input.student,
      parentUserId: input.parentUserId
    });
    return { kind: "created" as const, profile };
  }

  if (subscription.planTier === "single") {
    throw new Error(
      `Single includes one student. Upgrade to Standard from Billing before adding ${input.student.firstName}.`
    );
  }
  if (!subscription.stripeCustomerId || !["trialing", "active"].includes(subscription.status)) {
    throw new Error("Restore your Treeschool membership before adding another student.");
  }
  if (subscription.cancelAtPeriodEnd) {
    throw new Error("Resume your Treeschool membership before adding another student seat.");
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
  const isIntroductoryMonth = isIntroductoryOfferActive(subscription);
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
    studentCount + 1 - membership.includedStudentCount
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
    const stripeSession = await getStripe().checkout.sessions.create(withTreeschoolCheckoutBranding({
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
    }));
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
        ? `Standard includes three students. Add ${input.student.firstName} for ${formatUsd(amountInCents)} today, then ${formatUsd(additionalPlan.unitAmount)}/${recurringLabel} starting ${renewalLabel}. The profile appears after payment succeeds.`
        : `Standard includes three students. Add ${input.student.firstName} for ${formatUsd(amountInCents)} today (prorated), then ${formatUsd(additionalPlan.unitAmount)}/${recurringLabel} starting ${renewalLabel}. The profile appears after payment succeeds.`
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

type FirstGradePostCheckoutVariant = "full" | "starter";
type FirstGradePostCheckoutAction =
  | "accept_full"
  | "decline_full"
  | "accept_starter"
  | "decline_starter";

function stripeObjectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function firstGradePostCheckoutThankYouPath(
  sourceKind: string,
  sourceCheckoutSessionId: string
) {
  if (sourceKind === "public_core_subscription") {
    return `/membership/complete?session_id=${encodeURIComponent(sourceCheckoutSessionId)}`;
  }
  if (sourceKind === "core_subscription") {
    return "/p/dashboard?checkout=success";
  }
  return `/bookstore/success?session_id=${encodeURIComponent(sourceCheckoutSessionId)}`;
}

async function resolvePostCheckoutPaymentMethod(
  session: Stripe.Checkout.Session,
  customerId: string | null
) {
  const stripe = getStripe();
  const paymentIntentId = stripeObjectId(session.payment_intent);
  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paymentMethodId = stripeObjectId(paymentIntent.payment_method);
    if (paymentMethodId) return paymentMethodId;
  }

  const subscriptionId = stripeObjectId(session.subscription);
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const paymentMethodId = stripeObjectId(subscription.default_payment_method);
    if (paymentMethodId) return paymentMethodId;
  }

  if (customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      return stripeObjectId(customer.invoice_settings.default_payment_method);
    }
  }
  return null;
}

async function resolveVerifiedFirstGradeCheckout(sourceCheckoutSessionId: string) {
  const stripe = getStripe();
  let session = await stripe.checkout.sessions.retrieve(sourceCheckoutSessionId);
  const sourceKind = session.metadata?.checkoutSource === "public_pricing"
    ? "public_core_subscription"
    : session.metadata?.checkoutKind ?? "";
  if (
    session.metadata?.funnelKey !== FIRST_GRADE_FUNNEL_KEY ||
    !["public_core_subscription", "core_subscription", "native_workbook_bundle"].includes(sourceKind)
  ) {
    throw new Error("This checkout is not eligible for the first-grade curriculum offer.");
  }
  if (
    session.status !== "complete" ||
    !["paid", "no_payment_required"].includes(session.payment_status)
  ) {
    throw new Error("The original checkout has not been completed.");
  }

  if (sourceKind === "public_core_subscription") {
    await completePublicCoreSubscriptionCheckout(sourceCheckoutSessionId);
    session = await stripe.checkout.sessions.retrieve(sourceCheckoutSessionId);
  }

  const email = (
    session.customer_details?.email ??
    session.customer_email ??
    session.metadata?.deliveryEmail ??
    ""
  ).trim().toLowerCase();
  if (!email) throw new Error("The completed checkout has no customer email.");
  const accountId = session.metadata?.accountId ?? session.client_reference_id ?? null;
  const customerId = stripeObjectId(session.customer);
  const paymentMethodId = await resolvePostCheckoutPaymentMethod(session, customerId);

  return {
    session,
    sourceKind,
    email,
    accountId,
    customerId,
    paymentMethodId,
    thankYouPath: firstGradePostCheckoutThankYouPath(sourceKind, sourceCheckoutSessionId)
  };
}

async function resolveVerifiedCompletedCheckout(sourceCheckoutSessionId: string) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sourceCheckoutSessionId);
  if (
    session.status !== "complete" ||
    !["paid", "no_payment_required"].includes(session.payment_status)
  ) {
    throw new Error("The original checkout has not been completed.");
  }
  const email = (
    session.customer_details?.email ??
    session.customer_email ??
    session.metadata?.deliveryEmail ??
    ""
  ).trim().toLowerCase();
  if (!email) throw new Error("The completed checkout has no customer email.");
  const accountId = session.metadata?.accountId ?? session.client_reference_id ?? null;
  const customerId = stripeObjectId(session.customer);
  const paymentMethodId = await resolvePostCheckoutPaymentMethod(session, customerId);
  return { session, email, accountId, customerId, paymentMethodId };
}

function appendSourceCheckoutSession(path: string, sourceCheckoutSessionId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}source_session_id=${encodeURIComponent(sourceCheckoutSessionId)}`;
}

async function createFunnelMembershipOfferCheckout(input: {
  product: FunnelMembershipProduct;
  source: Awaited<ReturnType<typeof resolveVerifiedCompletedCheckout>>;
  sourceCheckoutSessionId: string;
  offer: Awaited<ReturnType<typeof resolvePublicFunnelOneClickOffer>>;
  offerKey: string;
  appBaseUrl: string;
  cancelPath: string;
  nextPath: string;
}) {
  if (
    input.source.session.mode === "subscription" ||
    ["core_subscription", "public_core_subscription"].includes(
      input.source.session.metadata?.checkoutKind ?? ""
    )
  ) {
    throw new Error("This order already includes a Treeschool membership.");
  }

  const [matchingParent] = input.source.accountId
    ? await db.select({
        accountId: profiles.accountId,
        userId: profiles.userId
      }).from(profiles).where(and(
        eq(profiles.accountId, input.source.accountId),
        eq(profiles.role, "PARENT")
      )).limit(1)
    : await db.select({
        accountId: profiles.accountId,
        userId: profiles.userId
      }).from(users)
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(and(
          eq(users.email, input.source.email),
          eq(profiles.role, "PARENT")
        ))
        .limit(1);
  const accountId = matchingParent?.accountId ?? input.source.accountId;
  const userId = matchingParent?.userId ?? input.source.session.metadata?.userId ?? null;
  const [existingSubscription] = accountId
    ? await db.select({
        stripeCustomerId: subscriptions.stripeCustomerId,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        status: subscriptions.status
      }).from(subscriptions).where(eq(subscriptions.accountId, accountId)).limit(1)
    : [];
  if (existingSubscription && ["trialing", "active", "past_due"].includes(existingSubscription.status)) {
    throw new Error("This family already has a Treeschool membership.");
  }

  const membership = getMembershipPlan(input.product.planTier);
  const [studentUsage] = accountId
    ? await db.select({ count: sql<number>`count(*)::integer` })
        .from(profiles)
        .where(and(eq(profiles.accountId, accountId), eq(profiles.role, "STUDENT")))
    : [{ count: 0 }];
  const activeStudentCount = Number(studentUsage?.count ?? 0);
  if (input.product.planTier === "single" && activeStudentCount > membership.includedStudentCount) {
    throw new Error("Treeschool Single supports one student. Choose Standard for this family.");
  }
  const additionalStudentQuantity = Math.max(
    0,
    activeStudentCount - membership.includedStudentCount
  );
  const additionalStudentPriceId = additionalStudentQuantity > 0
    ? await resolveAdditionalStudentPriceId(input.product.billingInterval)
    : undefined;
  const plan = membership.prices[input.product.billingInterval];
  const configuredPriceId = await resolveConfiguredSubscriptionPriceId(
    input.product.planTier,
    input.product.billingInterval,
    plan
  );
  const includesMonthlyIntro =
    input.product.billingInterval === "monthly" &&
    !existingSubscription?.stripeSubscriptionId;
  const introductoryCouponId = includesMonthlyIntro
    ? await resolveIntroductoryCouponId({
        planTier: input.product.planTier,
        monthlyPlanAmount: membership.prices.monthly.unitAmount,
        additionalStudentQuantity
      })
    : undefined;
  const checkoutKind = accountId ? "core_subscription" : "public_core_subscription";
  const metadata = {
    ...(accountId ? { accountId } : {}),
    ...(userId ? { userId } : {}),
    planTier: input.product.planTier,
    billingInterval: input.product.billingInterval,
    additionalStudentQuantity: String(additionalStudentQuantity),
    checkoutKind,
    checkoutSource: "funnel_subscription_offer",
    sourceCheckoutSessionId: input.sourceCheckoutSessionId,
    funnelId: input.offer.funnelId,
    funnelSlug: input.offer.funnelSlug,
    funnelStepId: input.offer.stepId,
    postCheckoutOfferKey: input.offerKey,
    subscriptionProductId: input.product.id,
    deliveryEmail: input.source.email,
    ...(includesMonthlyIntro ? { introductoryOffer: INTRODUCTORY_OFFER_KEY } : {})
  };
  const customerId = existingSubscription?.stripeCustomerId ?? input.source.customerId;
  const session = await getStripe().checkout.sessions.create(withTreeschoolCheckoutBranding({
    mode: "subscription",
    customer: customerId ?? undefined,
    customer_email: customerId ? undefined : input.source.email,
    client_reference_id: accountId ?? undefined,
    success_url: `${input.appBaseUrl}${input.nextPath}`,
    cancel_url: `${input.appBaseUrl}${appendSourceCheckoutSession(input.cancelPath, input.sourceCheckoutSessionId)}`,
    allow_promotion_codes: introductoryCouponId ? undefined : true,
    discounts: introductoryCouponId ? [{ coupon: introductoryCouponId }] : undefined,
    custom_text: MEMBERSHIP_CHECKOUT_CUSTOM_TEXT,
    line_items: [
      buildCoreSubscriptionLineItem(input.product.planTier, plan, configuredPriceId),
      ...(additionalStudentPriceId
        ? [buildAdditionalStudentSubscriptionLineItem(additionalStudentPriceId, additionalStudentQuantity)]
        : [])
    ],
    metadata,
    subscription_data: { metadata }
  }), {
    idempotencyKey: `funnel-membership:${input.sourceCheckoutSessionId}:${input.offer.stepId}:${input.product.id}`
  });
  await db.update(postCheckoutOffers).set({
    state: "checkout_required",
    selectedVariant: input.product.id,
    stripeCheckoutSessionId: session.id,
    lastError: null,
    updatedAt: new Date()
  }).where(and(
    eq(postCheckoutOffers.sourceCheckoutSessionId, input.sourceCheckoutSessionId),
    eq(postCheckoutOffers.offerKey, input.offerKey)
  ));
  return { status: "redirect" as const, url: session.url };
}

export async function decideFunnelOneClickOffer(input: {
  sourceCheckoutSessionId: string;
  funnelStepId: string;
  appBaseUrl: string;
  cancelPath: string;
}) {
  const offer = await resolvePublicFunnelOneClickOffer({ stepId: input.funnelStepId });
  const source = await resolveVerifiedCompletedCheckout(input.sourceCheckoutSessionId);
  const membershipProduct = getFunnelMembershipProduct(offer.productId);

  const offerKey = `funnel-step:${offer.stepId}`;
  const [record] = await db.insert(postCheckoutOffers).values({
    sourceCheckoutSessionId: input.sourceCheckoutSessionId,
    sourceCheckoutKind: source.session.metadata?.checkoutKind ?? "funnel_order",
    offerKey,
    accountId: source.accountId,
    email: source.email,
    stripeCustomerId: source.customerId,
    stripePaymentMethodId: source.paymentMethodId,
    state: "shown",
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: [postCheckoutOffers.sourceCheckoutSessionId, postCheckoutOffers.offerKey],
    set: {
      accountId: source.accountId,
      email: source.email,
      stripeCustomerId: source.customerId,
      stripePaymentMethodId: source.paymentMethodId,
      updatedAt: new Date()
    }
  }).returning({
    state: postCheckoutOffers.state,
    stripeCheckoutSessionId: postCheckoutOffers.stripeCheckoutSessionId
  });

  const nextPath = offer.nextHref
    ? appendSourceCheckoutSession(offer.nextHref, input.sourceCheckoutSessionId)
    : `/bookstore/success?session_id=${encodeURIComponent(input.sourceCheckoutSessionId)}`;
  if (record.state === "accepted") {
    return { status: "complete" as const, nextPath };
  }
  if (record.state === "checkout_required" && record.stripeCheckoutSessionId) {
    const existing = await getStripe().checkout.sessions.retrieve(record.stripeCheckoutSessionId).catch(() => null);
    if (existing?.status === "open" && existing.url) {
      return { status: "redirect" as const, url: existing.url };
    }
  }
  const cancelPath = input.cancelPath.startsWith("/") ? input.cancelPath : "/";
  if (membershipProduct) {
    return createFunnelMembershipOfferCheckout({
      product: membershipProduct,
      source,
      sourceCheckoutSessionId: input.sourceCheckoutSessionId,
      offer,
      offerKey,
      appBaseUrl: input.appBaseUrl,
      cancelPath,
      nextPath
    });
  }

  const [selection] = await resolveNativeWorkbookCheckoutSelections({
    ids: [offer.productId],
    userId: null
  });
  if (!selection) throw new Error("This offer is no longer available.");

  const metadata = {
    checkoutKind: "native_workbook_cart",
    checkoutSource: "funnel_one_click_offer",
    sourceCheckoutSessionId: input.sourceCheckoutSessionId,
    funnelId: offer.funnelId,
    funnelSlug: offer.funnelSlug,
    funnelStepId: offer.stepId,
    postCheckoutOfferKey: offerKey,
    itemCount: "1",
    deliveryEmail: source.email,
    ...(source.accountId ? { accountId: source.accountId } : {}),
    kind0: selection.catalogKind,
    item0: selection.id,
    ...(selection.catalogKind === "workbook"
      ? { version0: selection.activeVersionId ?? "" }
      : { versions0: selection.memberVersionIds.join("|") }),
    amount0: String(selection.priceInCents)
  };

  if (source.customerId && source.paymentMethodId) {
    try {
      const paymentIntent = await getStripe().paymentIntents.create({
        amount: selection.priceInCents,
        currency: selection.currencyCode.toLowerCase(),
        customer: source.customerId,
        payment_method: source.paymentMethodId,
        confirm: true,
        off_session: true,
        description: `Treeschool ${selection.title}`,
        metadata: { ...metadata, directTreeschoolSale: "true" }
      }, { idempotencyKey: `funnel-one-click:${input.sourceCheckoutSessionId}:${offer.stepId}:${selection.id}` });
      if (paymentIntent.status === "succeeded" || paymentIntent.status === "processing") {
        if (paymentIntent.status === "succeeded") {
          await fulfillNativeWorkbookPaymentIntent(paymentIntent);
        }
        await db.update(postCheckoutOffers).set({
          state: "accepted",
          selectedVariant: selection.id,
          stripePaymentIntentId: paymentIntent.id,
          stripeCheckoutSessionId: null,
          lastError: null,
          updatedAt: new Date()
        }).where(and(
          eq(postCheckoutOffers.sourceCheckoutSessionId, input.sourceCheckoutSessionId),
          eq(postCheckoutOffers.offerKey, offerKey)
        ));
        return { status: "complete" as const, nextPath };
      }
      if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(paymentIntent.status)) {
        await getStripe().paymentIntents.cancel(paymentIntent.id).catch(() => undefined);
      }
    } catch (error) {
      await db.update(postCheckoutOffers).set({
        lastError: error instanceof Error ? error.message.slice(0, 1000) : "Saved payment method could not be charged.",
        updatedAt: new Date()
      }).where(and(
        eq(postCheckoutOffers.sourceCheckoutSessionId, input.sourceCheckoutSessionId),
        eq(postCheckoutOffers.offerKey, offerKey)
      ));
    }
  }

  const successUrl = `${input.appBaseUrl}${nextPath}`;
  const session = await getStripe().checkout.sessions.create(withTreeschoolCheckoutBranding({
    mode: "payment",
    customer: source.customerId ?? undefined,
    customer_email: source.customerId ? undefined : source.email,
    client_reference_id: source.accountId ?? undefined,
    success_url: successUrl,
    cancel_url: `${input.appBaseUrl}${appendSourceCheckoutSession(cancelPath, input.sourceCheckoutSessionId)}`,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: selection.currencyCode.toLowerCase(),
        unit_amount: selection.priceInCents,
        product_data: {
          name: selection.title,
          description: selection.description.slice(0, 500)
        }
      }
    }],
    metadata,
    payment_intent_data: { metadata }
  }), { idempotencyKey: `funnel-one-click-fallback:${input.sourceCheckoutSessionId}:${offer.stepId}:${selection.id}` });
  await db.update(postCheckoutOffers).set({
    state: "checkout_required",
    selectedVariant: selection.id,
    stripeCheckoutSessionId: session.id,
    lastError: null,
    updatedAt: new Date()
  }).where(and(
    eq(postCheckoutOffers.sourceCheckoutSessionId, input.sourceCheckoutSessionId),
    eq(postCheckoutOffers.offerKey, offerKey)
  ));
  return { status: "redirect" as const, url: session.url };
}

export async function getFirstGradePostCheckoutOffer(sourceCheckoutSessionId: string) {
  const source = await resolveVerifiedFirstGradeCheckout(sourceCheckoutSessionId);
  const offer = await resolveJapanesePostCheckoutWorkbookOffer({
    accountId: source.accountId,
    email: source.email
  });
  const [record] = await db
    .insert(postCheckoutOffers)
    .values({
      sourceCheckoutSessionId,
      sourceCheckoutKind: source.sourceKind,
      offerKey: FIRST_GRADE_JAPANESE_OFFER_KEY,
      accountId: source.accountId,
      email: source.email,
      stripeCustomerId: source.customerId,
      stripePaymentMethodId: source.paymentMethodId,
      state: "shown",
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: [
        postCheckoutOffers.sourceCheckoutSessionId,
        postCheckoutOffers.offerKey
      ],
      set: {
        accountId: source.accountId,
        email: source.email,
        stripeCustomerId: source.customerId,
        stripePaymentMethodId: source.paymentMethodId,
        updatedAt: new Date()
      }
    })
    .returning({
      state: postCheckoutOffers.state,
      selectedVariant: postCheckoutOffers.selectedVariant
    });

  return {
    sourceCheckoutSessionId,
    offer,
    state: record.state,
    selectedVariant: record.selectedVariant,
    thankYouPath: source.thankYouPath
  };
}

function postCheckoutWorkbookMetadata(input: {
  sourceCheckoutSessionId: string;
  accountId: string | null;
  email: string;
  variant: FirstGradePostCheckoutVariant;
  items: NonNullable<Awaited<ReturnType<typeof resolveJapanesePostCheckoutWorkbookOffer>>["full"]>["items"];
}) {
  return {
    checkoutKind: "native_workbook_cart",
    checkoutSource: "post_checkout_offer",
    sourceCheckoutSessionId: input.sourceCheckoutSessionId,
    postCheckoutOfferKey: FIRST_GRADE_JAPANESE_OFFER_KEY,
    postCheckoutVariant: input.variant,
    itemCount: String(input.items.length),
    deliveryEmail: input.email,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...Object.fromEntries(input.items.flatMap((item, index) => [
      [`kind${index}`, "workbook"],
      [`item${index}`, item.id],
      [`version${index}`, item.versionId],
      [`amount${index}`, String(item.priceInCents)]
    ]))
  };
}

async function createPostCheckoutFallbackSession(input: {
  sourceCheckoutSessionId: string;
  source: Awaited<ReturnType<typeof resolveVerifiedFirstGradeCheckout>>;
  variant: FirstGradePostCheckoutVariant;
  selectedOffer: NonNullable<Awaited<ReturnType<typeof resolveJapanesePostCheckoutWorkbookOffer>>["full"]>;
  successUrl: string;
  cancelUrl: string;
}) {
  const metadata = postCheckoutWorkbookMetadata({
    sourceCheckoutSessionId: input.sourceCheckoutSessionId,
    accountId: input.source.accountId,
    email: input.source.email,
    variant: input.variant,
    items: input.selectedOffer.items
  });
  const session = await getStripe().checkout.sessions.create(
    withTreeschoolCheckoutBranding({
      mode: "payment",
      customer: input.source.customerId ?? undefined,
      customer_email: input.source.customerId ? undefined : input.source.email,
      client_reference_id: input.source.accountId ?? undefined,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: input.selectedOffer.items.map((item) => ({
        quantity: 1,
        price_data: {
          currency: item.currencyCode.toLowerCase(),
          unit_amount: item.priceInCents,
          product_data: {
            name: item.title,
            description: item.description.slice(0, 500)
          }
        }
      })),
      metadata,
      payment_intent_data: { metadata }
    }),
    { idempotencyKey: `post-checkout-fallback:${input.sourceCheckoutSessionId}:${input.variant}` }
  );
  await db.update(postCheckoutOffers).set({
    state: "checkout_required",
    selectedVariant: input.variant,
    stripeCheckoutSessionId: session.id,
    lastError: null,
    updatedAt: new Date()
  }).where(and(
    eq(postCheckoutOffers.sourceCheckoutSessionId, input.sourceCheckoutSessionId),
    eq(postCheckoutOffers.offerKey, FIRST_GRADE_JAPANESE_OFFER_KEY)
  ));
  return { status: "redirect" as const, url: session.url };
}

async function expireOpenPostCheckoutSession(sourceCheckoutSessionId: string) {
  const [record] = await db.select({
    stripeCheckoutSessionId: postCheckoutOffers.stripeCheckoutSessionId
  }).from(postCheckoutOffers).where(and(
    eq(postCheckoutOffers.sourceCheckoutSessionId, sourceCheckoutSessionId),
    eq(postCheckoutOffers.offerKey, FIRST_GRADE_JAPANESE_OFFER_KEY)
  )).limit(1);
  if (!record?.stripeCheckoutSessionId) return;
  const session = await getStripe().checkout.sessions
    .retrieve(record.stripeCheckoutSessionId)
    .catch(() => null);
  if (session?.status === "open") {
    await getStripe().checkout.sessions.expire(session.id).catch(() => undefined);
  }
}

export async function decideFirstGradePostCheckoutOffer(input: {
  sourceCheckoutSessionId: string;
  action: FirstGradePostCheckoutAction;
  successUrl: string;
  cancelUrl: string;
}) {
  const source = await resolveVerifiedFirstGradeCheckout(input.sourceCheckoutSessionId);
  const current = await getFirstGradePostCheckoutOffer(input.sourceCheckoutSessionId);
  if (["accepted", "downsell_accepted"].includes(current.state)) {
    return { status: "complete" as const, thankYouPath: source.thankYouPath };
  }

  if (input.action === "decline_full") {
    await expireOpenPostCheckoutSession(input.sourceCheckoutSessionId);
    const state = current.offer.starter ? "downsell_shown" : "declined";
    await db.update(postCheckoutOffers).set({
      state,
      stripeCheckoutSessionId: null,
      updatedAt: new Date()
    }).where(and(
      eq(postCheckoutOffers.sourceCheckoutSessionId, input.sourceCheckoutSessionId),
      eq(postCheckoutOffers.offerKey, FIRST_GRADE_JAPANESE_OFFER_KEY)
    ));
    return current.offer.starter
      ? { status: "downsell" as const }
      : { status: "complete" as const, thankYouPath: source.thankYouPath };
  }

  if (input.action === "decline_starter") {
    await expireOpenPostCheckoutSession(input.sourceCheckoutSessionId);
    await db.update(postCheckoutOffers).set({
      state: "declined",
      stripeCheckoutSessionId: null,
      updatedAt: new Date()
    }).where(and(
      eq(postCheckoutOffers.sourceCheckoutSessionId, input.sourceCheckoutSessionId),
      eq(postCheckoutOffers.offerKey, FIRST_GRADE_JAPANESE_OFFER_KEY)
    ));
    return { status: "complete" as const, thankYouPath: source.thankYouPath };
  }

  const variant: FirstGradePostCheckoutVariant =
    input.action === "accept_starter" ? "starter" : "full";
  if (
    variant === "starter" &&
    !["downsell_shown", "checkout_required"].includes(current.state)
  ) {
    throw new Error("The starter offer is not available at this stage.");
  }
  if (
    variant === "full" &&
    (
      current.state === "downsell_shown" ||
      (current.state === "checkout_required" && current.selectedVariant === "starter")
    )
  ) {
    throw new Error("The full offer is no longer available at this stage.");
  }
  const selectedOffer = variant === "starter" ? current.offer.starter : current.offer.full;
  if (!selectedOffer) {
    return { status: "complete" as const, thankYouPath: source.thankYouPath };
  }

  if (!source.customerId || !source.paymentMethodId) {
    return createPostCheckoutFallbackSession({
      sourceCheckoutSessionId: input.sourceCheckoutSessionId,
      source,
      variant,
      selectedOffer,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl
    });
  }

  const metadata = postCheckoutWorkbookMetadata({
    sourceCheckoutSessionId: input.sourceCheckoutSessionId,
    accountId: source.accountId,
    email: source.email,
    variant,
    items: selectedOffer.items
  });
  try {
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: selectedOffer.priceInCents,
      currency: selectedOffer.currencyCode.toLowerCase(),
      customer: source.customerId,
      payment_method: source.paymentMethodId,
      confirm: true,
      off_session: true,
      description: `Treeschool ${selectedOffer.title}`,
      metadata: { ...metadata, directTreeschoolSale: "true" }
    }, {
      idempotencyKey: `post-checkout-offer:${input.sourceCheckoutSessionId}:${variant}`
    });
    if (paymentIntent.status === "succeeded") {
      await fulfillNativeWorkbookPaymentIntent(paymentIntent);
      await db.update(postCheckoutOffers).set({
        state: variant === "starter" ? "downsell_accepted" : "accepted",
        selectedVariant: variant,
        stripePaymentIntentId: paymentIntent.id,
        stripeCheckoutSessionId: null,
        lastError: null,
        updatedAt: new Date()
      }).where(and(
        eq(postCheckoutOffers.sourceCheckoutSessionId, input.sourceCheckoutSessionId),
        eq(postCheckoutOffers.offerKey, FIRST_GRADE_JAPANESE_OFFER_KEY)
      ));
      return { status: "complete" as const, thankYouPath: source.thankYouPath };
    }
    if (paymentIntent.status === "processing") {
      await db.update(postCheckoutOffers).set({
        state: variant === "starter" ? "downsell_accepted" : "accepted",
        selectedVariant: variant,
        stripePaymentIntentId: paymentIntent.id,
        stripeCheckoutSessionId: null,
        lastError: null,
        updatedAt: new Date()
      }).where(and(
        eq(postCheckoutOffers.sourceCheckoutSessionId, input.sourceCheckoutSessionId),
        eq(postCheckoutOffers.offerKey, FIRST_GRADE_JAPANESE_OFFER_KEY)
      ));
      return { status: "complete" as const, thankYouPath: source.thankYouPath };
    }
    if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(paymentIntent.status)) {
      await getStripe().paymentIntents.cancel(paymentIntent.id).catch(() => undefined);
    }
  } catch (error) {
    await db.update(postCheckoutOffers).set({
      lastError: error instanceof Error ? error.message.slice(0, 1000) : "Saved payment method could not be charged.",
      updatedAt: new Date()
    }).where(and(
      eq(postCheckoutOffers.sourceCheckoutSessionId, input.sourceCheckoutSessionId),
      eq(postCheckoutOffers.offerKey, FIRST_GRADE_JAPANESE_OFFER_KEY)
    ));
  }

  return createPostCheckoutFallbackSession({
    sourceCheckoutSessionId: input.sourceCheckoutSessionId,
    source,
    variant,
    selectedOffer,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl
  });
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
    if (event.data.object.metadata?.checkoutKind === "public_core_subscription") {
      await provisionPublicCoreSubscriptionFromCheckoutSession(event.data.object);
    } else {
      await upsertSubscriptionFromCheckoutSession(event.data.object);
    }
    await fulfillAdditionalStudentCheckout(event.data.object);
    await fulfillNativeWorkbookCheckout(event.data.object);
    if (
      event.data.object.metadata?.checkoutSource === "post_checkout_offer" ||
      event.data.object.metadata?.checkoutSource === "funnel_one_click_offer" ||
      event.data.object.metadata?.checkoutSource === "funnel_subscription_offer"
    ) {
      const isManagedFunnelOffer = [
        "funnel_one_click_offer",
        "funnel_subscription_offer"
      ].includes(event.data.object.metadata.checkoutSource);
      await db.update(postCheckoutOffers).set({
        state: !isManagedFunnelOffer && event.data.object.metadata.postCheckoutVariant === "starter"
          ? "downsell_accepted"
          : "accepted",
        selectedVariant: isManagedFunnelOffer
          ? event.data.object.metadata.subscriptionProductId ?? event.data.object.metadata.item0 ?? null
          : event.data.object.metadata.postCheckoutVariant ?? null,
        stripePaymentIntentId: stripeObjectId(event.data.object.payment_intent),
        stripeCheckoutSessionId: null,
        lastError: null,
        updatedAt: new Date()
      }).where(and(
        eq(
          postCheckoutOffers.sourceCheckoutSessionId,
          event.data.object.metadata.sourceCheckoutSessionId ?? ""
        ),
        eq(
          postCheckoutOffers.offerKey,
          isManagedFunnelOffer
            ? event.data.object.metadata.postCheckoutOfferKey ?? ""
            : FIRST_GRADE_JAPANESE_OFFER_KEY
        )
      ));
    }
    await reportMetaCheckoutPurchase(
      event.data.object,
      event.created
    ).catch((error) => {
      console.error(
        "Meta purchase reporting failed after checkout completion:",
        error instanceof Error ? error.message : "Unknown Meta API error."
      );
    });
    await recordStripeFunnelSale({
      checkoutSessionId: event.data.object.id,
      paymentIntentId: stripeObjectId(event.data.object.payment_intent),
      email: event.data.object.customer_details?.email ?? event.data.object.customer_email,
      orderKind:
        event.data.object.metadata?.checkoutKind ??
        event.data.object.metadata?.checkoutSource ??
        null,
      amountSubtotalCents: event.data.object.amount_subtotal,
      amountTotalCents: event.data.object.amount_total,
      currency: event.data.object.currency,
      metadata: event.data.object.metadata,
      purchasedAt: new Date(event.created * 1000)
    }).catch((error) => {
      console.error(
        "Funnel sale attribution failed after checkout completion:",
        error instanceof Error ? error.message : "Unknown funnel attribution error."
      );
    });
    await notifyCheckoutSale({
      stripe,
      stripeEventId: event.id,
      eventCreated: event.created,
      session: event.data.object
    });
  }

  if (event.type === "payment_intent.succeeded") {
    await fulfillNativeWorkbookPaymentIntent(event.data.object);
    await notifyDirectPaymentIntentSale({
      stripeEventId: event.id,
      eventCreated: event.created,
      paymentIntent: event.data.object
    });
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    await fulfillAdditionalStudentCheckout(event.data.object);
    await reportMetaCheckoutPurchase(
      event.data.object,
      event.created
    ).catch((error) => {
      console.error(
        "Meta purchase reporting failed after asynchronous payment:",
        error instanceof Error ? error.message : "Unknown Meta API error."
      );
    });
    await recordStripeFunnelSale({
      checkoutSessionId: event.data.object.id,
      paymentIntentId: stripeObjectId(event.data.object.payment_intent),
      email: event.data.object.customer_details?.email ?? event.data.object.customer_email,
      orderKind:
        event.data.object.metadata?.checkoutKind ??
        event.data.object.metadata?.checkoutSource ??
        null,
      amountSubtotalCents: event.data.object.amount_subtotal,
      amountTotalCents: event.data.object.amount_total,
      currency: event.data.object.currency,
      metadata: event.data.object.metadata,
      purchasedAt: new Date(event.created * 1000)
    }).catch((error) => {
      console.error(
        "Funnel sale attribution failed after asynchronous payment:",
        error instanceof Error ? error.message : "Unknown funnel attribution error."
      );
    });
    await notifyCheckoutSale({
      stripe,
      stripeEventId: event.id,
      eventCreated: event.created,
      session: event.data.object
    });
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
