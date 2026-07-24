import { eq } from "drizzle-orm";
import {
  learningYears,
  modelUsageEvents,
  planVersions,
  profiles
} from "ts-db";
import { db } from "../db";

export type ModelUsageContext = {
  accountId?: string | null;
  learningYearId?: string | null;
  planGenerationEventId?: string | null;
  planVersionId?: string | null;
  contentDocumentId?: string | null;
  paperDocumentJobId?: string | null;
  nativeWorkbookVersionId?: string | null;
  nativeWorkbookJobId?: string | null;
  weeklyPlanJobId?: string | null;
};

export type NormalizedModelUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  toolTokens: number;
  totalTokens: number;
  providerUsageJson: Record<string, unknown>;
};

export type ModelUsageStatus = "succeeded" | "failed" | "invalid_response";

type ModelUsageSummaryRow = {
  provider: string;
  model: string;
  operation: string;
  status: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  toolTokens: number;
  totalTokens: number;
  durationMs: number | null;
};

const emptyUsage: NormalizedModelUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  toolTokens: 0,
  totalTokens: 0,
  providerUsageJson: {}
};

const accountIdByLearningYear = new Map<string, string | null>();
const generationEventIdByPlanVersion = new Map<string, string | null>();

async function resolveAccountId(context: ModelUsageContext) {
  if (context.accountId) return context.accountId;
  if (!context.learningYearId) return null;
  if (accountIdByLearningYear.has(context.learningYearId)) {
    return accountIdByLearningYear.get(context.learningYearId) ?? null;
  }

  const [owner] = await db
    .select({ accountId: profiles.accountId })
    .from(learningYears)
    .innerJoin(profiles, eq(profiles.id, learningYears.profileId))
    .where(eq(learningYears.id, context.learningYearId))
    .limit(1);
  const accountId = owner?.accountId ?? null;
  accountIdByLearningYear.set(context.learningYearId, accountId);
  return accountId;
}

async function resolveGenerationEventId(context: ModelUsageContext) {
  if (context.planGenerationEventId) return context.planGenerationEventId;
  if (!context.planVersionId) return null;
  if (generationEventIdByPlanVersion.has(context.planVersionId)) {
    return generationEventIdByPlanVersion.get(context.planVersionId) ?? null;
  }

  const [version] = await db
    .select({ generationEventId: planVersions.generationEventId })
    .from(planVersions)
    .where(eq(planVersions.id, context.planVersionId))
    .limit(1);
  const generationEventId = version?.generationEventId ?? null;
  generationEventIdByPlanVersion.set(context.planVersionId, generationEventId);
  return generationEventId;
}

export async function recordModelUsage(input: {
  context?: ModelUsageContext;
  feature?: string;
  operation: string;
  provider: string;
  model: string;
  status: ModelUsageStatus;
  providerRequestId?: string | null;
  durationMs?: number | null;
  errorCode?: string | null;
  usage?: NormalizedModelUsage | null;
}) {
  const context = input.context ?? {};
  const usage = input.usage ?? emptyUsage;

  try {
    const [accountId, planGenerationEventId] = await Promise.all([
      resolveAccountId(context),
      resolveGenerationEventId(context)
    ]);
    await db.insert(modelUsageEvents).values({
      accountId,
      learningYearId: context.learningYearId ?? null,
      planGenerationEventId,
      planVersionId: context.planVersionId ?? null,
      contentDocumentId: context.contentDocumentId ?? null,
      paperDocumentJobId: context.paperDocumentJobId ?? null,
      nativeWorkbookVersionId: context.nativeWorkbookVersionId ?? null,
      nativeWorkbookJobId: context.nativeWorkbookJobId ?? null,
      weeklyPlanJobId: context.weeklyPlanJobId ?? null,
      feature: input.feature ?? "lesson_plan",
      operation: input.operation,
      provider: input.provider,
      model: input.model,
      status: input.status,
      providerRequestId: input.providerRequestId ?? null,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      toolTokens: usage.toolTokens,
      totalTokens: usage.totalTokens,
      durationMs: input.durationMs == null ? null : Math.max(0, Math.round(input.durationMs)),
      errorCode: input.errorCode ?? null,
      providerUsageJson: usage.providerUsageJson
    });
  } catch (error) {
    // Usage telemetry must never make an otherwise valid plan fail. Emit a
    // structured error so operations can detect and repair a telemetry gap.
    console.error("Could not persist model usage metadata:", {
      operation: input.operation,
      provider: input.provider,
      model: input.model,
      learningYearId: context.learningYearId ?? null,
      error
    });
  }
}

export function summarizeModelUsage(rows: ModelUsageSummaryRow[]) {
  const totals = {
    requestCount: rows.length,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    toolTokens: 0,
    totalTokens: 0,
    durationMs: 0
  };
  const breakdown = new Map<string, typeof totals & {
    provider: string;
    model: string;
    operation: string;
    status: string;
  }>();

  for (const row of rows) {
    totals.inputTokens += row.inputTokens;
    totals.cachedInputTokens += row.cachedInputTokens;
    totals.outputTokens += row.outputTokens;
    totals.reasoningTokens += row.reasoningTokens;
    totals.toolTokens += row.toolTokens;
    totals.totalTokens += row.totalTokens;
    totals.durationMs += row.durationMs ?? 0;

    const key = [row.provider, row.model, row.operation, row.status].join("\u0000");
    const group = breakdown.get(key) ?? {
      provider: row.provider,
      model: row.model,
      operation: row.operation,
      status: row.status,
      requestCount: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      toolTokens: 0,
      totalTokens: 0,
      durationMs: 0
    };
    group.requestCount += 1;
    group.inputTokens += row.inputTokens;
    group.cachedInputTokens += row.cachedInputTokens;
    group.outputTokens += row.outputTokens;
    group.reasoningTokens += row.reasoningTokens;
    group.toolTokens += row.toolTokens;
    group.totalTokens += row.totalTokens;
    group.durationMs += row.durationMs ?? 0;
    breakdown.set(key, group);
  }

  return {
    totals,
    breakdown: Array.from(breakdown.values()).sort((left, right) =>
      left.provider.localeCompare(right.provider)
      || left.model.localeCompare(right.model)
      || left.operation.localeCompare(right.operation)
      || left.status.localeCompare(right.status)
    )
  };
}
