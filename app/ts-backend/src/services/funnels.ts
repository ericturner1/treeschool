import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, max, ne } from "drizzle-orm";
import { z } from "zod";
import {
  funnelAutomationRules,
  funnelEvents,
  funnelExperiments,
  funnelExperimentVariants,
  funnelLeads,
  funnelPageGenerationRuns,
  funnelPageRevisions,
  funnelPages,
  funnelSales,
  funnelVisitorAssignments,
  funnels,
  funnelSteps,
  profiles,
  type FunnelEventType,
  type FunnelExperimentGoal,
  type FunnelExperimentStatus,
  type FunnelPageGenerationMode,
  type FunnelPageRevisionSource,
  type FunnelPageStatus,
  type FunnelStatus,
  type FunnelStepSourceType,
  type FunnelStepStatus,
  type FunnelStepType
} from "ts-db";
import { db, env } from "../db";
import { normalizeGeminiUsage } from "./model-providers/gemini-usage";
import { recordModelUsage } from "./model-usage";

export const FUNNEL_STATUSES = ["draft", "live", "paused", "archived"] as const;
export const FUNNEL_STEP_STATUSES = ["draft", "active", "inactive"] as const;
export const FUNNEL_STEP_TYPES = [
  "landing",
  "sales",
  "checkout",
  "order_bump",
  "upsell",
  "downsell",
  "thank_you",
  "redirect",
  "fulfillment"
] as const;
export const FUNNEL_STEP_SOURCE_TYPES = ["code", "generated", "external", "runtime"] as const;
export const FUNNEL_PAGE_TEMPLATES = [
  "sales",
  "opt_in",
  "bridge",
  "upsell",
  "downsell",
  "thank_you"
] as const;
export const FUNNEL_PAGE_THEMES = ["sage", "cream", "violet", "sky"] as const;
export const FUNNEL_EXPERIMENT_GOALS = [
  "primary_cta_click",
  "secondary_cta_click",
  "checkout_started",
  "purchase",
  "thank_you_view"
] as const;
export const FUNNEL_PUBLIC_EVENT_TYPES = [
  "page_view",
  "lead_captured",
  "primary_cta_click",
  "secondary_cta_click",
  "checkout_started",
  "thank_you_view"
] as const;

const FUNNEL_PAGE_MODEL = "gemini-2.5-flash";
const FUNNEL_PAGE_MODEL_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${FUNNEL_PAGE_MODEL}:generateContent`;

function localFunnelTestSalesEnabled() {
  const usesLocalDatabase =
    /(?:localhost|127\.0\.0\.1|host\.docker\.internal|supabase_db_)/i.test(
      env.DATABASE_URL
    );
  return process.env.NODE_ENV !== "production" || usesLocalDatabase;
}

const optionalPathSchema = z.string().trim().max(500).optional().nullable();

const funnelInputSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().min(2).max(120),
  badgeLabel: z.string().trim().max(100).optional().nullable(),
  audience: z.string().trim().max(1000).default(""),
  objective: z.string().trim().max(1000).default(""),
  status: z.enum(FUNNEL_STATUSES).default("draft"),
  publicPath: optionalPathSchema
});

const stepInputSchema = z.object({
  id: z.string().uuid().optional(),
  funnelId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  stepType: z.enum(FUNNEL_STEP_TYPES),
  status: z.enum(FUNNEL_STEP_STATUSES),
  sourceType: z.enum(FUNNEL_STEP_SOURCE_TYPES),
  sourceRef: z.string().trim().max(240).optional().nullable(),
  publicPath: optionalPathSchema,
  previewPath: optionalPathSchema,
  linkLabel: z.string().trim().max(100).optional().nullable(),
  isTopOfFunnel: z.boolean().default(false)
});

const codeExperimentMutationSchema = z.object({
  userId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stepId: z.string().uuid(),
  action: z.enum(["pause", "resume", "complete"]),
  winnerStepId: z.string().uuid().optional().nullable()
});

type CodeExperimentStatus = "running" | "paused" | "completed";

type CodeExperimentSettings = {
  status: CodeExperimentStatus;
  goalEvent: FunnelExperimentGoal;
  winnerStepId: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

function readCodeExperimentSettings(
  settings: Record<string, unknown> | null | undefined
): CodeExperimentSettings {
  const candidate = settings?.codeExperiment;
  const record = candidate && typeof candidate === "object"
    ? candidate as Record<string, unknown>
    : {};
  const status = record.status === "paused" || record.status === "completed"
    ? record.status
    : "running";
  const goalEvent = FUNNEL_EXPERIMENT_GOALS.includes(
    record.goalEvent as FunnelExperimentGoal
  )
    ? record.goalEvent as FunnelExperimentGoal
    : "primary_cta_click";
  return {
    status,
    goalEvent,
    winnerStepId: typeof record.winnerStepId === "string" ? record.winnerStepId : null,
    startedAt: typeof record.startedAt === "string" ? record.startedAt : null,
    endedAt: typeof record.endedAt === "string" ? record.endedAt : null
  };
}

export const funnelPageContentSchema = z.object({
  template: z.enum(FUNNEL_PAGE_TEMPLATES).default("sales"),
  theme: z.enum(FUNNEL_PAGE_THEMES).default("sage"),
  eyebrow: z.string().trim().max(120).default(""),
  headline: z.string().trim().min(2).max(220),
  subheadline: z.string().trim().max(600).default(""),
  body: z.string().trim().max(6000).default(""),
  bullets: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  primaryCtaLabel: z.string().trim().min(2).max(100),
  primaryCtaHref: z.string().trim().max(500).optional().nullable(),
  secondaryCtaLabel: z.string().trim().max(100).optional().nullable(),
  secondaryCtaHref: z.string().trim().max(500).optional().nullable(),
  reassurance: z.string().trim().max(300).default(""),
  leadCapture: z.object({
    enabled: z.boolean().default(false),
    heading: z.string().trim().max(180).default("Where should we send it?"),
    collectFirstName: z.boolean().default(true),
    firstNameLabel: z.string().trim().max(80).default("First name"),
    emailLabel: z.string().trim().max(80).default("Email address"),
    submitLabel: z.string().trim().max(100).default("Continue")
  }).default({
    enabled: false,
    heading: "Where should we send it?",
    collectFirstName: true,
    firstNameLabel: "First name",
    emailLabel: "Email address",
    submitLabel: "Continue"
  })
});

const funnelPageSeoSchema = z.object({
  title: z.string().trim().max(140).default(""),
  description: z.string().trim().max(320).default(""),
  noIndex: z.boolean().default(false)
});

const savePageDraftSchema = z.object({
  userId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stepId: z.string().uuid(),
  pageId: z.string().uuid().optional().nullable(),
  content: funnelPageContentSchema,
  seo: funnelPageSeoSchema,
  source: z.enum(["manual", "ai", "imported"]).default("manual")
});

const pageMutationSchema = z.object({
  userId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stepId: z.string().uuid(),
  pageId: z.string().uuid().optional().nullable()
});

const generatePageSchema = z.object({
  userId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stepId: z.string().uuid(),
  pageId: z.string().uuid().optional().nullable(),
  mode: z.enum(["create", "rewrite", "optimize", "variant"]),
  prompt: z.string().trim().min(10).max(4000),
  variantName: z.string().trim().max(140).optional().nullable()
});

const startExperimentSchema = z.object({
  userId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stepId: z.string().uuid(),
  name: z.string().trim().min(2).max(140),
  goalEvent: z.enum(FUNNEL_EXPERIMENT_GOALS),
  variants: z.array(z.object({
    pageId: z.string().uuid(),
    weight: z.number().int().min(1).max(100)
  })).min(2).max(8)
});

const experimentMutationSchema = z.object({
  userId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stepId: z.string().uuid(),
  experimentId: z.string().uuid(),
  pageId: z.string().uuid().optional().nullable()
});

const publicEventSchema = z.object({
  eventId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stepId: z.string().uuid(),
  pageId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  experimentId: z.string().uuid().optional().nullable(),
  experimentVariantId: z.string().uuid().optional().nullable(),
  visitorId: z.string().uuid(),
  eventType: z.enum(FUNNEL_PUBLIC_EVENT_TYPES),
  metadata: z.record(z.union([
    z.string().max(500),
    z.number(),
    z.boolean(),
    z.null()
  ])).optional().default({})
});

const publicCodeEventSchema = z.object({
  eventId: z.string().uuid(),
  funnelSlug: z.string().trim().min(2).max(120),
  parentStepSlug: z.string().trim().min(2).max(120),
  variantStepSlug: z.string().trim().min(2).max(120),
  visitorId: z.string().uuid(),
  eventType: z.enum(FUNNEL_PUBLIC_EVENT_TYPES),
  metadata: z.record(z.union([
    z.string().max(500),
    z.number(),
    z.boolean(),
    z.null()
  ])).optional().default({})
});

const funnelAttributionSchema = z.object({
  funnelId: z.string().uuid(),
  funnelSlug: z.string().trim().min(1).max(120),
  stepId: z.string().uuid(),
  pageId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  visitorId: z.string().uuid(),
  experimentId: z.string().uuid().optional().nullable(),
  experimentVariantId: z.string().uuid().optional().nullable()
});

const publicLeadSchema = funnelAttributionSchema.extend({
  eventId: z.string().uuid(),
  email: z.string().trim().email().max(320),
  firstName: z.string().trim().max(100).optional().nullable(),
  attribution: z.record(z.union([
    z.string().max(500),
    z.number(),
    z.boolean(),
    z.null()
  ])).optional().default({})
});

const automationRuleSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  userId: z.string().uuid(),
  funnelId: z.string().uuid(),
  name: z.string().trim().min(2).max(140),
  triggerEvent: z.enum(["lead_captured", "purchase"]),
  actionType: z.literal("add_tag"),
  tag: z.string().trim().min(1).max(80),
  active: z.boolean().default(true)
});

export type FunnelCheckoutAttribution = z.infer<typeof funnelAttributionSchema>;

async function requireAdmin(userId: string) {
  const [admin] = await db
    .select({
      profileId: profiles.id,
      accountId: profiles.accountId,
      isAdmin: profiles.isAdmin
    })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);
  if (!admin?.isAdmin) throw new Error("Administrator access is required.");
  return admin;
}

export function normalizeFunnelSlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
  if (!slug) throw new Error("Enter a valid URL slug.");
  return slug;
}

export function chooseWeightedFunnelVariant<T extends { id: string; weight: number }>(
  visitorId: string,
  experimentId: string,
  variants: T[]
) {
  if (variants.length === 0) return null;
  const totalWeight = variants.reduce((sum, variant) => sum + Math.max(0, variant.weight), 0);
  if (totalWeight <= 0) return variants[0] ?? null;
  let hash = 2166136261;
  for (const character of `${experimentId}:${visitorId}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  let point = (hash >>> 0) % totalWeight;
  for (const variant of variants) {
    point -= Math.max(0, variant.weight);
    if (point < 0) return variant;
  }
  return variants.at(-1) ?? null;
}

function normalizeOptional(value: string | null | undefined) {
  return value?.trim() || null;
}

export function normalizeFunnelPath(value: string | null | undefined, label = "Path") {
  const path = normalizeOptional(value);
  if (!path) return null;
  if (path.startsWith("/") && !path.startsWith("//")) return path;
  try {
    const parsed = new URL(path);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString();
  } catch {
    // Use the clearer validation error below.
  }
  throw new Error(`${label} must be a site path beginning with / or a complete http(s) URL.`);
}

