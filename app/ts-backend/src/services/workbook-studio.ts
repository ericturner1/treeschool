import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  profiles,
  workbookContentRevisions,
  workbookCurricula,
  workbookCurriculumRevisions,
  workbookGenerationBatches,
  workbookGenerationPrompts,
  workbookGenerationPromptVersions,
  workbookGenerationRules,
  workbookGenerationRuleVersions,
  workbookGenerationRuns,
  workbookIllustrationTypes,
  workbookProjects,
  workbookRenderRuns,
  workbookStudioJobs,
  workbookThemeComponentTokens,
  workbookThemes,
  workbookThemeVersions,
  type WorkbookGenerationPromptKind,
  type WorkbookStudioRevisionSource,
} from "ts-db";
import { z } from "zod";
import { db } from "../db";
import {
  parseWorkbookCatalogPlan,
  workbookGenerationModel,
} from "./workbook-generation-provider";
import {
  classifyWorkbookContentChange,
  emptyWorkbookContent,
  parseWorkbookContent,
  validateWorkbookForPublish,
  workbookLessonIdFingerprint,
  type WorkbookContent,
} from "./workbook-studio-model";
import { validateWorkbookForScope } from "./workbook-studio-validation";
import {
  compileWorkbookThemeCss,
  workbookThemeTokensSchema,
  type WorkbookThemeTokens,
} from "./workbook-theme-compiler";

const uuidSchema = z.string().uuid();

const projectInputSchema = z
  .object({
    userId: uuidSchema,
    curriculumId: uuidSchema.nullable().default(null),
    catalogPlanKey: z.string().trim().min(1).max(160).nullable().default(null),
    title: z.string().trim().min(1).max(180),
    subjectKey: z.string().trim().min(1).max(100),
    subjectLabel: z.string().trim().min(1).max(120),
    gradeMin: z.number().int().min(-2).max(20),
    gradeMax: z.number().int().min(-2).max(20),
    languageCode: z.string().trim().min(2).max(20).default("en"),
    localeCode: z.string().trim().max(40).nullable().default(null),
    layoutProfile: z.string().trim().min(1).max(80).default("standard"),
    scriptProfile: z.string().trim().min(1).max(80).default("latin"),
    authoringMode: z.enum(["manual", "generate"]),
    generationPromptVersionId: uuidSchema.nullable().default(null),
    generationScope: z.record(z.unknown()).default({}),
  })
  .refine((value) => value.gradeMin <= value.gradeMax, {
    message: "The minimum grade cannot be above the maximum grade.",
    path: ["gradeMax"],
  })
  .refine(
    (value) =>
      value.authoringMode !== "generate" || value.generationPromptVersionId,
    {
      message: "Choose a workbook generation prompt.",
      path: ["generationPromptVersionId"],
    },
  );

const gradeLevelBatchInputSchema = z.object({
  userId: uuidSchema,
  curriculumName: z.string().trim().min(1).max(180),
  standardCode: z.string().trim().max(80).nullable().default(null),
  standardLabel: z.string().trim().max(180).nullable().default(null),
  gradeLevel: z.number().int().min(-2).max(20),
  languageCode: z.string().trim().min(2).max(20).default("en"),
  catalogPromptVersionId: uuidSchema,
  workbookPromptVersionId: uuidSchema,
  defaultThemeVersionId: uuidSchema.nullable().default(null),
});

const themeVersionSelection = {
  id: workbookThemeVersions.id,
  themeId: workbookThemeVersions.themeId,
  versionNumber: workbookThemeVersions.versionNumber,
  status: workbookThemeVersions.status,
  colorInk: workbookThemeVersions.colorInk,
  colorEarth: workbookThemeVersions.colorEarth,
  colorLeaf: workbookThemeVersions.colorLeaf,
  colorLeafDark: workbookThemeVersions.colorLeafDark,
  colorCream: workbookThemeVersions.colorCream,
  colorSand: workbookThemeVersions.colorSand,
  colorCanvas: workbookThemeVersions.colorCanvas,
  colorCoverAccent: workbookThemeVersions.colorCoverAccent,
  colorCoverAccentSoft: workbookThemeVersions.colorCoverAccentSoft,
  headingFontFamily: workbookThemeVersions.headingFontFamily,
  bodyFontFamily: workbookThemeVersions.bodyFontFamily,
  pageSize: workbookThemeVersions.pageSize,
  pageMarginTopMm: workbookThemeVersions.pageMarginTopMm,
  pageMarginRightMm: workbookThemeVersions.pageMarginRightMm,
  pageMarginBottomMm: workbookThemeVersions.pageMarginBottomMm,
  pageMarginLeftMm: workbookThemeVersions.pageMarginLeftMm,
  firstPageMarginTopMm: workbookThemeVersions.firstPageMarginTopMm,
  firstPageMarginRightMm: workbookThemeVersions.firstPageMarginRightMm,
  firstPageMarginBottomMm: workbookThemeVersions.firstPageMarginBottomMm,
  firstPageMarginLeftMm: workbookThemeVersions.firstPageMarginLeftMm,
  bodyFontSizePt: workbookThemeVersions.bodyFontSizePt,
  bodyLineHeight: workbookThemeVersions.bodyLineHeight,
  compiledCss: workbookThemeVersions.compiledCss,
  sourceJson: workbookThemeVersions.sourceJson,
  createdAt: workbookThemeVersions.createdAt,
  publishedAt: workbookThemeVersions.publishedAt,
};

