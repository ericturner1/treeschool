import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import {
  workbookGenerationPrompts,
  workbookGenerationPromptVersions,
  type WorkbookGenerationPromptKind,
} from "ts-db";
import { client, db } from "../app/ts-backend/src/db";

const sourceRoot =
  process.env.TREESCHOOL_WORKBOOKS_PATH ??
  join(process.cwd(), "../treeschool-workbooks");
const promptRoot = join(sourceRoot, "prompts");

type PromptSeed = {
  slug: string;
  name: string;
  description: string;
  kind: WorkbookGenerationPromptKind;
  paths: string[];
  stageSlugs?: Partial<
    Record<"outline" | "lesson_content" | "workbook_brief" | "catalog_plan", string>
  >;
};

const seeds: PromptSeed[] = [
  {
    slug: "grade-curriculum-planning",
    name: "Grade curriculum planning",
    description:
      "Plans the subject and workbook catalog for one grade before fan-out.",
    kind: "catalog_plan",
    paths: ["grade_curriculum_planning_prompt.md"],
  },
  {
    slug: "general-curriculum-stage",
    name: "General curriculum stage",
    description: "Creates the curriculum scope for one workbook.",
    kind: "workbook_brief",
    paths: ["general_step1_curriculum_generation_prompt.md"],
  },
  {
    slug: "general-outline-stage",
    name: "General outline stage",
    description: "Creates chapter and lesson structure with stable ids.",
    kind: "outline",
    paths: ["general_step2_outline_generation_prompt.md"],
  },
  {
    slug: "general-content-stage",
    name: "General lesson-content stage",
    description: "Writes full learn blocks, exercises, and answers.",
    kind: "lesson_content",
    paths: ["general_step3_workbook_generation_prompt.md"],
  },
  {
    slug: "general-workbook-generation",
    name: "General workbook generation",
    description: "The reusable general three-stage workbook workflow.",
    kind: "workflow",
    paths: ["general_orchestration_prompt.md"],
    stageSlugs: {
      workbook_brief: "general-curriculum-stage",
      outline: "general-outline-stage",
      lesson_content: "general-content-stage",
    },
  },
  {
    slug: "math-workbook-generation",
    name: "Math workbook generation",
    description:
      "The general workflow with the current Math illustration and exercise overlay.",
    kind: "workflow",
    paths: ["math/math_workbook_orchestration_prompt.md"],
    stageSlugs: {
      workbook_brief: "general-curriculum-stage",
      outline: "general-outline-stage",
      lesson_content: "general-content-stage",
    },
  },
  {
    slug: "music-workbook-generation",
    name: "Music workbook generation",
    description:
      "The general workflow with the current Music notation overlay.",
    kind: "workflow",
    paths: ["music/music_workbook_orchestration_prompt.md"],
    stageSlugs: {
      workbook_brief: "general-curriculum-stage",
      outline: "general-outline-stage",
      lesson_content: "general-content-stage",
    },
  },
  {
    slug: "foreign-language-workbook-generation",
    name: "Foreign-language workbook generation",
    description: "The reusable foreign-language orchestration workflow.",
    kind: "workflow",
    paths: [
      "foreign-language/foreign_language_workbook_orchestration_prompt.md",
    ],
    stageSlugs: {
      workbook_brief: "general-curriculum-stage",
      outline: "general-outline-stage",
      lesson_content: "general-content-stage",
    },
  },
  {
    slug: "reader-curriculum-stage",
    name: "Leveled reader curriculum stage",
    description: "Plans a leveled-reader curriculum.",
    kind: "workbook_brief",
    paths: [
      "leveled_reader/leveled_reader_step1_curriculum_generation_prompt.md",
    ],
  },
  {
    slug: "reader-outline-stage",
    name: "Leveled reader outline stage",
    description: "Plans passages and vocabulary in the reader layout profile.",
    kind: "outline",
    paths: ["leveled_reader/leveled_reader_step2_outline_generation_prompt.md"],
  },
  {
    slug: "reader-content-stage",
    name: "Leveled reader content stage",
    description: "Writes complete passages, vocabulary, and reader exercises.",
    kind: "lesson_content",
    paths: [
      "leveled_reader/leveled_reader_step3_workbook_generation_prompt.md",
    ],
  },
  {
    slug: "leveled-reader-generation",
    name: "Leveled reader generation",
    description: "The reusable leveled-reader workflow and layout vocabulary.",
    kind: "workflow",
    paths: ["leveled_reader/leveled_reader_orchestration_prompt.md"],
    stageSlugs: {
      workbook_brief: "reader-curriculum-stage",
      outline: "reader-outline-stage",
      lesson_content: "reader-content-stage",
    },
  },
  {
    slug: "japanese-curriculum-stage",
    name: "Japanese curriculum stage",
    description: "Plans Japanese and Kokugo curriculum scope.",
    kind: "workbook_brief",
    paths: ["japanese/general_step1_curriculum_generation_prompt.md"],
  },
  {
    slug: "japanese-outline-stage",
    name: "Japanese outline stage",
    description: "Plans Japanese and Kokugo chapters and lessons.",
    kind: "outline",
    paths: ["japanese/general_step2_outline_generation_prompt.md"],
  },
  {
    slug: "japanese-content-stage",
    name: "Japanese lesson-content stage",
    description: "Writes Japanese and Kokugo structured workbook content.",
    kind: "lesson_content",
    paths: ["japanese/general_step3_workbook_generation_prompt.md"],
  },
  {
    slug: "japanese-kokugo-generation",
    name: "Japanese / Kokugo workbook generation",
    description:
      "The Japanese workflow with the kanji ledger and series-structure addenda consolidated.",
    kind: "workflow",
    paths: [
      "japanese/general_orchestration_prompt.md",
      "japanese/kanji_ledger_addendum.md",
      "japanese/kokugo_series_structure_addendum.md",
    ],
    stageSlugs: {
      workbook_brief: "japanese-curriculum-stage",
      outline: "japanese-outline-stage",
      lesson_content: "japanese-content-stage",
    },
  },
];