export function normalizeFunnelCheckoutAttribution(
  value: unknown
): FunnelCheckoutAttribution | null {
  const parsed = funnelAttributionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function funnelCheckoutMetadata(value: unknown) {
  const attribution = normalizeFunnelCheckoutAttribution(value);
  if (!attribution) return {};
  return {
    managedFunnelId: attribution.funnelId,
    managedFunnelSlug: attribution.funnelSlug,
    managedFunnelStepId: attribution.stepId,
    managedFunnelPageId: attribution.pageId,
    managedFunnelRevision: String(attribution.revisionNumber),
    managedFunnelVisitorId: attribution.visitorId,
    ...(attribution.experimentId
      ? { managedFunnelExperimentId: attribution.experimentId }
      : {}),
    ...(attribution.experimentVariantId
      ? { managedFunnelVariantId: attribution.experimentVariantId }
      : {})
  };
}

function checkoutMetadataAttribution(metadata: Record<string, string> | null | undefined) {
  return normalizeFunnelCheckoutAttribution({
    funnelId: metadata?.managedFunnelId,
    funnelSlug: metadata?.managedFunnelSlug,
    stepId: metadata?.managedFunnelStepId,
    pageId: metadata?.managedFunnelPageId,
    revisionNumber: Number(metadata?.managedFunnelRevision),
    visitorId: metadata?.managedFunnelVisitorId,
    experimentId: metadata?.managedFunnelExperimentId || null,
    experimentVariantId: metadata?.managedFunnelVariantId || null
  });
}

function stableEventId(namespace: string, value: string) {
  const hex = createHash("sha256").update(`${namespace}:${value}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join("-");
}

async function validateFunnelAttribution(
  attribution: FunnelCheckoutAttribution,
  options: { requirePublishedRevision?: boolean } = {}
) {
  const [row] = await db
    .select({
      funnelId: funnels.id,
      funnelSlug: funnels.slug,
      funnelName: funnels.name,
      stepId: funnelSteps.id,
      stepName: funnelSteps.name,
      pageId: funnelPages.id,
      publishedRevisionNumber: funnelPages.publishedRevisionNumber
    })
    .from(funnelPages)
    .innerJoin(funnelSteps, eq(funnelSteps.id, funnelPages.funnelStepId))
    .innerJoin(funnels, eq(funnels.id, funnelSteps.funnelId))
    .where(and(
      eq(funnels.id, attribution.funnelId),
      eq(funnelSteps.id, attribution.stepId),
      eq(funnelPages.id, attribution.pageId)
    ))
    .limit(1);
  if (
    !row ||
    row.funnelSlug !== attribution.funnelSlug ||
    (options.requirePublishedRevision &&
      row.publishedRevisionNumber !== attribution.revisionNumber)
  ) {
    throw new Error("Invalid funnel attribution.");
  }
  if (attribution.experimentId || attribution.experimentVariantId) {
    const [variant] = await db
      .select({ id: funnelExperimentVariants.id })
      .from(funnelExperimentVariants)
      .where(and(
        eq(funnelExperimentVariants.id, attribution.experimentVariantId ?? ""),
        eq(funnelExperimentVariants.experimentId, attribution.experimentId ?? ""),
        eq(funnelExperimentVariants.funnelPageId, attribution.pageId)
      ))
      .limit(1);
    if (!variant) throw new Error("Invalid funnel experiment attribution.");
  }
  return row;
}

async function automationTags(funnelId: string, triggerEvent: "lead_captured" | "purchase") {
  const rules = await db
    .select({ actionConfigJson: funnelAutomationRules.actionConfigJson })
    .from(funnelAutomationRules)
    .where(and(
      eq(funnelAutomationRules.funnelId, funnelId),
      eq(funnelAutomationRules.triggerEvent, triggerEvent),
      eq(funnelAutomationRules.actionType, "add_tag"),
      eq(funnelAutomationRules.active, true)
    ));
  return Array.from(new Set(rules
    .map(({ actionConfigJson }) => String(actionConfigJson.tag ?? "").trim())
    .filter(Boolean)));
}

async function upsertFunnelLead(input: {
  attribution: FunnelCheckoutAttribution;
  email: string;
  firstName?: string | null;
  status?: "lead" | "customer";
  attributionJson?: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
  triggerEvent: "lead_captured" | "purchase";
}) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select()
    .from(funnelLeads)
    .where(and(
      eq(funnelLeads.funnelId, input.attribution.funnelId),
      eq(funnelLeads.visitorId, input.attribution.visitorId)
    ))
    .limit(1);
  const tags = Array.from(new Set([
    ...((existing?.tagsJson ?? []).filter((tag): tag is string => typeof tag === "string")),
    ...(await automationTags(input.attribution.funnelId, input.triggerEvent))
  ]));
  const now = new Date();
  if (existing) {
    const [updated] = await db
      .update(funnelLeads)
      .set({
        email,
        firstName: input.firstName?.trim() || existing.firstName,
        status: input.status === "customer" ? "customer" : existing.status,
        lastFunnelStepId: input.attribution.stepId,
        lastFunnelPageId: input.attribution.pageId,
        experimentId: input.attribution.experimentId ?? existing.experimentId,
        experimentVariantId:
          input.attribution.experimentVariantId ?? existing.experimentVariantId,
        tagsJson: tags,
        attributionJson: {
          ...(existing.attributionJson ?? {}),
          ...(input.attributionJson ?? {})
        },
        metadataJson: {
          ...(existing.metadataJson ?? {}),
          ...(input.metadataJson ?? {})
        },
        lastSeenAt: now,
        convertedAt: input.status === "customer" ? existing.convertedAt ?? now : existing.convertedAt,
        updatedAt: now
      })
      .where(eq(funnelLeads.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(funnelLeads)
    .values({
      funnelId: input.attribution.funnelId,
      visitorId: input.attribution.visitorId,
      email,
      firstName: input.firstName?.trim() || null,
      status: input.status ?? "lead",
      firstFunnelStepId: input.attribution.stepId,
      firstFunnelPageId: input.attribution.pageId,
      lastFunnelStepId: input.attribution.stepId,
      lastFunnelPageId: input.attribution.pageId,
      experimentId: input.attribution.experimentId ?? null,
      experimentVariantId: input.attribution.experimentVariantId ?? null,
      tagsJson: tags,
      attributionJson: input.attributionJson ?? {},
      metadataJson: input.metadataJson ?? {},
      convertedAt: input.status === "customer" ? now : null
    })
    .returning();
  return created;
}

function presentStep(step: typeof funnelSteps.$inferSelect) {
  return {
    id: step.id,
    funnelId: step.funnelId,
    slug: step.slug,
    name: step.name,
    description: step.description,
    stepType: step.stepType,
    status: step.status,
    sourceType: step.sourceType,
    sourceRef: step.sourceRef,
    publicPath: step.publicPath,
    previewPath: step.previewPath,
    linkLabel: step.linkLabel,
    displayOrder: step.displayOrder,
    isTopOfFunnel: step.isTopOfFunnel,
    settings: step.settingsJson ?? {},
    createdAt: step.createdAt.toISOString(),
    updatedAt: step.updatedAt.toISOString()
  };
}

function presentFunnel(
  funnel: typeof funnels.$inferSelect,
  steps: Array<typeof funnelSteps.$inferSelect> = []
) {
  return {
    id: funnel.id,
    slug: funnel.slug,
    name: funnel.name,
    badgeLabel: funnel.badgeLabel,
    audience: funnel.audience,
    objective: funnel.objective,
    status: funnel.status,
    publicPath: funnel.publicPath,
    createdAt: funnel.createdAt.toISOString(),
    updatedAt: funnel.updatedAt.toISOString(),
    steps: steps.map(presentStep)
  };
}

function managedPagePath(funnelSlug: string, stepSlug: string, isTopOfFunnel: boolean) {
  return isTopOfFunnel
    ? `/f/${encodeURIComponent(funnelSlug)}`
    : `/f/${encodeURIComponent(funnelSlug)}/${encodeURIComponent(stepSlug)}`;
}

async function getStepForFunnel(funnelId: string, stepId: string) {
  const [step] = await db
    .select()
    .from(funnelSteps)
    .where(and(eq(funnelSteps.id, stepId), eq(funnelSteps.funnelId, funnelId)))
    .limit(1);
  if (!step) throw new Error("Funnel step not found.");
  return step;
}

async function getPrimaryPage(stepId: string) {
  const [page] = await db
    .select()
    .from(funnelPages)
    .where(and(eq(funnelPages.funnelStepId, stepId), eq(funnelPages.isPrimary, true)))
    .limit(1);
  return page ?? null;
}

async function getStepPage(stepId: string, pageId: string) {
  const [page] = await db
    .select()
    .from(funnelPages)
    .where(and(eq(funnelPages.id, pageId), eq(funnelPages.funnelStepId, stepId)))
    .limit(1);
  if (!page) throw new Error("Managed page variant not found.");
  return page;
}

async function listStepPageRecords(stepId: string) {
  return db
    .select()
    .from(funnelPages)
    .where(eq(funnelPages.funnelStepId, stepId))
    .orderBy(desc(funnelPages.isPrimary), asc(funnelPages.createdAt));
}

async function getLatestPageRevision(pageId: string) {
  const [revision] = await db
    .select()
    .from(funnelPageRevisions)
    .where(eq(funnelPageRevisions.funnelPageId, pageId))
    .orderBy(desc(funnelPageRevisions.revisionNumber))
    .limit(1);
  return revision ?? null;
}

async function getPublishedPageRevision(pageId: string, revisionNumber: number) {
  const [revision] = await db
    .select()
    .from(funnelPageRevisions)
    .where(and(
      eq(funnelPageRevisions.funnelPageId, pageId),
      eq(funnelPageRevisions.revisionNumber, revisionNumber)
    ))
    .limit(1);
  return revision ?? null;
}

async function resolveNextStepHref(
  funnel: typeof funnels.$inferSelect,
  step: typeof funnelSteps.$inferSelect
) {
  const ordered = await db
    .select()
    .from(funnelSteps)
    .where(eq(funnelSteps.funnelId, funnel.id))
    .orderBy(asc(funnelSteps.displayOrder), asc(funnelSteps.createdAt));
  const currentIndex = ordered.findIndex(({ id }) => id === step.id);
  if (currentIndex < 0) return null;
  const next = ordered
    .slice(currentIndex + 1)
    .find((candidate) => candidate.status === "active");
  if (!next) return null;
  if (next.sourceType === "generated") {
    const page = await getPrimaryPage(next.id);
    if (page?.status === "published" && page.publishedRevisionNumber) {
      return managedPagePath(funnel.slug, next.slug, next.isTopOfFunnel);
    }
  }
  return next.publicPath;
}

function presentManagedPage(input: {
  funnel: typeof funnels.$inferSelect;
  step: typeof funnelSteps.$inferSelect;
  page: typeof funnelPages.$inferSelect;
  revision: typeof funnelPageRevisions.$inferSelect;
  nextHref: string | null;
  preview: boolean;
  experiment?: {
    id: string;
    name: string;
    goalEvent: FunnelExperimentGoal;
    variantId: string;
  } | null;
}) {
  const content = funnelPageContentSchema.parse(input.revision.contentJson);
  const seo = funnelPageSeoSchema.parse(input.revision.seoJson);
  const publicPath = managedPagePath(
    input.funnel.slug,
    input.step.slug,
    input.step.isTopOfFunnel
  );
  return {
    funnel: {
      id: input.funnel.id,
      slug: input.funnel.slug,
      name: input.funnel.name
    },
    step: presentStep(input.step),
    page: {
      id: input.page.id,
      name: input.page.name,
      slug: input.page.slug,
      status: input.page.status,
      publishedRevisionNumber: input.page.publishedRevisionNumber,
      latestRevisionNumber: input.revision.revisionNumber,
      source: input.revision.source,
      content,
      seo,
      publicPath,
      nextHref: input.nextHref,
      experiment: input.experiment ?? null,
      preview: input.preview,
      createdAt: input.page.createdAt.toISOString(),
      updatedAt: input.page.updatedAt.toISOString()
    }
  };
}

async function presentPageSummary(page: typeof funnelPages.$inferSelect) {
  const latest = await getLatestPageRevision(page.id);
  return {
    id: page.id,
    name: page.name,
    slug: page.slug,
    status: page.status,
    isPrimary: page.isPrimary,
    publishedRevisionNumber: page.publishedRevisionNumber,
    latestRevisionNumber: latest?.revisionNumber ?? 0,
    source: latest?.source ?? null,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString()
  };
}

async function getFunnelRecord(idOrSlug: string) {
  const isUuid = z.string().uuid().safeParse(idOrSlug).success;
  const [funnel] = await db
    .select()
    .from(funnels)
    .where(isUuid ? eq(funnels.id, idOrSlug) : eq(funnels.slug, normalizeFunnelSlug(idOrSlug)))
    .limit(1);
  if (!funnel) throw new Error("Funnel not found.");
  return funnel;
}

async function assertUniqueFunnelSlug(slug: string, excludeId?: string) {
  const [existing] = await db
    .select({ id: funnels.id })
    .from(funnels)
    .where(excludeId
      ? and(eq(funnels.slug, slug), ne(funnels.id, excludeId))
      : eq(funnels.slug, slug))
    .limit(1);
  if (existing) throw new Error("Another funnel already uses that URL slug.");
}

async function assertUniqueStepSlug(funnelId: string, slug: string, excludeId?: string) {
  const [existing] = await db
    .select({ id: funnelSteps.id })
    .from(funnelSteps)
    .where(excludeId
      ? and(eq(funnelSteps.funnelId, funnelId), eq(funnelSteps.slug, slug), ne(funnelSteps.id, excludeId))
      : and(eq(funnelSteps.funnelId, funnelId), eq(funnelSteps.slug, slug)))
    .limit(1);
  if (existing) throw new Error("Another step in this funnel already uses that slug.");
}

export async function listAdminFunnels(userId: string) {
  await requireAdmin(userId);
  const [funnelRows, stepRows] = await Promise.all([
    db.select().from(funnels).orderBy(asc(funnels.createdAt)),
    db.select().from(funnelSteps).orderBy(asc(funnelSteps.displayOrder), asc(funnelSteps.createdAt))
  ]);
  const byFunnel = new Map<string, Array<typeof funnelSteps.$inferSelect>>();
  for (const step of stepRows) {
    const collection = byFunnel.get(step.funnelId) ?? [];
    collection.push(step);
    byFunnel.set(step.funnelId, collection);
  }
  return {
    funnels: funnelRows.map((funnel) => presentFunnel(funnel, byFunnel.get(funnel.id) ?? [])),
    statuses: FUNNEL_STATUSES,
    stepTypes: FUNNEL_STEP_TYPES,
    stepStatuses: FUNNEL_STEP_STATUSES,
    sourceTypes: FUNNEL_STEP_SOURCE_TYPES
  };
}

export async function getAdminFunnel(input: { userId: string; idOrSlug: string }) {
  const parsed = z.object({
    userId: z.string().uuid(),
    idOrSlug: z.string().trim().min(1).max(140)
  }).parse(input);
  await requireAdmin(parsed.userId);
  const funnel = await getFunnelRecord(parsed.idOrSlug);
  const steps = await db
    .select()
    .from(funnelSteps)
    .where(eq(funnelSteps.funnelId, funnel.id))
    .orderBy(asc(funnelSteps.displayOrder), asc(funnelSteps.createdAt));
  return {
    funnel: presentFunnel(funnel, steps),
    statuses: FUNNEL_STATUSES,
    stepTypes: FUNNEL_STEP_TYPES,
    stepStatuses: FUNNEL_STEP_STATUSES,
    sourceTypes: FUNNEL_STEP_SOURCE_TYPES
  };
}

export async function getAdminFunnelOperations(input: {
  userId: string;
  funnelId: string;
}) {
  const parsed = z.object({
    userId: z.string().uuid(),
    funnelId: z.string().uuid()
  }).parse(input);
  await requireAdmin(parsed.userId);
  const funnel = await getFunnelRecord(parsed.funnelId);
  const [steps, events, leads, sales, automations] = await Promise.all([
    db.select().from(funnelSteps)
      .where(eq(funnelSteps.funnelId, funnel.id))
      .orderBy(asc(funnelSteps.displayOrder)),
    db.select().from(funnelEvents)
      .where(eq(funnelEvents.funnelId, funnel.id))
      .orderBy(desc(funnelEvents.occurredAt)),
    db.select().from(funnelLeads)
      .where(eq(funnelLeads.funnelId, funnel.id))
      .orderBy(desc(funnelLeads.createdAt))
      .limit(200),
    db.select().from(funnelSales)
      .where(eq(funnelSales.funnelId, funnel.id))
      .orderBy(desc(funnelSales.purchasedAt))
      .limit(200),
    db.select().from(funnelAutomationRules)
      .where(eq(funnelAutomationRules.funnelId, funnel.id))
      .orderBy(asc(funnelAutomationRules.displayOrder), asc(funnelAutomationRules.createdAt))
  ]);
  const stepNames = new Map(steps.map((step) => [step.id, step.name]));
  const visitors = new Set(events.map((event) => event.visitorId));
  const pageViewVisitors = new Set(
    events.filter((event) => event.eventType === "page_view").map((event) => event.visitorId)
  );
  const checkoutVisitors = new Set(
    events
      .filter((event) => event.eventType === "checkout_started")
      .map((event) => event.visitorId)
  );
  const purchasedVisitors = new Set(sales.map((sale) => sale.visitorId));
  const totalRevenueCents = sales.reduce(
    (sum, sale) => sum + sale.amountTotalCents,
    0
  );
  const eventCounts = (stepId: string, eventType: FunnelEventType) =>
    events.filter((event) =>
      event.funnelStepId === stepId && event.eventType === eventType
    ).length;
  const stepStats = steps.map((step) => {
    const stepEvents = events.filter((event) => event.funnelStepId === step.id);
    const stepVisitors = new Set(stepEvents.map((event) => event.visitorId));
    const conversions = new Set(
      stepEvents
        .filter((event) => event.eventType === "purchase")
        .map((event) => event.visitorId)
    );
    return {
      id: step.id,
      name: step.name,
      stepType: step.stepType,
      visitors: stepVisitors.size,
      pageViews: eventCounts(step.id, "page_view"),
      leads: eventCounts(step.id, "lead_captured"),
      primaryCtaClicks: eventCounts(step.id, "primary_cta_click"),
      checkoutStarts: eventCounts(step.id, "checkout_started"),
      purchases: eventCounts(step.id, "purchase"),
      conversionRate: stepVisitors.size
        ? Math.round((conversions.size / stepVisitors.size) * 10_000) / 100
        : 0
    };
  });
  const daily = new Map<string, {
    date: string;
    visitors: Set<string>;
    pageViews: number;
    leads: number;
    purchases: number;
    revenueCents: number;
  }>();
  const ensureDay = (date: Date) => {
    const key = date.toISOString().slice(0, 10);
    const existing = daily.get(key);
    if (existing) return existing;
    const created = {
      date: key,
      visitors: new Set<string>(),
      pageViews: 0,
      leads: 0,
      purchases: 0,
      revenueCents: 0
    };
    daily.set(key, created);
    return created;
  };
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    ensureDay(date);
  }
  for (const event of events) {
    const day = daily.get(event.occurredAt.toISOString().slice(0, 10));
    if (!day) continue;
    day.visitors.add(event.visitorId);
    if (event.eventType === "page_view") day.pageViews += 1;
    if (event.eventType === "lead_captured") day.leads += 1;
  }
  for (const sale of sales) {
    const day = daily.get(sale.purchasedAt.toISOString().slice(0, 10));
    if (!day) continue;
    day.purchases += 1;
    day.revenueCents += sale.amountTotalCents;
  }

  return {
    testSalesEnabled: localFunnelTestSalesEnabled(),
    overview: {
      visitors: visitors.size,
      pageViewVisitors: pageViewVisitors.size,
      pageViews: events.filter((event) => event.eventType === "page_view").length,
      leads: leads.length,
      checkoutStarts: checkoutVisitors.size,
      customers: purchasedVisitors.size,
      purchases: sales.length,
      revenueCents: totalRevenueCents,
      visitorToLeadRate: visitors.size
        ? Math.round((leads.length / visitors.size) * 10_000) / 100
        : 0,
      visitorToCustomerRate: visitors.size
        ? Math.round((purchasedVisitors.size / visitors.size) * 10_000) / 100
        : 0,
      averageOrderValueCents: sales.length
        ? Math.round(totalRevenueCents / sales.length)
        : 0
    },
    stepStats,
    daily: Array.from(daily.values()).map((day) => ({
      ...day,
      visitors: day.visitors.size
    })),
    leads: leads.map((lead) => ({
      id: lead.id,
      visitorId: lead.visitorId,
      email: lead.email,
      firstName: lead.firstName,
      status: lead.status,
      tags: lead.tagsJson,
      firstStepName: lead.firstFunnelStepId
        ? stepNames.get(lead.firstFunnelStepId) ?? null
        : null,
      lastStepName: lead.lastFunnelStepId
        ? stepNames.get(lead.lastFunnelStepId) ?? null
        : null,
      firstSeenAt: lead.firstSeenAt.toISOString(),
      lastSeenAt: lead.lastSeenAt.toISOString(),
      convertedAt: lead.convertedAt?.toISOString() ?? null
    })),
    sales: sales.map((sale) => ({
      id: sale.id,
      visitorId: sale.visitorId,
      checkoutSessionId: sale.stripeCheckoutSessionId,
      email: sale.email,
      orderKind: sale.orderKind,
      amountSubtotalCents: sale.amountSubtotalCents,
      amountTotalCents: sale.amountTotalCents,
      currency: sale.currency,
      status: sale.status,
      stepName: sale.funnelStepId ? stepNames.get(sale.funnelStepId) ?? null : null,
      purchasedAt: sale.purchasedAt.toISOString(),
      test: sale.metadataJson.test === true
    })),
    automations: automations.map((rule) => ({
      id: rule.id,
      name: rule.name,
      triggerEvent: rule.triggerEvent,
      actionType: rule.actionType,
      tag: String(rule.actionConfigJson.tag ?? ""),
      active: rule.active,
      displayOrder: rule.displayOrder,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString()
    }))
  };
}

export async function saveAdminFunnelAutomation(
  input: z.input<typeof automationRuleSchema>
) {
  const parsed = automationRuleSchema.parse(input);
  await requireAdmin(parsed.userId);
  await getFunnelRecord(parsed.funnelId);
  const values = {
    name: parsed.name,
    triggerEvent: parsed.triggerEvent,
    actionType: parsed.actionType,
    actionConfigJson: { tag: parsed.tag },
    active: parsed.active,
    updatedByUserId: parsed.userId,
    updatedAt: new Date()
  } as const;
  if (parsed.id) {
    const [updated] = await db
      .update(funnelAutomationRules)
      .set(values)
      .where(and(
        eq(funnelAutomationRules.id, parsed.id),
        eq(funnelAutomationRules.funnelId, parsed.funnelId)
      ))
      .returning();
    if (!updated) throw new Error("Automation rule not found.");
    return { rule: updated };
  }
  const [{ highestOrder }] = await db
    .select({ highestOrder: max(funnelAutomationRules.displayOrder) })
    .from(funnelAutomationRules)
    .where(eq(funnelAutomationRules.funnelId, parsed.funnelId));
  const [created] = await db
    .insert(funnelAutomationRules)
    .values({
      ...values,
      funnelId: parsed.funnelId,
      displayOrder: Number(highestOrder ?? 0) + 10,
      createdByUserId: parsed.userId
    })
    .returning();
  if (!created) throw new Error("Could not create the automation rule.");
  return { rule: created };
}

export async function deleteAdminFunnelAutomation(input: {
  userId: string;
  funnelId: string;
  ruleId: string;
}) {
  const parsed = z.object({
    userId: z.string().uuid(),
    funnelId: z.string().uuid(),
    ruleId: z.string().uuid()
  }).parse(input);
  await requireAdmin(parsed.userId);
  const [deleted] = await db
    .delete(funnelAutomationRules)
    .where(and(
      eq(funnelAutomationRules.id, parsed.ruleId),
      eq(funnelAutomationRules.funnelId, parsed.funnelId)
    ))
    .returning({ id: funnelAutomationRules.id });
  if (!deleted) throw new Error("Automation rule not found.");
  return { deleted: true };
}

export async function saveAdminFunnel(input: z.input<typeof funnelInputSchema>) {
  const parsed = funnelInputSchema.parse(input);
  await requireAdmin(parsed.userId);
  const slug = normalizeFunnelSlug(parsed.slug);
  await assertUniqueFunnelSlug(slug, parsed.id);
  const values = {
    slug,
    name: parsed.name,
    badgeLabel: normalizeOptional(parsed.badgeLabel),
    audience: parsed.audience,
    objective: parsed.objective,
    status: parsed.status as FunnelStatus,
    publicPath: normalizeFunnelPath(parsed.publicPath, "Top-of-funnel path"),
    updatedByUserId: parsed.userId,
    updatedAt: new Date()
  };
  if (parsed.id) {
    const [updated] = await db
      .update(funnels)
      .set(values)
      .where(eq(funnels.id, parsed.id))
      .returning();
    if (!updated) throw new Error("Funnel not found.");
    return { funnel: presentFunnel(updated) };
  }
  const [created] = await db
    .insert(funnels)
    .values({
      ...values,
      createdByUserId: parsed.userId
    })
    .returning();
  if (!created) throw new Error("Could not create the funnel.");
  return { funnel: presentFunnel(created) };
}

export async function saveAdminFunnelStep(input: z.input<typeof stepInputSchema>) {
  const parsed = stepInputSchema.parse(input);
  await requireAdmin(parsed.userId);
  await getFunnelRecord(parsed.funnelId);
  const slug = normalizeFunnelSlug(parsed.slug);
  await assertUniqueStepSlug(parsed.funnelId, slug, parsed.id);
  const values = {
    slug,
    name: parsed.name,
    description: parsed.description,
    stepType: parsed.stepType as FunnelStepType,
    status: parsed.status as FunnelStepStatus,
    sourceType: parsed.sourceType as FunnelStepSourceType,
    sourceRef: normalizeOptional(parsed.sourceRef),
    publicPath: normalizeFunnelPath(parsed.publicPath, "Public path"),
    previewPath: normalizeFunnelPath(parsed.previewPath, "Preview path"),
    linkLabel: normalizeOptional(parsed.linkLabel),
    isTopOfFunnel: parsed.isTopOfFunnel,
    updatedByUserId: parsed.userId,
    updatedAt: new Date()
  };

  return db.transaction(async (tx) => {
    if (parsed.isTopOfFunnel) {
      await tx
        .update(funnelSteps)
        .set({
          isTopOfFunnel: false,
          updatedByUserId: parsed.userId,
          updatedAt: new Date()
        })
        .where(eq(funnelSteps.funnelId, parsed.funnelId));
    }
    if (parsed.id) {
      const [updated] = await tx
        .update(funnelSteps)
        .set(values)
        .where(and(eq(funnelSteps.id, parsed.id), eq(funnelSteps.funnelId, parsed.funnelId)))
        .returning();
      if (!updated) throw new Error("Funnel step not found.");
      return { step: presentStep(updated) };
    }
    const [{ highestOrder }] = await tx
      .select({ highestOrder: max(funnelSteps.displayOrder) })
      .from(funnelSteps)
      .where(eq(funnelSteps.funnelId, parsed.funnelId));
    const [created] = await tx
      .insert(funnelSteps)
      .values({
        ...values,
        funnelId: parsed.funnelId,
        displayOrder: Number(highestOrder ?? 0) + 10,
        createdByUserId: parsed.userId
      })
      .returning();
    if (!created) throw new Error("Could not create the funnel step.");
    return { step: presentStep(created) };
  });
}

function codeExperimentChildren(
  parent: typeof funnelSteps.$inferSelect,
  steps: Array<typeof funnelSteps.$inferSelect>
) {
  return steps
    .filter((step) => {
      const settings = step.settingsJson as Record<string, unknown> | null;
      return settings?.relationship === "experiment_variant"
        && settings?.parentStepSlug === parent.slug;
    })
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

export async function updateAdminCodeFunnelExperiment(
  input: z.input<typeof codeExperimentMutationSchema>
) {
  const parsed = codeExperimentMutationSchema.parse(input);
  await requireAdmin(parsed.userId);
  const parent = await getStepForFunnel(parsed.funnelId, parsed.stepId);
  const steps = await db
    .select()
    .from(funnelSteps)
    .where(eq(funnelSteps.funnelId, parsed.funnelId));
  const variants = codeExperimentChildren(parent, steps);
  if (variants.length < 2) {
    throw new Error("This step does not have enough code variants for an A/B test.");
  }

  const current = readCodeExperimentSettings(
    parent.settingsJson as Record<string, unknown> | null
  );
  if (parsed.action === "complete") {
    if (!parsed.winnerStepId || !variants.some(({ id }) => id === parsed.winnerStepId)) {
      throw new Error("Choose a valid winning variant.");
    }
  }
  const now = new Date().toISOString();
  const next: CodeExperimentSettings = parsed.action === "pause"
    ? { ...current, status: "paused" }
    : parsed.action === "resume"
      ? {
          ...current,
          status: "running",
          winnerStepId: null,
          startedAt: current.startedAt ?? now,
          endedAt: null
        }
      : {
          ...current,
          status: "completed",
          winnerStepId: parsed.winnerStepId ?? null,
          startedAt: current.startedAt ?? now,
          endedAt: now
        };
  const [updated] = await db
    .update(funnelSteps)
    .set({
      settingsJson: {
        ...((parent.settingsJson as Record<string, unknown> | null) ?? {}),
        codeExperiment: next
      },
      updatedByUserId: parsed.userId,
      updatedAt: new Date()
    })
    .where(and(eq(funnelSteps.id, parent.id), eq(funnelSteps.funnelId, parsed.funnelId)))
    .returning();
  if (!updated) throw new Error("A/B test not found.");
  return {
    experiment: {
      ...next,
      variants: variants.map(presentStep)
    }
  };
}

export async function getPublicCodeFunnelExperiment(input: {
  funnelSlug: string;
  stepSlug: string;
  visitorId: string;
}) {
  const parsed = z.object({
    funnelSlug: z.string().trim().min(2).max(120),
    stepSlug: z.string().trim().min(2).max(120),
    visitorId: z.string().uuid()
  }).parse(input);
  const funnel = await getFunnelRecord(parsed.funnelSlug);
  if (funnel.status !== "live") throw new Error("Funnel not found.");
  const steps = await db
    .select()
    .from(funnelSteps)
    .where(eq(funnelSteps.funnelId, funnel.id));
  const parent = steps.find((step) => step.slug === parsed.stepSlug);
  if (!parent || parent.status !== "active") throw new Error("Funnel step not found.");
  const variants = codeExperimentChildren(parent, steps)
    .filter((step) => step.status === "active");
  if (variants.length < 2) throw new Error("A/B test is not available.");
  const settings = readCodeExperimentSettings(
    parent.settingsJson as Record<string, unknown> | null
  );
  const winner = settings.winnerStepId
    ? variants.find(({ id }) => id === settings.winnerStepId) ?? null
    : null;
  const selected = settings.status === "completed" && winner
    ? winner
    : settings.status === "paused"
      ? variants[0]
      : chooseWeightedFunnelVariant(
          parsed.visitorId,
          parent.id,
          variants.map((variant) => ({ ...variant, weight: 100 }))
        ) ?? variants[0];
  const variantKey = /variant-b(?:-|$)/i.test(selected.slug) ? "b" : "a";
  return {
    experiment: {
      status: settings.status,
      goalEvent: settings.goalEvent,
      variantKey,
      step: presentStep(selected)
    }
  };
}

export async function reorderAdminFunnelSteps(input: {
  userId: string;
  funnelId: string;
  orderedIds: string[];
}) {
  const parsed = z.object({
    userId: z.string().uuid(),
    funnelId: z.string().uuid(),
    orderedIds: z.array(z.string().uuid()).min(1).max(100)
  }).parse(input);
  await requireAdmin(parsed.userId);
  const orderedIds = Array.from(new Set(parsed.orderedIds));
  const existing = await db
    .select({ id: funnelSteps.id })
    .from(funnelSteps)
    .where(eq(funnelSteps.funnelId, parsed.funnelId));
  if (
    orderedIds.length !== existing.length ||
    existing.some(({ id }) => !orderedIds.includes(id))
  ) {
    throw new Error("The funnel order is out of date. Refresh and try again.");
  }
  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(funnelSteps)
        .set({
          displayOrder: (index + 1) * 10,
          updatedByUserId: parsed.userId,
          updatedAt: new Date()
        })
        .where(and(eq(funnelSteps.id, id), eq(funnelSteps.funnelId, parsed.funnelId)));
    }
    await tx
      .update(funnels)
      .set({ updatedByUserId: parsed.userId, updatedAt: new Date() })
      .where(eq(funnels.id, parsed.funnelId));
  });
  return { reordered: true };
}

export async function duplicateAdminFunnelStep(input: {
  userId: string;
  funnelId: string;
  stepId: string;
}) {
  const parsed = z.object({
    userId: z.string().uuid(),
    funnelId: z.string().uuid(),
    stepId: z.string().uuid()
  }).parse(input);
  await requireAdmin(parsed.userId);
  const funnel = await getFunnelRecord(parsed.funnelId);
  const [source] = await db
    .select()
    .from(funnelSteps)
    .where(and(eq(funnelSteps.id, parsed.stepId), eq(funnelSteps.funnelId, parsed.funnelId)))
    .limit(1);
  if (!source) throw new Error("Funnel step not found.");
  const sourcePage = await getPrimaryPage(source.id);
  const sourceRevision = sourcePage
    ? await getLatestPageRevision(sourcePage.id)
    : null;
  let slug = `${source.slug}-copy`;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const [existing] = await db
      .select({ id: funnelSteps.id })
      .from(funnelSteps)
      .where(and(eq(funnelSteps.funnelId, parsed.funnelId), eq(funnelSteps.slug, slug)))
      .limit(1);
    if (!existing) break;
    slug = `${source.slug}-copy-${suffix}`;
  }
  return db.transaction(async (tx) => {
    const ordered = await tx
      .select({ id: funnelSteps.id })
      .from(funnelSteps)
      .where(eq(funnelSteps.funnelId, parsed.funnelId))
      .orderBy(asc(funnelSteps.displayOrder), asc(funnelSteps.createdAt));
    const sourceIndex = ordered.findIndex(({ id }) => id === source.id);
    const [created] = await tx
      .insert(funnelSteps)
      .values({
        funnelId: source.funnelId,
        slug,
        name: `${source.name} copy`,
        description: source.description,
        stepType: source.stepType,
        status: "draft",
        sourceType: source.sourceType === "generated" && !(sourcePage && sourceRevision)
          ? "code"
          : source.sourceType,
        sourceRef: source.sourceType === "generated" ? null : source.sourceRef,
        publicPath: null,
        previewPath: source.sourceType === "generated" ? null : source.previewPath,
        linkLabel: source.linkLabel,
        displayOrder: source.displayOrder + 1,
        isTopOfFunnel: false,
        settingsJson: source.settingsJson,
        createdByUserId: parsed.userId,
        updatedByUserId: parsed.userId
      })
      .returning();
    if (!created) throw new Error("Could not duplicate the funnel step.");
    let duplicatedStep = created;
    if (sourcePage && sourceRevision) {
      const [duplicatedPage] = await tx
        .insert(funnelPages)
        .values({
          funnelStepId: created.id,
          slug: "control",
          name: `${created.name} page`,
          status: "draft",
          isPrimary: true,
          createdByUserId: parsed.userId,
          updatedByUserId: parsed.userId
        })
        .returning();
      if (!duplicatedPage) throw new Error("Could not duplicate the managed page.");
      await tx
        .insert(funnelPageRevisions)
        .values({
          funnelPageId: duplicatedPage.id,
          revisionNumber: 1,
          source: "imported",
          contentJson: sourceRevision.contentJson,
          seoJson: sourceRevision.seoJson,
          createdByUserId: parsed.userId
        });
      const previewPath =
        `/admin/funnels/${encodeURIComponent(funnel.slug)}/preview/${encodeURIComponent(created.id)}`;
      const [updatedStep] = await tx
        .update(funnelSteps)
        .set({
          sourceType: "generated",
          sourceRef: duplicatedPage.id,
          previewPath,
          updatedByUserId: parsed.userId,
          updatedAt: new Date()
        })
        .where(eq(funnelSteps.id, created.id))
        .returning();
      duplicatedStep = updatedStep ?? created;
    }
    ordered.splice(sourceIndex + 1, 0, { id: created.id });
    for (const [index, { id }] of ordered.entries()) {
      await tx
        .update(funnelSteps)
        .set({ displayOrder: (index + 1) * 10 })
        .where(eq(funnelSteps.id, id));
    }
    return { step: presentStep(duplicatedStep) };
  });
}

export async function deleteAdminFunnelStep(input: {
  userId: string;
  funnelId: string;
  stepId: string;
}) {
  const parsed = z.object({
    userId: z.string().uuid(),
    funnelId: z.string().uuid(),
    stepId: z.string().uuid()
  }).parse(input);
  await requireAdmin(parsed.userId);
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(funnelSteps)
      .where(and(eq(funnelSteps.id, parsed.stepId), eq(funnelSteps.funnelId, parsed.funnelId)))
      .returning({ id: funnelSteps.id, wasTop: funnelSteps.isTopOfFunnel });
    if (!deleted) throw new Error("Funnel step not found.");
    const remaining = await tx
      .select({ id: funnelSteps.id })
      .from(funnelSteps)
      .where(eq(funnelSteps.funnelId, parsed.funnelId))
      .orderBy(asc(funnelSteps.displayOrder), asc(funnelSteps.createdAt));
    for (const [index, { id }] of remaining.entries()) {
      await tx
        .update(funnelSteps)
        .set({
          displayOrder: (index + 1) * 10,
          ...(deleted.wasTop && index === 0 ? { isTopOfFunnel: true } : {})
        })
        .where(eq(funnelSteps.id, id));
    }
    return { deleted: true };
  });
}

export async function getAdminFunnelPage(input: {
  userId: string;
  funnelId: string;
  stepId: string;
  pageId?: string | null;
}) {
  const parsed = pageMutationSchema.parse(input);
  await requireAdmin(parsed.userId);
  const funnel = await getFunnelRecord(parsed.funnelId);
  const step = await getStepForFunnel(funnel.id, parsed.stepId);
  const pageRows = await listStepPageRecords(step.id);
  const page = parsed.pageId
    ? pageRows.find(({ id }) => id === parsed.pageId) ?? null
    : pageRows.find(({ isPrimary }) => isPrimary) ?? null;
  if (parsed.pageId && !page) throw new Error("Managed page variant not found.");
  const pages = await Promise.all(pageRows.map(presentPageSummary));
  const experiment = await getAdminExperimentSummary(step.id);
  if (!page) {
    return {
      funnel: presentFunnel(funnel),
      step: presentStep(step),
      page: null,
      pages,
      experiment,
      templates: FUNNEL_PAGE_TEMPLATES,
      themes: FUNNEL_PAGE_THEMES,
      goals: FUNNEL_EXPERIMENT_GOALS
    };
  }
  const revision = await getLatestPageRevision(page.id);
  if (!revision) throw new Error("The managed page has no revision.");
  const nextHref = await resolveNextStepHref(funnel, step);
  return {
    ...presentManagedPage({
      funnel,
      step,
      page,
      revision,
      nextHref,
      preview: true
    }),
    pages,
    experiment,
    templates: FUNNEL_PAGE_TEMPLATES,
    themes: FUNNEL_PAGE_THEMES,
    goals: FUNNEL_EXPERIMENT_GOALS
  };
}

export async function saveAdminFunnelPageDraft(
  input: z.input<typeof savePageDraftSchema>
) {
  const parsed = savePageDraftSchema.parse(input);
  await requireAdmin(parsed.userId);
  const funnel = await getFunnelRecord(parsed.funnelId);
  const step = await getStepForFunnel(funnel.id, parsed.stepId);
  const content = {
    ...parsed.content,
    primaryCtaHref: normalizeFunnelPath(
      parsed.content.primaryCtaHref,
      "Primary CTA path"
    ),
    secondaryCtaHref: normalizeFunnelPath(
      parsed.content.secondaryCtaHref,
      "Secondary CTA path"
    )
  };
  const existingPage = parsed.pageId
    ? await getStepPage(step.id, parsed.pageId)
    : await getPrimaryPage(step.id);
  const previewPath =
    `/admin/funnels/${encodeURIComponent(funnel.slug)}/preview/${encodeURIComponent(step.id)}` +
    (existingPage && !existingPage.isPrimary
      ? `?page=${encodeURIComponent(existingPage.id)}`
      : "");
  const nextHref = await resolveNextStepHref(funnel, step);

  return db.transaction(async (tx) => {
    let page = existingPage;
    if (!page) {
      const [created] = await tx
        .insert(funnelPages)
        .values({
          funnelStepId: step.id,
          slug: "control",
          name: `${step.name} page`,
          status: "draft",
          isPrimary: true,
          createdByUserId: parsed.userId,
          updatedByUserId: parsed.userId
        })
        .returning();
      if (!created) throw new Error("Could not create the managed page.");
      page = created;
    }
    const [{ highestRevision }] = await tx
      .select({ highestRevision: max(funnelPageRevisions.revisionNumber) })
      .from(funnelPageRevisions)
      .where(eq(funnelPageRevisions.funnelPageId, page.id));
    const revisionNumber = Number(highestRevision ?? 0) + 1;
    const [revision] = await tx
      .insert(funnelPageRevisions)
      .values({
        funnelPageId: page.id,
        revisionNumber,
        source: parsed.source as FunnelPageRevisionSource,
        contentJson: content,
        seoJson: parsed.seo,
        createdByUserId: parsed.userId
      })
      .returning();
    if (!revision) throw new Error("Could not save the page revision.");
    const [updatedPage] = await tx
      .update(funnelPages)
      .set({
        name: page.name,
        updatedByUserId: parsed.userId,
        updatedAt: new Date()
      })
      .where(eq(funnelPages.id, page.id))
      .returning();
    if (page.isPrimary) {
      await tx
        .update(funnelSteps)
        .set({
          sourceType: "generated",
          sourceRef: page.id,
          previewPath,
          updatedByUserId: parsed.userId,
          updatedAt: new Date()
        })
        .where(eq(funnelSteps.id, step.id));
    }
    return {
      page: presentManagedPage({
        funnel,
        step: {
          ...step,
          ...(page.isPrimary
            ? {
                sourceType: "generated" as FunnelStepSourceType,
                sourceRef: page.id,
                previewPath
              }
            : {})
        },
        page: updatedPage ?? page,
        revision,
        nextHref,
        preview: true
      }).page
    };
  });
}

export async function publishAdminFunnelPage(input: {
  userId: string;
  funnelId: string;
  stepId: string;
  pageId?: string | null;
}) {
  const parsed = pageMutationSchema.parse(input);
  await requireAdmin(parsed.userId);
  const funnel = await getFunnelRecord(parsed.funnelId);
  const step = await getStepForFunnel(funnel.id, parsed.stepId);
  const page = parsed.pageId
    ? await getStepPage(step.id, parsed.pageId)
    : await getPrimaryPage(step.id);
  if (!page) throw new Error("Save a page draft before publishing.");
  const revision = await getLatestPageRevision(page.id);
  if (!revision) throw new Error("Save a page draft before publishing.");
  const publicPath = managedPagePath(funnel.slug, step.slug, step.isTopOfFunnel);
  const previewPath =
    `/admin/funnels/${encodeURIComponent(funnel.slug)}/preview/${encodeURIComponent(step.id)}` +
    (!page.isPrimary ? `?page=${encodeURIComponent(page.id)}` : "");

  await db.transaction(async (tx) => {
    await tx
      .update(funnelPages)
      .set({
        status: "published" as FunnelPageStatus,
        publishedRevisionNumber: revision.revisionNumber,
        updatedByUserId: parsed.userId,
        updatedAt: new Date()
      })
      .where(eq(funnelPages.id, page.id));
    if (page.isPrimary) {
      await tx
        .update(funnelSteps)
        .set({
          status: "active",
          sourceType: "generated",
          sourceRef: page.id,
          publicPath,
          previewPath,
          updatedByUserId: parsed.userId,
          updatedAt: new Date()
        })
        .where(eq(funnelSteps.id, step.id));
    }
    if (page.isPrimary && step.isTopOfFunnel) {
      await tx
        .update(funnels)
        .set({
          status: "live",
          publicPath,
          updatedByUserId: parsed.userId,
          updatedAt: new Date()
        })
        .where(eq(funnels.id, funnel.id));
    }
  });
  return { published: true, publicPath, revisionNumber: revision.revisionNumber };
}

export async function unpublishAdminFunnelPage(input: {
  userId: string;
  funnelId: string;
  stepId: string;
  pageId?: string | null;
}) {
  const parsed = pageMutationSchema.parse(input);
  await requireAdmin(parsed.userId);
  const funnel = await getFunnelRecord(parsed.funnelId);
  const step = await getStepForFunnel(funnel.id, parsed.stepId);
  const page = parsed.pageId
    ? await getStepPage(step.id, parsed.pageId)
    : await getPrimaryPage(step.id);
  if (!page) throw new Error("Managed page not found.");
  await db.transaction(async (tx) => {
    await tx
      .update(funnelPages)
      .set({
        status: "draft",
        publishedRevisionNumber: null,
        updatedByUserId: parsed.userId,
        updatedAt: new Date()
      })
      .where(eq(funnelPages.id, page.id));
    if (page.isPrimary) {
      await tx
        .update(funnelSteps)
        .set({
          status: "draft",
          updatedByUserId: parsed.userId,
          updatedAt: new Date()
        })
        .where(eq(funnelSteps.id, step.id));
    }
    if (page.isPrimary && step.isTopOfFunnel) {
      await tx
        .update(funnels)
        .set({
          status: "paused",
          updatedByUserId: parsed.userId,
          updatedAt: new Date()
        })
        .where(eq(funnels.id, funnel.id));
    }
  });
  return { unpublished: true };
}

async function getAdminExperimentSummary(stepId: string) {
  const [experiment] = await db
    .select()
    .from(funnelExperiments)
    .where(eq(funnelExperiments.funnelStepId, stepId))
    .orderBy(desc(funnelExperiments.createdAt))
    .limit(1);
  if (!experiment) return null;

  const variants = await db
    .select({
      id: funnelExperimentVariants.id,
      pageId: funnelExperimentVariants.funnelPageId,
      weight: funnelExperimentVariants.weight,
      isControl: funnelExperimentVariants.isControl,
      pageName: funnelPages.name,
      pageStatus: funnelPages.status,
      isPrimary: funnelPages.isPrimary
    })
    .from(funnelExperimentVariants)
    .innerJoin(funnelPages, eq(funnelPages.id, funnelExperimentVariants.funnelPageId))
    .where(eq(funnelExperimentVariants.experimentId, experiment.id))
    .orderBy(desc(funnelExperimentVariants.isControl), asc(funnelExperimentVariants.createdAt));
  const events = await db
    .select()
    .from(funnelEvents)
    .where(eq(funnelEvents.experimentId, experiment.id));

  const presentedVariants = variants.map((variant) => {
    const relevant = events.filter(({ experimentVariantId }) => experimentVariantId === variant.id);
    const visitors = new Set(relevant.map(({ visitorId }) => visitorId));
    const convertingVisitors = new Set(
      relevant
        .filter(({ eventType }) => eventType === experiment.goalEvent)
        .map(({ visitorId }) => visitorId)
    );
    const purchases = relevant.filter(({ eventType }) => eventType === "purchase");
    const revenueCents = purchases.reduce((sum, event) => sum + (event.valueCents ?? 0), 0);
    return {
      ...variant,
      visitors: visitors.size,
      pageViews: relevant.filter(({ eventType }) => eventType === "page_view").length,
      primaryCtaClicks: relevant.filter(({ eventType }) => eventType === "primary_cta_click").length,
      secondaryCtaClicks: relevant.filter(({ eventType }) => eventType === "secondary_cta_click").length,
      conversions: convertingVisitors.size,
      conversionRate: visitors.size > 0
        ? Math.round((convertingVisitors.size / visitors.size) * 10_000) / 100
        : 0,
      purchases: purchases.length,
      revenueCents
    };
  });

  return {
    id: experiment.id,
    name: experiment.name,
    status: experiment.status,
    goalEvent: experiment.goalEvent,
    startedAt: experiment.startedAt?.toISOString() ?? null,
    endedAt: experiment.endedAt?.toISOString() ?? null,
    createdAt: experiment.createdAt.toISOString(),
    variants: presentedVariants,
    totals: {
      visitors: new Set(events.map(({ visitorId }) => visitorId)).size,
      pageViews: events.filter(({ eventType }) => eventType === "page_view").length,
      conversions: new Set(
        events
          .filter(({ eventType }) => eventType === experiment.goalEvent)
          .map(({ visitorId }) => visitorId)
      ).size,
      purchases: events.filter(({ eventType }) => eventType === "purchase").length,
      revenueCents: events
        .filter(({ eventType }) => eventType === "purchase")
        .reduce((sum, event) => sum + (event.valueCents ?? 0), 0)
    }
  };
}

function parseGeminiPageJson(payload: unknown) {
  const text = (payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }).candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("AI page generation returned an empty response.");
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as unknown;
}

export async function createAdminFunnelPageVariant(input: {
  userId: string;
  funnelId: string;
  stepId: string;
  sourcePageId?: string | null;
  name?: string | null;
}) {
  const parsed = z.object({
    userId: z.string().uuid(),
    funnelId: z.string().uuid(),
    stepId: z.string().uuid(),
    sourcePageId: z.string().uuid().optional().nullable(),
    name: z.string().trim().max(140).optional().nullable()
  }).parse(input);
  await requireAdmin(parsed.userId);
  const funnel = await getFunnelRecord(parsed.funnelId);
  const step = await getStepForFunnel(funnel.id, parsed.stepId);
  const sourcePage = parsed.sourcePageId
    ? await getStepPage(step.id, parsed.sourcePageId)
    : await getPrimaryPage(step.id);
  if (!sourcePage) throw new Error("Create the control page before adding a variant.");
  const sourceRevision = await getLatestPageRevision(sourcePage.id);
  if (!sourceRevision) throw new Error("The source page has no revision to copy.");
  const pageCount = (await listStepPageRecords(step.id)).length;
  const slug = `variant-${Date.now().toString(36)}`;

  const [page] = await db.transaction(async (tx) => {
    const createdPages = await tx
      .insert(funnelPages)
      .values({
        funnelStepId: step.id,
        slug,
        name: parsed.name || `Variant ${pageCount}`,
        status: "draft",
        isPrimary: false,
        createdByUserId: parsed.userId,
        updatedByUserId: parsed.userId
      })
      .returning();
    const created = createdPages[0];
    if (!created) throw new Error("Could not create the page variant.");
    await tx.insert(funnelPageRevisions).values({
      funnelPageId: created.id,
      revisionNumber: 1,
      source: "imported",
      contentJson: sourceRevision.contentJson,
      seoJson: sourceRevision.seoJson,
      createdByUserId: parsed.userId
    });
    return createdPages;
  });
  if (!page) throw new Error("Could not create the page variant.");
  return { page: await presentPageSummary(page) };
}

export async function generateAdminFunnelPageDraft(
  input: z.input<typeof generatePageSchema>
) {
  const parsed = generatePageSchema.parse(input);
  const admin = await requireAdmin(parsed.userId);
  if (!env.GOOGLE_AI_API_KEY) throw new Error("AI funnel writing is not configured.");
  const funnel = await getFunnelRecord(parsed.funnelId);
  const step = await getStepForFunnel(funnel.id, parsed.stepId);
  const sourcePage = parsed.pageId
    ? await getStepPage(step.id, parsed.pageId)
    : await getPrimaryPage(step.id);
  const sourceRevision = sourcePage ? await getLatestPageRevision(sourcePage.id) : null;
  const current = sourceRevision
    ? {
        content: funnelPageContentSchema.parse(sourceRevision.contentJson),
        seo: funnelPageSeoSchema.parse(sourceRevision.seoJson)
      }
    : null;

  const [run] = await db
    .insert(funnelPageGenerationRuns)
    .values({
      funnelStepId: step.id,
      funnelPageId: sourcePage?.id ?? null,
      requestedByUserId: parsed.userId,
      provider: "google",
      model: FUNNEL_PAGE_MODEL,
      mode: parsed.mode as FunnelPageGenerationMode,
      prompt: parsed.prompt
    })
    .returning({ id: funnelPageGenerationRuns.id });
  if (!run) throw new Error("Could not start AI page generation.");

  const startedAt = Date.now();
  try {
    const response = await fetch(`${FUNNEL_PAGE_MODEL_ENDPOINT}?key=${env.GOOGLE_AI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{
            text: [
              "You are a conversion copywriter working inside Treeschool's human-reviewed funnel editor.",
              "Return a complete structured funnel page as JSON with exactly two top-level keys: content and seo.",
              `Task mode: ${parsed.mode}.`,
              `Funnel: ${funnel.name}.`,
              `Audience: ${funnel.audience || "homeschool parents"}.`,
              `Funnel objective: ${funnel.objective || "help the visitor take the next appropriate step"}.`,
              `Step type: ${step.stepType}. Step name: ${step.name}.`,
              `Editor instructions: ${parsed.prompt}`,
              current ? `Current structured page:\n${JSON.stringify(current)}` : "",
              "The content object must include template, theme, eyebrow, headline, subheadline, body, bullets, primaryCtaLabel, primaryCtaHref, secondaryCtaLabel, secondaryCtaHref, and reassurance.",
              `Allowed templates: ${FUNNEL_PAGE_TEMPLATES.join(", ")}.`,
              `Allowed themes: ${FUNNEL_PAGE_THEMES.join(", ")}.`,
              "Use null for CTA destinations when the button should continue to the next active funnel step.",
              "The seo object must include title, description, and noIndex.",
              "Be specific, clear, and persuasive without hype. Never invent testimonials, statistics, scarcity, guarantees, product capabilities, prices, discounts, or research findings.",
              "Preserve factual details from the current page unless the editor explicitly requests a change.",
              "Return JSON only."
            ].filter(Boolean).join("\n\n")
          }]
        }],
        generationConfig: {
          temperature: parsed.mode === "optimize" ? 0.4 : 0.65,
          responseMimeType: "application/json"
        }
      })
    });
    const requestId =
      response.headers.get("x-goog-request-id") ?? response.headers.get("x-request-id");
    if (!response.ok) throw new Error(`AI page generation failed (${response.status}).`);
    const payload = await response.json();
    const usage = normalizeGeminiUsage(payload);
    const generated = z.object({
      content: funnelPageContentSchema,
      seo: funnelPageSeoSchema
    }).parse(parseGeminiPageJson(payload));

    let targetPage = sourcePage;
    if (parsed.mode === "variant") {
      const variant = await createAdminFunnelPageVariant({
        userId: parsed.userId,
        funnelId: funnel.id,
        stepId: step.id,
        sourcePageId: sourcePage?.id ?? null,
        name: parsed.variantName || "AI test variant"
      });
      targetPage = await getStepPage(step.id, variant.page.id);
    }
    const saved = await saveAdminFunnelPageDraft({
      userId: parsed.userId,
      funnelId: funnel.id,
      stepId: step.id,
      pageId: targetPage?.id ?? null,
      content: generated.content,
      seo: generated.seo,
      source: "ai"
    });
    await db
      .update(funnelPageGenerationRuns)
      .set({
        funnelPageId: saved.page.id,
        status: "succeeded",
        providerRequestId: requestId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        durationMs: Date.now() - startedAt,
        outputRevisionNumber: saved.page.latestRevisionNumber,
        providerUsageJson: usage.providerUsageJson,
        completedAt: new Date()
      })
      .where(eq(funnelPageGenerationRuns.id, run.id));
    await recordModelUsage({
      context: { accountId: admin.accountId },
      feature: "funnel_builder",
      operation: `funnel_page_${parsed.mode}`,
      provider: "google",
      model: FUNNEL_PAGE_MODEL,
      status: "succeeded",
      providerRequestId: requestId,
      durationMs: Date.now() - startedAt,
      usage
    });
    return { page: saved.page };
  } catch (error) {
    await db
      .update(funnelPageGenerationRuns)
      .set({
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
        completedAt: new Date()
      })
      .where(eq(funnelPageGenerationRuns.id, run.id));
    await recordModelUsage({
      context: { accountId: admin.accountId },
      feature: "funnel_builder",
      operation: `funnel_page_${parsed.mode}`,
      provider: "google",
      model: FUNNEL_PAGE_MODEL,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof z.ZodError ? "invalid_response" : "generation_failed"
    });
    throw error;
  }
}

