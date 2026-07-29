import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import {
  buildMetaCheckoutPurchaseEvent,
  canSendMetaServerEvent,
  hashMetaMatchValue,
  metaCheckoutEventId
} from "./meta-conversions";

function checkoutSession(
  overrides: Partial<Stripe.Checkout.Session> = {}
) {
  return {
    id: "cs_test_123",
    amount_total: 600,
    currency: "usd",
    customer_details: {
      address: {
        city: null,
        country: "US",
        line1: null,
        line2: null,
        postal_code: null,
        state: null
      },
      email: " Parent@Example.com ",
      name: null,
      phone: null,
      tax_exempt: "none",
      tax_ids: []
    },
    customer_email: null,
    metadata: {
      checkoutKind: "public_core_subscription",
      planTier: "single"
    },
    mode: "subscription",
    payment_status: "paid",
    status: "complete",
    ...overrides
  } as Stripe.Checkout.Session;
}

describe("Meta Conversions API purchase events", () => {
  test("uses the same stable event id as the browser purchase event", () => {
    expect(metaCheckoutEventId("cs_test_123")).toBe(
      "9ee7e06645426cb1d3597dc6"
    );
  });

  test("normalizes and hashes purchaser matching data", () => {
    expect(hashMetaMatchValue(" Parent@Example.com ")).toBe(
      hashMetaMatchValue("parent@example.com")
    );
  });

  test("skips prior-consent and unknown billing countries", () => {
    expect(canSendMetaServerEvent("US")).toBe(true);
    expect(canSendMetaServerEvent("GB")).toBe(false);
    expect(canSendMetaServerEvent("DE")).toBe(false);
    expect(canSendMetaServerEvent("CH")).toBe(false);
    expect(canSendMetaServerEvent(null)).toBe(false);
  });

  test("builds a paid purchase without exposing raw email", () => {
    const event = buildMetaCheckoutPurchaseEvent(
      checkoutSession(),
      1_785_283_200
    );

    expect(event).not.toBeNull();
    expect(event?.event_name).toBe("Purchase");
    expect(event?.event_id).toBe(metaCheckoutEventId("cs_test_123"));
    expect(event?.custom_data).toMatchObject({
      currency: "USD",
      value: 6,
      content_ids: ["membership-single"]
    });
    expect(JSON.stringify(event)).not.toContain("parent@example.com");
  });

  test("skips unpaid, untracked, and regulated-country checkouts", () => {
    expect(
      buildMetaCheckoutPurchaseEvent(
        checkoutSession({ payment_status: "unpaid" }),
        1
      )
    ).toBeNull();
    expect(
      buildMetaCheckoutPurchaseEvent(
        checkoutSession({ metadata: { checkoutKind: "additional_student" } }),
        1
      )
    ).toBeNull();
    expect(
      buildMetaCheckoutPurchaseEvent(
        checkoutSession({
          customer_details: {
            ...checkoutSession().customer_details!,
            address: {
              ...checkoutSession().customer_details!.address!,
              country: "IE"
            }
          }
        }),
        1
      )
    ).toBeNull();
  });
});
