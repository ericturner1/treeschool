import { backendFetch } from "../backend/server";
import type { FunnelPageDocument, FunnelPageTheme } from "./page-document";

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

export type AdminFunnelStatus = "draft" | "live" | "paused" | "archived";
export type AdminFunnelStepStatus = "draft" | "active" | "inactive";
export type AdminFunnelStepType =
  | "landing"
  | "sales"
  | "order_form"
  | "upsell"
  | "downsell"
  | "thank_you"
  | "redirect"
  | "fulfillment";
export type AdminFunnelStepSourceType = "code" | "generated" | "external" | "runtime";

export type AdminFunnelStep = {
  id: string;
  funnelId: string;
  slug: string;
  name: string;
  description: string;
  stepType: AdminFunnelStepType;
  status: AdminFunnelStepStatus;
  sourceType: AdminFunnelStepSourceType;
  sourceRef: string | null;
  routePath: string | null;
  publicPath: string | null;
  previewPath: string | null;
  linkLabel: string | null;
  displayOrder: number;
  isTopOfFunnel: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AdminFunnel = {
  id: string;
  slug: string;
  name: string;
  badgeLabel: string | null;
  audience: string;
  objective: string;
  status: AdminFunnelStatus;
  publicPath: string | null;
  createdAt: string;
  updatedAt: string;
  steps: AdminFunnelStep[];
};

export type AdminFunnelOptions = {
  statuses: readonly AdminFunnelStatus[];
  stepTypes: readonly AdminFunnelStepType[];
  stepStatuses: readonly AdminFunnelStepStatus[];
  sourceTypes: readonly AdminFunnelStepSourceType[];
};

export type ManagedFunnelPageTemplate =
  | "sales"
  | "opt_in"
  | "bridge"
  | "upsell"
  | "downsell"
  | "thank_you";
export type ManagedFunnelPageTheme = FunnelPageTheme;
export type ManagedFunnelPageContent = FunnelPageDocument;

export type ManagedFunnelAttribution = {
  funnelId: string;
  funnelSlug: string;
  stepId: string;
  pageId: string;
  revisionNumber: number;
  visitorId: string;
  experimentId?: string | null;
  experimentVariantId?: string | null;
};

export type ManagedFunnelPage = {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "published" | "archived";
  publishedRevisionNumber: number | null;
  latestRevisionNumber: number;
  source: "manual" | "ai" | "imported";
  content: ManagedFunnelPageContent;
  seo: {
    title: string;
    description: string;
    noIndex: boolean;
  };
  publicPath: string;
  nextHref: string | null;
  experiment: {
    id: string;
    name: string;
    goalEvent: FunnelExperimentGoal;
    variantId: string;
  } | null;
  preview: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FunnelExperimentGoal =
  | "primary_cta_click"
  | "secondary_cta_click"
  | "checkout_started"
  | "purchase"
  | "thank_you_view";

export type ManagedFunnelPageSummary = {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "published" | "archived";
  isPrimary: boolean;
  publishedRevisionNumber: number | null;
  latestRevisionNumber: number;
  source: "manual" | "ai" | "imported" | null;
  createdAt: string;
  updatedAt: string;
};

export type ManagedFunnelPageRevisionSummary = {
  revisionNumber: number;
  source: "manual" | "ai" | "imported";
  createdAt: string;
};

export type FunnelExperimentVariantStats = {
  id: string;
  pageId: string;
  weight: number;
  isControl: boolean;
  pageName: string;
  pageStatus: string;
  isPrimary: boolean;
  visitors: number;
  pageViews: number;
  primaryCtaClicks: number;
  secondaryCtaClicks: number;
  conversions: number;
  conversionRate: number;
  purchases: number;
  revenueCents: number;
};

export type AdminFunnelExperiment = {
  id: string;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  goalEvent: FunnelExperimentGoal;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  variants: FunnelExperimentVariantStats[];
  totals: {
    visitors: number;
    pageViews: number;
    conversions: number;
    purchases: number;
    revenueCents: number;
  };
};

export type ManagedFunnelPagePayload = {
  funnel: Pick<AdminFunnel, "id" | "slug" | "name">;
  step: AdminFunnelStep;
  page: ManagedFunnelPage;
};

export type AdminManagedFunnelPagePayload = {
  funnel: AdminFunnel | Pick<AdminFunnel, "id" | "slug" | "name">;
  step: AdminFunnelStep;
  page: ManagedFunnelPage | null;
  pages: ManagedFunnelPageSummary[];
  revisions: ManagedFunnelPageRevisionSummary[];
  experiment: AdminFunnelExperiment | null;
  templates: readonly ManagedFunnelPageTemplate[];
  themes: readonly ManagedFunnelPageTheme[];
  goals: readonly FunnelExperimentGoal[];
};

export type AdminFunnelOperations = {
  testSalesEnabled: boolean;
  overview: {
    visitors: number;
    pageViewVisitors: number;
    pageViews: number;
    leads: number;
    checkoutStarts: number;
    customers: number;
    purchases: number;
    revenueCents: number;
    visitorToLeadRate: number;
    visitorToCustomerRate: number;
    averageOrderValueCents: number;
  };
  stepStats: Array<{
    id: string;
    name: string;
    stepType: AdminFunnelStepType;
    visitors: number;
    pageViews: number;
    leads: number;
    primaryCtaClicks: number;
    checkoutStarts: number;
    purchases: number;
    conversionRate: number;
  }>;
  daily: Array<{
    date: string;
    visitors: number;
    pageViews: number;
    leads: number;
    purchases: number;
    revenueCents: number;
  }>;
  leads: Array<{
    id: string;
    visitorId: string;
    email: string;
    firstName: string | null;
    status: "lead" | "customer" | "unsubscribed";
    tags: string[];
    firstStepName: string | null;
    lastStepName: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    convertedAt: string | null;
  }>;
  sales: Array<{
    id: string;
    visitorId: string;
    checkoutSessionId: string;
    email: string | null;
    orderKind: string;
    amountSubtotalCents: number | null;
    amountTotalCents: number;
    currency: string;
    status: string;
    stepName: string | null;
    purchasedAt: string;
    test: boolean;
  }>;
  automations: Array<{
    id: string;
    name: string;
    triggerEvent: "lead_captured" | "purchase";
    actionType: "add_tag";
    tag: string;
    active: boolean;
    displayOrder: number;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type AdminContactSummary = {
  id: string;
  email: string;
  firstName: string | null;
  status: "lead" | "customer" | "unsubscribed";
  tags: string[];
  funnelNames: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  convertedAt: string | null;
  purchases: number;
  revenue: Array<{ currency: string; amountCents: number }>;
};

export type AdminContactDetail = Pick<
  AdminContactSummary,
  "id" | "email" | "firstName" | "status" | "tags" | "firstSeenAt" | "lastSeenAt" | "convertedAt"
> & {
  sources: Array<{
    id: string;
    funnelName: string;
    firstStepName: string | null;
    lastStepName: string | null;
    status: "lead" | "customer" | "unsubscribed";
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
  sales: Array<{
    id: string;
    funnelName: string;
    stepName: string | null;
    orderKind: string;
    amountTotalCents: number;
    currency: string;
    status: string;
    purchasedAt: string;
    test: boolean;
  }>;
};

export async function listAdminFunnels(userId: string) {
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/funnels/admin?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  ), "Could not load funnel administration.");
  return response.json() as Promise<{ funnels: AdminFunnel[] } & AdminFunnelOptions>;
}

export async function getAdminFunnel(userId: string, idOrSlug: string) {
  const query = new URLSearchParams({ userId, idOrSlug });
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/funnels/admin/detail?${query}`,
    { cache: "no-store" }
  ), "Could not load the funnel.");
  return response.json() as Promise<{ funnel: AdminFunnel } & AdminFunnelOptions>;
}

export async function getAdminFunnelOperations(userId: string, funnelId: string) {
  const query = new URLSearchParams({ userId, funnelId });
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/funnels/admin/operations?${query}`,
    { cache: "no-store" }
  ), "Could not load funnel operations.");
  return response.json() as Promise<AdminFunnelOperations>;
}

export async function listAdminFunnelContacts(userId: string, query?: string | null) {
  const params = new URLSearchParams({ userId });
  if (query) params.set("query", query);
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/funnels/admin/contacts?${params}`,
    { cache: "no-store" }
  ), "Could not load contacts.");
  return response.json() as Promise<{ contacts: AdminContactSummary[] }>;
}

export async function getAdminFunnelContact(userId: string, contactId: string) {
  const params = new URLSearchParams({ userId, contactId });
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/funnels/admin/contacts/detail?${params}`,
    { cache: "no-store" }
  ), "Could not load the contact.");
  return response.json() as Promise<{ contact: AdminContactDetail }>;
}