export async function startAdminFunnelExperiment(
  input: z.input<typeof startExperimentSchema>
) {
  const parsed = startExperimentSchema.parse(input);
  await requireAdmin(parsed.userId);
  const funnel = await getFunnelRecord(parsed.funnelId);
  const step = await getStepForFunnel(funnel.id, parsed.stepId);
  if (parsed.variants.reduce((sum, variant) => sum + variant.weight, 0) !== 100) {
    throw new Error("Variant traffic weights must add up to 100%.");
  }
  const pageRows = await listStepPageRecords(step.id);
  const selectedPages = parsed.variants.map((variant) => {
    const page = pageRows.find(({ id }) => id === variant.pageId);
    if (!page) throw new Error("One of the selected variants does not belong to this step.");
    if (page.status !== "published" || !page.publishedRevisionNumber) {
      throw new Error(`Publish “${page.name}” before starting the test.`);
    }
    return { ...variant, page };
  });
  if (!selectedPages.some(({ page }) => page.isPrimary)) {
    throw new Error("Include the control page in the experiment.");
  }
  const [running] = await db
    .select({ id: funnelExperiments.id })
    .from(funnelExperiments)
    .where(and(
      eq(funnelExperiments.funnelStepId, step.id),
      eq(funnelExperiments.status, "running")
    ))
    .limit(1);
  if (running) throw new Error("This step already has a running experiment.");

  const experiment = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(funnelExperiments)
      .values({
        funnelStepId: step.id,
        name: parsed.name,
        status: "running" as FunnelExperimentStatus,
        goalEvent: parsed.goalEvent as FunnelExperimentGoal,
        startedAt: new Date(),
        createdByUserId: parsed.userId,
        updatedByUserId: parsed.userId
      })
      .returning();
    if (!created) throw new Error("Could not create the experiment.");
    await tx.insert(funnelExperimentVariants).values(
      selectedPages.map(({ page, weight }) => ({
        experimentId: created.id,
        funnelPageId: page.id,
        weight,
        isControl: page.isPrimary
      }))
    );
    return created;
  });
  return { experiment: await getAdminExperimentSummary(step.id) };
}

