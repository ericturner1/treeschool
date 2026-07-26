import { describe, expect, test } from "bun:test";
import {
  getIntroductoryCouponId,
  getIntroductoryDiscountAmount,
  isIntroductoryOfferActive
} from "./billing-introductory-offer";

describe("paid introductory month", () => {
  test("discounts both monthly plans to $6", () => {
    expect(getIntroductoryDiscountAmount({
      monthlyPlanAmount: 1400,
      additionalStudentQuantity: 0
    })).toBe(800);
    expect(getIntroductoryDiscountAmount({
      monthlyPlanAmount: 2000,
      additionalStudentQuantity: 0
    })).toBe(1400);
  });

  test("discounts each additional student from $5 to $2", () => {
    expect(getIntroductoryDiscountAmount({
      monthlyPlanAmount: 2000,
      additionalStudentQuantity: 2
    })).toBe(2000);
    expect(getIntroductoryCouponId({
      planTier: "standard",
      additionalStudentQuantity: 2
    })).toBe("treeschool_first_month_v2_standard_students_2");
  });

  test("is active only through the stored introductory period", () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    expect(isIntroductoryOfferActive({
      status: "active",
      introductoryOffer: "paid_first_month_6_usd",
      introductoryOfferEndsAt: new Date("2026-08-26T00:00:00.000Z")
    }, now)).toBe(true);
    expect(isIntroductoryOfferActive({
      status: "active",
      introductoryOffer: "paid_first_month_6_usd",
      introductoryOfferEndsAt: new Date("2026-07-25T00:00:00.000Z")
    }, now)).toBe(false);
  });
});
