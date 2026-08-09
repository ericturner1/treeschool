import { describe, expect, test } from "bun:test";
import {
  emptyWorkbookContent,
  parseWorkbookContent,
} from "./workbook-studio-model";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const classicTheme = {
  colorInk: "#25201B",
  colorEarth: "#8F6544",
  colorLeaf: "#739E56",
  colorLeafDark: "#567B40",
  colorCream: "#FFFAF2",
  colorSand: "#F6EDDC",
  colorCanvas: "#FFFFFF",
  colorCoverAccent: "#2F6690",
  colorCoverAccentSoft: "#E3EEF5",
  headingFontFamily: '"Comic Neue", "Comic Sans MS", cursive',
  bodyFontFamily:
    '"Nunito", "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif',
  pageSize: "A4" as const,
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

function rendererFixture() {
  const content = emptyWorkbookContent({
    title: "Japanese Reader A",
    editionLabel: "1st Edition",
    gradeLabel: "Grade 1",
    subjectLabel: "Japanese",
  });
  content.introduction = [
    { type: "paragraph", text: "Welcome to this workbook." },
  ];
  const lesson = content.chapters[0].lessons[0];
  lesson.needsIllustration = true;
  lesson.learnBlocks = [
    {
      type: "reading_passage",
      title: "A short passage",
      paragraphs: ["A calm first paragraph.", "A second paragraph."],
    },
    {
      type: "vocabulary_list",
      entries: [{ term: "木", pronunciation: "き", definition: "tree" }],
    },
    {
      type: "character_practice",
      character: "木",
      pronunciation: "き",
      meaning: "tree",
      traceRows: 2,
    },
    {
      type: "illustration",
      illustrationType: "test-tree",
      parameters: {},
      altText: "A themed tree",
    },
  ];
  lesson.exercises = Array.from({ length: 5 }, (_, index) => ({
    id: `exercise-${index + 1}`,
    type: "short_answer" as const,
    prompt: `Question ${index + 1}`,
    correctAnswer: `Answer ${index + 1}`,
    standardsCodes: [],
    writingLines: 3,
  }));
  return parseWorkbookContent(content);
}

async function fixtureHtml() {
  const { buildWorkbookHtml } = await import("./workbook-renderer");
  const html = await buildWorkbookHtml({
    content: rendererFixture(),
    theme: { ...classicTheme, colorLeafDark: "#123456" },
    subjectKey: "japanese",
    languageCode: "ja",
    layoutProfile: "reader",
    scriptProfile: "japanese",
    copyrightYear: 2024,
    illustrationDefinitions: [
      {
        key: "test-tree",
        rendererKind: "parameterized_svg",
        svgTemplate:
          '<svg viewBox="0 0 20 20"><path stroke="{{theme:stroke}}" d="M1 1L19 19"/></svg>',
        tokenBindingsJson: { stroke: "leafDark" },
      },
    ],
  });
  if (process.env.WORKBOOK_HTML_TEST_OUTPUT) {
    await Bun.write(process.env.WORKBOOK_HTML_TEST_OUTPUT, html);
  }
  return html;
}

describe("Workbook Studio deterministic renderer", () => {
  test("inlines pinned dependencies and resolves theme tokens before printing", async () => {
    const html = await fixtureHtml();
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).toContain("#123456");
    expect(html).toContain("Copyright &copy; 2024 Treeschool");
    expect(html).toContain("reader-vocabulary");
    expect(html).toContain("character-practice");
    expect(html).not.toContain('class="chapter-page"');
    expect(html).not.toContain("{{theme:");
    expect(html).not.toContain("{{SUBJECT_NAME}}");
    expect(html).not.toContain("unpkg.com");
    expect(html).not.toContain("fonts.googleapis.com");
  }, 30_000);

  test("renders the self-contained HTML with pinned Chromium and Paged.js", async () => {
    const { renderWorkbookPdf } = await import("./workbook-renderer");
    const rendered = await renderWorkbookPdf(await fixtureHtml());
    if (process.env.WORKBOOK_RENDER_TEST_OUTPUT) {
      await Bun.write(process.env.WORKBOOK_RENDER_TEST_OUTPUT, rendered.pdf);
    }
    expect(rendered.pageCount).toBe(7);
    expect(rendered.pdf.byteLength).toBeGreaterThan(10_000);
    expect(Math.abs(rendered.pageWidthPoints - 595.28)).toBeLessThan(1);
    expect(Math.abs(rendered.pageHeightPoints - 841.89)).toBeLessThan(1);
    expect(rendered.coverDiagnostics.backgroundColor).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(rendered.coverDiagnostics.borderWidth).toBe("4px");
    expect(
      Number.parseFloat(rendered.coverDiagnostics.imageHeight ?? "999"),
    ).toBeLessThan(100);
    expect(rendered.chromiumVersion).toMatch(/^\d+\./);
  }, 120_000);
});
