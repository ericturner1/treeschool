import { and, asc, eq, sql } from "drizzle-orm";
import {
  nativeWorkbookEditions,
  nativeWorkbooks,
  workbookContentRevisions,
  workbookCurricula,
  workbookCurriculumRevisions,
  workbookGenerationBatches,
  workbookGenerationPromptVersions,
  workbookGenerationPrompts,
  workbookGenerationRuns,
  workbookProjects,
  workbookRenderRuns,
  workbookStudioJobs,
  type WorkbookStudioJobType,
} from "ts-db";
import { z } from "zod";
import { db } from "../db";
import {
  generateWorkbookCatalogPlan,
  generateWorkbookContent,
  generateWorkbookCurriculumBrief,
  generateWorkbookOutline,
  workbookGenerationModel,
  type WorkbookOutline,
} from "./workbook-generation-provider";
import { executeWorkbookRenderRun } from "./workbook-renderer";
import {
  assembleWorkbookGenerationPrompt,
  listApplicableWorkbookRules,
  resolveEffectiveWorkbookThemeVersionId,
  saveWorkbookStudioRevision,
} from "./workbook-studio";
import {
  publishCompletedWorkbookStudioRender,
  workbookStudioCatalogInputSchema,
} from "./workbook-studio-release";
import { parseWorkbookContent } from "./workbook-studio-model";
import { validateWorkbookForScope } from "./workbook-studio-validation";

const MAX_ATTEMPTS = 3;

type WorkbookStudioJobRow = {
  id: string;
  batchId: string | null;
  runId: string | null;
  projectId: string | null;
  jobType: WorkbookStudioJobType;
  status: string;
  sequenceNumber: number;
  attemptCount: number;
  payloadJson: Record<string, unknown>;
};

async function claimNextWorkbookStudioJob(workerId: string) {
  const [job] = await db.execute<WorkbookStudioJobRow>(sql`
    with next_job as (
      select candidate.id
      from workbook_studio_jobs candidate
      where candidate.status in ('queued', 'retry_wait')
        and candidate.available_at <= now()
        and not exists (
          select 1
          from workbook_studio_jobs predecessor
          where candidate.run_id is not null
            and predecessor.run_id = candidate.run_id
            and predecessor.sequence_number < candidate.sequence_number
            and predecessor.status <> 'completed'
        )
      order by candidate.available_at asc, candidate.created_at asc
      limit 1
      for update skip locked
    )
    update workbook_studio_jobs job
    set status = 'running',
        claimed_at = now(),
        heartbeat_at = now(),
        worker_id = ${workerId},
        updated_at = now()
    from next_job
    where job.id = next_job.id
    returning
      job.id,
      job.batch_id as "batchId",
      job.run_id as "runId",
      job.project_id as "projectId",
      job.job_type as "jobType",
      job.status,
      job.sequence_number as "sequenceNumber",
      job.attempt_count as "attemptCount",
      job.payload_json as "payloadJson"
  `);
  return job ?? null;
}

