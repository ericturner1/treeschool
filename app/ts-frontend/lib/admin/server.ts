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
