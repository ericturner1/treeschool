import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

async function requireOk(response: Response, fallback: string) {
  if (response.ok) return response;
  const payload = await response.json().catch(() => ({})) as { error?: string };
  throw new Error(payload.error || fallback);
}

async function postJson<T>(path: string, body: unknown, fallback: string) {
  const response = await requireOk(await backendFetch(`${getBackendUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  }), fallback);
  return response.json() as Promise<T>;
}

export const FAQ_CATEGORY_LABELS: Record<string, string> = {
  printing: "Printing & cost",
  learning: "Learning approach",
  planning: "Planning & flexibility",
  curriculum: "Curriculum",
  account: "Accounts & teachers",
  policy: "Parent responsibility",
  general: "General"
};

export type SalesFaq = {
  id: string;
  slug: string;
  question: string;
  answer: string;
  shortAnswer: string | null;
  category: string;
  sourceLinks: string[];
  displayOrder: number;
  isPublished: boolean;
  bandEligible: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function listPublishedSalesFaqs() {
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/faqs`,
    { next: { revalidate: 300, tags: ["faqs:published"] } }
  ), "Could not load frequently asked questions.");
  return response.json() as Promise<{ faqs: SalesFaq[] }>;
}

export async function listAdminSalesFaqs(userId: string) {
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/faqs/admin?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  ), "Could not load FAQ administration.");
  return response.json() as Promise<{ faqs: SalesFaq[]; categories: string[] }>;
}

export function saveSalesFaq(input: Record<string, unknown>) {
  return postJson<{ faq: SalesFaq }>(
    "/internal/faqs/admin/save",
    input,
    "Could not save the FAQ."
  );
}

export function reorderSalesFaqs(input: { userId: string; orderedIds: string[] }) {
  return postJson<{ reordered: boolean }>(
    "/internal/faqs/admin/reorder",
    input,
    "Could not reorder the FAQs."
  );
}

export function deleteSalesFaq(input: { userId: string; id: string }) {
  return postJson<{ deleted: boolean }>(
    "/internal/faqs/admin/delete",
    input,
    "Could not delete the FAQ."
  );
}
