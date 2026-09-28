import {
  NotificationTypeV2,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload
} from "@apple/app-store-server-library";

export const APPLE_MONTHLY_PRODUCT_ID = "com.treehomeschool.app.membership.standard.monthly";
export const APPLE_YEARLY_PRODUCT_ID = "com.treehomeschool.app.membership.standard.yearly";

const PRODUCT_INTERVALS = new Map<string, "monthly" | "yearly">([
  [APPLE_MONTHLY_PRODUCT_ID, "monthly"],
  [APPLE_YEARLY_PRODUCT_ID, "yearly"]
]);

export function getAppleProductInterval(productId: string | undefined) {
  return productId ? PRODUCT_INTERVALS.get(productId) : undefined;
}

function dateFromMilliseconds(value: number | undefined) {
  return value == null ? null : new Date(value);
}

export function deriveAppleSubscriptionStatus(input: {
  transaction: JWSTransactionDecodedPayload;
  renewal: JWSRenewalInfoDecodedPayload | null;
  notificationType?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const expiresAt = dateFromMilliseconds(input.transaction.expiresDate);
  const gracePeriodEndsAt = dateFromMilliseconds(input.renewal?.gracePeriodExpiresDate);
  const revoked = Boolean(input.transaction.revocationDate) || [
    NotificationTypeV2.REFUND,
    NotificationTypeV2.REVOKE
  ].includes(input.notificationType as NotificationTypeV2);
  if (revoked) return "canceled" as const;
  if (gracePeriodEndsAt && gracePeriodEndsAt > now) return "active" as const;
  if (
    input.notificationType === NotificationTypeV2.DID_FAIL_TO_RENEW &&
    (!gracePeriodEndsAt || gracePeriodEndsAt <= now)
  ) return "past_due" as const;
  if (expiresAt && expiresAt <= now) return "canceled" as const;
  return "active" as const;
}
