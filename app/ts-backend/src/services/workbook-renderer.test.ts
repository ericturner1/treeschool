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
  lesson.boxStyle = { backgroundColor: "#fffaf2" };
  lesson.learnSectionBoxStyle = {
    borderColor: "#739e56",
    borderWidth: 1,
    borderStyle: "dashed",
  };
  lesson.learnBlocks = [
    {
      type: "reading_passage",
      title: "A short passage",
      paragraphs: ["A calm first paragraph.", "A second paragraph."],
      boxStyle: { marginBottom: 2, paddingLeft: 3 },
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
  const learnChildren = lesson.learnBlocks.splice(0, 2);
  const leftLearnBlock = learnChildren[0];
  const rightLearnBlock = learnChildren[1];
  if (
    !leftLearnBlock ||
    !rightLearnBlock ||
    leftLearnBlock.type === "layout_row" ||
    rightLearnBlock.type === "layout_row"
  ) {
    throw new Error("Unexpected row fixture");
  }
  lesson.learnBlocks.unshift({
    id: "learn-layout-row",
    type: "layout_row",
    columns: [
      { id: "learn-layout-left", blocks: [leftLearnBlock] },
      { id: "learn-layout-right", blocks: [rightLearnBlock] },
    ],
  });
  const exercises = Array.from({ length: 5 }, (_, index) => ({
    id: `exercise-${index + 1}`,
    type: "short_answer" as const,
    prompt: `Question ${index + 1}`,
    correctAnswer: `Answer ${index + 1}`,
    standardsCodes: [],
    writingLines: 3,
    ...(index === 0
      ? { boxStyle: { borderRadius: 6, backgroundColor: "#f6eddc" } }
      : {}),
  }));
  lesson.exercises = [
    {
      id: "practice-layout-row",
      type: "layout_row",
      columns: [
        { id: "practice-layout-left", exercises: [exercises[0]!] },
        { id: "practice-layout-right", exercises: [exercises[1]!] },
      ],
    },
    ...exercises.slice(2),
  ];
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
    expect(html).toContain("background-color:#fffaf2");
    expect(html).toContain(
      "border-width:1px;border-style:dashed;border-color:#739e56",
    );
    expect(html).toContain("margin-bottom:2px;padding-left:3px");
    expect(html).toContain("border-radius:6px");
    expect(html).toContain("workbook-layout-row");
    expect(html).toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
    expect(html).toContain('<li value="5" data-exercise-id="exercise-5"');
    expect(html).not.toContain('class="chapter-page"');
    expect(html).not.toContain("{{theme:");
    expect(html).not.toContain("{{SUBJECT_NAME}}");
    expect(html).not.toContain("unpkg.com");
    expect(html).not.toContain("fonts.googleapis.com");
  }, 30_000);

  test("embeds uploaded images and generated QR codes with print controls", async () => {
    const assetId = "11111111-1111-4111-8111-111111111111";
    const content = rendererFixture();
    content.chapters[0].lessons[0].learnBlocks.push({
      type: "image_asset",
      assetId,
      contentType: "image/png",
      pixelWidth: 1200,
      pixelHeight: 800,
      description: "A labeled tree",
      altText: "A labeled tree diagram",
      caption: "Parts of a tree",
      widthPercent: 65,
      alignment: "right",
    });
    content.chapters[0].lessons[0].learnBlocks.push({
      type: "qr_code",
      data: "https://www.treehomeschool.com/lessons/guitar-a-1",
      description: "Scan to hear the chord progression.",
      sizeMm: 32,
    });
    content.chapters[0].lessons[0].learnBlocks.push({
      type: "sound_asset",
      assetId: "22222222-2222-4222-8222-222222222222",
      contentType: "audio/mpeg",
      fileName: "g-major-chord.mp3",
      sizeBytes: 48_000,
      description: "Listen to a G major chord.",
      qrSizeMm: 36,
    });
    const { buildWorkbookHtml } = await import("./workbook-renderer");
    const html = await buildWorkbookHtml({
      content: parseWorkbookContent(content),
      theme: classicTheme,
      subjectKey: "science",
      languageCode: "en",
      layoutProfile: "standard",
      scriptProfile: "latin",
      illustrationDefinitions: [
        {
          key: "test-tree",
          rendererKind: "parameterized_svg",
          svgTemplate:
            '<svg viewBox="0 0 20 20"><path stroke="{{theme:stroke}}" d="M1 1L19 19"/></svg>',
          tokenBindingsJson: { stroke: "leafDark" },
        },
      ],
      imageAssetDataUrls: {
        [assetId]: "data:image/png;base64,AAAA",
      },
      projectId: "33333333-3333-4333-8333-333333333333",
      publicAppUrl: "https://workbooks.example.test",
    });

    expect(html).toContain('class="workbook-image"');
    expect(html).toContain("width:65%");
    expect(html).toContain("margin-left:auto;margin-right:0");
    expect(html).toContain('alt="A labeled tree diagram"');
    expect(html).toContain("Parts of a tree");
    expect(html).toContain("data:image/png;base64,AAAA");
    expect(html).toContain('class="workbook-qr-code"');
    expect(html).toContain('style="width:32mm"');
    expect(html).toContain("Scan to hear the chord progression.");
    expect(html).toContain("data:image/svg+xml;base64,");
    expect(html).toContain('class="workbook-sound-qr"');
    expect(html).toContain('style="width:36mm"');
    expect(html).toContain("Listen to a G major chord.");
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