export async function completeAdminFunnelExperiment(
  input: z.input<typeof experimentMutationSchema>
) {
  const parsed = experimentMutationSchema.parse(input);
  await requireAdmin(parsed.userId);
  await getStepForFunnel(parsed.funnelId, parsed.stepId);
  const [updated] = await db
    .update(funnelExperiments)
    .set({
      status: "completed",
      endedAt: new Date(),
      updatedByUserId: parsed.userId,
      updatedAt: new Date()
    })
    .where(and(
      eq(funnelExperiments.id, parsed.experimentId),
      eq(funnelExperiments.funnelStepId, parsed.stepId)
    ))
    .returning({ id: funnelExperiments.id });
  if (!updated) throw new Error("Experiment not found.");
  return { experiment: await getAdminExperimentSummary(parsed.stepId) };
}

export async function promoteAdminFunnelExperimentWinner(
  input: z.input<typeof experimentMutationSchema>
) {
  const parsed = experimentMutationSchema.parse(input);
  if (!parsed.pageId) throw new Error("Choose a winning page.");
  await requireAdmin(parsed.userId);
  const funnel = await getFunnelRecord(parsed.funnelId);
  const step = await getStepForFunnel(funnel.id, parsed.stepId);
  const page = await getStepPage(step.id, parsed.pageId);
  const [variant] = await db
    .select({ id: funnelExperimentVariants.id })
    .from(funnelExperimentVariants)
    .where(and(
      eq(funnelExperimentVariants.experimentId, parsed.experimentId),
      eq(funnelExperimentVariants.funnelPageId, page.id)
    ))
    .limit(1);
  if (!variant) throw new Error("The selected page is not part of this experiment.");
  if (page.status !== "published" || !page.publishedRevisionNumber) {
    throw new Error("The winning page must be published.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(funnelPages)
      .set({ isPrimary: false, updatedByUserId: parsed.userId, updatedAt: new Date() })
      .where(eq(funnelPages.funnelStepId, step.id));
    await tx
      .update(funnelPages)
      .set({ isPrimary: true, updatedByUserId: parsed.userId, updatedAt: new Date() })
      .where(eq(funnelPages.id, page.id));
    await tx
      .update(funnelSteps)
      .set({
        sourceType: "generated",
        sourceRef: page.id,
        updatedByUserId: parsed.userId,
        updatedAt: new Date()
      })
      .where(eq(funnelSteps.id, step.id));
    await tx
      .update(funnelExperiments)
      .set({
        status: "completed",
        endedAt: new Date(),
        updatedByUserId: parsed.userId,
        updatedAt: new Date()
      })
      .where(eq(funnelExperiments.id, parsed.experimentId));
  });
  return { promoted: true, pageId: page.id };
}

