export type MembershipTier = "single" | "standard";
export type BillingInterval = "monthly" | "yearly";

export const MEMBERSHIP_PLANS = {
  single: {
    label: "Single",
    includedStudentCount: 1,
    teacherUserLimit: 2,
    productName: "Treeschool Single",
    productDescription:
      "The complete Treeschool K–4 homeschool platform for one student and up to two Teacher users, with printable lessons, curriculum, attendance, grades, and parent tools.",
    catalogKey: "membership_single",
    prices: {
      monthly: {
        label: "Monthly",
        unitAmount: 1400,
        recurringInterval: "month" as const,
        lookupKey: "treeschool_single_monthly_1400_v1"
      },
      yearly: {
        label: "Yearly",
        unitAmount: 14000,
        recurringInterval: "year" as const,
        lookupKey: "treeschool_single_yearly_14000_v1"
      }
    }
  },
  standard: {
    label: "Standard",
    includedStudentCount: 3,
    teacherUserLimit: 4,
    productName: "Treeschool Standard",
    productDescription:
      "The complete Treeschool K–4 homeschool platform for up to three students and four Teacher users, with printable lessons, curriculum, attendance, grades, and parent tools.",
    catalogKey: "membership_standard",
    prices: {
      monthly: {
        label: "Monthly",
        unitAmount: 2000,
        recurringInterval: "month" as const,
        lookupKey: "treeschool_standard_monthly_2000_v1"
      },
      yearly: {
        label: "Yearly",
        unitAmount: 20000,
        recurringInterval: "year" as const,
        lookupKey: "treeschool_standard_yearly_20000_v1"
      }
    }
  }
} as const;

export function isMembershipTier(value: unknown): value is MembershipTier {
  return value === "single" || value === "standard";
}

export function normalizeMembershipTier(
  value: unknown,
  fallback: MembershipTier = "standard"
): MembershipTier {
  return isMembershipTier(value) ? value : fallback;
}

export function getMembershipPlan(tier: MembershipTier) {
  return MEMBERSHIP_PLANS[tier];
}

export function inferMembershipTierFromAmount(
  unitAmount: number | null | undefined,
  recurringInterval: string | null | undefined
): MembershipTier {
  if (
    (recurringInterval === "month" && unitAmount === MEMBERSHIP_PLANS.single.prices.monthly.unitAmount) ||
    (recurringInterval === "year" && unitAmount === MEMBERSHIP_PLANS.single.prices.yearly.unitAmount)
  ) {
    return "single";
  }
  return "standard";
}

export function getSinglePlanDowngradeBlocker(input: {
  studentCount: number;
  additionalStudentQuantity: number;
  teacherUserCount?: number;
}) {
  const studentCount = Math.max(0, Math.floor(input.studentCount));
  if (studentCount > MEMBERSHIP_PLANS.single.includedStudentCount) {
    const profilesToRemove = studentCount - MEMBERSHIP_PLANS.single.includedStudentCount;
    return `Single supports one student. Remove ${profilesToRemove} student ${profilesToRemove === 1 ? "profile" : "profiles"} before downgrading.`;
  }
  if (Math.max(0, Math.floor(input.additionalStudentQuantity)) > 0) {
    return "Remove all additional student seats before downgrading to Single.";
  }
  const teacherUserCount = Math.max(0, Math.floor(input.teacherUserCount ?? 0));
  if (teacherUserCount > MEMBERSHIP_PLANS.single.teacherUserLimit) {
    const teacherUsersToRemove = teacherUserCount - MEMBERSHIP_PLANS.single.teacherUserLimit;
    return `Single supports up to ${MEMBERSHIP_PLANS.single.teacherUserLimit} Teacher users. Remove ${teacherUsersToRemove} Teacher ${teacherUsersToRemove === 1 ? "user" : "users"} before downgrading.`;
  }
  return null;
}
