import { describe, expect, test } from "bun:test";
import {
  funnelListContainerStyle,
  funnelListMarker,
  funnelListMarkerStyle,
  funnelListTextStyle,
  isCustomizedFunnelList
} from "./list-style";

describe("funnel list styles", () => {
  test("keeps legacy list markers compatible", () => {
    const props = { items: ["One"], style: "checks" as const, align: "left" as const };
    expect(isCustomizedFunnelList(props)).toBe(false);
    expect(funnelListMarker(props)).toBe("✓");
    expect(funnelListMarker({ ...props, style: "bullets" })).toBe("•");
  });

  test("builds customized typography and appearance styles", () => {
    const props = {
      items: ["One"],
      style: "checks" as const,
      align: "center" as const,
      typography: { fontFamily: "Georgia, serif", fontSize: 20, lineHeight: 30, fontWeight: 700, color: "#172033" },
      appearance: { marker: "star" as const, markerSize: 24, markerColor: "#76a456", itemSpacing: 10, backgroundColor: "#ffffff", borderColor: "#d8c5a8", borderWidth: 1, borderRadius: 16, paddingX: 20, paddingY: 14 }
    };
    expect(isCustomizedFunnelList(props)).toBe(true);
    expect(funnelListMarker(props)).toBe("★");
    expect(funnelListContainerStyle(props)).toMatchObject({ rowGap: 10, paddingInline: 20, borderWidth: 1 });
    expect(funnelListTextStyle(props)).toMatchObject({ fontFamily: "Georgia, serif", fontSize: 20, lineHeight: "30px" });
    expect(funnelListMarkerStyle(props, "#000000")).toMatchObject({ color: "#76a456", fontSize: 24 });
  });
});
