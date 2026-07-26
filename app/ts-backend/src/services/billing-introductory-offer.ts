export const INTRODUCTORY_OFFER_KEY = "paid_first_month_6_usd";
export const CORE_MONTHLY_INTRO_AMOUNT = 600;
export const ADDITIONAL_STUDENT_INTRO_AMOUNT = 200;

const LEGACY_TRIAL_OFFER_KEY = "first_month_6_usd";
const ADDITIONAL_STUDENT_MONTHLY_AMOUNT = 500;
const INTRODUCTORY_COUPON_VERSION = "v2";

export function getIntroductoryDiscountAmount(input: {
  monthlyPlanAmount: number;
  additionalStudentQuantity: number;
}) {
  const monthlyPlanAmount = Math.max(CORE_MONTHLY_INTRO_AMOUNT, Math.floor(input.monthlyPlanAmount));
  const additionalStudentQuantity = input.additionalStudentQuantity;
  const normalizedQuantity = Math.max(0, Math.floor(additionalStudentQuantity));
  return (monthlyPlanAmount - CORE_MONTHLY_INTRO_AMOUNT) +
    normalizedQuantity * (ADDITIONAL_STUDENT_MONTHLY_AMOUNT - ADDITIONAL_STUDENT_INTRO_AMOUNT);
}

export function getIntroductoryCouponId(input: {
  planTier: "single" | "standard";
  additionalStudentQuantity: number;
}) {
  const additionalStudentQuantity = input.additionalStudentQuantity;
  const normalizedQuantity = Math.max(0, Math.floor(additionalStudentQuantity));
  return `treeschool_first_month_${INTRODUCTORY_COUPON_VERSION}_${input.planTier}_students_${normalizedQuantity}`;
}

export function isIntroductoryOfferActive(input: {
  status: string | null | undefined;
  introductoryOffer: string | null | undefined;
  introductoryOfferEndsAt: Date | null | undefined;
}, now = new Date()) {
  return Boolean(
    (input.introductoryOffer === INTRODUCTORY_OFFER_KEY ||
      input.introductoryOffer === LEGACY_TRIAL_OFFER_KEY) &&
    input.introductoryOfferEndsAt &&
    input.introductoryOfferEndsAt > now &&
    (input.status === "active" || input.status === "trialing")
  );
}