export function saveAdminFunnelContact(input: Record<string, unknown>) {
  return postJson<{ saved: boolean }>(
    "/internal/funnels/admin/contacts/save",
    input,
    "Could not save the contact."
  );
}

export function saveAdminFunnelAutomation(input: Record<string, unknown>) {
  return postJson<{ rule: AdminFunnelOperations["automations"][number] }>(
    "/internal/funnels/admin/automation/save",
    input,
    "Could not save the automation."
  );
}

export function deleteAdminFunnelAutomation(input: Record<string, unknown>) {
  return postJson<{ deleted: boolean }>(
    "/internal/funnels/admin/automation/delete",
    input,
    "Could not delete the automation."
  );
}

export function createAdminFunnelTestSale(input: Record<string, unknown>) {
  return postJson<{ recorded: boolean; checkoutSessionId: string }>(
    "/internal/funnels/admin/test-sale",
    input,
    "Could not record the test sale."
  );
}

export function saveAdminFunnel(input: Record<string, unknown>) {
  return postJson<{ funnel: AdminFunnel }>(
    "/internal/funnels/admin/save",
    input,
    "Could not save the funnel."
  );
}

export function deleteAdminFunnel(input: {
  userId: string;
  funnelId: string;
}) {
  return postJson<{
    deleted: boolean;
    funnel: { id: string; slug: string; name: string };
  }>(
    "/internal/funnels/admin/delete",
    input,
    "Could not delete the funnel."
  );
}