async function resolveRunningExperimentPage(stepId: string, visitorId: string) {
  const [experiment] = await db
    .select()
    .from(funnelExperiments)
    .where(and(
      eq(funnelExperiments.funnelStepId, stepId),
      eq(funnelExperiments.status, "running")
    ))
    .limit(1);
  if (!experiment) return null;
  const variants = await db
    .select({
      id: funnelExperimentVariants.id,
      pageId: funnelExperimentVariants.funnelPageId,
      weight: funnelExperimentVariants.weight,
      pageStatus: funnelPages.status,
      publishedRevisionNumber: funnelPages.publishedRevisionNumber
    })
    .from(funnelExperimentVariants)
    .innerJoin(funnelPages, eq(funnelPages.id, funnelExperimentVariants.funnelPageId))
    .where(eq(funnelExperimentVariants.experimentId, experiment.id));
  const available = variants.filter(
    ({ pageStatus, publishedRevisionNumber }) =>
      pageStatus === "published" && Boolean(publishedRevisionNumber)
  );
  if (available.length < 2) return null;

  const [existing] = await db
    .select()
    .from(funnelVisitorAssignments)
    .where(and(
      eq(funnelVisitorAssignments.experimentId, experiment.id),
      eq(funnelVisitorAssignments.visitorId, visitorId)
    ))
    .limit(1);
  let selected = existing
    ? available.find(({ id }) => id === existing.experimentVariantId) ?? null
    : null;
  if (!selected) {
    selected = chooseWeightedFunnelVariant(visitorId, experiment.id, available);
    if (!selected) return null;
    await db
      .insert(funnelVisitorAssignments)
      .values({
        experimentId: experiment.id,
        experimentVariantId: selected.id,
        visitorId
      })
      .onConflictDoNothing();
    const [persisted] = await db
      .select()
      .from(funnelVisitorAssignments)
      .where(and(
        eq(funnelVisitorAssignments.experimentId, experiment.id),
        eq(funnelVisitorAssignments.visitorId, visitorId)
      ))
      .limit(1);
    if (persisted) {
      selected =
        available.find(({ id }) => id === persisted.experimentVariantId) ?? selected;
    }
  }
  return { experiment, variant: selected };
}

