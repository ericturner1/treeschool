import { describe, expect, test } from "bun:test";
import {
  funnelMembershipProductId,
  getFunnelMembershipProduct,
  listFunnelMembershipProducts,
  parseFunnelMembershipProductId
} from "./funnel-products";

describe("funnel membership products", () => {
  test("uses stable product references for every supported tier and interval", () => {
    expect(listFunnelMembershipProducts().map((product) => product.id)).toEqual([
      "membership:single:monthly",
      "membership:single:yearly",
      "membership:standard:monthly",
      "membership:standard:yearly"
    ]);
    expect(funnelMembershipProductId("single", "yearly"))
      .toBe("membership:single:yearly");
  });

  test("rejects malformed or unsupported product references", () => {
    expect(parseFunnelMembershipProductId("membership:single:monthly"))
      .toEqual({ planTier: "single", billingInterval: "monthly" });
    expect(parseFunnelMembershipProductId("membership:single:weekly")).toBeNull();
    expect(parseFunnelMembershipProductId("workbook:single:monthly")).toBeNull();
  });

  test("describes recurring and introductory pricing", () => {
    expect(getFunnelMembershipProduct("membership:single:monthly"))
      .toMatchObject({
        priceInCents: 1400,
        introductoryPriceInCents: 600,
        billingInterval: "monthly"
      });
    expect(getFunnelMembershipProduct("membership:single:yearly"))
      .toMatchObject({
        priceInCents: 14000,
        introductoryPriceInCents: null,
        billingInterval: "yearly"
      });
  });
});
