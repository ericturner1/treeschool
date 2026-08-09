import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  nativeWorkbookEditions,
  nativeWorkbookVersions,
  nativeWorkbooks,
  profiles,
  workbookContentRevisions,
  workbookCurricula,
  workbookGenerationBatches,
  workbookGenerationRuns,
  workbookProjects,
  workbookRenderRuns,
  workbookStudioJobs,
} from "ts-db";
import { db } from "../db";
import { downloadPrivateFile, uploadPrivateFile } from "./media";
import {
  completeNativeWorkbookEdition,
  completeNativeWorkbookReplacement,
  completeNativeWorkbookUpload,
  discardNativeWorkbookEdition,
  discardNativeWorkbookReplacement,
  discardNativeWorkbookUpload,
  prepareNativeWorkbookEdition,
  prepareNativeWorkbookReplacement,
  prepareNativeWorkbookUpload,
} from "./native-workbooks";
import {
  classifyWorkbookContentChange,
  parseWorkbookContent,
} from "./workbook-studio-model";
import { validateWorkbookForScope } from "./workbook-studio-validation";

const uuidSchema = z.string().uuid();

export const workbookStudioCatalogInputSchema = z.object({
  description: z.string().trim().min(1).max(3_000),
  curriculumAreaKey: z.string().trim().min(1).max(80),
  type: z.enum(["core", "elective"]),
  priceInCents: z.number().int().min(0).max(1_000_000),
  currencyCode: z.string().trim().length(3).default("USD"),
  coverageTags: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  prerequisiteWorkbookId: uuidSchema.nullable().default(null),
});

type CatalogInput = z.infer<typeof workbookStudioCatalogInputSchema>;

