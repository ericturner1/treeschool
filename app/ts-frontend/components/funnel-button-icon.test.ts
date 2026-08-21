import { describe, expect, test } from "bun:test";
import { FUNNEL_BUTTON_ICON_OPTIONS, resolveFunnelButtonIcon } from "./funnel-button-icon";

describe("funnel button icons", () => {
  test("keeps the historical right arrow for legacy buttons", () => {
    expect(resolveFunnelButtonIcon({})).toBe("arrow-right");
    expect(resolveFunnelButtonIcon({ showArrow: false })).toBeNull();
  });

  test("lets a structured icon override the legacy arrow flag", () => {
    expect(resolveFunnelButtonIcon({ icon: "shopping-cart", showArrow: false })).toBe("shopping-cart");
    expect(resolveFunnelButtonIcon({ icon: "none", showArrow: true })).toBeNull();
  });

  test("offers a useful icon library without duplicate values", () => {
    const values = FUNNEL_BUTTON_ICON_OPTIONS.map((option) => option.value);
    expect(values.length).toBeGreaterThanOrEqual(70);
    expect(new Set(values).size).toBe(values.length);
  });
});