async function promptText(seed: PromptSeed) {
  const parts = await Promise.all(
    seed.paths.map(async (path) => {
      const absolute = join(promptRoot, path);
      return `# Imported source: ${path}\n\n${await readFile(absolute, "utf8")}`;
    }),
  );
  return parts.join("\n\n---\n\n");
}

async function main() {
  const publishedVersions = new Map<string, string>();
  let imported = 0;
  let unchanged = 0;

  for (const seed of seeds) {
    const text = await promptText(seed);
    const sha256 = createHash("sha256").update(text).digest("hex");
    let [prompt] = await db
      .select()
      .from(workbookGenerationPrompts)
      .where(eq(workbookGenerationPrompts.slug, seed.slug))
      .limit(1);
    if (!prompt) {
      [prompt] = await db
        .insert(workbookGenerationPrompts)
        .values({
          id: randomUUID(),
          slug: seed.slug,
          name: seed.name,
          description: seed.description,
          kind: seed.kind,
          status: "active",
        })
        .returning();
    }
    const [latest] = await db
      .select()
      .from(workbookGenerationPromptVersions)
      .where(eq(workbookGenerationPromptVersions.promptId, prompt.id))
      .orderBy(desc(workbookGenerationPromptVersions.versionNumber))
      .limit(1);
    if (latest?.sourceJson.sha256 === sha256 && latest.status === "published") {
      publishedVersions.set(seed.slug, latest.id);
      unchanged += 1;
      continue;
    }
    const stagePromptVersionIds = Object.fromEntries(
      Object.entries(seed.stageSlugs ?? {}).map(([stage, slug]) => {
        const versionId = publishedVersions.get(slug);
        if (!versionId)
          throw new Error(
            `Stage ${slug} must be imported before ${seed.slug}.`,
          );
        return [stage, versionId];
      }),
    );
    const versionId = randomUUID();
    await db.transaction(async (tx) => {
      await tx
        .update(workbookGenerationPromptVersions)
        .set({ status: "retired" })
        .where(
          and(
            eq(workbookGenerationPromptVersions.promptId, prompt.id),
            eq(workbookGenerationPromptVersions.status, "published"),
          ),
        );
      await tx.insert(workbookGenerationPromptVersions).values({
        id: versionId,
        promptId: prompt.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: "published",
        promptText: text,
        configurationJson: { stagePromptVersionIds },
        sourceJson: {
          repository: "treeschool-workbooks",
          paths: seed.paths.map((path) =>
            relative(sourceRoot, join(promptRoot, path)),
          ),
          sha256,
          importedAt: new Date().toISOString(),
        },
        publishedAt: new Date(),
      });
      await tx
        .update(workbookGenerationPrompts)
        .set({
          name: seed.name,
          description: seed.description,
          kind: seed.kind,
          status: "active",
          publishedVersionId: versionId,
          updatedAt: new Date(),
        })
        .where(eq(workbookGenerationPrompts.id, prompt.id));
    });
    publishedVersions.set(seed.slug, versionId);
    imported += 1;
    console.log(
      `Imported ${seed.name} from ${seed.paths.map((path) => basename(path)).join(", ")}.`,
    );
  }

  console.log(
    `Workbook Studio prompt import complete: ${imported} imported, ${unchanged} unchanged.`,
  );
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end({ timeout: 5 }));