export function saveAdminFunnelStep(input: Record<string, unknown>) {
  return postJson<{ step: AdminFunnelStep }>(
    "/internal/funnels/admin/steps/save",
    input,
    "Could not save the funnel step."
  );
}

export async function getAdminFunnelPathAvailability(
  userId: string,
  path: string,
  excludeStepId?: string | null
) {
  const query = new URLSearchParams({ userId, path });
  if (excludeStepId) query.set("excludeStepId", excludeStepId);
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/funnels/admin/path-availability?${query}`,
    { cache: "no-store" }
  ), "Could not check the URL path.");
  return response.json() as Promise<{
    available: boolean;
    path: string | null;
    reason: string | null;
  }>;
}

export function reorderAdminFunnelSteps(input: {
  userId: string;
  funnelId: string;
  orderedIds: string[];
}) {
  return postJson<{ reordered: boolean }>(
    "/internal/funnels/admin/steps/reorder",
    input,
    "Could not reorder the funnel."
  );
}

export function duplicateAdminFunnelStep(input: {
  userId: string;
  funnelId: string;
  stepId: string;
}) {
  return postJson<{ step: AdminFunnelStep }>(
    "/internal/funnels/admin/steps/duplicate",
    input,
    "Could not duplicate the funnel step."
  );
}

export function deleteAdminFunnelStep(input: {
  userId: string;
  funnelId: string;
  stepId: string;
}) {
  return postJson<{ deleted: boolean }>(
    "/internal/funnels/admin/steps/delete",
    input,
    "Could not delete the funnel step."
  );
}

export async function getAdminFunnelPage(
  userId: string,
  funnelId: string,
  stepId: string,
  pageId?: string | null
) {
  const query = new URLSearchParams({ userId, funnelId, stepId });
  if (pageId) query.set("pageId", pageId);
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/funnels/admin/page?${query}`,
    { cache: "no-store" }
  ), "Could not load the managed page.");
  return response.json() as Promise<AdminManagedFunnelPagePayload>;
}

export function saveAdminFunnelPageDraft(input: Record<string, unknown>) {
  return postJson<{ page: ManagedFunnelPage }>(
    "/internal/funnels/admin/page/save",
    input,
    "Could not save the page draft."
  );
}

export function restoreAdminFunnelPageRevision(input: {
  userId: string;
  funnelId: string;
  stepId: string;
  pageId: string;
  revisionNumber: number;
}) {
  return postJson<{
    page: ManagedFunnelPage;
    restoredFromRevisionNumber: number;
  }>(
    "/internal/funnels/admin/page/restore",
    input,
    "Could not restore the page revision."
  );
}

export function prepareAdminFunnelAssetUpload(input: Record<string, unknown>) {
  return postJson<{
    assetId: string;
    objectPath: string;
    contentType: string;
    uploadUrl: string;
    publicUrl: string;
  }>("/internal/funnels/admin/asset/prepare", input, "Could not prepare the funnel image upload.");
}

export function completeAdminFunnelAssetUpload(input: Record<string, unknown>) {
  return postJson<{
    assetId: string;
    storagePath: string;
    publicUrl: string;
    alt: string;
    width: number | null;
    height: number | null;
  }>("/internal/funnels/admin/asset/complete", input, "Could not save the funnel image.");
}

export function discardAdminFunnelAssetUpload(input: Record<string, unknown>) {
  return postJson<{ discarded: boolean }>(
    "/internal/funnels/admin/asset/discard",
    input,
    "Could not discard the funnel image upload."
  );
}

export function getFunnelAssetResponse(input: { funnelId: string; stepId: string; filename: string }) {
  const query = new URLSearchParams(input);
  return backendFetch(`${getBackendUrl()}/internal/funnels/asset?${query}`, { cache: "force-cache" });
}

export function publishAdminFunnelPage(input: {
  userId: string;
  funnelId: string;
  stepId: string;
  pageId?: string | null;
}) {
  return postJson<{ published: boolean; publicPath: string; revisionNumber: number }>(
    "/internal/funnels/admin/page/publish",
    input,
    "Could not publish the page."
  );
}

