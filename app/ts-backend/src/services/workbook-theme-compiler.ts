import { z } from "zod";

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

export const workbookThemeTokensSchema = z.object({
  colorInk: hexColorSchema,
  colorEarth: hexColorSchema,
  colorLeaf: hexColorSchema,
  colorLeafDark: hexColorSchema,
  colorCream: hexColorSchema,
  colorSand: hexColorSchema,
  colorCanvas: hexColorSchema,
  colorCoverAccent: hexColorSchema,
  colorCoverAccentSoft: hexColorSchema,
  headingFontFamily: z.string().min(1),
  bodyFontFamily: z.string().min(1),
  pageSize: z.enum(["A4"]),
  pageMarginTopMm: z.number().min(0),
  pageMarginRightMm: z.number().min(0),
  pageMarginBottomMm: z.number().min(0),
  pageMarginLeftMm: z.number().min(0),
  firstPageMarginTopMm: z.number().min(0),
  firstPageMarginRightMm: z.number().min(0),
  firstPageMarginBottomMm: z.number().min(0),
  firstPageMarginLeftMm: z.number().min(0),
  bodyFontSizePt: z.number().positive(),
  bodyLineHeight: z.number().positive(),
});

export type WorkbookThemeTokens = z.infer<typeof workbookThemeTokensSchema>;

export function compileWorkbookThemeCss(input: WorkbookThemeTokens) {
  const theme = workbookThemeTokensSchema.parse(input);
  return `
:root {
  --ink: ${theme.colorInk};
  --earth: ${theme.colorEarth};
  --leaf: ${theme.colorLeaf};
  --leaf-dark: ${theme.colorLeafDark};
  --cream: ${theme.colorCream};
  --sand: ${theme.colorSand};
  --canvas: ${theme.colorCanvas};
  --cover-accent: ${theme.colorCoverAccent};
  --cover-accent-soft: ${theme.colorCoverAccentSoft};
  --heading-font: ${theme.headingFontFamily};
  --body-font: ${theme.bodyFontFamily};
}
@page {
  size: ${theme.pageSize};
  margin: ${theme.pageMarginTopMm}mm ${theme.pageMarginRightMm}mm ${theme.pageMarginBottomMm}mm ${theme.pageMarginLeftMm}mm;
}
@page :first {
  margin: ${theme.firstPageMarginTopMm}mm ${theme.firstPageMarginRightMm}mm ${theme.firstPageMarginBottomMm}mm ${theme.firstPageMarginLeftMm}mm;
}
body {
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--body-font);
  font-size: ${theme.bodyFontSizePt}pt;
  line-height: ${theme.bodyLineHeight};
}
h1, h2, h3, h4, .logo { font-family: var(--heading-font); }
.cover h1 { color: var(--cover-accent); }
.cover .core-label { color: var(--cover-accent); background: var(--cover-accent-soft); }
`.trim();
}

export function themeSvgTokenMap(theme: WorkbookThemeTokens) {
  const parsed = workbookThemeTokensSchema.parse(theme);
  return {
    ink: parsed.colorInk,
    earth: parsed.colorEarth,
    leaf: parsed.colorLeaf,
    leafDark: parsed.colorLeafDark,
    cream: parsed.colorCream,
    sand: parsed.colorSand,
    canvas: parsed.colorCanvas,
    coverAccent: parsed.colorCoverAccent,
    coverAccentSoft: parsed.colorCoverAccentSoft,
  } as const;
}

export function resolveSvgThemeTokens(
  template: string,
  tokenBindings: Record<string, keyof ReturnType<typeof themeSvgTokenMap>>,
  theme: WorkbookThemeTokens,
) {
  const tokens = themeSvgTokenMap(theme);
  return template.replace(
    /\{\{theme:([a-zA-Z][a-zA-Z0-9]*)\}\}/g,
    (match, binding: string) => {
      const tokenName = tokenBindings[binding];
      if (!tokenName) throw new Error(`Unknown SVG theme binding: ${binding}`);
      return tokens[tokenName];
    },
  );
}

export function validateCompiledThemeMechanics(css: string) {
  const requiredPatterns: Array<[string, RegExp]> = [
    [
      "table row break protection",
      /tr\s*\{[^}]*break-inside:\s*avoid[^}]*page-break-inside:\s*avoid/is,
    ],
    [
      "table header break protection",
      /(?:thead\s+tr|table\.[\w-]+\s+tr:first-child)\s*\{[^}]*break-after:\s*avoid[^}]*page-break-after:\s*avoid/is,
    ],
    ["split-fragment end fix", /\[data-split-to\]/],
    ["split-fragment start fix", /\[data-split-from\]/],
    ["running chapter string", /string-set:\s*chapter/],
    ["running lesson string", /string-set:\s*lesson/],
    ["TOC target page counter", /target-counter\(attr\(href url\),\s*page\)/],
  ];

  return requiredPatterns.flatMap(([label, pattern]) =>
    pattern.test(css) ? [] : [`Missing ${label}.`],
  );
}
