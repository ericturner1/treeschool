import { describe, expect, test } from "bun:test";
import {
  getMembershipPlan,
  getSinglePlanDowngradeBlocker,
  inferMembershipTierFromAmount,
  normalizeMembershipTier
} from "./membership-plans";

describe("membership plans", () => {
  test("defines the approved student capacities and prices", () => {
    expect(getMembershipPlan("single").includedStudentCount).toBe(1);
    expect(getMembershipPlan("single").teacherUserLimit).toBe(2);
    expect(getMembershipPlan("single").prices.monthly.unitAmount).toBe(1400);
    expect(getMembershipPlan("single").prices.yearly.unitAmount).toBe(14000);
    expect(getMembershipPlan("standard").includedStudentCount).toBe(3);
    expect(getMembershipPlan("standard").teacherUserLimit).toBe(4);
    expect(getMembershipPlan("standard").prices.monthly.unitAmount).toBe(2000);
    expect(getMembershipPlan("standard").prices.yearly.unitAmount).toBe(20000);
  });

  test("keeps legacy or unknown subscriptions on Standard", () => {
    expect(normalizeMembershipTier(undefined)).toBe("standard");
    expect(inferMembershipTierFromAmount(2000, "month")).toBe("standard");
    expect(inferMembershipTierFromAmount(1400, "month")).toBe("single");
    expect(inferMembershipTierFromAmount(14000, "year")).toBe("single");
  });

  test("requires extra student profiles to be removed before a Single downgrade", () => {
    expect(getSinglePlanDowngradeBlocker({
      studentCount: 2,
      additionalStudentQuantity: 0
    })).toBe("Single supports one student. Remove 1 student profile before downgrading.");
    expect(getSinglePlanDowngradeBlocker({
      studentCount: 1,
      additionalStudentQuantity: 0,
      teacherUserCount: 2
    })).toBeNull();
    expect(getSinglePlanDowngradeBlocker({
      studentCount: 1,
      additionalStudentQuantity: 0,
      teacherUserCount: 3
    })).toBe("Single supports up to 2 Teacher users. Remove 1 Teacher user before downgrading.");
  });
});