export function unpublishAdminFunnelPage(input: {
  userId: string;
  funnelId: string;
  stepId: string;
  pageId?: string | null;
}) {
  return postJson<{ unpublished: boolean }>(
    "/internal/funnels/admin/page/unpublish",
    input,
    "Could not unpublish the page."
  );
}

export function createAdminFunnelPageVariant(input: Record<string, unknown>) {
  return postJson<{ page: ManagedFunnelPageSummary }>(
    "/internal/funnels/admin/page/variant",
    input,
    "Could not create the page variant."
  );
}

export function generateAdminFunnelPageDraft(input: Record<string, unknown>) {
  return postJson<{ page: ManagedFunnelPage }>(
    "/internal/funnels/admin/page/generate",
    input,
    "Could not generate the page draft."
  );
}

export function startAdminFunnelExperiment(input: Record<string, unknown>) {
  return postJson<{ experiment: AdminFunnelExperiment }>(
    "/internal/funnels/admin/experiment/start",
    input,
    "Could not start the A/B test."
  );
}

export function completeAdminFunnelExperiment(input: Record<string, unknown>) {
  return postJson<{ experiment: AdminFunnelExperiment }>(
    "/internal/funnels/admin/experiment/complete",
    input,
    "Could not finish the A/B test."
  );
}

export function promoteAdminFunnelExperimentWinner(input: Record<string, unknown>) {
  return postJson<{ promoted: boolean; pageId: string }>(
    "/internal/funnels/admin/experiment/promote",
    input,
    "Could not promote the winning page."
  );
}

export function updateAdminCodeFunnelExperiment(input: {
  userId: string;
  funnelId: string;
  stepId: string;
  action: "pause" | "resume" | "complete";
  winnerStepId?: string | null;
}) {
  return postJson<{
    experiment: {
      status: "running" | "paused" | "completed";
      goalEvent: FunnelExperimentGoal;
      winnerStepId: string | null;
      variants: AdminFunnelStep[];
    };
  }>(
    "/internal/funnels/admin/code-experiment/update",
    input,
    "Could not update the A/B test."
  );
}

export async function getPublicCodeFunnelExperiment(
  funnelSlug: string,
  stepSlug: string,
  visitorId: string
) {
  const query = new URLSearchParams({ funnelSlug, stepSlug, visitorId });
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/public/funnels/code-experiment?${query}`,
    { cache: "no-store" }
  ), "A/B test not found.");
  return response.json() as Promise<{
    experiment: {
      status: "running" | "paused" | "completed";
      goalEvent: FunnelExperimentGoal;
      variantKey: string;
      step: AdminFunnelStep;
    };
  }>;
}

export async function getPublicFunnelPage(
  funnelSlug: string,
  stepSlug?: string,
  visitorId?: string | null
) {
  const query = new URLSearchParams({ funnelSlug });
  if (stepSlug) query.set("stepSlug", stepSlug);
  if (visitorId) query.set("visitorId", visitorId);
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/public/funnels/page?${query}`,
    { cache: "no-store" }
  ), "Funnel page not found.");
  return response.json() as Promise<ManagedFunnelPagePayload>;
}

export async function getPublicFunnelPageByPath(
  path: string,
  visitorId?: string | null
) {
  const query = new URLSearchParams({ path });
  if (visitorId) query.set("visitorId", visitorId);
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/public/funnels/page-by-path?${query}`,
    { cache: "no-store" }
  ), "Funnel page not found.");
  return response.json() as Promise<ManagedFunnelPagePayload>;
}

export async function getPublicFunnelOrderForm(path: string) {
  const query = new URLSearchParams({ path });
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/public/funnels/order-form?${query}`,
    { cache: "no-store" }
  ), "Order form not found.");
  return response.json() as Promise<{
    funnel: Pick<AdminFunnel, "id" | "slug" | "name">;
    step: AdminFunnelStep;
    orderForm: {
      primaryProductId: string | null;
      orderBumpProductIds: string[];
      submitLabel: string;
    };
  }>;
}

export function recordPublicFunnelEvent(input: Record<string, unknown>) {
  return postJson<{ recorded: boolean }>(
    "/public/funnels/events",
    input,
    "Could not record funnel activity."
  );
}

export function recordPublicCodeFunnelEvent(input: Record<string, unknown>) {
  return postJson<{ recorded: boolean }>(
    "/public/funnels/code-events",
    input,
    "Could not record funnel activity."
  );
}

export function capturePublicFunnelLead(input: Record<string, unknown>) {
  return postJson<{ captured: boolean; leadId: string | null; attribution: ManagedFunnelAttribution }>(
    "/public/funnels/leads",
    input,
    "Could not save your details. Please try again."
  );
}
