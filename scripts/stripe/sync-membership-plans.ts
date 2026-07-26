import Stripe from "stripe";
import {
  getMembershipPlan,
  MEMBERSHIP_PLANS,
  type BillingInterval,
  type MembershipTier
} from "../../app/ts-backend/src/services/membership-plans";
import {
  getIntroductoryCouponId,
  getIntroductoryDiscountAmount
} from "../../app/ts-backend/src/services/billing-introductory-offer";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error("Set STRIPE_SECRET_KEY before syncing the membership catalog.");
}

const stripe = new Stripe(secretKey);

function expectedPrice(tier: MembershipTier, interval: BillingInterval) {
  return getMembershipPlan(tier).prices[interval];
}

async function ensureProduct(tier: MembershipTier) {
  const membership = getMembershipPlan(tier);
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find((product) =>
    product.metadata.treeschoolCatalogKey === membership.catalogKey
  );
  const attributes = {
    name: membership.productName,
    description: membership.productDescription,
    metadata: {
      treeschoolCatalogKey: membership.catalogKey,
      treeschoolPlanTier: tier
    }
  };
  if (existing) {
    return stripe.products.update(existing.id, attributes);
  }
  return stripe.products.create(attributes);
}

async function ensurePrice(
  tier: MembershipTier,
  interval: BillingInterval,
  productId: string
) {
  const membership = getMembershipPlan(tier);
  const plan = expectedPrice(tier, interval);
  const prices = await stripe.prices.list({
    lookup_keys: [plan.lookupKey],
    active: true,
    limit: 10
  });
  const existing = prices.data[0];
  if (existing) {
    const correct =
      existing.currency.toLowerCase() === "usd" &&
      existing.unit_amount === plan.unitAmount &&
      existing.recurring?.interval === plan.recurringInterval &&
      (typeof existing.product === "string" ? existing.product : existing.product.id) === productId;
    if (!correct) {
      throw new Error(`Stripe lookup key ${plan.lookupKey} already points to a different price.`);
    }
    return existing;
  }
  return stripe.prices.create({
    currency: "usd",
    unit_amount: plan.unitAmount,
    recurring: { interval: plan.recurringInterval },
    product: productId,
    lookup_key: plan.lookupKey,
    nickname: `${membership.productName} (${interval})`
  });
}

async function renameConfiguredStandardProduct(priceId: string | undefined) {
  if (!priceId) return;
  const price = await stripe.prices.retrieve(priceId);
  const productId = typeof price.product === "string" ? price.product : price.product.id;
  const membership = getMembershipPlan("standard");
  await stripe.products.update(productId, {
    name: membership.productName,
    description: membership.productDescription,
    metadata: {
      treeschoolCatalogKey: membership.catalogKey,
      treeschoolPlanTier: "standard"
    }
  });
}

async function renameLegacyFamilyProducts() {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const membership = getMembershipPlan("standard");
  const legacyProducts = products.data.filter((product) => {
    const normalizedName = product.name.toLowerCase();
    return normalizedName.includes("family plan") &&
      (normalizedName.includes("treeschool") || normalizedName.includes("treeskool"));
  });
  await Promise.all(legacyProducts.map((product) =>
    stripe.products.update(product.id, {
      name: membership.productName,
      description: membership.productDescription,
      metadata: {
        ...product.metadata,
        treeschoolLegacyPlanTier: "standard"
      }
    })
  ));
}

async function ensureIntroductoryCoupon(tier: MembershipTier) {
  const membership = getMembershipPlan(tier);
  const id = getIntroductoryCouponId({
    planTier: tier,
    additionalStudentQuantity: 0
  });
  const amountOff = getIntroductoryDiscountAmount({
    monthlyPlanAmount: membership.prices.monthly.unitAmount,
    additionalStudentQuantity: 0
  });
  try {
    const coupon = await stripe.coupons.retrieve(id);
    if (
      coupon.valid &&
      coupon.duration === "once" &&
      coupon.currency?.toLowerCase() === "usd" &&
      coupon.amount_off === amountOff
    ) {
      return coupon;
    }
    throw new Error(`Stripe coupon ${id} exists but does not match the approved introductory price.`);
  } catch (error) {
    if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || error.code !== "resource_missing") {
      throw error;
    }
  }
  return stripe.coupons.create({
    id,
    name: `Treeschool ${membership.label} introductory month`,
    duration: "once",
    currency: "usd",
    amount_off: amountOff,
    metadata: {
      treeschoolOffer: "paid_first_month_6_usd",
      planTier: tier,
      additionalStudentQuantity: "0"
    }
  });
}

await Promise.all([
  renameLegacyFamilyProducts(),
  renameConfiguredStandardProduct(process.env.STRIPE_MONTHLY_PRICE_ID),
  renameConfiguredStandardProduct(process.env.STRIPE_YEARLY_PRICE_ID)
]);

const catalog: Record<string, {
  productId: string;
  monthlyPriceId: string;
  yearlyPriceId: string;
  introductoryCouponId: string;
}> = {};

for (const tier of Object.keys(MEMBERSHIP_PLANS) as MembershipTier[]) {
  const product = await ensureProduct(tier);
  const [monthly, yearly, coupon] = await Promise.all([
    ensurePrice(tier, "monthly", product.id),
    ensurePrice(tier, "yearly", product.id),
    ensureIntroductoryCoupon(tier)
  ]);
  catalog[tier] = {
    productId: product.id,
    monthlyPriceId: monthly.id,
    yearlyPriceId: yearly.id,
    introductoryCouponId: coupon.id
  };
}

const singleMonthly = await stripe.prices.retrieve(catalog.single.monthlyPriceId);
console.log(JSON.stringify({
  mode: singleMonthly.livemode ? "live" : "test",
  catalog
}, null, 2));