async function requireAdmin(userId: string) {
  const [admin] = await db
    .select({ id: profiles.id, isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!admin?.isAdmin) throw new Error("Administrator access is required.");
}

function slugify(value: string) {
  return (
    value
      .toLocaleLowerCase("en-US")
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "workbook"
  );
}

async function uniqueProjectSlug(title: string) {
  const base = slugify(title);
  const rows = await db
    .select({ slug: workbookProjects.slug })
    .from(workbookProjects)
    .where(
      or(
        eq(workbookProjects.slug, base),
        sql`${workbookProjects.slug} like ${`${base}-%`}`,
      ),
    );
  const used = new Set(rows.map((row) => row.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

async function classicThemeVersionId() {
  const [theme] = await db
    .select({ versionId: workbookThemes.publishedVersionId })
    .from(workbookThemes)
    .where(eq(workbookThemes.slug, "classic"))
    .limit(1);
  if (!theme?.versionId)
    throw new Error("The Classic workbook theme has not been seeded.");
  return theme.versionId;
}

export async function resolveEffectiveWorkbookThemeVersionId(input: {
  themeOverrideVersionId: string | null;
  curriculumId: string | null;
}) {
  if (input.themeOverrideVersionId) return input.themeOverrideVersionId;
  if (input.curriculumId) {
    const [curriculum] = await db
      .select({ versionId: workbookCurricula.defaultThemeVersionId })
      .from(workbookCurricula)
      .where(eq(workbookCurricula.id, input.curriculumId))
      .limit(1);
    if (curriculum) return curriculum.versionId;
  }
  return classicThemeVersionId();
}

export async function listAdminWorkbookStudio(userId: string) {
  await requireAdmin(userId);
  const [
    projects,
    curricula,
    themes,
    promptRows,
    rules,
    illustrationTypes,
    activeBatches,
  ] = await Promise.all([
    db
      .select()
      .from(workbookProjects)
      .orderBy(desc(workbookProjects.updatedAt)),
    db
      .select()
      .from(workbookCurricula)
      .orderBy(desc(workbookCurricula.updatedAt)),
    db
      .select({
        id: workbookThemes.id,
        slug: workbookThemes.slug,
        name: workbookThemes.name,
        description: workbookThemes.description,
        status: workbookThemes.status,
        publishedVersionId: workbookThemes.publishedVersionId,
        versionNumber: workbookThemeVersions.versionNumber,
        colorInk: workbookThemeVersions.colorInk,
        colorEarth: workbookThemeVersions.colorEarth,
        colorLeaf: workbookThemeVersions.colorLeaf,
        colorLeafDark: workbookThemeVersions.colorLeafDark,
        colorCream: workbookThemeVersions.colorCream,
        colorSand: workbookThemeVersions.colorSand,
        colorCanvas: workbookThemeVersions.colorCanvas,
        colorCoverAccent: workbookThemeVersions.colorCoverAccent,
        colorCoverAccentSoft: workbookThemeVersions.colorCoverAccentSoft,
        headingFontFamily: workbookThemeVersions.headingFontFamily,
        bodyFontFamily: workbookThemeVersions.bodyFontFamily,
        pageSize: workbookThemeVersions.pageSize,
        pageMarginTopMm: workbookThemeVersions.pageMarginTopMm,
        pageMarginRightMm: workbookThemeVersions.pageMarginRightMm,
        pageMarginBottomMm: workbookThemeVersions.pageMarginBottomMm,
        pageMarginLeftMm: workbookThemeVersions.pageMarginLeftMm,
        firstPageMarginTopMm: workbookThemeVersions.firstPageMarginTopMm,
        firstPageMarginRightMm: workbookThemeVersions.firstPageMarginRightMm,
        firstPageMarginBottomMm: workbookThemeVersions.firstPageMarginBottomMm,
        firstPageMarginLeftMm: workbookThemeVersions.firstPageMarginLeftMm,
        bodyFontSizePt: workbookThemeVersions.bodyFontSizePt,
        bodyLineHeight: workbookThemeVersions.bodyLineHeight,
        updatedAt: workbookThemes.updatedAt,
      })
      .from(workbookThemes)
      .leftJoin(
        workbookThemeVersions,
        eq(workbookThemeVersions.id, workbookThemes.publishedVersionId),
      )
      .orderBy(asc(workbookThemes.name)),
    db
      .select({
        id: workbookGenerationPrompts.id,
        slug: workbookGenerationPrompts.slug,
        name: workbookGenerationPrompts.name,
        description: workbookGenerationPrompts.description,
        kind: workbookGenerationPrompts.kind,
        status: workbookGenerationPrompts.status,
        publishedVersionId: workbookGenerationPrompts.publishedVersionId,
        versionNumber: workbookGenerationPromptVersions.versionNumber,
        promptText: workbookGenerationPromptVersions.promptText,
        configurationJson: workbookGenerationPromptVersions.configurationJson,
        sourceJson: workbookGenerationPromptVersions.sourceJson,
        updatedAt: workbookGenerationPrompts.updatedAt,
      })
      .from(workbookGenerationPrompts)
      .leftJoin(
        workbookGenerationPromptVersions,
        eq(
          workbookGenerationPromptVersions.id,
          workbookGenerationPrompts.publishedVersionId,
        ),
      )
      .orderBy(asc(workbookGenerationPrompts.name)),
    db
      .select({
        id: workbookGenerationRules.id,
        slug: workbookGenerationRules.slug,
        name: workbookGenerationRules.name,
        description: workbookGenerationRules.description,
        ruleKind: workbookGenerationRules.ruleKind,
        status: workbookGenerationRules.status,
        publishedVersionId: workbookGenerationRules.publishedVersionId,
        versionNumber: workbookGenerationRuleVersions.versionNumber,
        scopeType: workbookGenerationRuleVersions.scopeType,
        subjectKey: workbookGenerationRuleVersions.subjectKey,
        gradeMin: workbookGenerationRuleVersions.gradeMin,
        gradeMax: workbookGenerationRuleVersions.gradeMax,
        languageCode: workbookGenerationRuleVersions.languageCode,
        stage: workbookGenerationRuleVersions.stage,
        enforcement: workbookGenerationRuleVersions.enforcement,
        instructionText: workbookGenerationRuleVersions.instructionText,
        parametersJson: workbookGenerationRuleVersions.parametersJson,
      })
      .from(workbookGenerationRules)
      .leftJoin(
        workbookGenerationRuleVersions,
        eq(
          workbookGenerationRuleVersions.id,
          workbookGenerationRules.publishedVersionId,
        ),
      )
      .where(eq(workbookGenerationRules.status, "active"))
      .orderBy(asc(workbookGenerationRules.name)),
    db
      .select()
      .from(workbookIllustrationTypes)
      .where(eq(workbookIllustrationTypes.status, "active"))
      .orderBy(asc(workbookIllustrationTypes.name)),
    db
      .select()
      .from(workbookGenerationBatches)
      .where(
        inArray(workbookGenerationBatches.status, [
          "queued",
          "running",
          "retry_wait",
        ]),
      )
      .orderBy(desc(workbookGenerationBatches.createdAt)),
  ]);

  return {
    projects,
    curricula,
    themes,
    prompts: promptRows,
    rules,
    illustrationTypes,
    activeBatches,
  };
}

export async function getAdminWorkbookStudioProject(input: {
  userId: string;
  projectId: string;
}) {
  await requireAdmin(input.userId);
  const [project] = await db
    .select()
    .from(workbookProjects)
    .where(eq(workbookProjects.id, uuidSchema.parse(input.projectId)))
    .limit(1);
  if (!project) throw new Error("Workbook project not found.");

  const themeVersionId = await resolveEffectiveWorkbookThemeVersionId(project);
  const [
    revisions,
    [themeVersion],
    componentTokens,
    generationRuns,
    renderRuns,
  ] = await Promise.all([
    db
      .select()
      .from(workbookContentRevisions)
      .where(eq(workbookContentRevisions.projectId, project.id))
      .orderBy(desc(workbookContentRevisions.revisionNumber)),
    db
      .select(themeVersionSelection)
      .from(workbookThemeVersions)
      .where(eq(workbookThemeVersions.id, themeVersionId))
      .limit(1),
    db
      .select()
      .from(workbookThemeComponentTokens)
      .where(eq(workbookThemeComponentTokens.themeVersionId, themeVersionId))
      .orderBy(asc(workbookThemeComponentTokens.componentKey)),
    db
      .select()
      .from(workbookGenerationRuns)
      .where(eq(workbookGenerationRuns.projectId, project.id))
      .orderBy(desc(workbookGenerationRuns.createdAt)),
    db
      .select()
      .from(workbookRenderRuns)
      .where(eq(workbookRenderRuns.projectId, project.id))
      .orderBy(desc(workbookRenderRuns.createdAt)),
  ]);
  if (!themeVersion)
    throw new Error("The effective workbook theme version was not found.");

  return {
    project,
    revisions,
    currentRevision:
      revisions.find((revision) => revision.id === project.currentRevisionId) ??
      null,
    publishedRevision:
      revisions.find(
        (revision) => revision.id === project.publishedRevisionId,
      ) ?? null,
    effectiveTheme: { ...themeVersion, componentTokens },
    generationRuns,
    renderRuns,
  };
}

export async function createWorkbookStudioProject(
  rawInput: z.input<typeof projectInputSchema>,
) {
  const input = projectInputSchema.parse(rawInput);
  await requireAdmin(input.userId);
  const slug = await uniqueProjectSlug(input.title);

  if (input.curriculumId) {
    const [curriculum] = await db
      .select({ id: workbookCurricula.id })
      .from(workbookCurricula)
      .where(eq(workbookCurricula.id, input.curriculumId))
      .limit(1);
    if (!curriculum)
      throw new Error("Choose a valid Workbook Studio curriculum.");
  }
  if (input.generationPromptVersionId) {
    const [prompt] = await db
      .select({
        id: workbookGenerationPromptVersions.id,
        kind: workbookGenerationPrompts.kind,
      })
      .from(workbookGenerationPromptVersions)
      .innerJoin(
        workbookGenerationPrompts,
        eq(
          workbookGenerationPrompts.id,
          workbookGenerationPromptVersions.promptId,
        ),
      )
      .where(
        and(
          eq(
            workbookGenerationPromptVersions.id,
            input.generationPromptVersionId,
          ),
          eq(workbookGenerationPromptVersions.status, "published"),
        ),
      )
      .limit(1);
    if (!prompt)
      throw new Error("Choose a published workbook generation prompt.");
    if (input.authoringMode === "generate" && prompt.kind !== "workflow") {
      throw new Error("Choose a published workbook workflow prompt.");
    }
  }

  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(workbookProjects)
      .values({
        curriculumId: input.curriculumId,
        catalogPlanKey: input.catalogPlanKey,
        slug,
        title: input.title,
        subjectKey: slugify(input.subjectKey),
        subjectLabel: input.subjectLabel,
        gradeMin: input.gradeMin,
        gradeMax: input.gradeMax,
        languageCode: input.languageCode.toLowerCase(),
        localeCode: input.localeCode,
        layoutProfile: input.layoutProfile,
        scriptProfile: input.scriptProfile,
        status: input.authoringMode === "generate" ? "generating" : "draft",
        generationPromptVersionId: input.generationPromptVersionId,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
      })
      .returning();

    if (input.authoringMode === "manual") {
      const content = emptyWorkbookContent({
        title: input.title,
        editionLabel: "1st Edition",
        gradeLabel:
          input.gradeMin === input.gradeMax
            ? input.gradeMin === 0
              ? "Kindergarten"
              : `Grade ${input.gradeMin}`
            : `Grades ${input.gradeMin}–${input.gradeMax}`,
        subjectLabel: input.subjectLabel,
      });
      const [revision] = await tx
        .insert(workbookContentRevisions)
        .values({
          projectId: project.id,
          revisionNumber: 1,
          source: "manual",
          contentJson: content,
          lessonIdFingerprint: workbookLessonIdFingerprint(content),
          validationJson: { issues: validateWorkbookForPublish(content) },
          changeNotes: "Initial manual draft",
          createdByUserId: input.userId,
        })
        .returning();
      await tx
        .update(workbookProjects)
        .set({ currentRevisionId: revision.id })
        .where(eq(workbookProjects.id, project.id));
      return {
        project: { ...project, currentRevisionId: revision.id },
        revision,
        generationRun: null,
      };
    }

    const [run] = await tx
      .insert(workbookGenerationRuns)
      .values({
        projectId: project.id,
        promptVersionId: input.generationPromptVersionId,
        provider: "anthropic",
        model: workbookGenerationModel(),
        status: "queued",
        currentStage: "curriculum",
        scopeJson: {
          ...input.generationScope,
          subjectKey: project.subjectKey,
          subjectLabel: project.subjectLabel,
          gradeMin: project.gradeMin,
          gradeMax: project.gradeMax,
          languageCode: project.languageCode,
          localeCode: project.localeCode,
          layoutProfile: project.layoutProfile,
          scriptProfile: project.scriptProfile,
        },
        requestedByUserId: input.userId,
      })
      .returning();
    await tx.insert(workbookStudioJobs).values([
      {
        runId: run.id,
        projectId: project.id,
        jobType: "curriculum",
        sequenceNumber: 10,
      },
      {
        runId: run.id,
        projectId: project.id,
        jobType: "outline",
        sequenceNumber: 20,
      },
      {
        runId: run.id,
        projectId: project.id,
        jobType: "lesson_content",
        sequenceNumber: 30,
      },
      {
        runId: run.id,
        projectId: project.id,
        jobType: "validate",
        sequenceNumber: 40,
      },
      {
        runId: run.id,
        projectId: project.id,
        jobType: "render",
        sequenceNumber: 50,
      },
    ]);
    return { project, revision: null, generationRun: run };
  });
}

export async function saveWorkbookStudioRevision(input: {
  userId: string;
  projectId: string;
  content: unknown;
  source?: WorkbookStudioRevisionSource;
  changeNotes?: string | null;
}) {
  await requireAdmin(input.userId);
  const projectId = uuidSchema.parse(input.projectId);
  const content = parseWorkbookContent(input.content);
  const [project] = await db
    .select()
    .from(workbookProjects)
    .where(eq(workbookProjects.id, projectId))
    .limit(1);
  if (!project) throw new Error("Workbook project not found.");

  const comparisonRevisionId =
    project.publishedRevisionId ?? project.currentRevisionId;
  const [previousRevision] = comparisonRevisionId
    ? await db
        .select({ contentJson: workbookContentRevisions.contentJson })
        .from(workbookContentRevisions)
        .where(eq(workbookContentRevisions.id, comparisonRevisionId))
        .limit(1)
    : [];
  const previous = previousRevision
    ? parseWorkbookContent(previousRevision.contentJson)
    : null;
  const classification = classifyWorkbookContentChange(previous, content);
  const issues = await validateWorkbookForScope(content, project);

  return db.transaction(async (tx) => {
    const [numberRow] = await tx
      .select({
        next: sql<number>`coalesce(max(${workbookContentRevisions.revisionNumber}), 0) + 1`,
      })
      .from(workbookContentRevisions)
      .where(eq(workbookContentRevisions.projectId, projectId));
    const [revision] = await tx
      .insert(workbookContentRevisions)
      .values({
        projectId,
        revisionNumber: numberRow?.next ?? 1,
        source: input.source ?? "manual",
        contentJson: content,
        lessonIdFingerprint: workbookLessonIdFingerprint(content),
        validationJson: { issues, releaseSuggestion: classification },
        changeNotes: input.changeNotes?.trim() || null,
        createdByUserId: input.userId,
      })
      .returning();
    await tx
      .update(workbookProjects)
      .set({
        currentRevisionId: revision.id,
        status: "review",
        updatedByUserId: input.userId,
        updatedAt: new Date(),
      })
      .where(eq(workbookProjects.id, projectId));
    return { revision, classification, issues };
  });
}

export async function createWorkbookStudioCurriculum(input: {
  userId: string;
  name: string;
  standardCode?: string | null;
  standardLabel?: string | null;
  gradeLevel: number;
  languageCode: string;
  plan?: Record<string, unknown>;
}) {
  await requireAdmin(input.userId);
  const name = z.string().trim().min(1).max(180).parse(input.name);
  const baseSlug = slugify(`${name}-${input.gradeLevel}-${input.languageCode}`);
  const themeVersionId = await classicThemeVersionId();
  return db.transaction(async (tx) => {
    const [curriculum] = await tx
      .insert(workbookCurricula)
      .values({
        slug: `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`,
        name,
        standardCode: input.standardCode?.trim() || null,
        standardLabel: input.standardLabel?.trim() || null,
        gradeLevel: z.number().int().min(-2).max(20).parse(input.gradeLevel),
        languageCode: z
          .string()
          .trim()
          .min(2)
          .max(20)
          .parse(input.languageCode)
          .toLowerCase(),
        defaultThemeVersionId: themeVersionId,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
      })
      .returning();
    const [revision] = await tx
      .insert(workbookCurriculumRevisions)
      .values({
        curriculumId: curriculum.id,
        revisionNumber: 1,
        source: "manual",
        planJson: input.plan ?? { workbooks: [] },
        validationJson: {},
        createdByUserId: input.userId,
      })
      .returning();
    await tx
      .update(workbookCurricula)
      .set({ currentRevisionId: revision.id })
      .where(eq(workbookCurricula.id, curriculum.id));
    return { curriculum, revision };
  });
}

export async function queueWorkbookGradeLevelGeneration(
  rawInput: z.input<typeof gradeLevelBatchInputSchema>,
) {
  const input = gradeLevelBatchInputSchema.parse(rawInput);
  await requireAdmin(input.userId);
  const [catalogPrompt, workbookPrompt] = await Promise.all([
    db
      .select({
        id: workbookGenerationPromptVersions.id,
        kind: workbookGenerationPrompts.kind,
      })
      .from(workbookGenerationPromptVersions)
      .innerJoin(
        workbookGenerationPrompts,
        eq(
          workbookGenerationPrompts.id,
          workbookGenerationPromptVersions.promptId,
        ),
      )
      .where(
        and(
          eq(workbookGenerationPromptVersions.id, input.catalogPromptVersionId),
          eq(workbookGenerationPromptVersions.status, "published"),
        ),
      )
      .limit(1),
    db
      .select({
        id: workbookGenerationPromptVersions.id,
        kind: workbookGenerationPrompts.kind,
      })
      .from(workbookGenerationPromptVersions)
      .innerJoin(
        workbookGenerationPrompts,
        eq(
          workbookGenerationPrompts.id,
          workbookGenerationPromptVersions.promptId,
        ),
      )
      .where(
        and(
          eq(
            workbookGenerationPromptVersions.id,
            input.workbookPromptVersionId,
          ),
          eq(workbookGenerationPromptVersions.status, "published"),
        ),
      )
      .limit(1),
  ]);
  if (catalogPrompt[0]?.kind !== "catalog_plan") {
    throw new Error("Choose a published grade catalog planning prompt.");
  }
  if (workbookPrompt[0]?.kind !== "workflow") {
    throw new Error("Choose a published single-workbook workflow prompt.");
  }
  const themeVersionId =
    input.defaultThemeVersionId ?? (await classicThemeVersionId());
  await assertPublishedThemeVersion(themeVersionId);

  return db.transaction(async (tx) => {
    const [curriculum] = await tx
      .insert(workbookCurricula)
      .values({
        slug: `${slugify(`${input.curriculumName}-${input.gradeLevel}-${input.languageCode}`)}-${crypto.randomUUID().slice(0, 6)}`,
        name: input.curriculumName,
        standardCode: input.standardCode,
        standardLabel: input.standardLabel,
        gradeLevel: input.gradeLevel,
        languageCode: input.languageCode.toLowerCase(),
        defaultThemeVersionId: themeVersionId,
        createdByUserId: input.userId,
        updatedByUserId: input.userId,
      })
      .returning();
    const [revision] = await tx
      .insert(workbookCurriculumRevisions)
      .values({
        curriculumId: curriculum.id,
        revisionNumber: 1,
        source: "manual",
        planJson: { schemaVersion: 1, status: "planning", workbooks: [] },
        validationJson: {},
        createdByUserId: input.userId,
      })
      .returning();
    await tx
      .update(workbookCurricula)
      .set({ currentRevisionId: revision.id })
      .where(eq(workbookCurricula.id, curriculum.id));
    const [batch] = await tx
      .insert(workbookGenerationBatches)
      .values({
        kind: "grade_level",
        status: "queued",
        curriculumId: curriculum.id,
        gradeLevel: input.gradeLevel,
        languageCode: input.languageCode.toLowerCase(),
        targetThemeVersionId: themeVersionId,
        totalJobs: 1,
        inputJson: {
          curriculumName: input.curriculumName,
          standardCode: input.standardCode,
          standardLabel: input.standardLabel,
          catalogPromptVersionId: input.catalogPromptVersionId,
          workbookPromptVersionId: input.workbookPromptVersionId,
        },
        requestedByUserId: input.userId,
      })
      .returning();
    const [run] = await tx
      .insert(workbookGenerationRuns)
      .values({
        batchId: batch.id,
        promptVersionId: input.catalogPromptVersionId,
        provider: "anthropic",
        model: workbookGenerationModel(),
        status: "queued",
        currentStage: "catalog_plan",
        scopeJson: {
          curriculumName: input.curriculumName,
          standardCode: input.standardCode,
          standardLabel: input.standardLabel,
          gradeLevel: input.gradeLevel,
          languageCode: input.languageCode.toLowerCase(),
          workbookPromptVersionId: input.workbookPromptVersionId,
        },
        requestedByUserId: input.userId,
      })
      .returning();
    const [job] = await tx
      .insert(workbookStudioJobs)
      .values({
        batchId: batch.id,
        runId: run.id,
        jobType: "catalog_plan",
        sequenceNumber: 10,
        payloadJson: {
          curriculumId: curriculum.id,
          workbookPromptVersionId: input.workbookPromptVersionId,
        },
      })
      .returning();
    return { curriculum, batch, run, job };
  });
}

export async function getAdminWorkbookStudioCurriculum(input: {
  userId: string;
  curriculumId: string;
}) {
  await requireAdmin(input.userId);
  const curriculumId = uuidSchema.parse(input.curriculumId);
  const [curriculum] = await db
    .select()
    .from(workbookCurricula)
    .where(eq(workbookCurricula.id, curriculumId))
    .limit(1);
  if (!curriculum) throw new Error("Workbook curriculum not found.");
  const [revisions, projects, batches] = await Promise.all([
    db
      .select()
      .from(workbookCurriculumRevisions)
      .where(eq(workbookCurriculumRevisions.curriculumId, curriculumId))
      .orderBy(desc(workbookCurriculumRevisions.revisionNumber)),
    db
      .select()
      .from(workbookProjects)
      .where(eq(workbookProjects.curriculumId, curriculumId))
      .orderBy(
        asc(workbookProjects.subjectLabel),
        asc(workbookProjects.localeCode),
      ),
    db
      .select()
      .from(workbookGenerationBatches)
      .where(eq(workbookGenerationBatches.curriculumId, curriculumId))
      .orderBy(desc(workbookGenerationBatches.createdAt)),
  ]);
  return {
    curriculum,
    revisions,
    currentRevision:
      revisions.find(
        (revision) => revision.id === curriculum.currentRevisionId,
      ) ?? null,
    publishedRevision:
      revisions.find(
        (revision) => revision.id === curriculum.publishedRevisionId,
      ) ?? null,
    projects,
    batches,
  };
}

export async function saveWorkbookStudioCurriculumRevision(input: {
  userId: string;
  curriculumId: string;
  plan: unknown;
  workbookPromptVersionId?: string | null;
}) {
  await requireAdmin(input.userId);
  const curriculumId = uuidSchema.parse(input.curriculumId);
  const plan = parseWorkbookCatalogPlan(input.plan);
  const workbookPromptVersionId = input.workbookPromptVersionId
    ? uuidSchema.parse(input.workbookPromptVersionId)
    : null;
  const [curriculum] = await db
    .select({ id: workbookCurricula.id })
    .from(workbookCurricula)
    .where(eq(workbookCurricula.id, curriculumId))
    .limit(1);
  if (!curriculum) throw new Error("Workbook curriculum not found.");
  return db.transaction(async (tx) => {
    const [numberRow] = await tx
      .select({
        next: sql<number>`coalesce(max(${workbookCurriculumRevisions.revisionNumber}), 0) + 1`,
      })
      .from(workbookCurriculumRevisions)
      .where(eq(workbookCurriculumRevisions.curriculumId, curriculumId));
    const [revision] = await tx
      .insert(workbookCurriculumRevisions)
      .values({
        curriculumId,
        revisionNumber: numberRow?.next ?? 1,
        source: "manual",
        planJson: { schemaVersion: 1, workbookPromptVersionId, ...plan },
        validationJson: { issues: [] },
        createdByUserId: input.userId,
      })
      .returning();
    await tx
      .update(workbookCurricula)
      .set({
        currentRevisionId: revision.id,
        status: "review",
        updatedByUserId: input.userId,
        updatedAt: new Date(),
      })
      .where(eq(workbookCurricula.id, curriculumId));
    return { revision };
  });
}

export async function publishWorkbookStudioCurriculum(input: {
  userId: string;
  curriculumId: string;
}) {
  await requireAdmin(input.userId);
  const curriculumId = uuidSchema.parse(input.curriculumId);
  const [row] = await db
    .select({
      curriculum: workbookCurricula,
      planJson: workbookCurriculumRevisions.planJson,
    })
    .from(workbookCurricula)
    .leftJoin(
      workbookCurriculumRevisions,
      eq(workbookCurriculumRevisions.id, workbookCurricula.currentRevisionId),
    )
    .where(eq(workbookCurricula.id, curriculumId))
    .limit(1);
  if (!row?.curriculum.currentRevisionId)
    throw new Error("Save a curriculum plan before publishing it.");
  parseWorkbookCatalogPlan(row.planJson);
  const [curriculum] = await db
    .update(workbookCurricula)
    .set({
      publishedRevisionId: row.curriculum.currentRevisionId,
      status: "published",
      updatedByUserId: input.userId,
      updatedAt: new Date(),
    })
    .where(eq(workbookCurricula.id, curriculumId))
    .returning();
  return { curriculum };
}

export async function queueWorkbookCurriculumGeneration(input: {
  userId: string;
  curriculumId: string;
  workbookPromptVersionId?: string | null;
}) {
  await requireAdmin(input.userId);
  const curriculumId = uuidSchema.parse(input.curriculumId);
  const [row] = await db
    .select({
      curriculum: workbookCurricula,
      planJson: workbookCurriculumRevisions.planJson,
    })
    .from(workbookCurricula)
    .innerJoin(
      workbookCurriculumRevisions,
      eq(workbookCurriculumRevisions.id, workbookCurricula.currentRevisionId),
    )
    .where(eq(workbookCurricula.id, curriculumId))
    .limit(1);
  if (!row)
    throw new Error("Save a curriculum plan before generating workbooks.");
  const plan = parseWorkbookCatalogPlan(row.planJson);
  const storedPromptVersionId =
    typeof row.planJson.workbookPromptVersionId === "string"
      ? row.planJson.workbookPromptVersionId
      : null;
  const workbookPromptVersionId = uuidSchema.parse(
    input.workbookPromptVersionId ?? storedPromptVersionId,
  );
  const [workflowPrompt] = await db
    .select({ kind: workbookGenerationPrompts.kind })
    .from(workbookGenerationPromptVersions)
    .innerJoin(
      workbookGenerationPrompts,
      eq(
        workbookGenerationPrompts.id,
        workbookGenerationPromptVersions.promptId,
      ),
    )
    .where(
      and(
        eq(workbookGenerationPromptVersions.id, workbookPromptVersionId),
        eq(workbookGenerationPromptVersions.status, "published"),
      ),
    )
    .limit(1);
  if (workflowPrompt?.kind !== "workflow")
    throw new Error("Choose a published single-workbook workflow prompt.");

  const [batch] = await db
    .insert(workbookGenerationBatches)
    .values({
      kind: "curriculum",
      status: "queued",
      curriculumId,
      gradeLevel: row.curriculum.gradeLevel,
      languageCode: row.curriculum.languageCode,
      targetThemeVersionId: row.curriculum.defaultThemeVersionId,
      inputJson: {
        workbookPromptVersionId,
        curriculumRevisionId: row.curriculum.currentRevisionId,
      },
      requestedByUserId: input.userId,
    })
    .returning();
  const createdProjectIds: string[] = [];
  const existingProjectIds: string[] = [];
  try {
    for (const planned of plan.workbooks) {
      const [existingProject] = await db
        .select({ id: workbookProjects.id })
        .from(workbookProjects)
        .where(
          and(
            eq(workbookProjects.curriculumId, curriculumId),
            eq(workbookProjects.catalogPlanKey, planned.stableKey),
          ),
        )
        .limit(1);
      if (existingProject) {
        existingProjectIds.push(existingProject.id);
        continue;
      }
      const created = await createWorkbookStudioProject({
        userId: input.userId,
        curriculumId,
        catalogPlanKey: planned.stableKey,
        title: planned.title,
        subjectKey: planned.subjectKey,
        subjectLabel: planned.subjectLabel,
        gradeMin: row.curriculum.gradeLevel,
        gradeMax: row.curriculum.gradeLevel,
        languageCode: planned.languageCode,
        localeCode: planned.localeCode,
        layoutProfile: planned.layoutProfile,
        scriptProfile: planned.scriptProfile,
        authoringMode: "generate",
        generationPromptVersionId: workbookPromptVersionId,
        generationScope: {
          catalogPlanKey: planned.stableKey,
          domains: planned.domains,
          curriculumName: row.curriculum.name,
          standardCode: row.curriculum.standardCode,
          standardLabel: row.curriculum.standardLabel,
        },
      });
      if (!created.generationRun)
        throw new Error("The workbook generation run was not created.");
      createdProjectIds.push(created.project.id);
      await db
        .update(workbookGenerationRuns)
        .set({ batchId: batch.id })
        .where(eq(workbookGenerationRuns.id, created.generationRun.id));
      await db
        .update(workbookStudioJobs)
        .set({ batchId: batch.id })
        .where(eq(workbookStudioJobs.runId, created.generationRun.id));
    }
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(workbookStudioJobs)
      .where(eq(workbookStudioJobs.batchId, batch.id));
    const totalJobs = countRow?.count ?? 0;
    await db
      .update(workbookGenerationBatches)
      .set({
        totalJobs,
        status: totalJobs ? "queued" : "completed",
        ...(!totalJobs ? { completedAt: new Date() } : {}),
      })
      .where(eq(workbookGenerationBatches.id, batch.id));
    return { batch, createdProjectIds, existingProjectIds };
  } catch (error) {
    await db
      .update(workbookGenerationBatches)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(workbookGenerationBatches.id, batch.id));
    throw error;
  }
}

export async function saveWorkbookGenerationPrompt(input: {
  userId: string;
  promptId?: string | null;
  name: string;
  description?: string;
  kind: WorkbookGenerationPromptKind;
  promptText: string;
  configuration?: Record<string, unknown>;
  source?: Record<string, unknown>;
  publish?: boolean;
}) {
  await requireAdmin(input.userId);
  const name = z.string().trim().min(1).max(180).parse(input.name);
  const promptText = z.string().trim().min(1).parse(input.promptText);
  const kind = z
    .enum([
      "workflow",
      "catalog_plan",
      "curriculum",
      "outline",
      "lesson_content",
      "subject_overlay",
      "layout_profile",
    ])
    .parse(input.kind);
  return db.transaction(async (tx) => {
    let promptId = input.promptId ? uuidSchema.parse(input.promptId) : null;
    if (!promptId) {
      const [prompt] = await tx
        .insert(workbookGenerationPrompts)
        .values({
          slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`,
          name,
          description: input.description?.trim() || "",
          kind,
          createdByUserId: input.userId,
          updatedByUserId: input.userId,
        })
        .returning({ id: workbookGenerationPrompts.id });
      promptId = prompt.id;
    } else {
      await tx
        .update(workbookGenerationPrompts)
        .set({
          name,
          description: input.description?.trim() || "",
          kind,
          updatedByUserId: input.userId,
          updatedAt: new Date(),
        })
        .where(eq(workbookGenerationPrompts.id, promptId));
    }
    const [versionRow] = await tx
      .select({
        next: sql<number>`coalesce(max(${workbookGenerationPromptVersions.versionNumber}), 0) + 1`,
      })
      .from(workbookGenerationPromptVersions)
      .where(eq(workbookGenerationPromptVersions.promptId, promptId));
    const [version] = await tx
      .insert(workbookGenerationPromptVersions)
      .values({
        promptId,
        versionNumber: versionRow?.next ?? 1,
        status: input.publish ? "published" : "draft",
        promptText,
        configurationJson: input.configuration ?? {},
        sourceJson: input.source ?? {},
        createdByUserId: input.userId,
        publishedAt: input.publish ? new Date() : null,
      })
      .returning();
    if (input.publish) {
      await tx
        .update(workbookGenerationPromptVersions)
        .set({ status: "retired" })
        .where(
          and(
            eq(workbookGenerationPromptVersions.promptId, promptId),
            eq(workbookGenerationPromptVersions.status, "published"),
            sql`${workbookGenerationPromptVersions.id} <> ${version.id}`,
          ),
        );
      await tx
        .update(workbookGenerationPrompts)
        .set({
          publishedVersionId: version.id,
          updatedAt: new Date(),
        })
        .where(eq(workbookGenerationPrompts.id, promptId));
    }
    return { promptId, version };
  });
}

export async function saveWorkbookGenerationRule(input: {
  userId: string;
  ruleId?: string | null;
  name: string;
  description?: string;
  ruleKind: string;
  scopeType: "global" | "subject" | "grade" | "subject_grade" | "language";
  subjectKey?: string | null;
  gradeMin?: number | null;
  gradeMax?: number | null;
  languageCode?: string | null;
  stage?: string | null;
  enforcement: "prompt" | "save_validator" | "publish_validator";
  instructionText?: string | null;
  parameters?: Record<string, unknown>;
  publish?: boolean;
}) {
  await requireAdmin(input.userId);
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(180),
      description: z.string().trim().max(2_000).default(""),
      ruleKind: z.string().trim().min(1).max(80),
      scopeType: z.enum([
        "global",
        "subject",
        "grade",
        "subject_grade",
        "language",
      ]),
      subjectKey: z.string().trim().min(1).max(100).nullable().default(null),
      gradeMin: z.number().int().min(-2).max(20).nullable().default(null),
      gradeMax: z.number().int().min(-2).max(20).nullable().default(null),
      languageCode: z.string().trim().min(2).max(20).nullable().default(null),
      stage: z.string().trim().min(1).max(80).nullable().default(null),
      enforcement: z.enum(["prompt", "save_validator", "publish_validator"]),
      instructionText: z.string().trim().max(4_000).nullable().default(null),
      parameters: z.record(z.unknown()).default({}),
      publish: z.boolean().default(false),
    })
    .superRefine((value, context) => {
      if (
        value.gradeMin !== null &&
        value.gradeMax !== null &&
        value.gradeMin > value.gradeMax
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The minimum grade cannot be above the maximum grade.",
          path: ["gradeMax"],
        });
      }
      if (value.enforcement === "prompt" && !value.instructionText) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Prompt rules need instruction text.",
          path: ["instructionText"],
        });
      }
      if (
        ["subject", "subject_grade"].includes(value.scopeType) &&
        !value.subjectKey
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Subject-scoped rules need a subject key.",
          path: ["subjectKey"],
        });
      }
      if (
        ["grade", "subject_grade"].includes(value.scopeType) &&
        value.gradeMin === null &&
        value.gradeMax === null
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Grade-scoped rules need at least one grade boundary.",
          path: ["gradeMin"],
        });
      }
      if (value.scopeType === "language" && !value.languageCode) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Language-scoped rules need a language code.",
          path: ["languageCode"],
        });
      }
    })
    .parse({
      name: input.name,
      description: input.description ?? "",
      ruleKind: input.ruleKind,
      scopeType: input.scopeType,
      subjectKey: input.subjectKey ?? null,
      gradeMin: input.gradeMin ?? null,
      gradeMax: input.gradeMax ?? null,
      languageCode: input.languageCode ?? null,
      stage: input.stage ?? null,
      enforcement: input.enforcement,
      instructionText: input.instructionText?.trim() || null,
      parameters: input.parameters ?? {},
      publish: input.publish ?? false,
    });
  const subjectKey = ["subject", "subject_grade"].includes(parsed.scopeType)
    ? parsed.subjectKey
    : null;
  const gradeMin = ["grade", "subject_grade"].includes(parsed.scopeType)
    ? parsed.gradeMin
    : null;
  const gradeMax = ["grade", "subject_grade"].includes(parsed.scopeType)
    ? parsed.gradeMax
    : null;
  const languageCode =
    parsed.scopeType === "language"
      ? (parsed.languageCode?.toLowerCase() ?? null)
      : null;
  return db.transaction(async (tx) => {
    let ruleId = input.ruleId ? uuidSchema.parse(input.ruleId) : null;
    if (!ruleId) {
      const [rule] = await tx
        .insert(workbookGenerationRules)
        .values({
          slug: `${slugify(parsed.name)}-${crypto.randomUUID().slice(0, 6)}`,
          name: parsed.name,
          description: parsed.description,
          ruleKind: parsed.ruleKind,
          createdByUserId: input.userId,
          updatedByUserId: input.userId,
        })
        .returning({ id: workbookGenerationRules.id });
      ruleId = rule.id;
    } else {
      const [existing] = await tx
        .select({ id: workbookGenerationRules.id })
        .from(workbookGenerationRules)
        .where(eq(workbookGenerationRules.id, ruleId))
        .limit(1);
      if (!existing) throw new Error("Workbook generation rule not found.");
      await tx
        .update(workbookGenerationRules)
        .set({
          name: parsed.name,
          description: parsed.description,
          ruleKind: parsed.ruleKind,
          updatedByUserId: input.userId,
          updatedAt: new Date(),
        })
        .where(eq(workbookGenerationRules.id, ruleId));
    }
    const [versionRow] = await tx
      .select({
        next: sql<number>`coalesce(max(${workbookGenerationRuleVersions.versionNumber}), 0) + 1`,
      })
      .from(workbookGenerationRuleVersions)
      .where(eq(workbookGenerationRuleVersions.ruleId, ruleId));
    const [version] = await tx
      .insert(workbookGenerationRuleVersions)
      .values({
        ruleId,
        versionNumber: versionRow?.next ?? 1,
        status: parsed.publish ? "published" : "draft",
        scopeType: parsed.scopeType,
        subjectKey,
        gradeMin,
        gradeMax,
        languageCode,
        stage: parsed.stage,
        enforcement: parsed.enforcement,
        instructionText: parsed.instructionText,
        parametersJson: parsed.parameters,
        createdByUserId: input.userId,
        publishedAt: parsed.publish ? new Date() : null,
      })
      .returning();
    if (parsed.publish) {
      await tx
        .update(workbookGenerationRuleVersions)
        .set({ status: "retired" })
        .where(
          and(
            eq(workbookGenerationRuleVersions.ruleId, ruleId),
            eq(workbookGenerationRuleVersions.status, "published"),
            sql`${workbookGenerationRuleVersions.id} <> ${version.id}`,
          ),
        );
      await tx
        .update(workbookGenerationRules)
        .set({
          publishedVersionId: version.id,
          updatedAt: new Date(),
        })
        .where(eq(workbookGenerationRules.id, ruleId));
    }
    return { ruleId, version };
  });
}

export async function createWorkbookThemeVersion(input: {
  userId: string;
  themeId?: string | null;
  name: string;
  description?: string;
  tokens: WorkbookThemeTokens;
  componentTokens?: Array<{
    componentKey: string;
    tokens: Record<string, string | number | boolean>;
  }>;
  publish?: boolean;
}) {
  await requireAdmin(input.userId);
  const name = z.string().trim().min(1).max(120).parse(input.name);
  const tokens = workbookThemeTokensSchema.parse(input.tokens);
  const compiledCss = compileWorkbookThemeCss(tokens);
  return db.transaction(async (tx) => {
    let themeId = input.themeId ? uuidSchema.parse(input.themeId) : null;
    let inheritedComponentTokens: Array<{
      componentKey: string;
      tokens: Record<string, string | number | boolean>;
    }> = [];
    if (!themeId) {
      const [theme] = await tx
        .insert(workbookThemes)
        .values({
          slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`,
          name,
          description: input.description?.trim() || "",
          createdByUserId: input.userId,
          updatedByUserId: input.userId,
        })
        .returning({ id: workbookThemes.id });
      themeId = theme.id;
    } else {
      const [existingTheme] = await tx
        .select({ publishedVersionId: workbookThemes.publishedVersionId })
        .from(workbookThemes)
        .where(eq(workbookThemes.id, themeId))
        .limit(1);
      if (!existingTheme) throw new Error("Workbook theme not found.");
      if (!input.componentTokens && existingTheme.publishedVersionId) {
        inheritedComponentTokens = await tx
          .select({
            componentKey: workbookThemeComponentTokens.componentKey,
            tokens: workbookThemeComponentTokens.tokensJson,
          })
          .from(workbookThemeComponentTokens)
          .where(
            eq(
              workbookThemeComponentTokens.themeVersionId,
              existingTheme.publishedVersionId,
            ),
          );
      }
      await tx
        .update(workbookThemes)
        .set({
          name,
          description: input.description?.trim() || "",
          updatedByUserId: input.userId,
          updatedAt: new Date(),
        })
        .where(eq(workbookThemes.id, themeId));
    }
    const [versionRow] = await tx
      .select({
        next: sql<number>`coalesce(max(${workbookThemeVersions.versionNumber}), 0) + 1`,
      })
      .from(workbookThemeVersions)
      .where(eq(workbookThemeVersions.themeId, themeId));
    const [version] = await tx
      .insert(workbookThemeVersions)
      .values({
        themeId,
        versionNumber: versionRow?.next ?? 1,
        status: input.publish ? "published" : "draft",
        ...tokens,
        rawCssOverride: null,
        compiledCss,
        compiledAt: new Date(),
        sourceJson: { source: "workbook_studio" },
        createdByUserId: input.userId,
        publishedAt: input.publish ? new Date() : null,
      })
      .returning();
    const componentTokens = input.componentTokens ?? inheritedComponentTokens;
    if (componentTokens.length) {
      await tx.insert(workbookThemeComponentTokens).values(
        componentTokens.map((component) => ({
          themeVersionId: version.id,
          componentKey: component.componentKey,
          tokensJson: component.tokens,
        })),
      );
    }
    if (input.publish) {
      await tx
        .update(workbookThemeVersions)
        .set({ status: "retired" })
        .where(
          and(
            eq(workbookThemeVersions.themeId, themeId),
            eq(workbookThemeVersions.status, "published"),
            sql`${workbookThemeVersions.id} <> ${version.id}`,
          ),
        );
      await tx
        .update(workbookThemes)
        .set({ publishedVersionId: version.id, updatedAt: new Date() })
        .where(eq(workbookThemes.id, themeId));
    }
    return { themeId, version };
  });
}

async function assertPublishedThemeVersion(themeVersionId: string) {
  const [theme] = await db
    .select({ id: workbookThemeVersions.id })
    .from(workbookThemeVersions)
    .where(
      and(
        eq(workbookThemeVersions.id, themeVersionId),
        eq(workbookThemeVersions.status, "published"),
      ),
    )
    .limit(1);
  if (!theme) throw new Error("Choose a published workbook theme version.");
}

export async function setWorkbookCurriculumTheme(input: {
  userId: string;
  curriculumId: string;
  themeVersionId: string;
}) {
  await requireAdmin(input.userId);
  const curriculumId = uuidSchema.parse(input.curriculumId);
  const themeVersionId = uuidSchema.parse(input.themeVersionId);
  await assertPublishedThemeVersion(themeVersionId);
  const [curriculum] = await db
    .select({
      defaultThemeVersionId: workbookCurricula.defaultThemeVersionId,
    })
    .from(workbookCurricula)
    .where(eq(workbookCurricula.id, curriculumId))
    .limit(1);
  if (!curriculum) throw new Error("Workbook Studio curriculum not found.");
  if (curriculum.defaultThemeVersionId === themeVersionId) {
    return { batchId: null, affectedProjects: 0 };
  }
  const projects = await db
    .select({
      id: workbookProjects.id,
      nativeWorkbookId: workbookProjects.nativeWorkbookId,
    })
    .from(workbookProjects)
    .where(
      and(
        eq(workbookProjects.curriculumId, curriculumId),
        isNull(workbookProjects.themeOverrideVersionId),
        sql`${workbookProjects.status} <> 'archived'`,
      ),
    );
  return db.transaction(async (tx) => {
    await tx
      .update(workbookCurricula)
      .set({
        defaultThemeVersionId: themeVersionId,
        updatedByUserId: input.userId,
        updatedAt: new Date(),
      })
      .where(eq(workbookCurricula.id, curriculumId));
    const releasable = projects.filter((project) => project.nativeWorkbookId);
    if (!releasable.length)
      return { batchId: null, affectedProjects: projects.length };
    const [batch] = await tx
      .insert(workbookGenerationBatches)
      .values({
        kind: "theme_cascade",
        status: "queued",
        curriculumId,
        targetThemeVersionId: themeVersionId,
        totalJobs: releasable.length,
        inputJson: { reason: "curriculum_theme_change" },
        requestedByUserId: input.userId,
      })
      .returning();
    await tx.insert(workbookStudioJobs).values(
      releasable.map((project, index) => ({
        batchId: batch.id,
        projectId: project.id,
        jobType: "theme_cascade" as const,
        sequenceNumber: index,
        payloadJson: { themeVersionId },
      })),
    );
    return { batchId: batch.id, affectedProjects: projects.length };
  });
}

export async function setWorkbookProjectThemeOverride(input: {
  userId: string;
  projectId: string;
  themeVersionId: string | null;
}) {
  await requireAdmin(input.userId);
  const projectId = uuidSchema.parse(input.projectId);
  const themeVersionId = input.themeVersionId
    ? uuidSchema.parse(input.themeVersionId)
    : null;
  if (themeVersionId) await assertPublishedThemeVersion(themeVersionId);
  const [project] = await db
    .select()
    .from(workbookProjects)
    .where(eq(workbookProjects.id, projectId))
    .limit(1);
  if (!project) throw new Error("Workbook project not found.");
  const currentThemeVersionId =
    await resolveEffectiveWorkbookThemeVersionId(project);
  const targetThemeVersionId =
    themeVersionId ??
    (await resolveEffectiveWorkbookThemeVersionId({
      ...project,
      themeOverrideVersionId: null,
    }));
  return db.transaction(async (tx) => {
    await tx
      .update(workbookProjects)
      .set({
        themeOverrideVersionId: themeVersionId,
        updatedByUserId: input.userId,
        updatedAt: new Date(),
      })
      .where(eq(workbookProjects.id, projectId));
    if (
      !project.nativeWorkbookId ||
      currentThemeVersionId === targetThemeVersionId
    ) {
      return { jobId: null, themeVersionId: targetThemeVersionId };
    }
    const [job] = await tx
      .insert(workbookStudioJobs)
      .values({
        projectId,
        jobType: "theme_cascade",
        payloadJson: {
          themeVersionId: targetThemeVersionId,
          reason: "project_theme_override_change",
        },
      })
      .returning({ id: workbookStudioJobs.id });
    return { jobId: job.id, themeVersionId: targetThemeVersionId };
  });
}

export async function queueWorkbookStudioRender(input: {
  userId: string;
  projectId: string;
  contentRevisionId?: string | null;
}) {
  await requireAdmin(input.userId);
  const projectId = uuidSchema.parse(input.projectId);
  const [project] = await db
    .select()
    .from(workbookProjects)
    .where(eq(workbookProjects.id, projectId))
    .limit(1);
  if (!project) throw new Error("Workbook project not found.");
  const contentRevisionId = input.contentRevisionId
    ? uuidSchema.parse(input.contentRevisionId)
    : project.currentRevisionId;
  if (!contentRevisionId)
    throw new Error("Save workbook content before rendering it.");
  const themeVersionId = await resolveEffectiveWorkbookThemeVersionId(project);
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(workbookRenderRuns)
      .values({
        projectId,
        contentRevisionId,
        themeVersionId,
        rendererVersion: "workbook-studio-v1",
        pagedJsVersion: "0.4.3",
        optionsJson: { copyrightYear: new Date().getUTCFullYear() },
        createdByUserId: input.userId,
      })
      .returning();
    const [job] = await tx
      .insert(workbookStudioJobs)
      .values({
        projectId,
        jobType: "render",
        payloadJson: { renderRunId: run.id },
      })
      .returning();
    return { run, job };
  });
}

