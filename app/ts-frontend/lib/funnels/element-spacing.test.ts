import { describe, expect, test } from "bun:test";
import { allSpacingSides, funnelElementSpacingStyle } from "./element-spacing";

describe("funnel element spacing", () => {
  test("maps persisted element spacing to CSS properties", () => {
    expect(funnelElementSpacingStyle({
      spacing: {
        marginTop: 10,
        marginRight: -4,
        marginBottom: 18,
        marginLeft: 2,
        paddingTop: 6,
        paddingRight: 12,
        paddingBottom: 8,
        paddingLeft: 14
      }
    })).toEqual({
      marginTop: 10,
      marginRight: -4,
      marginBottom: 18,
      marginLeft: 2,
      paddingTop: 6,
      paddingRight: 12,
      paddingBottom: 8,
      paddingLeft: 14
    });
  });

  test("sets all four sides together", () => {
    expect(allSpacingSides("margin", 16)).toEqual({
      marginTop: 16,
      marginRight: 16,
      marginBottom: 16,
      marginLeft: 16
    });
    expect(allSpacingSides("padding", 12)).toEqual({
      paddingTop: 12,
      paddingRight: 12,
      paddingBottom: 12,
      paddingLeft: 12
    });
  });
});
