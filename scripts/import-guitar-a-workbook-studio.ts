import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull, sql } from "drizzle-orm";
import { chromium } from "playwright";
import {
  curriculumSubjects,
  workbookContentRevisions,
  workbookCourses,
  workbookIllustrationTypes,
  workbookProjects,
  workbookRenderRuns,
  workbookThemes,
  workbookThemeVersions,
} from "ts-db";
import { client, db } from "../app/ts-backend/src/db";
import { uploadPrivateFile } from "../app/ts-backend/src/services/media";
import {
  buildWorkbookHtml,
  executeWorkbookRenderRun,
  renderWorkbookPdf,
  themeTokensFromRow,
} from "../app/ts-backend/src/services/workbook-renderer";
import {
  parseWorkbookContent,
  validateWorkbookForPublish,
  workbookLessonIdFingerprint,
  type WorkbookContent,
  type WorkbookLearnBlockLeaf,
} from "../app/ts-backend/src/services/workbook-studio-model";

type RawIntroItem =
  | { kind: "paragraph"; text: string }
  | {
      kind: "rhythm";
      items: Array<{ beats: number; subdivisions: number; label: string }>;
    }
  | {
      kind: "svg_group";
      wrapperClass: string;
      figures: Array<{
        svg: string;
        label: string | null;
        altText: string;
      }>;
    }
  | {
      kind: "chord_group";
      figures: Array<{
        label: string | null;
        markers: string[];
        fingers: Array<{ string: number; fret: number; finger: string }>;
      }>;
    }
  | {
      kind: "chord_chart";
      lines: Array<{ chord: string; text: string }>;
    };

type RawExercise = {
  prompt: string;
  options: string[];
  matchingHeaders: [string, string] | null;
  matchingRows: Array<{ left: string; right: string }>;
  writingLines: number;
  answer: string;
};

type RawWorkbook = {
  tocTitles: string[];
  chapters: Array<{
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      intro: RawIntroItem[];
      exercises: RawExercise[];
    }>;
  }>;
};