async function generationContext(job: WorkbookStudioJobRow) {
  if (!job.runId || !job.projectId)
    throw new Error("The generation job is missing its run or project.");
  const [row] = await db
    .select({
      run: workbookGenerationRuns,
      project: workbookProjects,
      promptText: workbookGenerationPromptVersions.promptText,
      promptConfiguration: workbookGenerationPromptVersions.configurationJson,
      promptKind: workbookGenerationPrompts.kind,
    })
    .from(workbookGenerationRuns)
    .innerJoin(
      workbookProjects,
      eq(workbookProjects.id, workbookGenerationRuns.projectId),
    )
    .leftJoin(
      workbookGenerationPromptVersions,
      eq(
        workbookGenerationPromptVersions.id,
        workbookGenerationRuns.promptVersionId,
      ),
    )
    .leftJoin(
      workbookGenerationPrompts,
      eq(
        workbookGenerationPrompts.id,
        workbookGenerationPromptVersions.promptId,
      ),
    )
    .where(
      and(
        eq(workbookGenerationRuns.id, job.runId),
        eq(workbookProjects.id, job.projectId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Workbook generation context not found.");
  if (!row.promptText)
    throw new Error("The selected generation prompt version is unavailable.");
  const rules = await listApplicableWorkbookRules({
    subjectKey: row.project.subjectKey,
    gradeMin: row.project.gradeMin,
    gradeMax: row.project.gradeMax,
    languageCode: row.project.languageCode,
    stage: job.jobType,
  });
  const configuration = row.promptConfiguration as {
    subjectOverlayPromptVersionIds?: Record<string, string>;
    stagePromptVersionIds?: Record<string, string>;
  };
  const stagePromptVersionId =
    configuration.stagePromptVersionIds?.[job.jobType];
  const overlayVersionId =
    configuration.subjectOverlayPromptVersionIds?.[row.project.subjectKey];
  const [stagePromptRows, overlayRows] = await Promise.all([
    stagePromptVersionId
      ? db
          .select({ promptText: workbookGenerationPromptVersions.promptText })
          .from(workbookGenerationPromptVersions)
          .where(eq(workbookGenerationPromptVersions.id, stagePromptVersionId))
          .limit(1)
      : Promise.resolve([]),
    overlayVersionId
      ? db
          .select({ promptText: workbookGenerationPromptVersions.promptText })
          .from(workbookGenerationPromptVersions)
          .where(eq(workbookGenerationPromptVersions.id, overlayVersionId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const stagePrompt = stagePromptRows[0];
  const overlay = overlayRows[0];
  const workflowOverlay = stagePrompt?.promptText ? row.promptText : null;
  const combinedOverlay = [workflowOverlay, overlay?.promptText]
    .filter(Boolean)
    .join("\n\n");
  const assembledPrompt = assembleWorkbookGenerationPrompt({
    basePrompt: stagePrompt?.promptText ?? row.promptText,
    subjectOverlay: combinedOverlay,
    rules,
    scope: {
      ...row.run.scopeJson,
      stage: job.jobType,
      layoutProfile: row.project.layoutProfile,
      scriptProfile: row.project.scriptProfile,
    },
  });
  return { ...row, rules, assembledPrompt };
}

async function executeOutlineJob(job: WorkbookStudioJobRow) {
  const context = await generationContext(job);
  const [curriculumJob] = await db
    .select({ resultJson: workbookStudioJobs.resultJson })
    .from(workbookStudioJobs)
    .where(
      and(
        eq(workbookStudioJobs.runId, context.run.id),
        eq(workbookStudioJobs.jobType, "curriculum"),
      ),
    )
    .limit(1);
  const curriculum = z
    .object({ curriculum: z.unknown() })
    .safeParse(curriculumJob?.resultJson);
  const assembledPrompt = curriculum.success
    ? `${context.assembledPrompt}\n\nAPPROVED CURRICULUM BRIEF\n${JSON.stringify(curriculum.data.curriculum, null, 2)}`
    : context.assembledPrompt;
  const generated = await generateWorkbookOutline({ assembledPrompt });
  await db.transaction(async (tx) => {
    await tx
      .update(workbookStudioJobs)
      .set({
        resultJson: { outline: generated.outline, usage: generated.usage },
        heartbeatAt: new Date(),
      })
      .where(eq(workbookStudioJobs.id, job.id));
    await tx
      .update(workbookGenerationRuns)
      .set({
        status: "running",
        currentStage: "lesson_content",
        assembledPrompt: context.assembledPrompt,
        providerRequestId: generated.providerRequestId,
        inputTokens: sql`${workbookGenerationRuns.inputTokens} + ${generated.usage.inputTokens}`,
        outputTokens: sql`${workbookGenerationRuns.outputTokens} + ${generated.usage.outputTokens}`,
        appliedRuleVersionIds: context.rules.map((rule) => rule.id),
        startedAt: sql`coalesce(${workbookGenerationRuns.startedAt}, now())`,
      })
      .where(eq(workbookGenerationRuns.id, context.run.id));
  });
  return { outline: generated.outline };
}

async function executeCurriculumJob(job: WorkbookStudioJobRow) {
  const context = await generationContext(job);
  const generated = await generateWorkbookCurriculumBrief({
    assembledPrompt: context.assembledPrompt,
  });
  await db
    .update(workbookGenerationRuns)
    .set({
      status: "running",
      currentStage: "outline",
      assembledPrompt: context.assembledPrompt,
      providerRequestId: generated.providerRequestId,
      inputTokens: sql`${workbookGenerationRuns.inputTokens} + ${generated.usage.inputTokens}`,
      outputTokens: sql`${workbookGenerationRuns.outputTokens} + ${generated.usage.outputTokens}`,
      appliedRuleVersionIds: context.rules.map((rule) => rule.id),
      startedAt: sql`coalesce(${workbookGenerationRuns.startedAt}, now())`,
    })
    .where(eq(workbookGenerationRuns.id, context.run.id));
  return { curriculum: generated.curriculum, usage: generated.usage };
}

async function executeCatalogPlanJob(job: WorkbookStudioJobRow) {
  if (!job.runId || !job.batchId)
    throw new Error("The catalog planning job is missing its run or batch.");
  const payload = z
    .object({
      curriculumId: z.string().uuid(),
      workbookPromptVersionId: z.string().uuid(),
    })
    .parse(job.payloadJson);
  const [row] = await db
    .select({
      run: workbookGenerationRuns,
      batch: workbookGenerationBatches,
      curriculum: workbookCurricula,
      promptText: workbookGenerationPromptVersions.promptText,
    })
    .from(workbookGenerationRuns)
    .innerJoin(
      workbookGenerationBatches,
      eq(workbookGenerationBatches.id, workbookGenerationRuns.batchId),
    )
    .innerJoin(
      workbookCurricula,
      eq(workbookCurricula.id, workbookGenerationBatches.curriculumId),
    )
    .innerJoin(
      workbookGenerationPromptVersions,
      eq(
        workbookGenerationPromptVersions.id,
        workbookGenerationRuns.promptVersionId,
      ),
    )
    .where(
      and(
        eq(workbookGenerationRuns.id, job.runId),
        eq(workbookGenerationBatches.id, job.batchId),
        eq(workbookCurricula.id, payload.curriculumId),
      ),
    )
    .limit(1);
  if (!row?.run.requestedByUserId)
    throw new Error("The catalog planning requester is unavailable.");
  const rules = await listApplicableWorkbookRules({
    subjectKey: "catalog",
    gradeMin: row.curriculum.gradeLevel,
    gradeMax: row.curriculum.gradeLevel,
    languageCode: row.curriculum.languageCode,
    stage: "catalog_plan",
  });
  const assembledPrompt = assembleWorkbookGenerationPrompt({
    basePrompt: row.promptText,
    rules,
    scope: row.run.scopeJson,
  });
  const generated = await generateWorkbookCatalogPlan({ assembledPrompt });

  const [currentRevision] = row.curriculum.currentRevisionId
    ? await db
        .select({ planJson: workbookCurriculumRevisions.planJson })
        .from(workbookCurriculumRevisions)
        .where(
          eq(workbookCurriculumRevisions.id, row.curriculum.currentRevisionId),
        )
        .limit(1)
    : [];
  if (currentRevision?.planJson.generationBatchId !== row.batch.id) {
    const [numberRow] = await db
      .select({
        next: sql<number>`coalesce(max(${workbookCurriculumRevisions.revisionNumber}), 0) + 1`,
      })
      .from(workbookCurriculumRevisions)
      .where(eq(workbookCurriculumRevisions.curriculumId, row.curriculum.id));
    const [revision] = await db
      .insert(workbookCurriculumRevisions)
      .values({
        curriculumId: row.curriculum.id,
        revisionNumber: numberRow?.next ?? 1,
        source: "ai",
        planJson: {
          schemaVersion: 1,
          generationBatchId: row.batch.id,
          catalogPromptVersionId: row.run.promptVersionId,
          workbookPromptVersionId: payload.workbookPromptVersionId,
          ...generated.plan,
        },
        validationJson: { issues: [] },
        createdByUserId: row.run.requestedByUserId,
      })
      .returning({ id: workbookCurriculumRevisions.id });
    await db
      .update(workbookCurricula)
      .set({
        currentRevisionId: revision.id,
        status: "review",
        updatedByUserId: row.run.requestedByUserId,
        updatedAt: new Date(),
      })
      .where(eq(workbookCurricula.id, row.curriculum.id));
  }

  await db
    .update(workbookGenerationRuns)
    .set({
      status: "running",
      currentStage: "review",
      assembledPrompt,
      providerRequestId: generated.providerRequestId,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      appliedRuleVersionIds: rules.map((rule) => rule.id),
      startedAt: sql`coalesce(${workbookGenerationRuns.startedAt}, now())`,
    })
    .where(eq(workbookGenerationRuns.id, row.run.id));
  return {
    plan: generated.plan,
    curriculumId: row.curriculum.id,
    usage: generated.usage,
  };
}

async function executeLessonContentJob(job: WorkbookStudioJobRow) {
  const context = await generationContext(job);
  const [outlineJob] = await db
    .select({ resultJson: workbookStudioJobs.resultJson })
    .from(workbookStudioJobs)
    .where(
      and(
        eq(workbookStudioJobs.runId, context.run.id),
        eq(workbookStudioJobs.jobType, "outline"),
      ),
    )
    .limit(1);
  const outline = z
    .object({ outline: z.unknown() })
    .parse(outlineJob?.resultJson).outline as WorkbookOutline;
  const generated = await generateWorkbookContent({
    assembledPrompt: context.assembledPrompt,
    outline,
  });
  const saved = await saveWorkbookStudioRevision({
    userId:
      context.run.requestedByUserId ?? context.project.createdByUserId ?? "",
    projectId: context.project.id,
    content: generated.content,
    source: "ai",
    changeNotes: "Generated in Workbook Studio",
  });
  await db.transaction(async (tx) => {
    await tx
      .update(workbookStudioJobs)
      .set({
        resultJson: { revisionId: saved.revision.id, usage: generated.usage },
        heartbeatAt: new Date(),
      })
      .where(eq(workbookStudioJobs.id, job.id));
    await tx
      .update(workbookGenerationRuns)
      .set({
        currentStage: "validate",
        assembledPrompt: context.assembledPrompt,
        providerRequestId: generated.providerRequestId,
        inputTokens: sql`${workbookGenerationRuns.inputTokens} + ${generated.usage.inputTokens}`,
        outputTokens: sql`${workbookGenerationRuns.outputTokens} + ${generated.usage.outputTokens}`,
        outputRevisionId: saved.revision.id,
        appliedRuleVersionIds: context.rules.map((rule) => rule.id),
      })
      .where(eq(workbookGenerationRuns.id, context.run.id));
  });
  return { revisionId: saved.revision.id };
}

async function executeValidationJob(job: WorkbookStudioJobRow) {
  if (!job.projectId)
    throw new Error("The validation job is missing its workbook project.");
  const contentRevisionId =
    typeof job.payloadJson.contentRevisionId === "string"
      ? job.payloadJson.contentRevisionId
      : null;
  const [row] = await db
    .select({
      project: workbookProjects,
      revision: workbookContentRevisions,
    })
    .from(workbookProjects)
    .innerJoin(
      workbookContentRevisions,
      eq(
        workbookContentRevisions.id,
        contentRevisionId
          ? sql`${contentRevisionId}::uuid`
          : workbookProjects.currentRevisionId,
      ),
    )
    .where(eq(workbookProjects.id, job.projectId))
    .limit(1);
  if (!row) throw new Error("The workbook revision to validate was not found.");
  const content = parseWorkbookContent(row.revision.contentJson);
  const issues = await validateWorkbookForScope(content, row.project);
  const blocking = issues.filter((issue) => issue.severity === "error");
  await db
    .update(workbookContentRevisions)
    .set({ validationJson: { issues } })
    .where(eq(workbookContentRevisions.id, row.revision.id));
  if (blocking.length)
    throw new Error(blocking.map((issue) => issue.message).join(" "));
  await db
    .update(workbookProjects)
    .set({ status: "ready", updatedAt: new Date() })
    .where(eq(workbookProjects.id, row.project.id));
  return { revisionId: row.revision.id, issues };
}

async function executeRenderJob(job: WorkbookStudioJobRow) {
  if (!job.projectId)
    throw new Error("The render job is missing its workbook project.");
  let renderRunId = z
    .string()
    .uuid()
    .safeParse(job.payloadJson.renderRunId).data;
  if (!renderRunId) {
    const [project] = await db
      .select()
      .from(workbookProjects)
      .where(eq(workbookProjects.id, job.projectId))
      .limit(1);
    if (!project?.currentRevisionId)
      throw new Error("The render job has no saved workbook revision.");
    const [run] = job.runId
      ? await db
          .select({
            requestedByUserId: workbookGenerationRuns.requestedByUserId,
          })
          .from(workbookGenerationRuns)
          .where(eq(workbookGenerationRuns.id, job.runId))
          .limit(1)
      : [];
    const themeVersionId =
      await resolveEffectiveWorkbookThemeVersionId(project);
    const [renderRun] = await db
      .insert(workbookRenderRuns)
      .values({
        projectId: project.id,
        contentRevisionId: project.currentRevisionId,
        themeVersionId,
        rendererVersion: "workbook-studio-v1",
        pagedJsVersion: "0.4.3",
        optionsJson: { copyrightYear: new Date().getUTCFullYear() },
        createdByUserId:
          run?.requestedByUserId ??
          project.updatedByUserId ??
          project.createdByUserId,
      })
      .returning({ id: workbookRenderRuns.id });
    renderRunId = renderRun.id;
    await db
      .update(workbookStudioJobs)
      .set({
        payloadJson: { ...job.payloadJson, renderRunId },
      })
      .where(eq(workbookStudioJobs.id, job.id));
  }
  const result = await executeWorkbookRenderRun(renderRunId);
  if (job.runId) {
    await db
      .update(workbookGenerationRuns)
      .set({ currentStage: "release" })
      .where(eq(workbookGenerationRuns.id, job.runId));
  }
  return {
    renderRunId,
    pageCount: result.pageCount,
    chromiumVersion: result.chromiumVersion,
    pdfObjectPath: result.pdfObjectPath,
  };
}

async function executeReleaseJob(job: WorkbookStudioJobRow) {
  if (!job.projectId || !job.runId)
    throw new Error("The release job is missing its run or project.");
  const payload = z
    .object({
      renderRunId: z.string().uuid(),
      releaseMode: z.enum(["first_release", "revision", "edition"]),
      editionLabel: z.string().min(1),
      catalog: workbookStudioCatalogInputSchema,
    })
    .parse(job.payloadJson);
  const [run] = await db
    .select({ requestedByUserId: workbookGenerationRuns.requestedByUserId })
    .from(workbookGenerationRuns)
    .where(eq(workbookGenerationRuns.id, job.runId))
    .limit(1);
  if (!run?.requestedByUserId)
    throw new Error("The release requester is unavailable.");
  return publishCompletedWorkbookStudioRender({
    userId: run.requestedByUserId,
    projectId: job.projectId,
    renderRunId: payload.renderRunId,
    releaseMode: payload.releaseMode,
    editionLabel: payload.editionLabel,
    catalog: payload.catalog,
  });
}

async function executeThemeCascadeJob(job: WorkbookStudioJobRow) {
  if (!job.projectId)
    throw new Error("The theme cascade job is missing its workbook project.");
  const themeVersionId = z
    .string()
    .uuid()
    .parse(job.payloadJson.themeVersionId);
  const [project] = await db
    .select()
    .from(workbookProjects)
    .where(eq(workbookProjects.id, job.projectId))
    .limit(1);
  if (!project?.currentRevisionId || !project.nativeWorkbookId) {
    throw new Error(
      "The theme cascade requires a released Workbook Studio project.",
    );
  }
  const [[editionCount], [catalog]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::integer` })
      .from(nativeWorkbookEditions)
      .where(eq(nativeWorkbookEditions.workbookId, project.nativeWorkbookId)),
    db
      .select()
      .from(nativeWorkbooks)
      .where(eq(nativeWorkbooks.id, project.nativeWorkbookId))
      .limit(1),
  ]);
  if (!catalog) throw new Error("The linked bookstore workbook was not found.");
  const editionLabel = (() => {
    const value = (editionCount?.count ?? 0) + 1;
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
  })();
  const [renderRun] = await db
    .insert(workbookRenderRuns)
    .values({
      projectId: project.id,
      contentRevisionId: project.currentRevisionId,
      themeVersionId,
      rendererVersion: "workbook-studio-v1",
      pagedJsVersion: "0.4.3",
      optionsJson: {
        editionLabelOverride: editionLabel,
        copyrightYear: new Date().getUTCFullYear(),
      },
      createdByUserId: project.updatedByUserId ?? project.createdByUserId,
    })
    .returning();
  await executeWorkbookRenderRun(renderRun.id);
  const requestedByUserId = project.updatedByUserId ?? project.createdByUserId;
  if (!requestedByUserId)
    throw new Error("The theme change requester is unavailable.");
  return publishCompletedWorkbookStudioRender({
    userId: requestedByUserId,
    projectId: project.id,
    renderRunId: renderRun.id,
    releaseMode: "edition",
    editionLabel,
    catalog: {
      description: catalog.description,
      curriculumAreaKey: catalog.curriculumAreaKey,
      type: catalog.type,
      priceInCents: catalog.priceInCents,
      currencyCode: catalog.currencyCode,
      coverageTags: catalog.coverageTags,
      prerequisiteWorkbookId: catalog.prerequisiteWorkbookId,
    },
  });
}

async function executeJob(job: WorkbookStudioJobRow) {
  switch (job.jobType) {
    case "catalog_plan":
      return executeCatalogPlanJob(job);
    case "curriculum":
      return executeCurriculumJob(job);
    case "outline":
      return executeOutlineJob(job);
    case "lesson_content":
      return executeLessonContentJob(job);
    case "validate":
      return executeValidationJob(job);
    case "render":
      return executeRenderJob(job);
    case "release":
      return executeReleaseJob(job);
    case "theme_cascade":
      return executeThemeCascadeJob(job);
  }
}

async function refreshBatch(batchId: string | null) {
  if (!batchId) return;
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::integer`,
      completed: sql<number>`count(*) filter (where ${workbookStudioJobs.status} = 'completed')::integer`,
      failed: sql<number>`count(*) filter (where ${workbookStudioJobs.status} = 'failed')::integer`,
      active: sql<number>`count(*) filter (where ${workbookStudioJobs.status} in ('queued', 'running', 'retry_wait'))::integer`,
    })
    .from(workbookStudioJobs)
    .where(eq(workbookStudioJobs.batchId, batchId));
  await db
    .update(workbookGenerationBatches)
    .set({
      totalJobs: counts?.total ?? 0,
      completedJobs: counts?.completed ?? 0,
      failedJobs: counts?.failed ?? 0,
      status:
        (counts?.active ?? 0) > 0
          ? "running"
          : (counts?.failed ?? 0) > 0
            ? "failed"
            : "completed",
      startedAt: sql`coalesce(${workbookGenerationBatches.startedAt}, now())`,
      ...((counts?.active ?? 0) === 0 ? { completedAt: new Date() } : {}),
    })
    .where(eq(workbookGenerationBatches.id, batchId));
}

async function completeJob(job: WorkbookStudioJobRow, result: unknown) {
  await db
    .update(workbookStudioJobs)
    .set({
      status: "completed",
      resultJson:
        result && typeof result === "object"
          ? (result as Record<string, unknown>)
          : {},
      heartbeatAt: new Date(),
      completedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(workbookStudioJobs.id, job.id));
  if (job.runId) {
    const [remaining] = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(workbookStudioJobs)
      .where(
        and(
          eq(workbookStudioJobs.runId, job.runId),
          sql`${workbookStudioJobs.status} <> 'completed'`,
        ),
      );
    if ((remaining?.count ?? 0) === 0) {
      await db
        .update(workbookGenerationRuns)
        .set({
          status: "completed",
          currentStage: null,
          completedAt: new Date(),
        })
        .where(eq(workbookGenerationRuns.id, job.runId));
    }
  }
  await refreshBatch(job.batchId);
}

async function failJob(job: WorkbookStudioJobRow, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown Workbook Studio job error.";
  const attemptCount = job.attemptCount + 1;
  const retry = attemptCount < MAX_ATTEMPTS;
  await db.transaction(async (tx) => {
    await tx
      .update(workbookStudioJobs)
      .set({
        status: retry ? "retry_wait" : "failed",
        attemptCount,
        availableAt: retry
          ? new Date(Date.now() + 2 ** attemptCount * 30_000)
          : new Date(),
        workerId: null,
        lastError: message,
        updatedAt: new Date(),
        ...(!retry ? { completedAt: new Date() } : {}),
      })
      .where(eq(workbookStudioJobs.id, job.id));
    if (!retry && job.runId) {
      await tx
        .update(workbookStudioJobs)
        .set({
          status: "cancelled",
          lastError: "Cancelled because an earlier workflow stage failed.",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workbookStudioJobs.runId, job.runId),
            sql`${workbookStudioJobs.sequenceNumber} > ${job.sequenceNumber}`,
            eq(workbookStudioJobs.status, "queued"),
          ),
        );
      await tx
        .update(workbookGenerationRuns)
        .set({
          status: "failed",
          errorMessage: message,
          completedAt: new Date(),
        })
        .where(eq(workbookGenerationRuns.id, job.runId));
    }
  });
  await refreshBatch(job.batchId);
  return { retry, error: message };
}

export async function runNextWorkbookStudioJob(workerId: string) {
  const job = await claimNextWorkbookStudioJob(workerId);
  if (!job) return null;
  try {
    const result = await executeJob(job);
    await completeJob(job, result);
    return {
      jobId: job.id,
      jobType: job.jobType,
      outcome: "completed" as const,
    };
  } catch (error) {
    const failure = await failJob(job, error);
    console.error(`[Workbook Studio ${job.id}] ${failure.error}`);
    return {
      jobId: job.id,
      jobType: job.jobType,
      outcome: failure.retry ? ("retry_wait" as const) : ("failed" as const),
      error: failure.error,
    };
  }
}

export const workbookStudioWorkerModel = workbookGenerationModel();
