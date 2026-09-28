import { describe, expect, test } from "bun:test";
import { NotificationTypeV2 } from "@apple/app-store-server-library";
import {
  APPLE_MONTHLY_PRODUCT_ID,
  APPLE_YEARLY_PRODUCT_ID,
  deriveAppleSubscriptionStatus,
  getAppleProductInterval
} from "./apple-subscription-model";

describe("Apple subscription lifecycle", () => {
  test("maps only the configured membership products", () => {
    expect(getAppleProductInterval(APPLE_MONTHLY_PRODUCT_ID)).toBe("monthly");
    expect(getAppleProductInterval(APPLE_YEARLY_PRODUCT_ID)).toBe("yearly");
    expect(getAppleProductInterval("unknown-product")).toBeUndefined();
  });

  test("keeps an unexpired subscription active", () => {
    expect(deriveAppleSubscriptionStatus({
      transaction: { expiresDate: Date.parse("2026-10-27T00:00:00Z") },
      renewal: null,
      now: new Date("2026-09-27T00:00:00Z")
    })).toBe("active");
  });

  test("honors billing grace period during a failed renewal", () => {
    expect(deriveAppleSubscriptionStatus({
      transaction: { expiresDate: Date.parse("2026-09-26T00:00:00Z") },
      renewal: { gracePeriodExpiresDate: Date.parse("2026-10-10T00:00:00Z") },
      notificationType: NotificationTypeV2.DID_FAIL_TO_RENEW,
      now: new Date("2026-09-27T00:00:00Z")
    })).toBe("active");
  });

  test("marks a failed renewal past due after expiration and outside grace", () => {
    expect(deriveAppleSubscriptionStatus({
      transaction: { expiresDate: Date.parse("2026-09-26T00:00:00Z") },
      renewal: null,
      notificationType: NotificationTypeV2.DID_FAIL_TO_RENEW,
      now: new Date("2026-09-27T00:00:00Z")
    })).toBe("past_due");
  });

  test("revokes access for a refund even before the original expiration", () => {
    expect(deriveAppleSubscriptionStatus({
      transaction: { expiresDate: Date.parse("2026-10-27T00:00:00Z") },
      renewal: null,
      notificationType: NotificationTypeV2.REFUND,
      now: new Date("2026-09-27T00:00:00Z")
    })).toBe("canceled");
  });
});
