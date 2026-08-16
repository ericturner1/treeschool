import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";
import {
  curriculumSubjects,
  workbookContentRevisions,
  workbookCourses,
  workbookIllustrationTypes,
  workbookProjects,
  workbookRenderRuns,
  workbookThemeVersions,
} from "ts-db";
import { db, env } from "../db";
import { downloadPrivateFile, uploadPrivateFile } from "./media";
import {
  flattenWorkbookExercises,
  flattenWorkbookLearnBlocks,
  parseWorkbookContent,
  type WorkbookContent,
  type WorkbookExercise,
  type WorkbookLearnBlockLeaf,
  type WorkbookPracticeItem,
} from "./workbook-studio-model";
import { validateWorkbookForScope } from "./workbook-studio-validation";
import { renderWorkbookQrCodeDataUrl } from "./workbook-qr-code";
import { workbookSoundPublicUrl } from "./workbook-media";
import {
  compileWorkbookThemeCss,
  resolveSvgThemeTokens,
  validateCompiledThemeMechanics,
  workbookThemeTokensSchema,
  type WorkbookThemeTokens,
} from "./workbook-theme-compiler";

const PAGED_JS_VERSION = "0.4.3";
const RENDERER_VERSION = "workbook-studio-v1";
const FONT_MANIFEST = {
  source: "fontsource",
  packageVersion: "5.3.0",
  families: {
    Nunito: [400, 700],
    "Comic Neue": [400, 700],
    "Noto Sans JP": [400, 700],
    Bravura: [400],
  },
} as const;

