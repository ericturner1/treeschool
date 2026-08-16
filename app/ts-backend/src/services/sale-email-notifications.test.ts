import { describe, expect, test } from "bun:test";
import {
  buildSaleNotificationMessage,
  saleSourceLabel
} from "./sale-email-notifications";

describe("merchant sale email notifications", () => {
  test("labels the supported purchase paths", () => {
    expect(saleSourceLabel({ checkoutKind: "native_workbook_bundle" })).toBe(
      "Workbook bundle"
    );
    expect(saleSourceLabel({ checkoutKind: "public_core_subscription" })).toBe(
      "Treeschool subscription"
    );
    expect(saleSourceLabel({ checkoutSource: "funnel_one_click_offer" })).toBe(
      "Funnel one-click offer"
    );
  });

  test("builds a useful escaped live-sale message", () => {
    const message = buildSaleNotificationMessage({
      notificationKey: "checkout:cs_test_123",
      stripeEventId: "evt_123",
      livemode: true,
      stripeCheckoutSessionId: "cs_test_123",
      stripePaymentIntentId: "pi_123",
      purchaserEmail: "parent@example.com",
      saleSource: "Workbook bundle",
      amountTotalCents: 999,
      currency: "USD",
      items: [{ description: "Japanese <A–D>", quantity: 1 }],
      occurredAt: new Date("2026-08-16T07:00:00.000Z")
    });

    expect(message.subject).toBe("New Treeschool sale — $9.99");
    expect(message.text).toContain("Customer: parent@example.com");
    expect(message.text).toContain("Japanese <A–D>");
    expect(message.html).toContain("Japanese &lt;A–D&gt;");
    expect(message.html).not.toContain("Japanese <A–D>");
    expect(message.html).toContain("https://dashboard.stripe.com/payments/pi_123");
    expect(message.messageId).toMatch(/^<treeschool-sale-[a-f0-9]{32}@treehomeschool\.com>$/);
  });

  test("clearly marks test payments", () => {
    const message = buildSaleNotificationMessage({
      notificationKey: "payment_intent:pi_test_123",
      stripeEventId: "evt_test_123",
      livemode: false,
      stripePaymentIntentId: "pi_test_123",
      purchaserEmail: null,
      saleSource: "Post-purchase offer",
      amountTotalCents: 500,
      currency: "USD",
      items: [],
      occurredAt: new Date("2026-08-16T07:00:00.000Z")
    });

    expect(message.text).toContain("Mode: TEST payment");
    expect(message.html).toContain("https://dashboard.stripe.com/test/payments/pi_test_123");
  });
});