export async function recordPublicFunnelEvent(
  input: z.input<typeof publicEventSchema>
) {
  const parsed = publicEventSchema.parse(input);
  await validateFunnelAttribution({
    funnelId: parsed.funnelId,
    funnelSlug: (await getFunnelRecord(parsed.funnelId)).slug,
    stepId: parsed.stepId,
    pageId: parsed.pageId,
    revisionNumber: parsed.revisionNumber,
    visitorId: parsed.visitorId,
    experimentId: parsed.experimentId ?? null,
    experimentVariantId: parsed.experimentVariantId ?? null
  }, { requirePublishedRevision: true });
  await db
    .insert(funnelEvents)
    .values({
      eventId: parsed.eventId,
      funnelId: parsed.funnelId,
      funnelStepId: parsed.stepId,
      funnelPageId: parsed.pageId,
      funnelPageRevisionNumber: parsed.revisionNumber,
      experimentId: parsed.experimentId ?? null,
      experimentVariantId: parsed.experimentVariantId ?? null,
      visitorId: parsed.visitorId,
      eventType: parsed.eventType as FunnelEventType,
      metadataJson: parsed.metadata
    })
    .onConflictDoNothing();
  return { recorded: true };
}

export async function recordPublicCodeFunnelEvent(
  input: z.input<typeof publicCodeEventSchema>
) {
  const parsed = publicCodeEventSchema.parse(input);
  const funnel = await getFunnelRecord(parsed.funnelSlug);
  if (funnel.status !== "live") throw new Error("Funnel not found.");
  const steps = await db
    .select()
    .from(funnelSteps)
    .where(eq(funnelSteps.funnelId, funnel.id));
  const parent = steps.find((step) => step.slug === parsed.parentStepSlug);
  const variant = steps.find((step) => step.slug === parsed.variantStepSlug);
  if (!parent || !variant || parent.status !== "active" || variant.status !== "active") {
    throw new Error("Funnel step not found.");
  }
  const children = codeExperimentChildren(parent, steps);
  if (!children.some(({ id }) => id === variant.id)) {
    throw new Error("Funnel variant not found.");
  }
  await db
    .insert(funnelEvents)
    .values({
      eventId: parsed.eventId,
      funnelId: funnel.id,
      funnelStepId: variant.id,
      funnelPageId: null,
      funnelPageRevisionNumber: null,
      visitorId: parsed.visitorId,
      eventType: parsed.eventType as FunnelEventType,
      metadataJson: {
        ...parsed.metadata,
        codeExperimentParentStepId: parent.id,
        codeExperimentParentStepSlug: parent.slug
      }
    })
    .onConflictDoNothing();
  return { recorded: true };
}

