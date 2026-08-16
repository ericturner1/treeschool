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
} from "../app/ts-backend/src/services/workbook-studio-model";

type RichParagraph = {
  text: string;
  runs: Array<{ text: string; bold: boolean }>;
};

type RawPracticeRow = {
  text: string;
  caption: string;
  kind: "character" | "word" | "sentence";
};

type RawStrokeExample = {
  label: string;
  svg: string;
};

type RawWorkbook = {
  tocTitles: string[];
  lessons: Array<{
    id: string;
    title: string;
    intro: RichParagraph[];
    instruction: string;
    rows: RawPracticeRow[];
    strokeExamples: RawStrokeExample[];
    answerParagraphs: string[];
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
  "workbook-content/kto6-japanese-a",
);
const sourceHtmlPath = join(sourceDirectory, "workbook.html");
const sourcePdfPath = join(
  sourceDirectory,
  "Treeschool-Grade-Kto6-Japanese-A-1st-Edition.pdf",
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
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
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
  ];
  let template = svg;
  for (const [pattern, binding, token] of colors) {
    if (!pattern.test(template)) continue;
    pattern.lastIndex = 0;
    template = template.replace(pattern, `{{theme:${binding}}}`);
    bindings[binding] = token;
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
        String(value ?? "").replace(/\s+/g, " ").trim();
      const paragraph = (element: Element) => {
        const runs: Array<{ text: string; bold: boolean }> = [];
        const visit = (node: Node, inheritedBold = false) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? "";
            if (text) runs.push({ text, bold: inheritedBold });
            return;
          }
          if (!(node instanceof HTMLElement)) return;
          const bold = inheritedBold || node.tagName === "STRONG" || node.tagName === "B";
          node.childNodes.forEach((child) => visit(child, bold));
        };
        element.childNodes.forEach((child) => visit(child));
        const normalizedRuns = runs
          .map((run) => ({ ...run, text: run.text.replace(/\s+/g, " ") }))
          .filter((run) => run.text);
        return { text: clean(element.textContent), runs: normalizedRuns };
      };
      const tocTitles = [...document.querySelectorAll(".toc > h3")].map((node) =>
        clean(node.textContent).replace(/^Chapter\s+\d+:\s*/i, ""),
      );
      const lessons = [...document.querySelectorAll<HTMLElement>(".lesson")].map((lesson) => {
        const heading = clean(lesson.querySelector(".lesson-title")?.textContent);
        const title = heading.replace(/^Lesson\s+\d+\.\d+\s+[—-]\s*/i, "");
        const rows: RawPracticeRow[] = [];
        lesson.querySelectorAll("table.char-grid tr").forEach((row) => {
          const text = clean(row.querySelector(".cg-glyph")?.textContent);
          if (!text) return;
          rows.push({
            text,
            caption: clean(row.querySelector(".cg-caption")?.textContent),
            kind: "character",
          });
        });
        const kanaTable = lesson.querySelector("table.kana-grid");
        kanaTable?.querySelectorAll("tr").forEach((row) => {
          const look = row.querySelector<HTMLElement>(".kg-look");
          if (!look) return;
          const caption = clean(look.querySelector(".kg-caption")?.textContent);
          const clone = look.cloneNode(true) as HTMLElement;
          clone.querySelector(".kg-caption")?.remove();
          rows.push({
            text: clean(clone.textContent),
            caption,
            kind: kanaTable.classList.contains("kana-grid--sentence")
              ? "sentence"
              : "word",
          });
        });
        const strokeExamples = [...lesson.querySelectorAll(".stroke-example")].map((example) => ({
          label: clean(example.querySelector(".stroke-caption")?.textContent),
          svg: example.querySelector("svg:not(.stroke-ghost)")?.outerHTML ?? "",
        })).filter((example) => example.svg);
        const answerPage = lesson.nextElementSibling?.classList.contains("answer-key-page")
          ? lesson.nextElementSibling
          : null;
        return {
          id: lesson.id,
          title,
          intro: [...lesson.querySelectorAll(".intro > p")].map(paragraph),
          instruction: clean(lesson.querySelector(".fold-instruction")?.textContent),
          rows,
          strokeExamples,
          answerParagraphs: answerPage
            ? [...answerPage.querySelectorAll(".answer-key > p")].map((node) => clean(node.textContent))
            : [],
        };
      });
      return { tocTitles, lessons };
    });
  } finally {
    await browser.close();
  }
}

