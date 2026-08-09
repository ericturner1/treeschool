import { describe, expect, test } from "bun:test";
import {
  compileWorkbookThemeCss,
  resolveSvgThemeTokens,
  type WorkbookThemeTokens,
} from "./workbook-theme-compiler";

const classic: WorkbookThemeTokens = {
  colorInk: "#25201B",
  colorEarth: "#8F6544",
  colorLeaf: "#739E56",
  colorLeafDark: "#567B40",
  colorCream: "#FFFAF2",
  colorSand: "#F6EDDC",
  colorCanvas: "#FFFFFF",
  colorCoverAccent: "#2F6690",
  colorCoverAccentSoft: "#E3EEF5",
  headingFontFamily: '"Comic Neue", cursive',
  bodyFontFamily: '"Nunito", sans-serif',
  pageSize: "A4",
  pageMarginTopMm: 16,
  pageMarginRightMm: 14,
  pageMarginBottomMm: 20,
  pageMarginLeftMm: 14,
  firstPageMarginTopMm: 8,
  firstPageMarginRightMm: 7,
  firstPageMarginBottomMm: 10,
  firstPageMarginLeftMm: 7,
  bodyFontSizePt: 13,
  bodyLineHeight: 1.5,
};

describe("Workbook theme compiler", () => {
  test("compiles structured tokens into deterministic CSS", () => {
    expect(compileWorkbookThemeCss(classic)).toContain("--ink: #25201B");
    expect(compileWorkbookThemeCss(classic)).toContain(
      "margin: 16mm 14mm 20mm 14mm",
    );
  });

  test("resolves SVG theme bindings to literal server-side hex colors", () => {
    expect(
      resolveSvgThemeTokens(
        '<path fill="{{theme:primary}}" stroke="{{theme:outline}}"/>',
        { primary: "leaf", outline: "ink" },
        classic,
      ),
    ).toBe('<path fill="#739E56" stroke="#25201B"/>');
  });

  test("rejects an SVG binding that is not registered", () => {
    expect(() =>
      resolveSvgThemeTokens("{{theme:unknown}}", {}, classic),
    ).toThrow("Unknown SVG theme binding");
  });
});
