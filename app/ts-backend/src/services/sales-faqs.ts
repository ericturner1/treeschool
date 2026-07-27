import { and, asc, eq, max, sql } from "drizzle-orm";
import { z } from "zod";
import { profiles, salesFaqs } from "ts-db";
import { db } from "../db";

export const SALES_FAQ_CATEGORIES = [
  "printing",
  "learning",
  "planning",
  "curriculum",
  "account",
  "policy",
  "general"
] as const;

const faqInputSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  question: z.string().trim().min(5).max(240),
  answer: z.string().trim().min(20).max(5000),
  shortAnswer: z.string().trim().max(360).optional().nullable(),
  category: z.enum(SALES_FAQ_CATEGORIES).default("general"),
  sourceLinks: z.array(z.string().trim().url()).max(6).default([]),
  isPublished: z.boolean().default(false),
  bandEligible: z.boolean().default(false)
});

async function requireAdmin(userId: string) {
  const [admin] = await db
    .select({ profileId: profiles.id, isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);
  if (!admin?.isAdmin) throw new Error("Administrator access is required.");
  return admin;
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110)
    .replace(/-+$/g, "") || "question";
}

function normalizeParagraphs(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function normalizeSources(values: string[]) {
  return Array.from(new Set(values.map((value) => {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Evidence links must use http or https.");
    }
    return parsed.toString();
  })));
}

async function uniqueSlug(question: string) {
  const base = slugify(question);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const [existing] = await db
      .select({ id: salesFaqs.id })
      .from(salesFaqs)
      .where(sql`lower(${salesFaqs.slug}) = ${candidate}`)
      .limit(1);
    if (!existing) return candidate;
  }
  throw new Error("Could not create a unique FAQ link.");
}

function presentFaq(faq: typeof salesFaqs.$inferSelect) {
  return {
    id: faq.id,
    slug: faq.slug,
    question: faq.question,
    answer: faq.answer,
    shortAnswer: faq.shortAnswer,
    category: faq.category,
    sourceLinks: Array.isArray(faq.sourceLinks) ? faq.sourceLinks : [],
    displayOrder: faq.displayOrder,
    isPublished: faq.isPublished,
    bandEligible: faq.bandEligible,
    createdAt: faq.createdAt.toISOString(),
    updatedAt: faq.updatedAt.toISOString()
  };
}

export async function listPublishedSalesFaqs() {
  const faqs = await db
    .select()
    .from(salesFaqs)
    .where(eq(salesFaqs.isPublished, true))
    .orderBy(asc(salesFaqs.displayOrder), asc(salesFaqs.createdAt));
  return faqs.map(presentFaq);
}

export async function listAdminSalesFaqs(userId: string) {
  await requireAdmin(userId);
  const faqs = await db
    .select()
    .from(salesFaqs)
    .orderBy(asc(salesFaqs.displayOrder), asc(salesFaqs.createdAt));
  return { faqs: faqs.map(presentFaq), categories: SALES_FAQ_CATEGORIES };
}

export async function saveSalesFaq(input: z.input<typeof faqInputSchema>) {
  const parsed = faqInputSchema.parse(input);
  await requireAdmin(parsed.userId);
  const answer = normalizeParagraphs(parsed.answer);
  const shortAnswer = parsed.shortAnswer?.trim() || null;
  const sourceLinks = normalizeSources(parsed.sourceLinks);

  if (parsed.id) {
    const [updated] = await db
      .update(salesFaqs)
      .set({
        question: parsed.question,
        answer,
        shortAnswer,
        category: parsed.category,
        sourceLinks,
        isPublished: parsed.isPublished,
        bandEligible: parsed.bandEligible,
        updatedByUserId: parsed.userId,
        updatedAt: new Date()
      })
      .where(eq(salesFaqs.id, parsed.id))
      .returning();
    if (!updated) throw new Error("FAQ not found.");
    return { faq: presentFaq(updated) };
  }

  const [{ highestOrder }] = await db
    .select({ highestOrder: max(salesFaqs.displayOrder) })
    .from(salesFaqs);
  const [created] = await db
    .insert(salesFaqs)
    .values({
      slug: await uniqueSlug(parsed.question),
      question: parsed.question,
      answer,
      shortAnswer,
      category: parsed.category,
      sourceLinks,
      displayOrder: Number(highestOrder ?? 0) + 10,
      isPublished: parsed.isPublished,
      bandEligible: parsed.bandEligible,
      createdByUserId: parsed.userId,
      updatedByUserId: parsed.userId
    })
    .returning();
  if (!created) throw new Error("Could not create the FAQ.");
  return { faq: presentFaq(created) };
}

export async function reorderSalesFaqs(input: { userId: string; orderedIds: string[] }) {
  const parsed = z.object({
    userId: z.string().uuid(),
    orderedIds: z.array(z.string().uuid()).max(200)
  }).parse(input);
  await requireAdmin(parsed.userId);
  const uniqueIds = Array.from(new Set(parsed.orderedIds));
  const existing = await db.select({ id: salesFaqs.id }).from(salesFaqs);
  if (uniqueIds.length !== existing.length || existing.some(({ id }) => !uniqueIds.includes(id))) {
    throw new Error("The FAQ order is out of date. Refresh and try again.");
  }
  await db.transaction(async (tx) => {
    for (const [index, id] of uniqueIds.entries()) {
      await tx
        .update(salesFaqs)
        .set({
          displayOrder: (index + 1) * 10,
          updatedByUserId: parsed.userId,
          updatedAt: new Date()
        })
        .where(eq(salesFaqs.id, id));
    }
  });
  return { reordered: true };
}

export async function deleteSalesFaq(input: { userId: string; id: string }) {
  const parsed = z.object({
    userId: z.string().uuid(),
    id: z.string().uuid()
  }).parse(input);
  await requireAdmin(parsed.userId);
  const [deleted] = await db
    .delete(salesFaqs)
    .where(eq(salesFaqs.id, parsed.id))
    .returning({ id: salesFaqs.id });
  if (!deleted) throw new Error("FAQ not found.");
  return { deleted: true };
}
