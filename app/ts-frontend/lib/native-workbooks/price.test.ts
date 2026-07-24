import { describe, expect, test } from "bun:test";
import { parseWorkbookPriceInCents } from "./price";

describe("parseWorkbookPriceInCents", () => {
  test("preserves prices to the exact cent", () => {
    expect(parseWorkbookPriceInCents("3.99")).toBe(399);
    expect(parseWorkbookPriceInCents("3.93")).toBe(393);
    expect(parseWorkbookPriceInCents("3.91")).toBe(391);
    expect(parseWorkbookPriceInCents("9.9")).toBe(990);
    expect(parseWorkbookPriceInCents("1000.00")).toBe(100_000);
  });

  test("rejects ambiguous or out-of-range values", () => {
    expect(parseWorkbookPriceInCents("3.999")).toBeNull();
    expect(parseWorkbookPriceInCents("1e2")).toBeNull();
    expect(parseWorkbookPriceInCents("1000.01")).toBeNull();
    expect(parseWorkbookPriceInCents("")).toBeNull();
  });
});
