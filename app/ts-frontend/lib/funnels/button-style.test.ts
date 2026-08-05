import { describe, expect, test } from "bun:test";
import {
  funnelButtonBoxStyle,
  funnelButtonSubtextStyle,
  funnelButtonTextStyle,
  type FunnelButtonPalette
} from "./button-style";
import type { FunnelPageElement } from "./page-document";

type ButtonProps = Extract<FunnelPageElement, { type: "button" }>["props"];

const palette: FunnelButtonPalette = {
  primary: "#76a456",
  secondary: "#ffffff",
  primaryText: "#ffffff",
  secondaryText: "#466534",
  primaryShadow: "#486f34",
  secondaryShadow: "#cdddbd",
  pageBorderRadius: 18
};

describe("funnel button styles", () => {
  test("keeps legacy primary buttons on the page defaults", () => {
    const props: ButtonProps = {
      label: "Continue",
      variant: "primary",
      align: "center",
      action: { type: "next_step" }
    };

    expect(funnelButtonBoxStyle(props, palette)).toMatchObject({
      backgroundColor: "#76a456",
      borderColor: "#76a456",
      borderWidth: 2,
      borderRadius: 18,
      boxShadow: "0 8px 0 #486f34"
    });
  });

  test("renders saved sales-button typography and appearance", () => {
    const props: ButtonProps = {
      label: "Buy now",
      subtext: "30-day guarantee",
      variant: "primary",
      align: "center",
      typography: { fontFamily: "Georgia, serif", fontSize: 28, lineHeight: 32, fontWeight: 700, color: "#fffaf2" },
      subtextTypography: { fontSize: 14, lineHeight: 18, fontWeight: 500 },
      appearance: { width: "full", borderColor: "#365e2d", borderWidth: 3, shadowDepth: 4 },
      action: { type: "next_step" }
    };

    expect(funnelButtonBoxStyle(props, palette)).toMatchObject({
      width: "100%",
      borderColor: "#365e2d",
      borderWidth: 3,
      boxShadow: "0 4px 0 #486f34"
    });
    expect(funnelButtonTextStyle(props.typography, "#ffffff")).toMatchObject({
      color: "#fffaf2",
      fontFamily: "Georgia, serif",
      fontSize: 28,
      lineHeight: "32px",
      fontWeight: 700
    });
    expect(funnelButtonSubtextStyle(props.subtextTypography, "#ffffff")).toMatchObject({
      color: "#ffffff",
      fontSize: 14,
      lineHeight: "18px",
      fontWeight: 500
    });
  });
});