type IllustrationSeed = {
  key: string;
  name: string;
  description: string;
  rendererKind: string;
  parameterSchemaJson: Record<string, unknown>;
  svgTemplate: string | null;
  wrapperClass: string | null;
  tokenBindingsJson: Record<string, string>;
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const workbooksRoot = resolve(
  process.env.TREESCHOOL_WORKBOOKS_PATH ??
    join(repositoryRoot, "../treeschool-workbooks"),
);
const sourceDirectory = join(
  workbooksRoot,
  "workbook-content/1to6-guitar-a",
);
const sourceHtmlPath = join(sourceDirectory, "workbook.html");
const sourcePdfPath = join(
  sourceDirectory,
  "Treeschool-Grade-1to6-Guitar-A-1st-Edition.pdf",
);
const coverImagePath = join(sourceDirectory, "assets/cover-img.png");

const apply = process.argv.includes("--apply");
const render = process.argv.includes("--render");
const localRender = process.argv.includes("--local-render");
const skipObjectUpload = process.argv.includes("--skip-object-upload");
const outputPdfArgument = process.argv.find((value) =>
  value.startsWith("--output-pdf="),
);

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${canonicalJson(entry)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripNumberPrefix(value: string) {
  return value.replace(/^\d+\.\s*/, "").trim();
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const bravuraGlyphPaths: Record<string, string> = {
  "\uE050": "M376 415Q375 424 376 427Q378 430 382 434Q465 510 518 605Q570 700 572 815Q572 881 555 942Q538 1002 507 1048Q495 1066 480 1081Q464 1097 455 1098Q444 1097 425 1082Q406 1067 390 1050Q335 987 313 903Q291 819 292 739Q292 695 296 651Q301 607 306 575Q308 567 307 562Q306 558 297 551Q184 463 95 350Q5 237 0 87Q0 -48 90 -148Q180 -247 364 -252Q382 -252 400 -250Q418 -249 433 -246Q441 -244 444 -245Q447 -246 448 -255Q458 -307 466 -363Q474 -419 475 -456Q471 -563 418 -594Q365 -625 316 -622Q276 -621 256 -612Q236 -603 236 -593Q236 -588 243 -584Q251 -581 268 -576Q293 -570 313 -547Q334 -525 335 -482Q335 -440 310 -410Q285 -381 239 -380Q188 -381 160 -414Q132 -447 132 -495Q130 -548 170 -601Q211 -654 322 -658Q378 -661 446 -622Q513 -582 519 -458Q518 -413 509 -353Q499 -293 490 -244Q488 -236 491 -233Q493 -231 503 -227Q580 -196 625 -135Q670 -74 671 11Q670 110 606 180Q542 249 430 252Q411 251 407 254Q402 257 401 270ZM470 943Q495 943 512 923Q529 902 530 861Q527 778 473 710Q419 643 356 591Q351 586 348 588Q344 589 343 599Q340 619 339 643Q337 667 337 691Q340 809 381 876Q422 942 470 943ZM361 262Q364 249 361 245Q359 242 346 238Q279 214 241 162Q202 109 201 44Q202 -24 233 -70Q264 -115 316 -133Q322 -135 330 -137Q337 -139 343 -139Q349 -139 352 -136Q355 -133 355 -128Q355 -123 350 -120Q346 -117 340 -115Q308 -101 288 -72Q269 -43 268 -8Q269 35 295 66Q322 96 368 109Q380 112 383 111Q387 109 388 101L438 -197Q440 -205 437 -207Q435 -209 424 -211Q412 -213 398 -215Q383 -216 368 -216Q235 -214 158 -150Q82 -86 80 20Q78 64 95 123Q113 181 173 252Q218 301 254 334Q291 366 326 394Q333 400 336 399Q339 398 340 390ZM430 103Q428 112 430 115Q432 118 441 117Q503 110 545 66Q587 21 589 -46Q588 -94 563 -130Q538 -167 495 -188Q486 -193 483 -192Q480 -191 479 -182Z",
  "\uE084": "M362 -74V140Q362 146 360 152Q358 157 350 157Q343 157 339 155Q334 153 330 148L235 33Q232 29 229 24Q226 19 226 10V-74H91Q158 -11 241 101Q324 212 334 233L335 236Q335 243 331 247Q326 251 320 251Q312 251 289 250Q267 249 252 249Q237 249 213 250Q189 251 181 251Q174 251 166 248Q159 244 158 232Q153 136 105 49Q58 -38 30 -73L24 -81Q24 -81 24 -82L23 -83Q20 -90 20 -95Q20 -103 26 -107Q31 -112 40 -112H226V-175Q225 -195 213 -203Q200 -210 186 -210Q174 -210 169 -216Q163 -221 163 -229Q163 -237 167 -243Q171 -250 182 -250H395Q403 -250 409 -245Q415 -239 415 -229Q415 -219 408 -214Q401 -209 393 -209Q385 -210 374 -202Q363 -194 362 -171V-112H435Q450 -111 450 -93Q450 -84 447 -79Q443 -74 435 -74Z",
  "\uE0A4": "M97 -125Q168 -123 229 -73Q291 -24 295 42Q294 81 268 103Q241 125 198 125Q113 123 58 74Q2 25 0 -42Q1 -81 28 -103Q56 -125 97 -125Z",
};

function vectorizeBravuraGlyphs(svg: string) {
  if (!svg.includes("Bravura")) return svg;
  return svg.replace(
    /<text([^>]*)>([\uE000-\uF8FF])<\/text>/g,
    (match, attributes: string, glyph: string) => {
      const path = bravuraGlyphPaths[glyph];
      if (!path) return match;
      const x = Number(attributes.match(/\bx="([^"]+)"/)?.[1] ?? 0);
      const y = Number(attributes.match(/\by="([^"]+)"/)?.[1] ?? 0);
      const sizeValue = attributes.match(/\bfont-size="([^"]+)"/)?.[1] ??
        "10pt";
      const size = Number.parseFloat(sizeValue);
      const pixels = sizeValue.endsWith("pt") ? size * (4 / 3) : size;
      const scale = pixels / 1000;
      return `<path d="${path}" transform="translate(${x} ${y}) scale(${scale} ${-scale})" stroke="none"/>`;
    },
  );
}

function themeSvgTemplate(svg: string) {
  const bindings: Record<string, string> = {};
  const colors: Array<[RegExp, string, string]> = [
    [/#25201B/gi, "ink", "ink"],
    [/#8F6544/gi, "earth", "earth"],
    [/#739E56/gi, "leaf", "leaf"],
    [/#567B40/gi, "leafDark", "leafDark"],
    [/#FFFAF2/gi, "cream", "cream"],
    [/#F6EDDC/gi, "sand", "sand"],
    [/#FFFFFF/gi, "canvas", "canvas"],
    [/#2F6690/gi, "coverAccent", "coverAccent"],
    [/#E3EEF5/gi, "coverAccentSoft", "coverAccentSoft"],
  ];
  let template = svg;
  for (const [pattern, binding, token] of colors) {
    if (pattern.test(template)) {
      pattern.lastIndex = 0;
      template = template.replace(pattern, `{{theme:${binding}}}`);
      bindings[binding] = token;
    }
  }
  return { template, bindings };
}

async function parseSourceHtml(sourceHtml: string): Promise<RawWorkbook> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const offlineHtml = sourceHtml.replace(
      /<script src="https:\/\/unpkg\.com\/pagedjs[^>]*><\/script>/,
      "",
    );
    await page.setContent(offlineHtml, { waitUntil: "domcontentloaded" });
    return await page.evaluate(() => {
      const clean = (value: string | null | undefined) =>
        String(value ?? "")
          .replace(/\s+/g, " ")
          .trim();
      const childText = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
        if (!(node instanceof HTMLElement)) return "";
        if (
          node.classList.contains("options") ||
          node.classList.contains("matching") ||
          node.classList.contains("write-space")
        )
          return "";
        if (node.classList.contains("blank")) return "{{blank}}";
        return [...node.childNodes].map(childText).join("");
      };
      const parseChordFigure = (figure: Element) => {
        const svg = figure.querySelector("svg");
        const strings = [10, 30, 50, 70, 90, 110];
        const markerByX = new Map<number, string>();
        const fingerTextByX = new Map<number, string>();
        for (const text of svg?.querySelectorAll("text") ?? []) {
          const x = Number(text.getAttribute("x"));
          const value = clean(text.textContent);
          if (value === "X" || value === "O") markerByX.set(x, value);
          else if (/^[1-4]$/.test(value)) fingerTextByX.set(x, value);
        }
        const fingers = [...(svg?.querySelectorAll("circle") ?? [])].map(
          (circle) => {
            const x = Number(circle.getAttribute("cx"));
            const y = Number(circle.getAttribute("cy"));
            return {
              string: strings.indexOf(x) + 1,
              fret: Math.round((y - 8) / 24),
              finger: fingerTextByX.get(x) ?? "",
            };
          },
        );
        return {
          label: clean(figure.querySelector(".chord-label")?.textContent) || null,
          markers: strings.map((x) => markerByX.get(x) ?? ""),
          fingers,
        };
      };
      const parseIntro = (intro: Element) => {
        const items: RawIntroItem[] = [];
        for (const child of [...intro.children]) {
          if (
            child.matches("p") &&
            !child.classList.contains("notation-caption")
          ) {
            items.push({ kind: "paragraph", text: clean(child.textContent) });
            continue;
          }
          if (child.classList.contains("rhythm-row")) {
            items.push({
              kind: "rhythm",
              items: [...child.querySelectorAll(".rhythm-box")].map((box) => ({
                beats: box.classList.contains("beat-2") ? 2 : 1,
                subdivisions: box.querySelector(".rbox-pair") ? 2 : 1,
                label: clean(box.querySelector(".rbox-syllable")?.textContent),
              })),
            });
            continue;
          }
          if (child.classList.contains("chord-chart-box")) {
            items.push({
              kind: "chord_chart",
              lines: [...child.children].map((line) => {
                const chord = clean(
                  line.querySelector(".chord-name")?.textContent,
                );
                const clone = line.cloneNode(true) as HTMLElement;
                clone.querySelector(".chord-name")?.remove();
                return { chord, text: clean(clone.textContent) };
              }),
            });
            continue;
          }
          if (child.classList.contains("guitar-chord-row")) {
            items.push({
              kind: "chord_group",
              figures: [...child.querySelectorAll(".guitar-chord-figure")].map(
                parseChordFigure,
              ),
            });
            continue;
          }
          const groupClasses = [
            "concept-figure-row",
            "hand-figure-row",
          ];
          const groupClass = groupClasses.find((name) =>
            child.classList.contains(name),
          );
          if (groupClass) {
            items.push({
              kind: "svg_group",
              wrapperClass:
                groupClass === "hand-figure-row"
                  ? "concept-figure"
                  : "concept-figure",
              figures: [...child.querySelectorAll(":scope > div")].map(
                (figure) => ({
                  svg: figure.querySelector("svg")?.outerHTML ?? "",
                  label:
                    clean(
                      figure.querySelector(
                        ".chord-label, .notation-caption, span",
                      )?.textContent,
                    ) || null,
                  altText:
                    clean(figure.getAttribute("aria-label")) ||
                    clean(figure.textContent) ||
                    "Music concept diagram",
                }),
              ),
            });
            continue;
          }
          if (
            child.classList.contains("staff-figure") ||
            child.classList.contains("anatomy-figure")
          ) {
            const next = child.nextElementSibling;
            items.push({
              kind: "svg_group",
              wrapperClass: child.classList.contains("staff-figure")
                ? "staff-figure"
                : "anatomy-figure",
              figures: [
                {
                  svg: child.querySelector("svg")?.outerHTML ?? "",
                  label:
                    next?.classList.contains("notation-caption") === true
                      ? clean(next.textContent)
                      : null,
                  altText:
                    clean(child.getAttribute("aria-label")) ||
                    clean(next?.textContent) ||
                    "Music diagram",
                },
              ],
            });
          }
        }
        return items;
      };
      const answerKeyByLesson = new Map<string, string[]>();
      for (const answerPage of document.querySelectorAll(".answer-key-page")) {
        const heading = clean(answerPage.querySelector("h3")?.textContent);
        const lessonNumber = heading.match(/^Lesson\s+(\d+\.\d+)/)?.[1];
        if (!lessonNumber) continue;
        answerKeyByLesson.set(
          lessonNumber,
          [...answerPage.querySelectorAll(".answer-key p")].map((answer) =>
            clean(answer.textContent).replace(/^\d+\.\s*/, ""),
          ),
        );
      }
      const tocTitles = [...document.querySelectorAll(".toc h3")].map((heading) =>
        clean(heading.textContent).replace(/^Chapter\s+\d+:\s*/, ""),
      );
      const chapters: RawWorkbook["chapters"] = [];
      let currentChapter: RawWorkbook["chapters"][number] | null = null;
      for (const child of [...document.body.children]) {
        if (child.classList.contains("chapter-page")) {
          currentChapter = {
            title: clean(child.textContent).replace(/^Chapter\s+\d+:\s*/, ""),
            lessons: [],
          };
          chapters.push(currentChapter);
          continue;
        }
        if (!child.classList.contains("lesson") || !currentChapter) continue;
        const titleText = clean(child.querySelector(".lesson-title")?.textContent);
        const lessonNumber = titleText.match(/^Lesson\s+(\d+\.\d+)/)?.[1] ?? "";
        const answers = answerKeyByLesson.get(lessonNumber) ?? [];
        const exercises = [...child.querySelectorAll(".exercises > ol > li")].map(
          (item, index) => ({
            prompt: clean([...item.childNodes].map(childText).join("")),
            options: [...item.querySelectorAll(":scope > .options > li")].map(
              (option) => clean(option.textContent).replace(/^\([a-z]\)\s*/i, ""),
            ),
            matchingHeaders: (() => {
              const headers = item.querySelectorAll(
                ":scope > table.matching tr:first-child th",
              );
              return headers.length >= 2
                ? [clean(headers[0].textContent), clean(headers[1].textContent)]
                : null;
            })(),
            matchingRows: [...item.querySelectorAll(":scope > table.matching tr")]
              .slice(1)
              .map((row) => {
                const cells = row.querySelectorAll("td");
                return {
                  left: clean(cells[0]?.textContent).replace(/^\d+\.\s*/, ""),
                  right: clean(cells[1]?.textContent).replace(/^[A-Z]\.\s*/, ""),
                };
              }),
            writingLines: item.querySelectorAll(".write-line").length,
            answer: answers[index] ?? "",
          }),
        );
        currentChapter.lessons.push({
          id: child.id,
          title: titleText.replace(/^Lesson\s+\d+\.\d+\s+[—-]\s*/, ""),
          intro: parseIntro(child.querySelector(".intro")!),
          exercises,
        });
      }
      return { tocTitles, chapters };
    });
  } finally {
    await browser.close();
  }
}

function illustrationKey(lessonId: string, index: number, label: string | null) {
  const fixed: Record<string, string[]> = {
    "gtr-2-1": ["music-staff-blank-treble"],
    "gtr-2-2": ["music-staff-ascending-cdef"],
    "gtr-3-3": [
      "music-pitch-contour-up",
      "music-pitch-contour-down",
      "music-pitch-contour-repeat",
    ],
    "gtr-4-1": ["music-string-vibration-comparison"],
    "gtr-4-2": ["music-string-pitch-comparison"],
    "gtr-5-1": ["music-guitar-anatomy"],
    "gtr-6-1": ["music-open-string-layout"],
    "gtr-7-1": ["music-fretting-hand-numbers"],
    "gtr-7-2": ["music-picking-hand-letters"],
  };
  return fixed[lessonId]?.[index] ??
    `music-${lessonId}-${slugify(label ?? `diagram-${index + 1}`)}`;
}

function buildStructuredWorkbook(raw: RawWorkbook) {
  const illustrationSeeds = new Map<string, IllustrationSeed>();
  const addCustomSeeds = () => {
    illustrationSeeds.set("music-rhythm-boxes", {
      key: "music-rhythm-boxes",
      name: "Music rhythm boxes",
      description:
        "A parameterized row of proportional beat boxes with spoken rhythm syllables.",
      rendererKind: "music_rhythm_boxes",
      parameterSchemaJson: {
        type: "object",
        required: ["items"],
        properties: { items: { type: "array" } },
      },
      svgTemplate: null,
      wrapperClass: "rhythm-row",
      tokenBindingsJson: {},
    });
    illustrationSeeds.set("music-guitar-chord", {
      key: "music-guitar-chord",
      name: "Guitar chord diagram",
      description:
        "A parameterized six-string chord box with open/muted markers and finger positions.",
      rendererKind: "music_guitar_chord",
      parameterSchemaJson: {
        type: "object",
        required: ["markers", "fingers"],
        properties: {
          markers: { type: "array", minItems: 6, maxItems: 6 },
          fingers: { type: "array" },
        },
      },
      svgTemplate: null,
      wrapperClass: "guitar-chord-figure",
      tokenBindingsJson: {},
    });
    illustrationSeeds.set("music-chord-chart", {
      key: "music-chord-chart",
      name: "Guitar lyric chord chart",
      description:
        "A structured chord-and-lyric chart used for printable beginner songs.",
      rendererKind: "music_chord_chart",
      parameterSchemaJson: {
        type: "object",
        required: ["lines"],
        properties: { lines: { type: "array" } },
      },
      svgTemplate: null,
      wrapperClass: "chord-chart-box",
      tokenBindingsJson: {},
    });
  };
  addCustomSeeds();

  const chapters = raw.chapters.map((chapter, chapterIndex) => ({
    id: `chapter-${chapterIndex + 1}`,
    title: chapter.title,
    tocTitle: raw.tocTitles[chapterIndex] ?? chapter.title,
    lessons: chapter.lessons.map((lesson) => {
      let svgIndex = 0;
      const learnBlocks: WorkbookContent["chapters"][number]["lessons"][number]["learnBlocks"] = [];
      for (const item of lesson.intro) {
        if (item.kind === "paragraph") {
          learnBlocks.push({ type: "paragraph", text: item.text });
          continue;
        }
        if (item.kind === "rhythm") {
          learnBlocks.push({
            type: "illustration",
            illustrationType: "music-rhythm-boxes",
            parameters: { items: item.items },
            altText: "A proportional rhythm-box pattern",
          });
          continue;
        }
        if (item.kind === "chord_chart") {
          learnBlocks.push({
            type: "illustration",
            illustrationType: "music-chord-chart",
            parameters: { lines: item.lines },
            altText: "A guitar chord chart with chord names above lyrics",
          });
          continue;
        }
        if (item.kind === "chord_group") {
          const blocks = item.figures.map((figure) => ({
            type: "illustration" as const,
            illustrationType: "music-guitar-chord",
            parameters: {
              markers: figure.markers,
              fingers: figure.fingers,
            },
            altText: `${figure.label ?? "Guitar"} chord fingering diagram`,
            caption: figure.label ?? undefined,
          }));
          if (blocks.length === 1) learnBlocks.push(blocks[0]);
          else {
            learnBlocks.push({
              id: `${lesson.id}-chord-row`,
              type: "layout_row",
              columnGap: 28,
              columns: blocks.map((block, index) => ({
                id: `${lesson.id}-chord-column-${index + 1}`,
                blocks: [block],
              })),
            });
          }
          continue;
        }
        const blocks: WorkbookLearnBlockLeaf[] = item.figures.map((figure) => {
          const key = illustrationKey(lesson.id, svgIndex, figure.label);
          svgIndex += 1;
          const themed = themeSvgTemplate(vectorizeBravuraGlyphs(figure.svg));
          illustrationSeeds.set(key, {
            key,
            name: (figure.label || key)
              .replace(/^music-/, "")
              .split("-")
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" "),
            description: `Trusted ${lesson.title} illustration imported from the shipped Guitar A workbook.`,
            rendererKind: "parameterized_svg",
            parameterSchemaJson: {},
            svgTemplate: themed.template,
            wrapperClass: item.wrapperClass,
            tokenBindingsJson: themed.bindings,
          });
          return {
            type: "illustration",
            illustrationType: key,
            parameters: {},
            altText: figure.altText,
            caption: figure.label ?? undefined,
          };
        });
        if (blocks.length === 1) learnBlocks.push(blocks[0]);
        else {
          learnBlocks.push({
            id: `${lesson.id}-diagram-row`,
            type: "layout_row",
            columnGap: 20,
            columns: blocks.map((block, index) => ({
              id: `${lesson.id}-diagram-column-${index + 1}`,
              blocks: [block],
            })),
          });
        }
      }

      const exercises = lesson.exercises.map((exercise, exerciseIndex) => {
        const id = `${lesson.id}-exercise-${exerciseIndex + 1}`;
        const base = {
          id,
          prompt: exercise.prompt,
          answerKeyText: exercise.answer,
          standardsCodes: [] as string[],
        };
        if (exercise.options.length) {
          const answerMatch = exercise.answer.match(/^\([a-z]\)\s*(.+)$/i);
          const correctAnswer = answerMatch?.[1]?.trim() ?? exercise.answer;
          return {
            ...base,
            type: exercise.prompt.toLowerCase().startsWith("multiple choice")
              ? ("multiple_choice" as const)
              : ("circle_choice" as const),
            options: exercise.options,
            correctAnswer,
          };
        }
        if (exercise.matchingRows.length) {
          const answerPairs = new Map<number, string>();
          for (const match of exercise.answer.matchAll(/(\d+)-([A-Z])/g)) {
            answerPairs.set(Number(match[1]), match[2]);
          }
          const displayedRights = exercise.matchingRows.map((row) => row.right);
          const pairs = exercise.matchingRows.map((row, index) => {
            const letter = answerPairs.get(index + 1) ??
              String.fromCharCode(65 + index);
            return {
              id: `${id}-pair-${index + 1}`,
              left: row.left,
              right:
                displayedRights[letter.charCodeAt(0) - 65] ?? row.right,
            };
          });
          return {
            ...base,
            type: "matching" as const,
            leftLabel: exercise.matchingHeaders?.[0] ?? "Item",
            rightLabel: exercise.matchingHeaders?.[1] ?? "Match",
            pairs,
            rightOrder: displayedRights.map((right, index) =>
              pairs.find((pair) => pair.right === right)?.id ?? pairs[index].id,
            ),
          };
        }
        if (exercise.prompt.includes("{{blank}}")) {
          return {
            ...base,
            type: "fill_in_blank" as const,
            correctAnswer: exercise.answer,
          };
        }
        return {
          ...base,
          type: "short_answer" as const,
          correctAnswer: exercise.answer,
          writingLines: Math.max(1, exercise.writingLines || 2),
        };
      });
      return {
        id: lesson.id,
        title: lesson.title,
        standardsCodes: [],
        needsIllustration: learnBlocks.some((block) =>
          block.type === "illustration" ||
          (block.type === "layout_row" &&
            block.columns.some((column) =>
              column.blocks.some((candidate) => candidate.type === "illustration"),
            )),
        ),
        learnBlocks,
        exercises,
      };
    }),
  }));

  const content = parseWorkbookContent({
    schemaVersion: 1,
    title: "Guitar A",
    subtitle: "Begin your musical journey with the acoustic guitar.",
    editionLabel: "1st Edition",
    gradeLabel: "Grades 1-6",
    subjectLabel: "Guitar A",
    isCore: false,
    introduction: [],
    chapters,
  });
  return { content, illustrationSeeds: [...illustrationSeeds.values()] };
}

async function applyImport(input: {
  content: WorkbookContent;
  illustrationSeeds: IllustrationSeed[];
  sourceHtmlSha256: string;
  coverBytes: Uint8Array;
}) {
  // Match the exact JSON shape Postgres stores: optional `undefined` fields
  // are omitted by JSON serialization. Comparing this normalized form keeps
  // repeated imports idempotent instead of manufacturing identical revisions.
  const persistedContent = JSON.parse(
    JSON.stringify(input.content),
  ) as WorkbookContent;
  const [subject] = await db
    .select()
    .from(curriculumSubjects)
    .where(
      and(
        eq(curriculumSubjects.academicStandardKey, "us"),
        eq(curriculumSubjects.key, "guitar"),
      ),
    )
    .limit(1);
  if (!subject) throw new Error("The US Guitar subject has not been seeded.");
  const [classic] = await db
    .select({ versionId: workbookThemes.publishedVersionId })
    .from(workbookThemes)
    .where(eq(workbookThemes.slug, "classic"))
    .limit(1);
  if (!classic?.versionId)
    throw new Error("The published Classic theme has not been seeded.");

  const result = await db.transaction(async (tx) => {
    const [existingCourse] = await tx
      .select()
      .from(workbookCourses)
      .where(
        and(
          isNull(workbookCourses.curriculumId),
          eq(workbookCourses.stableKey, "guitar"),
        ),
      )
      .limit(1);
    const [course] = existingCourse
      ? await tx
          .update(workbookCourses)
          .set({
            curriculumSubjectId: subject.id,
            gradeMin: 1,
            gradeMax: 6,
            type: "elective",
            academicStandardOverrideKey: "us",
            standardLabel: "Beginner elementary guitar progression",
            coverageNotes:
              "A multi-grade beginner guitar series covering rhythm, staff basics, guitar anatomy, strings, hand technique, open chords, and first songs.",
            pipelineKey: "music",
            updatedAt: new Date(),
          })
          .where(eq(workbookCourses.id, existingCourse.id))
          .returning()
      : await tx
          .insert(workbookCourses)
          .values({
            curriculumId: null,
            stableKey: "guitar",
            curriculumSubjectId: subject.id,
            status: "new",
            gradeMin: 1,
            gradeMax: 6,
            type: "elective",
            academicStandardOverrideKey: "us",
            standardLabel: "Beginner elementary guitar progression",
            boundaryNotes:
              "Standalone elective series; not part of grade-level core Curriculum planning.",
            coverageNotes:
              "A multi-grade beginner guitar series covering rhythm, staff basics, guitar anatomy, strings, hand technique, open chords, and first songs.",
            pipelineKey: "music",
          })
          .returning();

    for (const seed of input.illustrationSeeds) {
      await tx
        .insert(workbookIllustrationTypes)
        .values({
          key: seed.key,
          name: seed.name,
          description: seed.description,
          subjectKey: "music",
          status: "active",
          rendererKind: seed.rendererKind,
          parameterSchemaJson: seed.parameterSchemaJson,
          svgTemplate: seed.svgTemplate,
          wrapperClass: seed.wrapperClass,
          tokenBindingsJson: seed.tokenBindingsJson,
        })
        .onConflictDoUpdate({
          target: workbookIllustrationTypes.key,
          set: {
            name: seed.name,
            description: seed.description,
            subjectKey: "music",
            status: "active",
            rendererKind: seed.rendererKind,
            parameterSchemaJson: seed.parameterSchemaJson,
            svgTemplate: seed.svgTemplate,
            wrapperClass: seed.wrapperClass,
            tokenBindingsJson: seed.tokenBindingsJson,
            updatedAt: new Date(),
          },
        });
    }

    const [existingProject] = await tx
      .select()
      .from(workbookProjects)
      .where(eq(workbookProjects.slug, "guitar-a"))
      .limit(1);
    const projectId = existingProject?.id ?? randomUUID();
    const coverImageSha256 = sha256(input.coverBytes);
    const coverImageObjectPath = `workbook-studio/${projectId}/assets/cover-${coverImageSha256.slice(0, 16)}.png`;
    const [project] = existingProject
      ? await tx
          .update(workbookProjects)
          .set({
            courseId: course.id,
            title: "Guitar A",
            gradeMin: 1,
            gradeMax: 6,
            languageCode: "en",
            localeCode: "en-US",
            layoutProfile: "standard",
            scriptProfile: "latin",
            themeOverrideVersionId: classic.versionId,
            coverImageObjectPath,
            coverImageAlt: "A classical acoustic guitar",
            coverImageSha256,
            updatedAt: new Date(),
          })
          .where(eq(workbookProjects.id, existingProject.id))
          .returning()
      : await tx
          .insert(workbookProjects)
          .values({
            id: projectId,
            courseId: course.id,
            slug: "guitar-a",
            title: "Guitar A",
            gradeMin: 1,
            gradeMax: 6,
            languageCode: "en",
            localeCode: "en-US",
            layoutProfile: "standard",
            scriptProfile: "latin",
            status: "review",
            themeOverrideVersionId: classic.versionId,
            coverImageObjectPath,
            coverImageAlt: "A classical acoustic guitar",
            coverImageSha256,
          })
          .returning();

    const currentRevision = project.currentRevisionId
      ? (
          await tx
            .select()
            .from(workbookContentRevisions)
            .where(eq(workbookContentRevisions.id, project.currentRevisionId))
            .limit(1)
        )[0]
      : null;
    let revision = currentRevision;
    if (
      !currentRevision ||
      canonicalJson(currentRevision.contentJson) !== canonicalJson(persistedContent)
    ) {
      const [numberRow] = await tx
        .select({
          next: sql<number>`coalesce(max(${workbookContentRevisions.revisionNumber}), 0) + 1`,
        })
        .from(workbookContentRevisions)
        .where(eq(workbookContentRevisions.projectId, project.id));
      [revision] = await tx
        .insert(workbookContentRevisions)
        .values({
          projectId: project.id,
          revisionNumber: numberRow?.next ?? 1,
          source: "imported",
          contentJson: persistedContent,
          lessonIdFingerprint: workbookLessonIdFingerprint(persistedContent),
          validationJson: {
            issues: validateWorkbookForPublish(persistedContent),
            import: {
              source: "workbook-content/1to6-guitar-a/workbook.html",
              sourceHtmlSha256: input.sourceHtmlSha256,
            },
          },
          changeNotes: `Imported from shipped Guitar A HTML (${input.sourceHtmlSha256.slice(0, 12)})`,
        })
        .returning();
      await tx
        .update(workbookProjects)
        .set({
          currentRevisionId: revision!.id,
          status: "review",
          updatedAt: new Date(),
        })
        .where(eq(workbookProjects.id, project.id));
    }
    if (!revision) throw new Error("The Guitar A revision was not created.");
    return {
      course,
      project: { ...project, currentRevisionId: revision.id },
      revision,
      themeVersionId: classic.versionId,
      coverImageObjectPath,
    };
  });

  if (!skipObjectUpload) {
    await uploadPrivateFile({
      objectPath: result.coverImageObjectPath,
      contentType: "image/png",
      data: input.coverBytes,
    });
  }
  return result;
}

async function main() {
  const [sourceHtml, sourcePdf, coverBytes] = await Promise.all([
    readFile(sourceHtmlPath, "utf8"),
    readFile(sourcePdfPath),
    readFile(coverImagePath),
  ]);
  const raw = await parseSourceHtml(sourceHtml);
  const { content, illustrationSeeds } = buildStructuredWorkbook(raw);
  const lessonCount = content.chapters.reduce(
    (sum, chapter) => sum + chapter.lessons.length,
    0,
  );
  const exerciseCount = content.chapters.reduce(
    (sum, chapter) =>
      sum +
      chapter.lessons.reduce(
        (lessonSum, lesson) => lessonSum + lesson.exercises.length,
        0,
      ),
    0,
  );
  const missingAnswers = content.chapters.flatMap((chapter) =>
    chapter.lessons.flatMap((lesson) =>
      lesson.exercises.filter((exercise) => {
        if (exercise.type === "layout_row") return false;
        if (exercise.type === "matching") return exercise.pairs.length === 0;
        if (exercise.type === "write" || exercise.type === "draw_box")
          return !exercise.sampleAnswer;
        return !exercise.correctAnswer;
      }),
    ),
  );
  if (lessonCount !== 24 || exerciseCount !== 120 || missingAnswers.length) {
    throw new Error(
      `Import integrity failed: ${lessonCount} lessons, ${exerciseCount} exercises, ${missingAnswers.length} missing answers.`,
    );
  }
  const sourceHtmlSha256 = sha256(sourceHtml);
  const sourcePdfSha256 = sha256(sourcePdf);
  const summary: Record<string, unknown> = {
    mode: apply ? "apply" : "dry-run",
    sourceHtmlSha256,
    sourcePdfSha256,
    contentSha256: sha256(canonicalJson(content)),
    chapters: content.chapters.length,
    lessons: lessonCount,
    exercises: exerciseCount,
    illustrationTypes: illustrationSeeds.length,
    validationIssues: validateWorkbookForPublish(content),
  };
  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const imported = await applyImport({
    content,
    illustrationSeeds,
    sourceHtmlSha256,
    coverBytes,
  });
  summary.courseId = imported.course.id;
  summary.projectId = imported.project.id;
  summary.revisionId = imported.revision.id;
  summary.editorPath = `/admin/workbook-studio/${imported.project.id}`;
  if (localRender) {
    const [theme, illustrationDefinitions] = await Promise.all([
      db
        .select()
        .from(workbookThemeVersions)
        .where(eq(workbookThemeVersions.id, imported.themeVersionId))
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select({
          key: workbookIllustrationTypes.key,
          rendererKind: workbookIllustrationTypes.rendererKind,
          svgTemplate: workbookIllustrationTypes.svgTemplate,
          wrapperClass: workbookIllustrationTypes.wrapperClass,
          tokenBindingsJson: workbookIllustrationTypes.tokenBindingsJson,
        })
        .from(workbookIllustrationTypes)
        .where(eq(workbookIllustrationTypes.status, "active")),
    ]);
    if (!theme) throw new Error("Classic theme version not found.");
    const html = await buildWorkbookHtml({
      content,
      theme: themeTokensFromRow(theme),
      subjectKey: "guitar",
      languageCode: "en",
      layoutProfile: "standard",
      scriptProfile: "latin",
      illustrationDefinitions,
      coverImageDataUrl: `data:image/png;base64,${Buffer.from(coverBytes).toString("base64")}`,
      coverImageAlt: "A classical acoustic guitar",
      editionLabelOverride: "1st Edition",
      copyrightYear: 2026,
    });
    const rendered = await renderWorkbookPdf(html);
    summary.renderedPageCount = rendered.pageCount;
    summary.chromiumVersion = rendered.chromiumVersion;
    summary.coverDiagnostics = rendered.coverDiagnostics;
    if (outputPdfArgument) {
      const outputPath = resolve(outputPdfArgument.slice("--output-pdf=".length));
      await writeFile(outputPath, rendered.pdf);
      summary.outputPdf = outputPath;
    }
  }
  if (render) {
    const [renderRun] = await db
      .insert(workbookRenderRuns)
      .values({
        projectId: imported.project.id,
        contentRevisionId: imported.revision.id,
        themeVersionId: imported.themeVersionId,
        status: "queued",
        rendererVersion: "workbook-studio-v1",
        pagedJsVersion: "0.4.3",
        optionsJson: { editionLabelOverride: "1st Edition", copyrightYear: 2026 },
      })
      .returning();
    const rendered = await executeWorkbookRenderRun(renderRun.id);
    summary.renderRunId = renderRun.id;
    summary.renderedPageCount = rendered.pageCount;
    summary.renderedPdfObjectPath = rendered.pdfObjectPath;
    if (outputPdfArgument) {
      const outputPath = resolve(outputPdfArgument.slice("--output-pdf=".length));
      await writeFile(outputPath, rendered.pdf);
      summary.outputPdf = outputPath;
    }
  }
  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} finally {
  await client.end({ timeout: 5 }).catch(() => undefined);
}