async function requireAdmin(userId: string) {
  const [admin] = await db
    .select({ isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!admin?.isAdmin) throw new Error("Administrator access is required.");
}

function ordinalEdition(value: number) {
  const mod100 = value % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : value % 10 === 1
        ? "st"
        : value % 10 === 2
          ? "nd"
          : value % 10 === 3
            ? "rd"
            : "th";
  return `${value}${suffix} Edition`;
}

async function resolveReleasePlan(input: {
  projectId: string;
  contentRevisionId: string;
  forceNewEdition: boolean;
}) {
  const [project] = await db
    .select()
    .from(workbookProjects)
    .where(eq(workbookProjects.id, input.projectId))
    .limit(1);
  if (!project) throw new Error("Workbook project not found.");
  const [revision] = await db
    .select()
    .from(workbookContentRevisions)
    .where(
      and(
        eq(workbookContentRevisions.id, input.contentRevisionId),
        eq(workbookContentRevisions.projectId, project.id),
      ),
    )
    .limit(1);
  if (!revision) throw new Error("Workbook revision not found.");
  const content = parseWorkbookContent(revision.contentJson);
  const blockingIssues = (
    await validateWorkbookForScope(content, project)
  ).filter((issue) => issue.severity === "error");
  if (blockingIssues.length)
    throw new Error(blockingIssues.map((issue) => issue.message).join(" "));

  const [publishedRevision] = project.publishedRevisionId
    ? await db
        .select()
        .from(workbookContentRevisions)
        .where(eq(workbookContentRevisions.id, project.publishedRevisionId))
        .limit(1)
    : [];
  const contentChange = classifyWorkbookContentChange(
    publishedRevision
      ? parseWorkbookContent(publishedRevision.contentJson)
      : null,
    content,
  );
  const [activeRelease] = project.nativeWorkbookId
    ? await db
        .select({
          themeVersionId: nativeWorkbookEditions.themeVersionId,
          editionLabel: nativeWorkbookEditions.editionLabel,
          workbookContentRevisionId:
            nativeWorkbookVersions.workbookContentRevisionId,
        })
        .from(nativeWorkbooks)
        .innerJoin(
          nativeWorkbookVersions,
          eq(nativeWorkbookVersions.id, nativeWorkbooks.activeVersionId),
        )
        .innerJoin(
          nativeWorkbookEditions,
          eq(nativeWorkbookEditions.id, nativeWorkbookVersions.editionId),
        )
        .where(eq(nativeWorkbooks.id, project.nativeWorkbookId))
        .limit(1)
    : [];
  const [curriculum] = project.curriculumId
    ? await db
        .select({ themeVersionId: workbookCurricula.defaultThemeVersionId })
        .from(workbookCurricula)
        .where(eq(workbookCurricula.id, project.curriculumId))
        .limit(1)
    : [];
  const themeVersionId =
    project.themeOverrideVersionId ?? curriculum?.themeVersionId;
  if (!themeVersionId)
    throw new Error("Choose a published theme before releasing this workbook.");
  const themeChanged = Boolean(
    activeRelease && activeRelease.themeVersionId !== themeVersionId,
  );
  const legacyActiveRelease = Boolean(
    activeRelease && !activeRelease.workbookContentRevisionId,
  );
  const mode = !project.nativeWorkbookId
    ? ("first_release" as const)
    : input.forceNewEdition ||
        themeChanged ||
        legacyActiveRelease ||
        contentChange.classification === "edition"
      ? ("edition" as const)
      : ("revision" as const);
  const [editionCount] = project.nativeWorkbookId
    ? await db
        .select({ count: sql<number>`count(*)::integer` })
        .from(nativeWorkbookEditions)
        .where(eq(nativeWorkbookEditions.workbookId, project.nativeWorkbookId))
    : [{ count: 0 }];
  const editionLabel =
    mode === "edition"
      ? ordinalEdition((editionCount?.count ?? 0) + 1)
      : mode === "revision"
        ? (activeRelease?.editionLabel ?? content.editionLabel)
        : content.editionLabel;

  return {
    project,
    revision,
    content,
    contentChange,
    themeVersionId,
    themeChanged,
    mode,
    editionLabel,
  };
}

export async function queueWorkbookStudioRelease(input: {
  userId: string;
  projectId: string;
  contentRevisionId?: string | null;
  catalog: CatalogInput;
  forceNewEdition?: boolean;
}) {
  await requireAdmin(input.userId);
  const projectId = uuidSchema.parse(input.projectId);
  const catalog = workbookStudioCatalogInputSchema.parse(input.catalog);
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
    throw new Error("Save workbook content before releasing it.");
  const plan = await resolveReleasePlan({
    projectId,
    contentRevisionId,
    forceNewEdition: input.forceNewEdition === true,
  });

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(workbookGenerationBatches)
      .values({
        kind: "single_workbook",
        status: "queued",
        curriculumId: project.curriculumId,
        targetThemeVersionId: plan.themeVersionId,
        totalJobs: 3,
        inputJson: { operation: "release", mode: plan.mode },
        requestedByUserId: input.userId,
      })
      .returning();
    const [run] = await tx
      .insert(workbookGenerationRuns)
      .values({
        batchId: batch.id,
        projectId,
        provider: "manual",
        model: "workbook-studio",
        status: "queued",
        currentStage: "validate",
        scopeJson: { releaseMode: plan.mode },
        requestedByUserId: input.userId,
      })
      .returning();
    const [renderRun] = await tx
      .insert(workbookRenderRuns)
      .values({
        projectId,
        contentRevisionId,
        themeVersionId: plan.themeVersionId,
        rendererVersion: "workbook-studio-v1",
        pagedJsVersion: "0.4.3",
        optionsJson: {
          editionLabelOverride: plan.editionLabel,
          copyrightYear: new Date().getUTCFullYear(),
        },
        createdByUserId: input.userId,
      })
      .returning();
    await tx.insert(workbookStudioJobs).values([
      {
        batchId: batch.id,
        runId: run.id,
        projectId,
        jobType: "validate",
        sequenceNumber: 10,
        payloadJson: { contentRevisionId },
      },
      {
        batchId: batch.id,
        runId: run.id,
        projectId,
        jobType: "render",
        sequenceNumber: 20,
        payloadJson: { renderRunId: renderRun.id },
      },
      {
        batchId: batch.id,
        runId: run.id,
        projectId,
        jobType: "release",
        sequenceNumber: 30,
        payloadJson: {
          renderRunId: renderRun.id,
          contentRevisionId,
          themeVersionId: plan.themeVersionId,
          releaseMode: plan.mode,
          editionLabel: plan.editionLabel,
          catalog,
        },
      },
    ]);
    return {
      batch,
      run,
      renderRun,
      plan: {
        mode: plan.mode,
        editionLabel: plan.editionLabel,
        themeChanged: plan.themeChanged,
        contentChange: plan.contentChange,
      },
    };
  });
}

