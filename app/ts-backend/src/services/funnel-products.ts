import { CORE_MONTHLY_INTRO_AMOUNT } from "./billing-introductory-offer";
import {
  MEMBERSHIP_PLANS,
  type BillingInterval,
  type MembershipTier
} from "./membership-plans";

const FUNNEL_MEMBERSHIP_PRODUCT_PREFIX = "membership";

export type FunnelMembershipProduct = {
  id: string;
  productKind: "subscription";
  title: string;
  description: string;
  priceInCents: number;
  introductoryPriceInCents: number | null;
  currencyCode: "USD";
  planTier: MembershipTier;
  billingInterval: BillingInterval;
};

export function funnelMembershipProductId(
  planTier: MembershipTier,
  billingInterval: BillingInterval
) {
  return `${FUNNEL_MEMBERSHIP_PRODUCT_PREFIX}:${planTier}:${billingInterval}`;
}

export function parseFunnelMembershipProductId(
  value: unknown
): { planTier: MembershipTier; billingInterval: BillingInterval } | null {
  if (typeof value !== "string") return null;
  const match = /^membership:(single|standard):(monthly|yearly)$/.exec(value.trim());
  if (!match) return null;
  return {
    planTier: match[1] as MembershipTier,
    billingInterval: match[2] as BillingInterval
  };
}

export function listFunnelMembershipProducts(): FunnelMembershipProduct[] {
  return (["single", "standard"] as const).flatMap((planTier) => {
    const membership = MEMBERSHIP_PLANS[planTier];
    return (["monthly", "yearly"] as const).map((billingInterval) => {
      const price = membership.prices[billingInterval];
      return {
        id: funnelMembershipProductId(planTier, billingInterval),
        productKind: "subscription" as const,
        title: `Treeschool ${membership.label} membership · ${billingInterval === "yearly" ? "Annual" : "Monthly"}`,
        description: membership.productDescription,
        priceInCents: price.unitAmount,
        introductoryPriceInCents:
          billingInterval === "monthly" ? CORE_MONTHLY_INTRO_AMOUNT : null,
        currencyCode: "USD" as const,
        planTier,
        billingInterval
      };
    });
  });
}

export function getFunnelMembershipProduct(value: unknown) {
  const parsed = parseFunnelMembershipProductId(value);
  if (!parsed) return null;
  return listFunnelMembershipProducts().find((product) =>
    product.planTier === parsed.planTier &&
    product.billingInterval === parsed.billingInterval
  ) ?? null;
}