function buildStructuredWorkbook(raw: RawWorkbook) {
  const illustrationSeeds = new Map<string, IllustrationSeed>();
  const chapters = raw.tocTitles.map((title, chapterIndex) => {
    const chapterNumber = chapterIndex + 1;
    const lessons = raw.lessons
      .filter((lesson) => lesson.id.startsWith(`ja-${chapterNumber}-`))
      .map((lesson) => {
        const learnBlocks: WorkbookContent["chapters"][number]["lessons"][number]["learnBlocks"] =
          lesson.intro.map((intro) => ({
            type: "reading_passage" as const,
            paragraphs: [intro.text],
            richParagraphs: [{ runs: intro.runs }],
            fontSizePt: 12,
          }));
        const practiceBlocks: WorkbookContent["chapters"][number]["lessons"][number]["practiceBlocks"] = [];
        if (lesson.instruction) {
          practiceBlocks.push({ type: "paragraph", text: lesson.instruction });
        }
        for (const row of lesson.rows) {
          const isCharacter = row.kind === "character";
          practiceBlocks.push({
            type: "character_practice",
            character: row.text,
            meaning: row.caption || undefined,
            traceRows: 1,
            columns: isCharacter ? 5 : 2,
            fontSizePt: row.kind === "sentence" ? 14 : row.kind === "word" ? 19 : 28,
            layoutStyle: "compact_row",
            modelWidthPercent: isCharacter ? 22 : 27,
            boxBackground: isCharacter ? "quadrant" : "blank",
            fadeOut: true,
            startingOpacityPercent: 15,
            fadeStepPercent: 15,
          });
        }
        if (lesson.strokeExamples.length) {
          const blocks = lesson.strokeExamples.map((example, index) => {
            const key = `${lesson.id}-stroke-${index + 1}`;
            const themed = themeSvgTemplate(example.svg);
            illustrationSeeds.set(key, {
              key,
              name: `${example.label || "Hiragana"} stroke order`,
              description: `Trusted stroke-order diagram imported from the shipped Japanese A workbook (${lesson.title}).`,
              rendererKind: "parameterized_svg",
              parameterSchemaJson: {},
              svgTemplate: themed.template,
              wrapperClass: "stroke-example",
              tokenBindingsJson: themed.bindings,
            });
            return {
              type: "illustration" as const,
              illustrationType: key,
              parameters: {},
              altText: `${example.label || "Hiragana"} stroke-order diagram`,
              caption: example.label || undefined,
            };
          });
          practiceBlocks.push({
            id: `${lesson.id}-stroke-row`,
            type: "layout_row",
            columnGap: 12,
            columns: blocks.map((block, index) => ({
              id: `${lesson.id}-stroke-column-${index + 1}`,
              blocks: [block],
            })),
          });
        }
        return {
          id: lesson.id,
          title: lesson.title,
          standardsCodes: [],
          needsIllustration: lesson.strokeExamples.length > 0,
          learnBlocks,
          practiceBlocks,
          exercises: [],
          notesForParent: lesson.answerParagraphs.length
            ? lesson.answerParagraphs.join("\n\n")
            : undefined,
        };
      });
    return {
      id: `chapter-${chapterNumber}`,
      title,
      tocTitle: title,
      lessons,
    };
  });
  const content = parseWorkbookContent({
    schemaVersion: 1,
    title: "Japanese A",
    subtitle: "The first steps to learning Japanese: Hiragana letters, simple words, and sentences.",
    editionLabel: "1st Edition",
    gradeLabel: "Grades K-6",
    subjectLabel: "Japanese A",
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
  const persistedContent = JSON.parse(JSON.stringify(input.content)) as WorkbookContent;
  const [subject] = await db
    .select()
    .from(curriculumSubjects)
    .where(
      and(
        eq(curriculumSubjects.academicStandardKey, "us"),
        eq(curriculumSubjects.key, "japanese"),
      ),
    )
    .limit(1);
  if (!subject) throw new Error("The US Japanese subject has not been seeded.");
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
          eq(workbookCourses.stableKey, "japanese"),
        ),
      )
      .limit(1);
    const [course] = existingCourse
      ? await tx
          .update(workbookCourses)
          .set({
            curriculumSubjectId: subject.id,
            gradeMin: 0,
            gradeMax: 6,
            type: "elective",
            academicStandardOverrideKey: "us",
            standardLabel: "Beginner Japanese language progression",
            coverageNotes: "A multi-grade Japanese elective series beginning with hiragana, basic words, and simple sentences.",
            pipelineKey: "foreign-language",
            updatedAt: new Date(),
          })
          .where(eq(workbookCourses.id, existingCourse.id))
          .returning()
      : await tx
          .insert(workbookCourses)
          .values({
            curriculumId: null,
            stableKey: "japanese",
            curriculumSubjectId: subject.id,
            status: "new",
            gradeMin: 0,
            gradeMax: 6,
            type: "elective",
            academicStandardOverrideKey: "us",
            standardLabel: "Beginner Japanese language progression",
            boundaryNotes: "Standalone elective series; not part of grade-level core Curriculum planning.",
            coverageNotes: "A multi-grade Japanese elective series beginning with hiragana, basic words, and simple sentences.",
            pipelineKey: "foreign-language",
          })
          .returning();

    for (const seed of input.illustrationSeeds) {
      await tx
        .insert(workbookIllustrationTypes)
        .values({
          key: seed.key,
          name: seed.name,
          description: seed.description,
          subjectKey: "japanese",
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
            subjectKey: "japanese",
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
      .where(eq(workbookProjects.slug, "japanese-a"))
      .limit(1);
    const projectId = existingProject?.id ?? randomUUID();
    const coverImageSha256 = sha256(input.coverBytes);
    const coverImageObjectPath = `workbook-studio/${projectId}/assets/cover-${coverImageSha256.slice(0, 16)}.png`;
    const [project] = existingProject
      ? await tx
          .update(workbookProjects)
          .set({
            courseId: course.id,
            title: "Japanese A",
            gradeMin: 0,
            gradeMax: 6,
            languageCode: "en",
            localeCode: "en-US",
            layoutProfile: "standard",
            scriptProfile: "japanese",
            themeOverrideVersionId: classic.versionId,
            coverImageObjectPath,
            coverImageAlt: "The hiragana character a",
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
            slug: "japanese-a",
            title: "Japanese A",
            gradeMin: 0,
            gradeMax: 6,
            languageCode: "en",
            localeCode: "en-US",
            layoutProfile: "standard",
            scriptProfile: "japanese",
            status: "review",
            themeOverrideVersionId: classic.versionId,
            coverImageObjectPath,
            coverImageAlt: "The hiragana character a",
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
            issues: validateWorkbookForPublish(persistedContent, {
              standardExerciseCount: null,
              requireFlaggedIllustrations: true,
            }),
            import: {
              source: "workbook-content/kto6-japanese-a/workbook.html",
              sourceHtmlSha256: input.sourceHtmlSha256,
            },
          },
          changeNotes: `Imported from shipped Japanese A HTML (${input.sourceHtmlSha256.slice(0, 12)})`,
        })
        .returning();
      await tx
        .update(workbookProjects)
        .set({ currentRevisionId: revision!.id, status: "review", updatedAt: new Date() })
        .where(eq(workbookProjects.id, project.id));
    }
    if (!revision) throw new Error("The Japanese A revision was not created.");
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
  const traceableCount = content.chapters.reduce(
    (sum, chapter) => sum + chapter.lessons.reduce(
      (lessonSum, lesson) => lessonSum + lesson.practiceBlocks.filter((block) => block.type === "character_practice").length,
      0,
    ),
    0,
  );
  const answerKeyCount = content.chapters.reduce(
    (sum, chapter) => sum + chapter.lessons.filter((lesson) => lesson.notesForParent).length,
    0,
  );
  if (
    content.chapters.length !== 8 ||
    lessonCount !== 27 ||
    traceableCount !== 136 ||
    answerKeyCount !== 26 ||
    illustrationSeeds.length !== 3
  ) {
    throw new Error(
      `Import integrity failed: ${content.chapters.length} chapters, ${lessonCount} lessons, ${traceableCount} traceables, ${answerKeyCount} answer keys, ${illustrationSeeds.length} illustrations.`,
    );
  }
  const sourceHtmlSha256 = sha256(sourceHtml);
  const summary: Record<string, unknown> = {
    mode: apply ? "apply" : "dry-run",
    sourceHtmlSha256,
    sourcePdfSha256: sha256(sourcePdf),
    contentSha256: sha256(canonicalJson(content)),
    chapters: content.chapters.length,
    lessons: lessonCount,
    traceables: traceableCount,
    answerKeys: answerKeyCount,
    illustrationTypes: illustrationSeeds.length,
    validationIssues: validateWorkbookForPublish(content, {
      standardExerciseCount: null,
      requireFlaggedIllustrations: true,
    }),
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
      subjectKey: "japanese",
      languageCode: "en",
      layoutProfile: "standard",
      scriptProfile: "japanese",
      illustrationDefinitions,
      coverImageDataUrl: `data:image/png;base64,${Buffer.from(coverBytes).toString("base64")}`,
      coverImageAlt: "The hiragana character a",
      editionLabelOverride: "1st Edition",
      copyrightYear: 2026,
    });
    const rendered = await renderWorkbookPdf(html);
    summary.renderedPageCount = rendered.pageCount;
    summary.chromiumVersion = rendered.chromiumVersion;
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
    summary.renderStatus = rendered.status;
    summary.renderedPageCount = rendered.pageCount;
  }
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