export async function capturePublicFunnelLead(input: z.input<typeof publicLeadSchema>) {
  const parsed = publicLeadSchema.parse(input);
  const attribution: FunnelCheckoutAttribution = {
    funnelId: parsed.funnelId,
    funnelSlug: parsed.funnelSlug,
    stepId: parsed.stepId,
    pageId: parsed.pageId,
    revisionNumber: parsed.revisionNumber,
    visitorId: parsed.visitorId,
    experimentId: parsed.experimentId ?? null,
    experimentVariantId: parsed.experimentVariantId ?? null
  };
  await validateFunnelAttribution(attribution, { requirePublishedRevision: true });
  const lead = await upsertFunnelLead({
    attribution,
    email: parsed.email,
    firstName: parsed.firstName,
    attributionJson: parsed.attribution,
    triggerEvent: "lead_captured"
  });
  await db
    .insert(funnelEvents)
    .values({
      eventId: parsed.eventId,
      funnelId: parsed.funnelId,
      funnelStepId: parsed.stepId,
      funnelPageId: parsed.pageId,
      funnelPageRevisionNumber: parsed.revisionNumber,
      experimentId: parsed.experimentId ?? null,
      experimentVariantId: parsed.experimentVariantId ?? null,
      visitorId: parsed.visitorId,
      eventType: "lead_captured",
      metadataJson: {
        hasFirstName: Boolean(parsed.firstName)
      }
    })
    .onConflictDoNothing();
  return {
    captured: true,
    leadId: lead?.id ?? null,
    attribution
  };
}