type IllustrationDefinition = {
  key: string;
  rendererKind: string;
  svgTemplate: string | null;
  wrapperClass?: string | null;
  tokenBindingsJson: Record<string, string>;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeInlineScript(value: string) {
  return value.replaceAll("</script", "<\\/script");
}

function escapeCssStringContent(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll(/\r?\n/g, " ");
}

type WorkbookBoxStyle = NonNullable<
  WorkbookContent["chapters"][number]["lessons"][number]["boxStyle"]
>;

function workbookBoxStyleAttributes(
  style: WorkbookBoxStyle | undefined,
  baseDeclarations: string[] = [],
) {
  const declarations: string[] = [...baseDeclarations];
  const addPixels = (property: string, value: number | undefined) => {
    if (value !== undefined) declarations.push(`${property}:${value}px`);
  };
  addPixels("margin-top", style?.marginTop);
  addPixels("margin-right", style?.marginRight);
  addPixels("margin-bottom", style?.marginBottom);
  addPixels("margin-left", style?.marginLeft);
  addPixels("padding-top", style?.paddingTop);
  addPixels("padding-right", style?.paddingRight);
  addPixels("padding-bottom", style?.paddingBottom);
  addPixels("padding-left", style?.paddingLeft);
  if (style?.backgroundColor)
    declarations.push(`background-color:${style.backgroundColor}`);
  const hasBorderSetting =
    style?.borderWidth !== undefined ||
    style?.borderColor !== undefined ||
    style?.borderStyle !== undefined;
  if (hasBorderSetting) {
    declarations.push(`border-width:${style?.borderWidth ?? 1}px`);
    declarations.push(`border-style:${style?.borderStyle ?? "solid"}`);
    declarations.push(`border-color:${style?.borderColor ?? "currentColor"}`);
  }
  addPixels("border-radius", style?.borderRadius);
  return declarations.length
    ? ` style="${escapeHtml(declarations.join(";"))}"`
    : "";
}

async function firstReadable(paths: string[]) {
  let lastError: unknown;
  for (const path of paths) {
    try {
      return await readFile(path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Could not read ${paths[0]}.`);
}

function serviceDirectory() {
  return dirname(fileURLToPath(import.meta.url));
}

async function loadWorkbookAssetBytes(filename: string) {
  const serviceDir = serviceDirectory();
  return firstReadable([
    join(serviceDir, "../workbook-assets", filename),
    join(serviceDir, "workbook-assets", filename),
    join(process.cwd(), "app/ts-backend/src/workbook-assets", filename),
    join(process.cwd(), "app/ts-backend/dist/workbook-assets", filename),
  ]);
}

async function loadWorkbookAsset(filename: string) {
  return new TextDecoder().decode(await loadWorkbookAssetBytes(filename));
}

async function embeddedFontCssAsset(filename: string) {
  const css = await loadWorkbookAsset(filename);
  // The repository keeps very large data URIs line-wrapped so they remain
  // reviewable. Raw newlines are not valid inside a CSS url(), so compact only
  // the base64 payload before handing the stylesheet to Chromium.
  const payload = css.match(/base64,([\s\S]*?)"\)\s*format/)?.[1];
  if (!payload) throw new Error(`Invalid embedded font asset: ${filename}`);
  return `@font-face{font-family:"Bravura";src:url("data:font/woff2;charset=utf-8;base64,${payload.replace(/\s+/g, "")}") format("woff2");font-style:normal;font-weight:400;}`;
}

async function resolvePackageFile(relativePath: string) {
  const candidates = [
    join(process.cwd(), "node_modules", relativePath),
    join(process.cwd(), "../../node_modules", relativePath),
    join(serviceDirectory(), "../../../node_modules", relativePath),
    join(serviceDirectory(), "../../../../node_modules", relativePath),
  ];
  return firstReadable(candidates);
}

async function inlineFontsourceCss(packageName: string, cssFile: string) {
  const packageRoot = `@fontsource/${packageName}`;
  let css = new TextDecoder().decode(
    await resolvePackageFile(`${packageRoot}/${cssFile}`),
  );
  const matches = Array.from(
    css.matchAll(/url\((?:"|')?\.\/files\/([^)'\"]+)(?:"|')?\)/g),
  );
  const replacements = new Map<string, string>();
  for (const match of matches) {
    const filename = match[1];
    if (replacements.has(filename)) continue;
    const bytes = await resolvePackageFile(`${packageRoot}/files/${filename}`);
    const mime = filename.endsWith(".woff2") ? "font/woff2" : "font/woff";
    replacements.set(
      filename,
      `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`,
    );
  }
  for (const [filename, dataUrl] of replacements) {
    css = css
      .replaceAll(`url(./files/${filename})`, `url(${dataUrl})`)
      .replaceAll(`url("./files/${filename}")`, `url("${dataUrl}")`)
      .replaceAll(`url('./files/${filename}')`, `url('${dataUrl}')`);
  }
  return css;
}

async function pinnedFontCss() {
  return (
    await Promise.all([
      inlineFontsourceCss("nunito", "400.css"),
      inlineFontsourceCss("nunito", "700.css"),
      inlineFontsourceCss("comic-neue", "400.css"),
      inlineFontsourceCss("comic-neue", "700.css"),
      inlineFontsourceCss("noto-sans-jp", "400.css"),
      inlineFontsourceCss("noto-sans-jp", "700.css"),
      embeddedFontCssAsset("bravura-font-face.css"),
    ])
  ).join("\n");
}

function replaceCanonicalThemeColors(css: string, theme: WorkbookThemeTokens) {
  const colors: Array<[string, string]> = [
    ["#25201B", theme.colorInk],
    ["#8F6544", theme.colorEarth],
    ["#739E56", theme.colorLeaf],
    ["#567B40", theme.colorLeafDark],
    ["#FFFAF2", theme.colorCream],
    ["#F6EDDC", theme.colorSand],
    ["#FFFFFF", theme.colorCanvas],
    ["#2F6690", theme.colorCoverAccent],
    ["#E3EEF5", theme.colorCoverAccentSoft],
  ];
  const themedColors = colors.reduce(
    (result, [source, target]) =>
      result.replace(new RegExp(source, "gi"), target),
    css,
  );
  return themedColors
    .replaceAll(
      '"Comic Sans MS","Comic Sans",cursive',
      theme.headingFontFamily,
    )
    .replaceAll(
      '"Avenir Next","Nunito","Trebuchet MS","Segoe UI",sans-serif',
      theme.bodyFontFamily,
    )
    .replaceAll('"Avenir Next",sans-serif', theme.bodyFontFamily);
}

async function subjectOverlayCss(
  subjectKey: string,
  layoutProfile: string,
  scriptProfile: string,
) {
  const normalized = subjectKey.toLocaleLowerCase("en-US");
  const assets = new Set<string>();
  if (normalized.includes("math")) assets.add("math-overlay.css");
  if (normalized.includes("music") || normalized.includes("guitar"))
    assets.add("music-overlay.css");
  if (
    normalized.includes("japanese") ||
    normalized.includes("kokugo") ||
    scriptProfile === "japanese"
  )
    assets.add("japanese-overlay.css");

  const overlays = await Promise.all([...assets].map(loadWorkbookAsset));
  if (layoutProfile === "reader") {
    overlays.push(
      `
.reader-vocabulary { page-break-after: always; }
.reader-passage { font-size: 15pt; line-height: 1.8; }
.reader-passage .lesson-title { font-size: 20pt; }
`.trim(),
    );
  }
  return overlays.join("\n");
}

function replaceSvgParameters(
  template: string,
  parameters: Record<string, unknown>,
) {
  return template.replace(
    /\{\{param:([a-zA-Z][a-zA-Z0-9]*)\}\}/g,
    (_match, key: string) => {
      if (!(key in parameters))
        throw new Error(`Missing illustration parameter: ${key}`);
      return escapeHtml(parameters[key]);
    },
  );
}

function renderIllustration(
  block: Extract<
    WorkbookContent["chapters"][number]["lessons"][number]["learnBlocks"][number],
    { type: "illustration" }
  >,
  definitions: Map<string, IllustrationDefinition>,
  theme: WorkbookThemeTokens,
) {
  const definition = definitions.get(block.illustrationType);
  if (!definition)
    throw new Error(`Unknown illustration type: ${block.illustrationType}`);
  if (definition.rendererKind === "music_rhythm_boxes") {
    const items = Array.isArray(block.parameters.items)
      ? block.parameters.items
      : [];
    const boxes = items
      .map((raw) => {
        const item = raw as Record<string, unknown>;
        const beats = Number(item.beats) === 2 ? 2 : 1;
        const subdivisions = Number(item.subdivisions) === 2 ? 2 : 1;
        const box =
          subdivisions === 2
            ? '<div class="rbox-pair"><div class="rbox"></div><div class="rbox"></div></div>'
            : '<div class="rbox"></div>';
        return `<div class="rhythm-box beat-${beats}">${box}<span class="rbox-syllable">${escapeHtml(item.label)}</span></div>`;
      })
      .join("");
    return `<figure class="workbook-illustration rhythm-row" role="img" aria-label="${escapeHtml(block.altText)}">${boxes}${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}</figure>`;
  }
  if (definition.rendererKind === "music_guitar_chord") {
    const markers = Array.isArray(block.parameters.markers)
      ? block.parameters.markers.map(String).slice(0, 6)
      : [];
    const fingers = Array.isArray(block.parameters.fingers)
      ? block.parameters.fingers
      : [];
    const strings = [10, 30, 50, 70, 90, 110];
    const markerSvg = strings
      .map((x, index) => {
        const marker = markers[index] ?? "";
        return marker
          ? `<text x="${x}" y="13" text-anchor="middle" font-size="12"${marker === "X" ? ' font-weight="700"' : ""} fill="${theme.colorInk}">${escapeHtml(marker)}</text>`
          : "";
      })
      .join("");
    const fingerSvg = fingers
      .map((raw) => {
        const finger = raw as Record<string, unknown>;
        const stringNumber = Math.max(1, Math.min(6, Number(finger.string)));
        const fret = Math.max(1, Math.min(4, Number(finger.fret)));
        const x = strings[stringNumber - 1];
        const y = 20 + 24 * fret - 12;
        const label = String(finger.finger ?? "");
        return `<circle cx="${x}" cy="${y}" r="7" fill="${theme.colorInk}"/>${label ? `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${theme.colorCream}">${escapeHtml(label)}</text>` : ""}`;
      })
      .join("");
    const fretLines = [44, 68, 92, 116]
      .map(
        (y) =>
          `<line x1="10" y1="${y}" x2="110" y2="${y}" stroke="${theme.colorInk}" stroke-width="1.5"/>`,
      )
      .join("");
    const stringLines = strings
      .map(
        (x) =>
          `<line x1="${x}" y1="20" x2="${x}" y2="116" stroke="${theme.colorInk}" stroke-width="1.5"/>`,
      )
      .join("");
    return `<figure class="workbook-illustration guitar-chord-figure" role="img" aria-label="${escapeHtml(block.altText)}"><svg width="130" height="150" viewBox="0 0 130 150" xmlns="http://www.w3.org/2000/svg"><line x1="10" y1="20" x2="110" y2="20" stroke="${theme.colorInk}" stroke-width="4"/>${fretLines}${stringLines}${markerSvg}${fingerSvg}</svg>${block.caption ? `<figcaption class="chord-label">${escapeHtml(block.caption)}</figcaption>` : ""}</figure>`;
  }
  if (definition.rendererKind === "music_chord_chart") {
    const lines = Array.isArray(block.parameters.lines)
      ? block.parameters.lines
      : [];
    return `<figure class="workbook-illustration chord-chart-box" role="img" aria-label="${escapeHtml(block.altText)}">${lines
      .map((raw) => {
        const line = raw as Record<string, unknown>;
        return `<div><span class="chord-name">${escapeHtml(line.chord)}</span> ${escapeHtml(line.text)}</div>`;
      })
      .join("")}${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}</figure>`;
  }
  if (!definition.svgTemplate)
    throw new Error(
      `Illustration ${block.illustrationType} has no SVG template.`,
    );
  const tokenBindings = Object.fromEntries(
    Object.entries(definition.tokenBindingsJson).map(([binding, token]) => [
      binding,
      token,
    ]),
  ) as Parameters<typeof resolveSvgThemeTokens>[1];
  const themed = resolveSvgThemeTokens(
    definition.svgTemplate,
    tokenBindings,
    theme,
  );
  const svg = replaceSvgParameters(themed, block.parameters);
  const wrapperClass = definition.wrapperClass
    ? ` ${escapeHtml(definition.wrapperClass)}`
    : "";
  const staffCaption =
    definition.wrapperClass === "staff-figure" && block.caption
      ? `<p class="notation-caption">${escapeHtml(block.caption)}</p>`
      : "";
  const nestedCaption =
    definition.wrapperClass !== "staff-figure" && block.caption
      ? `<figcaption>${escapeHtml(block.caption)}</figcaption>`
      : "";
  return `<figure class="workbook-illustration${wrapperClass}" role="img" aria-label="${escapeHtml(block.altText)}">${svg}${nestedCaption}</figure>${staffCaption}`;
}

function renderLearnBlockContent(
  block: WorkbookLearnBlockLeaf,
  definitions: Map<string, IllustrationDefinition>,
  theme: WorkbookThemeTokens,
  imageAssetDataUrls: Record<string, string>,
  qrCodeDataUrls: Map<string, string>,
  soundAssetPublicUrls: Map<string, string>,
) {
  if (block.type === "paragraph") return `<p>${escapeHtml(block.text)}</p>`;
  if (block.type === "illustration")
    return renderIllustration(block, definitions, theme);
  if (block.type === "callout") {
    return `<aside class="lesson-callout lesson-callout--${block.tone}">${block.label ? `<strong>${escapeHtml(block.label)}</strong> ` : ""}${escapeHtml(block.text)}</aside>`;
  }
  if (block.type === "image_asset") {
    const imageDataUrl = block.assetId
      ? imageAssetDataUrls[block.assetId]
      : null;
    if (imageDataUrl) {
      const margins = block.alignment === "left"
        ? "margin-left:0;margin-right:auto"
        : block.alignment === "right"
          ? "margin-left:auto;margin-right:0"
          : "margin-left:auto;margin-right:auto";
      return `<figure class="workbook-image" style="width:${block.widthPercent}%;${margins}"><img src="${escapeHtml(imageDataUrl)}" alt="${escapeHtml(block.altText)}">${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}</figure>`;
    }
    return `<div class="image-asset-placeholder"><strong>Illustration brief</strong><p>${escapeHtml(block.description)}</p></div>`;
  }
  if (block.type === "qr_code") {
    const dataUrl = qrCodeDataUrls.get(block.data);
    if (!dataUrl) throw new Error("A workbook QR code could not be generated.");
    return `<figure class="workbook-qr-code" style="width:${block.sizeMm}mm"><img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(block.description)}"><figcaption>${escapeHtml(block.description)}</figcaption></figure>`;
  }
  if (block.type === "sound_asset") {
    const publicUrl = block.assetId
      ? soundAssetPublicUrls.get(block.assetId)
      : null;
    const dataUrl = publicUrl ? qrCodeDataUrls.get(publicUrl) : null;
    if (!dataUrl) {
      return `<div class="sound-asset-placeholder"><strong>Sound</strong><p>${escapeHtml(block.description)}</p></div>`;
    }
    return `<figure class="workbook-sound-qr" style="width:${block.qrSizeMm}mm"><strong>Listen</strong><img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(block.description)}"><figcaption>${escapeHtml(block.description)}</figcaption></figure>`;
  }
  if (block.type === "vocabulary_list") {
    return `<section class="reader-vocabulary"><h4>${escapeHtml(block.title ?? "Vocabulary")}</h4><dl>${block.entries.map((entry) => `<div><dt>${escapeHtml(entry.term)}${entry.pronunciation ? ` <span>${escapeHtml(entry.pronunciation)}</span>` : ""}</dt><dd>${escapeHtml(entry.definition)}</dd></div>`).join("")}</dl></section>`;
  }
  if (block.type === "reading_passage") {
    return `<article class="reader-passage">${block.title ? `<h4>${escapeHtml(block.title)}</h4>` : ""}${block.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}${block.attribution ? `<p class="passage-attribution">${escapeHtml(block.attribution)}</p>` : ""}</article>`;
  }
  return `<section class="character-practice"><div class="character-model">${escapeHtml(block.character)}</div><p>${[block.pronunciation, block.meaning].filter(Boolean).map(escapeHtml).join(" · ")}</p>${Array.from({ length: block.traceRows }, () => `<div class="character-trace-row"><span>${escapeHtml(block.character)}</span><span></span><span></span><span></span></div>`).join("")}</section>`;
}

function renderLearnBlock(
  block: WorkbookContent["chapters"][number]["lessons"][number]["learnBlocks"][number],
  definitions: Map<string, IllustrationDefinition>,
  theme: WorkbookThemeTokens,
  imageAssetDataUrls: Record<string, string>,
  qrCodeDataUrls: Map<string, string>,
  soundAssetPublicUrls: Map<string, string>,
): string {
  if (block.type === "layout_row") {
    const row: string = `<div class="workbook-layout-row" style="display:grid;grid-template-columns:repeat(${block.columns.length},minmax(0,1fr));gap:${block.columnGap ?? 16}px">${block.columns.map((column) => `<div class="workbook-layout-column">${column.blocks.map((child) => renderLearnBlock(child, definitions, theme, imageAssetDataUrls, qrCodeDataUrls, soundAssetPublicUrls)).join("")}</div>`).join("")}</div>`;
    return block.boxStyle
      ? `<div class="workbook-content-box"${workbookBoxStyleAttributes(block.boxStyle)}>${row}</div>`
      : row;
  }
  const html = renderLearnBlockContent(
    block,
    definitions,
    theme,
    imageAssetDataUrls,
    qrCodeDataUrls,
    soundAssetPublicUrls,
  );
  return block.boxStyle
    ? `<div class="workbook-content-box"${workbookBoxStyleAttributes(block.boxStyle)}>${html}</div>`
    : html;
}

function exerciseAnswer(
  exercise: WorkbookExercise,
) {
  if (exercise.answerKeyText) return exercise.answerKeyText;
  if (exercise.type === "matching") {
    return exercise.pairs
      .map((pair) => `${pair.left} — ${pair.right}`)
      .join("; ");
  }
  if (exercise.type === "write" || exercise.type === "draw_box")
    return exercise.sampleAnswer;
  return Array.isArray(exercise.correctAnswer)
    ? exercise.correctAnswer.join(" / ")
    : exercise.correctAnswer;
}

function renderExercise(
  exercise: WorkbookExercise,
) {
  if (
    exercise.type === "circle_choice" ||
    exercise.type === "multiple_choice"
  ) {
    return `${escapeHtml(exercise.prompt)}<ul class="options">${exercise.options.map((option, index) => `<li>(${String.fromCharCode(97 + index)}) ${escapeHtml(option)}</li>`).join("")}</ul>`;
  }
  if (exercise.type === "matching") {
    const rightById = new Map(
      exercise.pairs.map((pair) => [pair.id, pair.right]),
    );
    return `${escapeHtml(exercise.prompt)}<table class="matching"><thead><tr><th>${escapeHtml(exercise.leftLabel)}</th><th>${escapeHtml(exercise.rightLabel)}</th></tr></thead><tbody>${exercise.pairs.map((pair, index) => `<tr><td>${index + 1}. ${escapeHtml(pair.left)}</td><td>${String.fromCharCode(65 + index)}. ${escapeHtml(rightById.get(exercise.rightOrder[index]) ?? "")}</td></tr>`).join("")}</tbody></table>`;
  }
  if (exercise.type === "fill_in_blank") {
    const marker = "{{blank}}";
    if (exercise.prompt.includes(marker)) {
      const [before, ...after] = exercise.prompt.split(marker);
      return `${escapeHtml(before)}<span class="blank">&nbsp;</span>${escapeHtml(after.join(marker))}`;
    }
    return `${escapeHtml(exercise.prompt)} <span class="blank">&nbsp;</span>`;
  }
  if (exercise.type === "draw_box") {
    return `${escapeHtml(exercise.prompt)}<div class="draw-box" style="height:${exercise.boxHeightMm}mm"></div>`;
  }
  const lines = exercise.writingLines;
  return `${escapeHtml(exercise.prompt)}<div class="write-space">${Array.from({ length: lines }, () => '<div class="write-line"></div>').join("")}</div>`;
}

function renderPracticeItems(items: WorkbookPracticeItem[]) {
  let exerciseNumber = 0;
  const renderNumberedExercise = (exercise: WorkbookExercise) => {
    exerciseNumber += 1;
    return `<li value="${exerciseNumber}" data-exercise-id="${escapeHtml(exercise.id)}"${workbookBoxStyleAttributes(exercise.boxStyle)}>${renderExercise(exercise)}</li>`;
  };
  return `<ol>${items
    .map((item) => {
      if (item.type !== "layout_row") return renderNumberedExercise(item);
      return `<li class="workbook-layout-row-shell" style="list-style:none"><div class="workbook-layout-row"${workbookBoxStyleAttributes(item.boxStyle, ["display:grid", `grid-template-columns:repeat(${item.columns.length},minmax(0,1fr))`, `gap:${item.columnGap ?? 16}px`])}>${item.columns
        .map(
          (column) =>
            `<div class="workbook-layout-column"><ol>${column.exercises.map(renderNumberedExercise).join("")}</ol></div>`,
        )
        .join("")}</div></li>`;
    })
    .join("")}</ol>`;
}

function gradeBadge(content: WorkbookContent) {
  const label = content.gradeLabel
    .replace(/^Grades?\s+/i, "")
    .replace(/^Kindergarten$/i, "K");
  return {
    value: label,
    noun: label.length > 1 ? "Grades" : "Grade",
    className:
      label.length > 1 ? "grade-badge grade-badge--range" : "grade-badge",
  };
}

function renderWorkbookBody(
  content: WorkbookContent,
  definitions: Map<string, IllustrationDefinition>,
  theme: WorkbookThemeTokens,
  logoDataUrl: string,
  copyrightYear: number,
  layoutProfile: string,
  imageAssetDataUrls: Record<string, string>,
  qrCodeDataUrls: Map<string, string>,
  soundAssetPublicUrls: Map<string, string>,
  coverImageDataUrl?: string | null,
  coverImageAlt?: string | null,
) {
  const badge = gradeBadge(content);
  const toc = content.chapters
    .map(
      (chapter, chapterIndex) => `
    <h3>Chapter ${chapterIndex + 1}: ${escapeHtml(chapter.tocTitle ?? chapter.title)}</h3>
    <ol>${chapter.lessons.map((lesson, lessonIndex) => `<li><a href="#${escapeHtml(lesson.id)}">Lesson ${chapterIndex + 1}.${lessonIndex + 1} — ${escapeHtml(lesson.title)}</a></li>`).join("")}</ol>
  `,
    )
    .join("");
  const chapters = content.chapters
    .map(
      (chapter, chapterIndex) => `
    ${layoutProfile === "reader" ? "" : `<div class="chapter-page"><p class="chapter-marker">Chapter ${chapterIndex + 1}: ${escapeHtml(chapter.title)}</p></div>`}
    ${chapter.lessons
      .map((lesson, lessonIndex) => {
        const lessonNumber = `${chapterIndex + 1}.${lessonIndex + 1}`;
        return `
        <div class="lesson" id="${escapeHtml(lesson.id)}"${workbookBoxStyleAttributes(lesson.boxStyle)}>
          <h3 class="lesson-title">Lesson ${lessonNumber} — ${escapeHtml(lesson.title)}</h3>
          <span class="part-label">Part 1: Learn</span>
          <div class="intro"${workbookBoxStyleAttributes(lesson.learnSectionBoxStyle)}>${lesson.learnBlocks.map((block) => renderLearnBlock(block, definitions, theme, imageAssetDataUrls, qrCodeDataUrls, soundAssetPublicUrls)).join("")}</div>
          <span class="part-label">Part 2: Practice</span>
          <div class="exercises"${workbookBoxStyleAttributes(lesson.practiceSectionBoxStyle)}>${renderPracticeItems(lesson.exercises)}</div>
        </div>
        <div class="answer-key-page">
          <div class="ak-banner">FOR PARENTS ONLY — ANSWER KEY</div>
          <h3>Lesson ${lessonNumber} — ${escapeHtml(lesson.title)}</h3>
          <div class="answer-key">${flattenWorkbookExercises(lesson.exercises).map((exercise, index) => `<p><strong>${index + 1}.</strong> ${escapeHtml(exerciseAnswer(exercise))}</p>`).join("")}</div>
        </div>
      `;
      })
      .join("")}
  `,
    )
    .join("");
  return `
    <div class="cover">
      <div class="cover-header-bar"><div class="cover-logo-art"><img src="${logoDataUrl}" alt="Treeschool tree logo"></div><div class="logo">treeschool</div></div>
      <div class="${badge.className}">${escapeHtml(badge.value)}<div class="grade-badge-label">${badge.noun}</div></div>
      ${coverImageDataUrl ? `<div class="cover-symbol-wrap"><img class="cover-symbol" src="${coverImageDataUrl}" alt="${escapeHtml(coverImageAlt ?? `${content.subjectLabel} cover illustration`)}"></div>` : ""}
      <h1>${escapeHtml(content.subjectLabel)}</h1>
      ${content.isCore ? '<p class="core-label">Core Curriculum</p>' : ""}
      <p class="cover-note">${escapeHtml(content.subtitle ?? "A complete, print-ready homeschool workbook.")}</p>
      <div class="cover-edition-bar"><p class="edition-label">${escapeHtml(content.editionLabel)}</p></div>
    </div>
    <div class="publisher-page"><span class="header-label">Front Matter</span><p>Copyright &copy; ${copyrightYear} Treeschool. All rights reserved.</p><p>No part of this workbook may be reproduced, distributed, or transmitted in any form without prior written permission from Treeschool, except for personal or single-classroom use by the purchaser.</p><p class="publisher-site">www.treehomeschool.com</p></div>
    ${content.introduction.length ? `<div class="intro-page"><h1>Introduction</h1>${content.introduction.map((block) => renderLearnBlock(block, definitions, theme, imageAssetDataUrls, qrCodeDataUrls, soundAssetPublicUrls)).join("")}</div>` : ""}
    <div class="toc"><h1>Table of Contents</h1>${toc}</div>
    ${chapters}
  `;
}

async function logoDataUrl() {
  const bytes = await loadWorkbookAssetBytes("tree-icon.png");
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function buildWorkbookHtml(input: {
  content: WorkbookContent;
  theme: WorkbookThemeTokens;
  subjectKey: string;
  languageCode?: string;
  layoutProfile: string;
  scriptProfile: string;
  illustrationDefinitions?: IllustrationDefinition[];
  imageAssetDataUrls?: Record<string, string>;
  coverImageDataUrl?: string | null;
  coverImageAlt?: string | null;
  editionLabelOverride?: string | null;
  projectId?: string;
  publicAppUrl?: string;
  copyrightYear?: number;
}) {
  const [canonicalCss, overlayCss, fontCss, pagedJs, logo] = await Promise.all([
    loadWorkbookAsset("classic-workbook.css"),
    subjectOverlayCss(
      input.subjectKey,
      input.layoutProfile,
      input.scriptProfile,
    ),
    pinnedFontCss(),
    resolvePackageFile("pagedjs/dist/paged.polyfill.js").then((bytes) =>
      new TextDecoder().decode(bytes),
    ),
    logoDataUrl(),
  ]);
  const themedCanonicalCss = replaceCanonicalThemeColors(
    canonicalCss,
    input.theme,
  ).replaceAll(
    "{{SUBJECT_NAME}}",
    escapeCssStringContent(input.content.subjectLabel),
  );
  const tokenCss = compileWorkbookThemeCss(input.theme);
  const mechanicsIssues = validateCompiledThemeMechanics(themedCanonicalCss);
  if (mechanicsIssues.length) {
    throw new Error(
      `Workbook theme failed print-mechanics validation: ${mechanicsIssues.join(" ")}`,
    );
  }
  const definitions = new Map(
    (input.illustrationDefinitions ?? []).map((definition) => [
      definition.key,
      definition,
    ]),
  );
  const renderedContent = input.editionLabelOverride
    ? { ...input.content, editionLabel: input.editionLabelOverride }
    : input.content;
  const learnBlocks = [
    ...flattenWorkbookLearnBlocks(renderedContent.introduction),
    ...renderedContent.chapters.flatMap((chapter) =>
      chapter.lessons.flatMap((lesson) =>
        flattenWorkbookLearnBlocks(lesson.learnBlocks),
      ),
    ),
  ];
  const soundAssetPublicUrls = new Map<string, string>();
  for (const block of learnBlocks) {
    if (block.type !== "sound_asset" || !block.assetId || !block.contentType) {
      continue;
    }
    if (!input.projectId) {
      throw new Error("A workbook project id is required to render sound assets.");
    }
    soundAssetPublicUrls.set(
      block.assetId,
      workbookSoundPublicUrl(
        {
          projectId: input.projectId,
          assetId: block.assetId,
          contentType: block.contentType,
        },
        input.publicAppUrl ?? env.PUBLIC_APP_URL ?? "https://www.treehomeschool.com",
      ),
    );
  }
  const qrCodeData = new Set([
    ...learnBlocks
      .filter((block) => block.type === "qr_code")
      .map((block) => block.data),
    ...soundAssetPublicUrls.values(),
  ]);
  const qrCodeDataUrls = new Map(
    await Promise.all(
      [...qrCodeData].map(async (data) => [
        data,
        await renderWorkbookQrCodeDataUrl(data, input.theme.colorInk),
      ] as const),
    ),
  );
  const body = renderWorkbookBody(
    renderedContent,
    definitions,
    input.theme,
    logo,
    input.copyrightYear ?? 2026,
    input.layoutProfile,
    input.imageAssetDataUrls ?? {},
    qrCodeDataUrls,
    soundAssetPublicUrls,
    input.coverImageDataUrl,
    input.coverImageAlt,
  );
  return `<!doctype html>
<html lang="${escapeHtml(input.languageCode ?? "en")}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.content.title)}</title>
<style>${fontCss}</style>
<style>${themedCanonicalCss}\n${overlayCss}\n${tokenCss}\n
.workbook-illustration { margin: 12px auto; break-inside: avoid; page-break-inside: avoid; text-align: center; }
.workbook-illustration svg { max-width: 100%; height: auto; }
.workbook-illustration figcaption { margin-top: 4px; color: var(--earth); font-size: 10pt; }
.workbook-image { break-inside: avoid; page-break-inside: avoid; text-align: center; }
.workbook-image img { display: block; width: 100%; max-width: 100%; height: auto; }
.workbook-image figcaption { margin-top: 4px; color: var(--earth); font-size: 10pt; }
.workbook-qr-code { margin: 12px auto; break-inside: avoid; page-break-inside: avoid; text-align: center; }
.workbook-qr-code img { display: block; width: 100%; height: auto; }
.workbook-qr-code figcaption { margin-top: 5px; color: var(--earth); font-size: 10pt; line-height: 1.35; }
.workbook-sound-qr { margin: 12px auto; break-inside: avoid; page-break-inside: avoid; text-align: center; }
.workbook-sound-qr strong { display: block; margin-bottom: 4px; color: var(--leaf-dark); font-family: var(--heading-font); font-size: 12pt; }
.workbook-sound-qr img { display: block; width: 100%; height: auto; }
.workbook-sound-qr figcaption { margin-top: 5px; color: var(--earth); font-size: 10pt; line-height: 1.35; }
.lesson-callout, .image-asset-placeholder, .sound-asset-placeholder { margin: 10px 0; padding: 10px 14px; border: 2px solid var(--leaf); border-radius: 12px; break-inside: avoid; }
.draw-box { margin-top: 10px; border: 2px solid var(--ink); break-inside: avoid; }
.reader-vocabulary, .reader-passage, .character-practice { margin: 12px 0; break-inside: avoid; page-break-inside: avoid; }
.reader-vocabulary dl > div { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--sand); }
.reader-vocabulary dt { font-weight: 700; color: var(--leaf-dark); }
.reader-vocabulary dd { margin: 0; }
.passage-attribution { color: var(--earth); font-size: 10pt; text-align: right; }
.character-model { font-family: "Noto Sans JP", sans-serif; font-size: 42pt; color: var(--leaf-dark); text-align: center; }
.character-trace-row { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 6px; }
.character-trace-row span { display: grid; min-height: 22mm; place-items: center; border: 1px dashed var(--earth); font-family: "Noto Sans JP", sans-serif; font-size: 28pt; }
.character-trace-row span:first-child { color: color-mix(in srgb, var(--earth) 35%, transparent); }
</style>
<script>window.PagedConfig={auto:false};</script>
<script>${safeInlineScript(pagedJs)}</script>
</head>
<body>${body}<script>
(async()=>{try{await document.fonts.load('40px "Bravura"','\uE050\uE084\uE0A4');await document.fonts.ready;await window.PagedPolyfill.preview();window.__WORKBOOK_PAGED_DONE__=true;}catch(error){window.__WORKBOOK_PAGED_ERROR__=String(error&&error.stack||error);}})();
</script></body>
</html>`;
}

export async function renderWorkbookPdf(html: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 960 },
    });
    await page.setContent(html, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(
      () =>
        Boolean(
          (globalThis as unknown as { __WORKBOOK_PAGED_DONE__?: boolean })
            .__WORKBOOK_PAGED_DONE__,
        ) ||
        Boolean(
          (globalThis as unknown as { __WORKBOOK_PAGED_ERROR__?: string })
            .__WORKBOOK_PAGED_ERROR__,
        ),
      undefined,
      { timeout: 120_000 },
    );
    const pagedError = await page.evaluate(
      () =>
        (globalThis as unknown as { __WORKBOOK_PAGED_ERROR__?: string })
          .__WORKBOOK_PAGED_ERROR__,
    );
    if (pagedError) throw new Error(`Paged.js failed: ${pagedError}`);
    const coverDiagnostics = await page
      .locator(".pagedjs_page .cover")
      .first()
      .evaluate((element) => {
        const view = globalThis as unknown as {
          getComputedStyle(target: unknown): {
            backgroundColor: string;
            borderWidth: string;
            height: string;
          };
        };
        const style = view.getComputedStyle(element);
        const image = element.querySelector("img");
        return {
          backgroundColor: style.backgroundColor,
          borderWidth: style.borderWidth,
          height: style.height,
          imageHeight: image ? view.getComputedStyle(image).height : null,
        };
      });
    const pdf = await page.pdf({
      width: "210mm",
      height: "297mm",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    const document = await PDFDocument.load(pdf);
    const pageSize = document.getPage(0).getSize();
    return {
      pdf: new Uint8Array(pdf),
      pageCount: document.getPageCount(),
      pageWidthPoints: pageSize.width,
      pageHeightPoints: pageSize.height,
      coverDiagnostics,
      chromiumVersion: browser.version(),
    };
  } finally {
    await browser.close();
  }
}

export function themeTokensFromRow(
  row: typeof workbookThemeVersions.$inferSelect,
): WorkbookThemeTokens {
  return workbookThemeTokensSchema.parse({
    colorInk: row.colorInk,
    colorEarth: row.colorEarth,
    colorLeaf: row.colorLeaf,
    colorLeafDark: row.colorLeafDark,
    colorCream: row.colorCream,
    colorSand: row.colorSand,
    colorCanvas: row.colorCanvas,
    colorCoverAccent: row.colorCoverAccent,
    colorCoverAccentSoft: row.colorCoverAccentSoft,
    headingFontFamily: row.headingFontFamily,
    bodyFontFamily: row.bodyFontFamily,
    pageSize: row.pageSize,
    pageMarginTopMm: row.pageMarginTopMm,
    pageMarginRightMm: row.pageMarginRightMm,
    pageMarginBottomMm: row.pageMarginBottomMm,
    pageMarginLeftMm: row.pageMarginLeftMm,
    firstPageMarginTopMm: row.firstPageMarginTopMm,
    firstPageMarginRightMm: row.firstPageMarginRightMm,
    firstPageMarginBottomMm: row.firstPageMarginBottomMm,
    firstPageMarginLeftMm: row.firstPageMarginLeftMm,
    bodyFontSizePt: row.bodyFontSizePt,
    bodyLineHeight: row.bodyLineHeight,
  });
}

function workbookImageAssetExtension(contentType: string) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  throw new Error(`Unsupported workbook image type: ${contentType}`);
}

async function loadWorkbookImageAssetDataUrls(
  projectId: string,
  content: WorkbookContent,
) {
  const blocks = [
    ...flattenWorkbookLearnBlocks(content.introduction),
    ...content.chapters.flatMap((chapter) =>
      chapter.lessons.flatMap((lesson) =>
        flattenWorkbookLearnBlocks(lesson.learnBlocks),
      ),
    ),
  ];
  const assets = new Map<
    string,
    { assetId: string; contentType: "image/jpeg" | "image/png" | "image/webp" }
  >();
  for (const block of blocks) {
    if (block.type === "image_asset" && block.assetId && block.contentType) {
      assets.set(block.assetId, {
        assetId: block.assetId,
        contentType: block.contentType,
      });
    }
  }
  return Object.fromEntries(
    await Promise.all(
      [...assets.values()].map(async (asset) => {
        const extension = workbookImageAssetExtension(asset.contentType);
        const objectPath = `workbook-studio/${projectId}/assets/${asset.assetId}.${extension}`;
        const bytes = await downloadPrivateFile(objectPath);
        return [
          asset.assetId,
          `data:${asset.contentType};base64,${Buffer.from(bytes).toString("base64")}`,
        ] as const;
      }),
    ),
  );
}

export async function executeWorkbookRenderRun(renderRunId: string) {
  const [row] = await db
    .select({
      run: workbookRenderRuns,
      project: workbookProjects,
      subjectKey: curriculumSubjects.key,
      revision: workbookContentRevisions,
      theme: workbookThemeVersions,
    })
    .from(workbookRenderRuns)
    .innerJoin(
      workbookProjects,
      eq(workbookProjects.id, workbookRenderRuns.projectId),
    )
    .innerJoin(workbookCourses, eq(workbookCourses.id, workbookProjects.courseId))
    .innerJoin(
      curriculumSubjects,
      eq(curriculumSubjects.id, workbookCourses.curriculumSubjectId),
    )
    .innerJoin(
      workbookContentRevisions,
      eq(workbookContentRevisions.id, workbookRenderRuns.contentRevisionId),
    )
    .innerJoin(
      workbookThemeVersions,
      eq(workbookThemeVersions.id, workbookRenderRuns.themeVersionId),
    )
    .where(eq(workbookRenderRuns.id, renderRunId))
    .limit(1);
  if (!row) throw new Error("Workbook render run not found.");
  if (row.theme.status !== "published")
    throw new Error(
      "Only a published theme version can render a release artifact.",
    );
  const content = parseWorkbookContent(row.revision.contentJson);
  const validationIssues = await validateWorkbookForScope(content, {
    ...row.project,
    subjectKey: row.subjectKey,
  });
  const blockingIssues = validationIssues.filter(
    (issue) => issue.severity === "error",
  );
  if (blockingIssues.length)
    throw new Error(blockingIssues.map((issue) => issue.message).join(" "));

  const illustrations = await db
    .select({
      key: workbookIllustrationTypes.key,
      rendererKind: workbookIllustrationTypes.rendererKind,
      svgTemplate: workbookIllustrationTypes.svgTemplate,
      wrapperClass: workbookIllustrationTypes.wrapperClass,
      tokenBindingsJson: workbookIllustrationTypes.tokenBindingsJson,
    })
    .from(workbookIllustrationTypes)
    .where(eq(workbookIllustrationTypes.status, "active"));
  await db
    .update(workbookRenderRuns)
    .set({ status: "running", lastError: null })
    .where(eq(workbookRenderRuns.id, renderRunId));
  try {
    const imageAssetDataUrls = await loadWorkbookImageAssetDataUrls(
      row.project.id,
      content,
    );
    const coverImageDataUrl = row.project.coverImageObjectPath
      ? `data:image/png;base64,${Buffer.from(
          await downloadPrivateFile(row.project.coverImageObjectPath),
        ).toString("base64")}`
      : null;
    const html = await buildWorkbookHtml({
      content,
      theme: themeTokensFromRow(row.theme),
      subjectKey: row.subjectKey,
      languageCode: row.project.languageCode,
      layoutProfile: row.project.layoutProfile,
      scriptProfile: row.project.scriptProfile,
      illustrationDefinitions: illustrations,
      imageAssetDataUrls,
      coverImageDataUrl,
      coverImageAlt: row.project.coverImageAlt,
      editionLabelOverride: row.run.optionsJson.editionLabelOverride ?? null,
      projectId: row.project.id,
      copyrightYear: row.run.optionsJson.copyrightYear ?? 2026,
    });
    const rendered = await renderWorkbookPdf(html);
    const prefix = `workbook-studio/${row.project.id}/renders/${row.run.id}`;
    const htmlObjectPath = `${prefix}/${basename(row.project.slug)}.html`;
    const pdfObjectPath = `${prefix}/${basename(row.project.slug)}.pdf`;
    await Promise.all([
      uploadPrivateFile({
        objectPath: htmlObjectPath,
        contentType: "text/html; charset=utf-8",
        data: new TextEncoder().encode(html),
      }),
      uploadPrivateFile({
        objectPath: pdfObjectPath,
        contentType: "application/pdf",
        data: rendered.pdf,
      }),
    ]);
    await db
      .update(workbookRenderRuns)
      .set({
        status: "completed",
        rendererVersion: RENDERER_VERSION,
        chromiumVersion: rendered.chromiumVersion,
        pagedJsVersion: PAGED_JS_VERSION,
        fontManifestJson: FONT_MANIFEST,
        htmlObjectPath,
        pdfObjectPath,
        pageCount: rendered.pageCount,
        validationJson: { issues: validationIssues },
        completedAt: new Date(),
        lastError: null,
      })
      .where(
        and(
          eq(workbookRenderRuns.id, renderRunId),
          eq(workbookRenderRuns.status, "running"),
        ),
      );
    return { ...rendered, htmlObjectPath, pdfObjectPath, validationIssues };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Workbook render failed.";
    await db
      .update(workbookRenderRuns)
      .set({
        status: "failed",
        lastError: message,
        completedAt: new Date(),
      })
      .where(eq(workbookRenderRuns.id, renderRunId));
    throw error;
  }
}

export const workbookRendererManifest = {
  rendererVersion: RENDERER_VERSION,
  pagedJsVersion: PAGED_JS_VERSION,
  fonts: FONT_MANIFEST,
};
