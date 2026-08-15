import { describe, expect, test } from "bun:test";
import { parseFunnelSubscriptionProductId } from "./products";

describe("funnel subscription product references", () => {
  test("parses supported membership products", () => {
    expect(parseFunnelSubscriptionProductId("membership:standard:yearly"))
      .toEqual({ planTier: "standard", billingInterval: "yearly" });
  });

  test("rejects non-membership products", () => {
    expect(parseFunnelSubscriptionProductId("a-workbook-id")).toBeNull();
  });
});
