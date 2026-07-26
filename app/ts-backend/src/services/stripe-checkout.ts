import type Stripe from "stripe";

type BrandedCheckoutSessionCreateParams = Stripe.Checkout.SessionCreateParams & {
  branding_settings: {
    display_name: string;
  };
};

export function withTreeschoolCheckoutBranding(
  params: Stripe.Checkout.SessionCreateParams
): Stripe.Checkout.SessionCreateParams {
  return {
    ...params,
    branding_settings: {
      display_name: "Treeschool"
    }
  } as BrandedCheckoutSessionCreateParams;
}
