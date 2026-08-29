import { eq } from "drizzle-orm";
import { profiles } from "ts-db";
import { db, env } from "../db";

export const ADMIN_BACKUP_CONFIRMATION = "RUN BACKUP";

type MetadataToken = {
  access_token?: string;
};

type CloudRunCondition = {
  type?: string;
  state?: string;
};

export type CloudRunExecution = {
  name?: string;
  createTime?: string;
  startTime?: string;
  completionTime?: string;
  succeededCount?: number;
  failedCount?: number;
  retriedCount?: number;
  conditions?: CloudRunCondition[];
};

export type AdminBackupExecution = {
  id: string;
  status: "succeeded" | "failed" | "running" | "unknown";
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  retryCount: number;
};

async function requireAdmin(userId: string) {
  const [admin] = await db
    .select({ isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!admin?.isAdmin) throw new Error("Administrator access is required.");
}

function backupJobConfig() {
  if (!env.GCP_PROJECT_ID || !env.GCP_REGION || !env.GCP_BACKUP_JOB_NAME) return null;
  return {
    projectId: env.GCP_PROJECT_ID,
    region: env.GCP_REGION,
    jobName: env.GCP_BACKUP_JOB_NAME,
  };
}

async function getCloudAccessToken() {
  const tokenResponse = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
  );
  if (!tokenResponse.ok) {
    throw new Error(`Could not obtain Cloud Run service token (${tokenResponse.status}).`);
  }
  const token = (await tokenResponse.json()) as MetadataToken;
  if (!token.access_token) throw new Error("Cloud Run service token was empty.");
  return token.access_token;
}

function executionStatus(execution: CloudRunExecution): AdminBackupExecution["status"] {
  if (Number(execution.succeededCount) > 0) return "succeeded";
  if (Number(execution.failedCount) > 0) return "failed";
  const completed = execution.conditions?.find((condition) => condition.type === "Completed");
  if (completed?.state === "CONDITION_SUCCEEDED") return "succeeded";
  if (completed?.state === "CONDITION_FAILED") return "failed";
  if (!execution.completionTime) return "running";
  return "unknown";
}

export function toAdminBackupExecution(execution: CloudRunExecution): AdminBackupExecution {
  const startedAt = execution.startTime ?? null;
  const completedAt = execution.completionTime ?? null;
  const startTime = startedAt ? Date.parse(startedAt) : Number.NaN;
  const completionTime = completedAt ? Date.parse(completedAt) : Number.NaN;
  const durationSeconds = Number.isFinite(startTime) && Number.isFinite(completionTime)
    ? Math.max(0, Math.round((completionTime - startTime) / 1_000))
    : null;
  return {
    id: execution.name?.split("/").at(-1) ?? "unknown",
    status: executionStatus(execution),
    createdAt: execution.createTime ?? null,
    startedAt,
    completedAt,
    durationSeconds,
    retryCount: Math.max(0, Number(execution.retriedCount) || 0),
  };
}

async function listBackupExecutions(accessToken: string) {
  const config = backupJobConfig();
  if (!config) return [];
  const url = new URL(
    `https://run.googleapis.com/v2/projects/${config.projectId}/locations/${config.region}/jobs/${encodeURIComponent(config.jobName)}/executions`,
  );
  url.searchParams.set("pageSize", "12");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    console.error(JSON.stringify({
      event: "admin_backup_executions_unavailable",
      status: response.status,
    }));
    throw new Error("Backup history is temporarily unavailable.");
  }
  const payload = (await response.json()) as { executions?: CloudRunExecution[] };
  return (payload.executions ?? [])
    .map(toAdminBackupExecution)
    .sort((left, right) => {
      const rightTime = Date.parse(right.createdAt ?? "");
      const leftTime = Date.parse(left.createdAt ?? "");
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });
}

export async function getAdminBackupStatus(userId: string) {
  await requireAdmin(userId);
  const configured = Boolean(backupJobConfig());
  const executions = configured
    ? await listBackupExecutions(await getCloudAccessToken())
    : [];
  const latestSuccessfulAt = executions.find((execution) => execution.status === "succeeded")?.completedAt ?? null;
  return {
    configured,
    generatedAt: new Date().toISOString(),
    schedule: {
      description: "Every day at 2:30 AM",
      timeZone: "Asia/Tokyo",
    },
    retention: {
      nightlyDays: 100,
      monthlyDays: 370,
    },
    recoveryMode: "manual" as const,
    latestSuccessfulAt,
    executions,
  };
}

export async function runAdminBackupNow(input: { userId: string; confirmation: unknown }) {
  await requireAdmin(input.userId);
  if (input.confirmation !== ADMIN_BACKUP_CONFIRMATION) {
    throw new Error(`Type ${ADMIN_BACKUP_CONFIRMATION} to confirm.`);
  }
  const config = backupJobConfig();
  if (!config) throw new Error("The production backup job is not configured.");
  const accessToken = await getCloudAccessToken();
  const executions = await listBackupExecutions(accessToken);
  if (executions.some((execution) => execution.status === "running")) {
    return { started: false, reason: "already_running" as const };
  }

  const response = await fetch(
    `https://run.googleapis.com/v2/projects/${config.projectId}/locations/${config.region}/jobs/${encodeURIComponent(config.jobName)}:run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  if (!response.ok) {
    console.error(JSON.stringify({
      event: "admin_backup_start_failed",
      adminUserId: input.userId,
      status: response.status,
    }));
    throw new Error("The backup job could not be started. Please try again.");
  }
  const operation = (await response.json()) as { name?: string };
  console.info(JSON.stringify({
    event: "admin_backup_started",
    adminUserId: input.userId,
    operationName: operation.name ?? null,
  }));
  return { started: true, operationName: operation.name ?? null } as const;
}