export async function listApplicableWorkbookRules(input: {
  subjectKey: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  stage: string;
}) {
  return db
    .select({
      id: workbookGenerationRuleVersions.id,
      name: workbookGenerationRules.name,
      enforcement: workbookGenerationRuleVersions.enforcement,
      instructionText: workbookGenerationRuleVersions.instructionText,
      parametersJson: workbookGenerationRuleVersions.parametersJson,
    })
    .from(workbookGenerationRuleVersions)
    .innerJoin(
      workbookGenerationRules,
      eq(workbookGenerationRules.id, workbookGenerationRuleVersions.ruleId),
    )
    .where(
      and(
        eq(workbookGenerationRuleVersions.status, "published"),
        eq(workbookGenerationRules.status, "active"),
        eq(workbookGenerationRuleVersions.enforcement, "prompt"),
        or(
          isNull(workbookGenerationRuleVersions.subjectKey),
          eq(workbookGenerationRuleVersions.subjectKey, input.subjectKey),
        ),
        or(
          isNull(workbookGenerationRuleVersions.gradeMin),
          sql`${workbookGenerationRuleVersions.gradeMin} <= ${input.gradeMax}`,
        ),
        or(
          isNull(workbookGenerationRuleVersions.gradeMax),
          sql`${workbookGenerationRuleVersions.gradeMax} >= ${input.gradeMin}`,
        ),
        or(
          isNull(workbookGenerationRuleVersions.languageCode),
          eq(workbookGenerationRuleVersions.languageCode, input.languageCode),
        ),
        or(
          isNull(workbookGenerationRuleVersions.stage),
          eq(workbookGenerationRuleVersions.stage, input.stage),
        ),
      ),
    )
    .orderBy(asc(workbookGenerationRules.name));
}

export function assembleWorkbookGenerationPrompt(input: {
  basePrompt: string;
  subjectOverlay?: string | null;
  rules: Array<{ name: string; instructionText: string | null }>;
  scope: Record<string, unknown>;
}) {
  const ruleText = input.rules
    .filter((rule) => rule.instructionText)
    .map((rule) => `- ${rule.name}: ${rule.instructionText}`)
    .join("\n");
  return [
    input.basePrompt.trim(),
    input.subjectOverlay?.trim()
      ? `SUBJECT OVERLAY\n${input.subjectOverlay.trim()}`
      : "",
    ruleText ? `ACTIVE RULES\n${ruleText}` : "",
    `REQUEST SCOPE\n${JSON.stringify(input.scope, null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type WorkbookStudioProjectDetail = Awaited<
  ReturnType<typeof getAdminWorkbookStudioProject>
>;
export type WorkbookStudioContent = WorkbookContent;