async function recordStripeCodeFunnelSale(input: {
  checkoutSessionId: string;
  paymentIntentId?: string | null;
  email?: string | null;
  orderKind?: string | null;
  amountSubtotalCents?: number | null;
  amountTotalCents?: number | null;
  currency?: string | null;
  metadata: Record<string, string>;
  purchasedAt?: Date;
  test?: boolean;
}) {
  const funnelKey = input.metadata.funnelKey;
  const landingVariant = input.metadata.landingVariant;
  const visitorId = input.metadata.funnelVisitorId;
  if (
    funnelKey !== "first_grade_curriculum"
    || (landingVariant !== "a" && landingVariant !== "b")
    || !z.string().uuid().safeParse(visitorId).success
  ) {
    return { recorded: false, reason: "no_attribution" as const };
  }
  const funnel = await getFunnelRecord("first-grade-curriculum");
  const steps = await db.select().from(funnelSteps).where(eq(funnelSteps.funnelId, funnel.id));
  const parent = steps.find(({ slug }) => slug === "live-ab-landing-page");
  const variantSlug = landingVariant === "b"
    ? "variant-b-direct-response-page"
    : "variant-a-concise-visual-page";
  const variant = steps.find(({ slug }) => slug === variantSlug);
  if (!parent || !variant || !codeExperimentChildren(parent, steps).some(({ id }) => id === variant.id)) {
    return { recorded: false, reason: "no_attribution" as const };
  }
  const amountTotalCents = Math.max(0, Math.round(input.amountTotalCents ?? 0));
  const amountSubtotalCents = input.amountSubtotalCents == null
    ? null
    : Math.max(0, Math.round(input.amountSubtotalCents));
  const currency = String(input.currency || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid funnel sale currency.");
  const email = input.email?.trim().toLowerCase() || null;
  const purchasedAt = input.purchasedAt ?? new Date();
  const [sale] = await db.insert(funnelSales).values({
    funnelId: funnel.id,
    funnelSlug: funnel.slug,
    funnelName: funnel.name,
    visitorId,
    funnelStepId: variant.id,
    funnelPageId: null,
    funnelPageRevisionNumber: null,
    stripeCheckoutSessionId: input.checkoutSessionId,
    stripePaymentIntentId: input.paymentIntentId ?? null,
    email,
    orderKind: input.orderKind?.trim().slice(0, 100) || "unknown",
    amountSubtotalCents,
    amountTotalCents,
    currency,
    metadataJson: { test: input.test === true, codeExperiment: true },
    purchasedAt
  }).onConflictDoNothing().returning();
  if (!sale) return { recorded: false, reason: "duplicate" as const };
  await db.insert(funnelEvents).values({
    eventId: stableEventId("stripe-code-funnel-purchase", input.checkoutSessionId),
    funnelId: funnel.id,
    funnelStepId: variant.id,
    funnelPageId: null,
    funnelPageRevisionNumber: null,
    visitorId,
    eventType: "purchase",
    valueCents: amountTotalCents,
    currency,
    metadataJson: { checkoutSessionId: input.checkoutSessionId, codeExperiment: true },
    occurredAt: purchasedAt
  }).onConflictDoNothing();
  if (email) {
    const [existing] = await db.select().from(funnelLeads).where(and(
      eq(funnelLeads.funnelId, funnel.id),
      eq(funnelLeads.visitorId, visitorId)
    )).limit(1);
    const tags = Array.from(new Set([
      ...((existing?.tagsJson ?? []).filter((tag): tag is string => typeof tag === "string")),
      ...(await automationTags(funnel.id, "purchase"))
    ]));
    const values = {
      email,
      status: "customer" as const,
      lastFunnelStepId: variant.id,
      tagsJson: tags,
      convertedAt: existing?.convertedAt ?? purchasedAt,
      lastSeenAt: purchasedAt,
      updatedAt: purchasedAt
    };
    if (existing) {
      await db.update(funnelLeads).set(values).where(eq(funnelLeads.id, existing.id));
    } else {
      await db.insert(funnelLeads).values({
        funnelId: funnel.id,
        visitorId,
        ...values,
        firstFunnelStepId: variant.id,
        firstSeenAt: purchasedAt
      });
    }
  }
  return { recorded: true, saleId: sale.id };
}

export async function recordStripeFunnelSale(input: {
  checkoutSessionId: string;
  paymentIntentId?: string | null;
  email?: string | null;
  orderKind?: string | null;
  amountSubtotalCents?: number | null;
  amountTotalCents?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
  purchasedAt?: Date;
  test?: boolean;
}) {
  const attribution = checkoutMetadataAttribution(input.metadata);
  if (!attribution) {
    return recordStripeCodeFunnelSale({
      ...input,
      metadata: input.metadata ?? {}
    });
  }
  const context = await validateFunnelAttribution(attribution);
  const amountTotalCents = Math.max(0, Math.round(input.amountTotalCents ?? 0));
  const amountSubtotalCents = input.amountSubtotalCents == null
    ? null
    : Math.max(0, Math.round(input.amountSubtotalCents));
  const currency = String(input.currency || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Invalid funnel sale currency.");
  }
  const email = input.email?.trim().toLowerCase() || null;
  const purchasedAt = input.purchasedAt ?? new Date();
  const [sale] = await db
    .insert(funnelSales)
    .values({
      funnelId: context.funnelId,
      funnelSlug: context.funnelSlug,
      funnelName: context.funnelName,
      visitorId: attribution.visitorId,
      funnelStepId: attribution.stepId,
      funnelPageId: attribution.pageId,
      funnelPageRevisionNumber: attribution.revisionNumber,
      experimentId: attribution.experimentId ?? null,
      experimentVariantId: attribution.experimentVariantId ?? null,
      stripeCheckoutSessionId: input.checkoutSessionId,
      stripePaymentIntentId: input.paymentIntentId ?? null,
      email,
      orderKind: input.orderKind?.trim().slice(0, 100) || "unknown",
      amountSubtotalCents,
      amountTotalCents,
      currency,
      metadataJson: { test: input.test === true },
      purchasedAt
    })
    .onConflictDoNothing()
    .returning();
  if (!sale) return { recorded: false, reason: "duplicate" as const };

  await db
    .insert(funnelEvents)
    .values({
      eventId: stableEventId("stripe-funnel-purchase", input.checkoutSessionId),
      funnelId: context.funnelId,
      funnelStepId: attribution.stepId,
      funnelPageId: attribution.pageId,
      funnelPageRevisionNumber: attribution.revisionNumber,
      experimentId: attribution.experimentId ?? null,
      experimentVariantId: attribution.experimentVariantId ?? null,
      visitorId: attribution.visitorId,
      eventType: "purchase",
      valueCents: amountTotalCents,
      currency,
      metadataJson: {
        checkoutSessionId: input.checkoutSessionId,
        orderKind: input.orderKind ?? "unknown",
        test: input.test === true
      },
      occurredAt: purchasedAt
    })
    .onConflictDoNothing();
  if (email) {
    await upsertFunnelLead({
      attribution,
      email,
      status: "customer",
      metadataJson: { lastCheckoutSessionId: input.checkoutSessionId },
      triggerEvent: "purchase"
    });
  }
  return { recorded: true, saleId: sale.id };
}

export async function createAdminFunnelTestSale(input: {
  userId: string;
  funnelId: string;
  amountCents?: number;
}) {
  const parsed = z.object({
    userId: z.string().uuid(),
    funnelId: z.string().uuid(),
    amountCents: z.number().int().min(0).max(10_000_000).default(2700)
  }).parse(input);
  await requireAdmin(parsed.userId);
  if (!localFunnelTestSalesEnabled()) {
    throw new Error("Test sales are available only in local development.");
  }
  const funnel = await getFunnelRecord(parsed.funnelId);
  const [step] = await db
    .select()
    .from(funnelSteps)
    .where(and(
      eq(funnelSteps.funnelId, funnel.id),
      eq(funnelSteps.status, "active")
    ))
    .orderBy(desc(funnelSteps.isTopOfFunnel), asc(funnelSteps.displayOrder))
    .limit(1);
  if (!step) throw new Error("Activate at least one funnel step before recording a test sale.");
  const page = await getPrimaryPage(step.id);
  if (!page?.publishedRevisionNumber) {
    throw new Error("Publish the selected funnel step before recording a test sale.");
  }
  const visitorId = randomUUID();
  const checkoutSessionId = `local_test_${randomUUID()}`;
  const attribution: FunnelCheckoutAttribution = {
    funnelId: funnel.id,
    funnelSlug: funnel.slug,
    stepId: step.id,
    pageId: page.id,
    revisionNumber: page.publishedRevisionNumber,
    visitorId,
    experimentId: null,
    experimentVariantId: null
  };
  const result = await recordStripeFunnelSale({
    checkoutSessionId,
    email: `phase4-test+${Date.now()}@treehomeschool.local`,
    orderKind: "local_test",
    amountSubtotalCents: parsed.amountCents,
    amountTotalCents: parsed.amountCents,
    currency: "USD",
    metadata: funnelCheckoutMetadata(attribution),
    test: true
  });
  return { ...result, checkoutSessionId };
}

export async function getPublicFunnelPage(input: {
  funnelSlug: string;
  stepSlug?: string | null;
  visitorId?: string | null;
}) {
  const parsed = z.object({
    funnelSlug: z.string().trim().min(1).max(120),
    stepSlug: z.string().trim().max(120).optional().nullable(),
    visitorId: z.string().uuid().optional().nullable()
  }).parse(input);
  const funnel = await getFunnelRecord(parsed.funnelSlug);
  if (funnel.status !== "live") throw new Error("Funnel page not found.");
  const [step] = await db
    .select()
    .from(funnelSteps)
    .where(parsed.stepSlug
      ? and(
          eq(funnelSteps.funnelId, funnel.id),
          eq(funnelSteps.slug, normalizeFunnelSlug(parsed.stepSlug)),
          eq(funnelSteps.status, "active")
        )
      : and(
          eq(funnelSteps.funnelId, funnel.id),
          eq(funnelSteps.isTopOfFunnel, true),
          eq(funnelSteps.status, "active")
        ))
    .limit(1);
  if (!step) throw new Error("Funnel page not found.");
  const assignment = parsed.visitorId
    ? await resolveRunningExperimentPage(step.id, parsed.visitorId)
    : null;
  const page = assignment
    ? await getStepPage(step.id, assignment.variant.pageId)
    : await getPrimaryPage(step.id);
  if (page?.status !== "published" || !page.publishedRevisionNumber) {
    throw new Error("Funnel page not found.");
  }
  const revision = await getPublishedPageRevision(page.id, page.publishedRevisionNumber);
  if (!revision) throw new Error("Funnel page not found.");
  return presentManagedPage({
    funnel,
    step,
    page,
    revision,
    nextHref: await resolveNextStepHref(funnel, step),
    preview: false,
    experiment: assignment
      ? {
          id: assignment.experiment.id,
          name: assignment.experiment.name,
          goalEvent: assignment.experiment.goalEvent,
          variantId: assignment.variant.id
        }
      : null
  });
}
