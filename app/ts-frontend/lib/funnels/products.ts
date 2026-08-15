export type FunnelSubscriptionSelection = {
  planTier: "single" | "standard";
  billingInterval: "monthly" | "yearly";
};

export function parseFunnelSubscriptionProductId(
  value: unknown
): FunnelSubscriptionSelection | null {
  if (typeof value !== "string") return null;
  const match = /^membership:(single|standard):(monthly|yearly)$/.exec(value.trim());
  if (!match) return null;
  return {
    planTier: match[1] as FunnelSubscriptionSelection["planTier"],
    billingInterval: match[2] as FunnelSubscriptionSelection["billingInterval"]
  };
}
