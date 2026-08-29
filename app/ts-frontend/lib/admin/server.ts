import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

export type AdminDashboardMetrics = {
  generatedAt: string;
  windowDays: number;
  mrr: { amountCents: number; currency: string };
  subscriptions: { active: number; trialing: number; canceling: number };
  churn: { canceled: number; rate: number | null };
  users: { total: number; newInWindow: number; accounts: number };
  leads: { newInWindow: number };
  sales: {
    count: number;
    revenueCents: number;
    currency: string;
    averageOrderValueCents: number;
    otherCurrencies: Array<{ currency: string; amountCents: number }>;
    recent: Array<{
      id: string;
      email: string | null;
      orderKind: string;
      amountTotalCents: number;
      currency: string;
      purchasedAt: string;
    }>;
  };
  funnelConversion: { visitors: number; customers: number; rate: number | null };
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

export type AdminBackupStatus = {
  configured: boolean;
  generatedAt: string;
  schedule: {
    description: string;
    timeZone: string;
  };
  retention: {
    nightlyDays: number;
    monthlyDays: number;
  };
  recoveryMode: "manual";
  latestSuccessfulAt: string | null;
  executions: AdminBackupExecution[];
};

export async function getAdminDashboardMetrics(userId: string) {
  const query = new URLSearchParams({ userId });
  const response = await backendFetch(
    `${getBackendUrl()}/internal/admin/dashboard?${query}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not load admin metrics.");
  }
  return response.json() as Promise<AdminDashboardMetrics>;
}

export async function getAdminBackupStatus(userId: string) {
  const query = new URLSearchParams({ userId });
  const response = await backendFetch(
    `${getBackendUrl()}/internal/admin/backups?${query}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "Could not load backup status.");
  }
  return response.json() as Promise<AdminBackupStatus>;
}

export async function runAdminBackupNow(input: { userId: string; confirmation: string }) {
  const response = await backendFetch(
    `${getBackendUrl()}/internal/admin/backups/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({})) as {
    started?: boolean;
    reason?: "already_running";
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Could not start the backup.");
  return payload;
}
