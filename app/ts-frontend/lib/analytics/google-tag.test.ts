import { describe, expect, test } from "bun:test";
import { createGoogleTagQueue } from "./google-tag";

describe("Google tag command queue", () => {
  test("queues the Arguments object expected by gtag.js", () => {
    const dataLayer: unknown[] = [];
    const gtag = createGoogleTagQueue(dataLayer);

    gtag("config", "G-CNXCLD3PLH", { send_page_view: false });

    expect(dataLayer).toHaveLength(1);
    expect(Array.isArray(dataLayer[0])).toBe(false);
    expect(Array.from(dataLayer[0] as ArrayLike<unknown>)).toEqual([
      "config",
      "G-CNXCLD3PLH",
      { send_page_view: false }
    ]);
  });
});