export async function publishCompletedWorkbookStudioRender(input: {
  userId: string;
  projectId: string;
  renderRunId: string;
  releaseMode: "first_release" | "revision" | "edition";
  editionLabel: string;
  catalog: CatalogInput;
}) {
  await requireAdmin(input.userId);
  const [row] = await db
    .select({
      project: workbookProjects,
      render: workbookRenderRuns,
      revision: workbookContentRevisions,
    })
    .from(workbookProjects)
    .innerJoin(
      workbookRenderRuns,
      eq(workbookRenderRuns.projectId, workbookProjects.id),
    )
    .innerJoin(
      workbookContentRevisions,
      eq(workbookContentRevisions.id, workbookRenderRuns.contentRevisionId),
    )
    .where(
      and(
        eq(workbookProjects.id, uuidSchema.parse(input.projectId)),
        eq(workbookRenderRuns.id, uuidSchema.parse(input.renderRunId)),
      ),
    )
    .limit(1);
  if (!row || row.render.status !== "completed" || !row.render.pdfObjectPath) {
    throw new Error("The release PDF has not finished rendering.");
  }
  const catalog = workbookStudioCatalogInputSchema.parse(input.catalog);
  const artifact = {
    projectId: row.project.id,
    contentRevisionId: row.revision.id,
    renderRunId: row.render.id,
    themeVersionId: row.render.themeVersionId,
    autoPublish: true,
  };
  const pdf = await downloadPrivateFile(row.render.pdfObjectPath);
  const filename = `${row.project.slug}-${input.editionLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;

  if (input.releaseMode === "first_release") {
    const prepared = await prepareNativeWorkbookUpload({
      userId: input.userId,
      title: row.project.title,
      subject: row.project.subjectLabel,
      addSubjectToTaxonomy: true,
      curriculumAreaKey: catalog.curriculumAreaKey,
      gradeMin: row.project.gradeMin,
      gradeMax: row.project.gradeMax,
      languageCode: row.project.languageCode,
      descriptionMode: "custom",
      description: catalog.description,
      type: catalog.type,
      priceInCents: catalog.priceInCents,
      currencyCode: catalog.currencyCode,
      coverageTags: catalog.coverageTags,
      prerequisiteWorkbookId: catalog.prerequisiteWorkbookId,
      editionLabel: input.editionLabel,
      pdfFilename: filename,
      studioArtifact: artifact,
    });
    try {
      await uploadPrivateFile({
        objectPath: prepared.objectPath,
        contentType: "application/pdf",
        data: pdf,
      });
      await completeNativeWorkbookUpload({
        userId: input.userId,
        workbookId: prepared.workbookId,
        versionId: prepared.versionId,
      });
      await db
        .update(workbookProjects)
        .set({
          nativeWorkbookId: prepared.workbookId,
          status: "ready",
          updatedAt: new Date(),
        })
        .where(eq(workbookProjects.id, row.project.id));
      return {
        workbookId: prepared.workbookId,
        versionId: prepared.versionId,
        mode: input.releaseMode,
      };
    } catch (error) {
      await discardNativeWorkbookUpload({
        userId: input.userId,
        workbookId: prepared.workbookId,
        versionId: prepared.versionId,
      }).catch(() => undefined);
      throw error;
    }
  }

  if (!row.project.nativeWorkbookId)
    throw new Error("The released bookstore workbook link is missing.");
  if (input.releaseMode === "revision") {
    const prepared = await prepareNativeWorkbookReplacement({
      userId: input.userId,
      workbookId: row.project.nativeWorkbookId,
      pdfFilename: filename,
      studioArtifact: artifact,
    });
    try {
      await uploadPrivateFile({
        objectPath: prepared.objectPath,
        contentType: "application/pdf",
        data: pdf,
      });
      await completeNativeWorkbookReplacement({
        userId: input.userId,
        workbookId: prepared.workbookId,
        versionId: prepared.versionId,
      });
      return {
        workbookId: prepared.workbookId,
        versionId: prepared.versionId,
        mode: input.releaseMode,
      };
    } catch (error) {
      await discardNativeWorkbookReplacement({
        userId: input.userId,
        workbookId: prepared.workbookId,
        versionId: prepared.versionId,
      }).catch(() => undefined);
      throw error;
    }
  }

  const prepared = await prepareNativeWorkbookEdition({
    userId: input.userId,
    workbookId: row.project.nativeWorkbookId,
    editionLabel: input.editionLabel,
    changeNotes: "Workbook Studio content or theme update",
    pdfFilename: filename,
    studioArtifact: artifact,
  });
  try {
    await uploadPrivateFile({
      objectPath: prepared.objectPath,
      contentType: "application/pdf",
      data: pdf,
    });
    await completeNativeWorkbookEdition({
      userId: input.userId,
      workbookId: prepared.workbookId,
      versionId: prepared.versionId,
    });
    return {
      workbookId: prepared.workbookId,
      versionId: prepared.versionId,
      mode: input.releaseMode,
    };
  } catch (error) {
    await discardNativeWorkbookEdition({
      userId: input.userId,
      workbookId: prepared.workbookId,
      versionId: prepared.versionId,
    }).catch(() => undefined);
    throw error;
  }
}
