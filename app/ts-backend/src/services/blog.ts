import { and, asc, desc, eq, inArray, max, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import {
  blogCategories,
  blogGenerationRuns,
  blogPostCategories,
  blogPostRevisions,
  blogPostSlugHistory,
  blogPosts,
  blogPostTags,
  blogTags,
  profiles
} from "ts-db";
import { db, env } from "../db";
import {
  deletePrivateFile,
  deletePrivateFilesByPrefix,
  downloadPrivateFile,
  getPrivateFileMetadata,
  getSignedPrivateUploadUrl
} from "./media";
import { normalizeGeminiUsage } from "./model-providers/gemini-usage";
import { recordModelUsage } from "./model-usage";

const BLOG_MODEL = "gemini-2.5-flash";
const BLOG_MODEL_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${BLOG_MODEL}:generateContent`;
const CONTENT_SCHEMA_VERSION = 1;
const BLOG_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const BLOG_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

type BlogTaxonomy = { categories?: string[]; tags?: string[] };
type BlogRevisionInput = BlogTaxonomy & {
  postId: string;
  userId: string;
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  seoTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  featuredImageUrl?: string | null;
  featuredImageAlt?: string | null;
  showAuthor?: boolean;
  primaryKeyword?: string | null;
  source?: "manual" | "ai" | "import";
  generationMetadata?: Record<string, unknown>;
  publish?: boolean;
};

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function slugify(value: string, fallback = "post") {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "") || fallback;
}

function normalizeUrl(value: unknown, max = 1000) {
  const url = cleanText(value, max);
  if (!url) return null;
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeList(values: string[] | undefined, maxItems: number) {
  return Array.from(new Map(
    (values ?? [])
      .map((value) => cleanText(value, 80))
      .filter(Boolean)
      .map((value) => [slugify(value, "topic"), value])
  ).values()).slice(0, maxItems);
}

export function sanitizeBlogHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [
      "p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "a",
      "blockquote", "code", "pre", "hr", "br", "figure", "figcaption", "img"
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        const external = /^https?:\/\//i.test(href);
        return {
          tagName,
          attribs: {
            ...attribs,
            ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})
          }
        };
      },
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, loading: "lazy" }
      })
    },
    exclusiveFilter: (frame) => frame.tag === "a" && !frame.attribs.href
  }).trim();
}

function htmlToText(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {}
  }).replace(/\s+/g, " ").trim();
}

function readingMinutes(text: string) {
  const words = text ? text.split(/\s+/).length : 0;
  return { wordCount: words, readingMinutes: Math.max(1, Math.ceil(words / 220)) };
}

async function requireAdmin(userId: string) {
  const [admin] = await db
    .select({ profileId: profiles.id, accountId: profiles.accountId, isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);
  if (!admin?.isAdmin) throw new Error("Administrator access is required.");
  return admin;
}

function normalizedImageType(value: unknown) {
  return String(value ?? "").toLowerCase().split(";", 1)[0].trim();
}

function validBlogImage(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function blogImageParts(objectPath: string) {
  const match = objectPath.match(/^blog-images\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/i);
  if (!match) throw new Error("The blog image upload is invalid.");
  return { postId: match[1]!, filename: match[2]! };
}

function blogImageUrl(objectPath: string) {
  const { postId, filename } = blogImageParts(objectPath);
  return `/api/blog/images/${postId}/${filename}`;
}

export async function prepareBlogImageUpload(input: {
  userId: string;
  postId: string;
  contentType: string;
  sizeBytes: number;
}) {
  await requireAdmin(input.userId);
  const [post] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.id, input.postId)).limit(1);
  if (!post) throw new Error("Blog post not found.");
  const contentType = normalizedImageType(input.contentType);
  const extension = BLOG_IMAGE_TYPES.get(contentType);
  if (!extension) throw new Error("Choose a JPEG, PNG, or WebP image.");
  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > BLOG_IMAGE_MAX_BYTES) {
    throw new Error("Blog images may be up to 10 MB.");
  }
  const objectPath = `blog-images/${input.postId}/${randomUUID()}.${extension}`;
  return {
    objectPath,
    contentType,
    uploadUrl: await getSignedPrivateUploadUrl({ objectPath, contentType, expiresInMinutes: 15 }),
    publicUrl: blogImageUrl(objectPath)
  };
}

export async function completeBlogImageUpload(input: {
  userId: string;
  postId: string;
  objectPath: string;
}) {
  await requireAdmin(input.userId);
  const parts = blogImageParts(input.objectPath);
  if (parts.postId !== input.postId) throw new Error("The blog image upload is invalid.");
  const metadata = await getPrivateFileMetadata(input.objectPath);
  const contentType = normalizedImageType(metadata.contentType);
  if (!BLOG_IMAGE_TYPES.has(contentType) || metadata.size <= 0 || metadata.size > BLOG_IMAGE_MAX_BYTES) {
    throw new Error("The uploaded file must be a JPEG, PNG, or WebP image up to 10 MB.");
  }
  const bytes = await downloadPrivateFile(input.objectPath);
  if (!validBlogImage(bytes, contentType)) throw new Error("The uploaded file does not appear to be a valid image.");
  return { objectPath: input.objectPath, publicUrl: blogImageUrl(input.objectPath), contentType, sizeBytes: metadata.size };
}

export async function discardBlogImageUpload(input: {
  userId: string;
  postId: string;
  objectPath: string;
}) {
  await requireAdmin(input.userId);
  const parts = blogImageParts(input.objectPath);
  if (parts.postId !== input.postId) throw new Error("The blog image upload is invalid.");
  await deletePrivateFile(input.objectPath);
  return { discarded: true };
}

export async function getBlogImage(input: { postId: string; filename: string }) {
  const objectPath = `blog-images/${input.postId}/${input.filename}`;
  blogImageParts(objectPath);
  const [post] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.id, input.postId)).limit(1);
  if (!post) throw new Error("Blog image not found.");
  const metadata = await getPrivateFileMetadata(objectPath);
  const contentType = normalizedImageType(metadata.contentType);
  if (!BLOG_IMAGE_TYPES.has(contentType)) throw new Error("Blog image not found.");
  return { bytes: await downloadPrivateFile(objectPath), contentType };
}

async function taxonomyForPosts(postIds: string[]) {
  if (!postIds.length) return new Map<string, { categories: Array<{ name: string; slug: string }>; tags: Array<{ name: string; slug: string }> }>();
  const [categoryRows, tagRows] = await Promise.all([
    db.select({ postId: blogPostCategories.postId, name: blogCategories.name, slug: blogCategories.slug })
      .from(blogPostCategories)
      .innerJoin(blogCategories, eq(blogCategories.id, blogPostCategories.categoryId))
      .where(inArray(blogPostCategories.postId, postIds))
      .orderBy(asc(blogCategories.name)),
    db.select({ postId: blogPostTags.postId, name: blogTags.name, slug: blogTags.slug })
      .from(blogPostTags)
      .innerJoin(blogTags, eq(blogTags.id, blogPostTags.tagId))
      .where(inArray(blogPostTags.postId, postIds))
      .orderBy(asc(blogTags.name))
  ]);
  const result = new Map<string, { categories: Array<{ name: string; slug: string }>; tags: Array<{ name: string; slug: string }> }>();
  for (const postId of postIds) result.set(postId, { categories: [], tags: [] });
  for (const row of categoryRows) result.get(row.postId)?.categories.push({ name: row.name, slug: row.slug });
  for (const row of tagRows) result.get(row.postId)?.tags.push({ name: row.name, slug: row.slug });
  return result;
}

async function authorNames(userIds: Array<string | null>) {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ userId: profiles.userId, firstName: profiles.firstName })
    .from(profiles)
    .where(and(inArray(profiles.userId, ids), eq(profiles.role, "PARENT")));
  return new Map(rows.filter((row) => row.userId).map((row) => [row.userId!, row.firstName]));
}

async function latestRevisionRows(postIds?: string[]) {
  const latest = db
    .select({ postId: blogPostRevisions.postId, revisionNumber: max(blogPostRevisions.revisionNumber).as("latest_revision_number") })
    .from(blogPostRevisions)
    .groupBy(blogPostRevisions.postId)
    .as("latest_blog_revisions");
  const condition = postIds?.length ? inArray(blogPosts.id, postIds) : undefined;
  return db.select({ post: blogPosts, revision: blogPostRevisions })
    .from(blogPosts)
    .innerJoin(latest, eq(latest.postId, blogPosts.id))
    .innerJoin(blogPostRevisions, and(
      eq(blogPostRevisions.postId, blogPosts.id),
      eq(blogPostRevisions.revisionNumber, latest.revisionNumber)
    ))
    .where(condition)
    .orderBy(desc(blogPosts.updatedAt));
}

function presentPost(row: { post: typeof blogPosts.$inferSelect; revision: typeof blogPostRevisions.$inferSelect }, taxonomy?: { categories: Array<{ name: string; slug: string }>; tags: Array<{ name: string; slug: string }> }, authorName?: string) {
  return {
    ...row.post,
    revision: {
      ...row.revision,
      ...readingMinutes(row.revision.contentText)
    },
    categories: taxonomy?.categories ?? [],
    tags: taxonomy?.tags ?? [],
    authorName: authorName || "Treeschool Editorial Team"
  };
}

export async function listAdminBlogPosts(userId: string) {
  await requireAdmin(userId);
  const rows = await latestRevisionRows();
  const taxonomy = await taxonomyForPosts(rows.map((row) => row.post.id));
  const authors = await authorNames(rows.map((row) => row.post.authorUserId));
  const categories = await db.select().from(blogCategories).orderBy(asc(blogCategories.name));
  return {
    posts: rows.map((row) => presentPost(row, taxonomy.get(row.post.id), row.post.authorUserId ? authors.get(row.post.authorUserId) : undefined)),
    categories
  };
}

export async function getAdminBlogPost(input: { userId: string; postId: string }) {
  await requireAdmin(input.userId);
  const rows = await latestRevisionRows([input.postId]);
  const row = rows[0];
  if (!row) throw new Error("Blog post not found.");
  const taxonomy = await taxonomyForPosts([input.postId]);
  const authors = await authorNames([row.post.authorUserId]);
  const categories = await db.select().from(blogCategories).orderBy(asc(blogCategories.name));
  return {
    post: presentPost(row, taxonomy.get(input.postId), row.post.authorUserId ? authors.get(row.post.authorUserId) : undefined),
    categories
  };
}

async function availableSlug(desired: string, postId?: string) {
  const base = slugify(desired);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [post, history] = await Promise.all([
      db.select({ id: blogPosts.id }).from(blogPosts).where(and(
        sql`lower(${blogPosts.slug}) = ${candidate}`,
        postId ? ne(blogPosts.id, postId) : undefined
      )).limit(1),
      db.select({ postId: blogPostSlugHistory.postId }).from(blogPostSlugHistory)
        .where(sql`lower(${blogPostSlugHistory.slug}) = ${candidate}`).limit(1)
    ]);
    if (!post[0] && (!history[0] || history[0].postId === postId)) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

async function replaceTaxonomy(postId: string, categories: string[], tags: string[]) {
  const categoryIds: string[] = [];
  for (const name of normalizeList(categories, 4)) {
    const slug = slugify(name, "category");
    await db.insert(blogCategories).values({ name, slug }).onConflictDoNothing();
    const [category] = await db.select({ id: blogCategories.id }).from(blogCategories)
      .where(sql`lower(${blogCategories.slug}) = ${slug}`).limit(1);
    if (category) categoryIds.push(category.id);
  }
  const tagIds: string[] = [];
  for (const name of normalizeList(tags, 12)) {
    const slug = slugify(name, "tag");
    await db.insert(blogTags).values({ name, slug }).onConflictDoNothing();
    const [tag] = await db.select({ id: blogTags.id }).from(blogTags)
      .where(sql`lower(${blogTags.slug}) = ${slug}`).limit(1);
    if (tag) tagIds.push(tag.id);
  }
  await db.transaction(async (tx) => {
    await tx.delete(blogPostCategories).where(eq(blogPostCategories.postId, postId));
    await tx.delete(blogPostTags).where(eq(blogPostTags.postId, postId));
    if (categoryIds.length) await tx.insert(blogPostCategories).values(categoryIds.map((categoryId) => ({ postId, categoryId })));
    if (tagIds.length) await tx.insert(blogPostTags).values(tagIds.map((tagId) => ({ postId, tagId })));
  });
}

export async function createManualBlogPost(input: { userId: string; title?: string }) {
  await requireAdmin(input.userId);
  const title = cleanText(input.title, 180) || "Untitled blog post";
  const slug = await availableSlug(title === "Untitled blog post" ? `draft-${Date.now()}` : title);
  const [post] = await db.insert(blogPosts).values({
    slug,
    authorUserId: input.userId
  }).returning({ id: blogPosts.id });
  await db.insert(blogPostRevisions).values({
    postId: post!.id,
    revisionNumber: 1,
    title,
    excerpt: "",
    contentHtml: "<p>Start writing your article here.</p>",
    contentText: "Start writing your article here.",
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    showAuthor: false,
    source: "manual",
    createdByUserId: input.userId
  });
  return { postId: post!.id };
}

export async function saveBlogPostRevision(input: BlogRevisionInput) {
  await requireAdmin(input.userId);
  const [existing] = await db.select().from(blogPosts).where(eq(blogPosts.id, input.postId)).limit(1);
  if (!existing) throw new Error("Blog post not found.");
  const title = cleanText(input.title, 180);
  if (!title) throw new Error("Enter a post title.");
  const excerpt = cleanText(input.excerpt, 500);
  const contentHtml = sanitizeBlogHtml(input.contentHtml);
  const contentText = htmlToText(contentHtml);
  if (!contentText) throw new Error("Add article content before saving.");
  if (input.publish && contentText === "Start writing your article here.") {
    throw new Error("Replace the starter text before publishing.");
  }
  const slug = await availableSlug(input.slug || title, input.postId);
  const seoTitle = cleanText(input.seoTitle, 70) || null;
  const metaDescription = cleanText(input.metaDescription, 170) || null;
  const canonicalUrl = normalizeUrl(input.canonicalUrl);
  const featuredImageUrl = normalizeUrl(input.featuredImageUrl);
  const featuredImageAlt = cleanText(input.featuredImageAlt, 180) || null;
  const showAuthor = input.showAuthor ?? false;
  const primaryKeyword = cleanText(input.primaryKeyword, 120) || null;
  const saved = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.postId}))`);
    const [latest] = await tx.select({ value: max(blogPostRevisions.revisionNumber) })
      .from(blogPostRevisions).where(eq(blogPostRevisions.postId, input.postId));
    const revisionNumber = Number(latest?.value ?? 0) + 1;
    if (existing.slug !== slug) {
      await tx.insert(blogPostSlugHistory).values({ postId: input.postId, slug: existing.slug }).onConflictDoNothing();
    }
    await tx.update(blogPosts).set({
      slug,
      authorUserId: existing.authorUserId ?? input.userId,
      status: input.publish ? "published" : existing.status === "published" ? "published" : "draft",
      publishedRevisionNumber: input.publish ? revisionNumber : existing.publishedRevisionNumber,
      publishedAt: input.publish ? existing.publishedAt ?? new Date() : existing.publishedAt,
      scheduledFor: null,
      archivedAt: null,
      updatedAt: new Date()
    }).where(eq(blogPosts.id, input.postId));
    await tx.insert(blogPostRevisions).values({
      postId: input.postId,
      revisionNumber,
      title,
      excerpt,
      contentHtml,
      contentText,
      contentSchemaVersion: CONTENT_SCHEMA_VERSION,
      seoTitle,
      metaDescription,
      canonicalUrl,
      featuredImageUrl,
      featuredImageAlt,
      showAuthor,
      primaryKeyword,
      source: input.source ?? "manual",
      generationMetadataJson: input.generationMetadata ?? {},
      createdByUserId: input.userId
    });
    return { revisionNumber };
  });
  await replaceTaxonomy(input.postId, input.categories ?? [], input.tags ?? []);
  return { postId: input.postId, slug, ...saved, published: Boolean(input.publish) };
}

export async function unpublishBlogPost(input: { userId: string; postId: string }) {
  await requireAdmin(input.userId);
  await db.update(blogPosts).set({ status: "draft", scheduledFor: null, updatedAt: new Date() })
    .where(eq(blogPosts.id, input.postId));
  return { unpublished: true };
}

export async function deleteBlogPost(input: { userId: string; postId: string }) {
  await requireAdmin(input.userId);
  const [deleted] = await db.delete(blogPosts)
    .where(eq(blogPosts.id, input.postId))
    .returning({ id: blogPosts.id, slug: blogPosts.slug });
  if (!deleted) throw new Error("Blog post not found.");
  let storageCleanupSucceeded = true;
  try {
    await deletePrivateFilesByPrefix(`blog-images/${input.postId}/`);
  } catch (error) {
    storageCleanupSucceeded = false;
    console.warn("Blog post was deleted, but its stored images could not be cleaned up.", error);
  }
  return { deleted: true, slug: deleted.slug, storageCleanupSucceeded };
}

const aiDraftSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z.string().trim().max(120).optional(),
  excerpt: z.string().trim().min(1).max(500),
  contentHtml: z.string().trim().min(300).max(100_000),
  seoTitle: z.string().trim().max(70),
  metaDescription: z.string().trim().max(170),
  primaryKeyword: z.string().trim().max(120),
  categories: z.array(z.string().trim().min(1).max(80)).max(4).default([]),
  tags: z.array(z.string().trim().min(1).max(80)).max(12).default([])
});

function parseGeminiJson(payload: unknown) {
  const text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("AI writing returned an empty response.");
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as unknown;
}

export async function generateBlogDraft(input: {
  userId: string;
  postId?: string | null;
  topic: string;
  audience?: string;
  primaryKeyword?: string;
  angle?: string;
  desiredLength?: "short" | "standard" | "deep";
}) {
  const admin = await requireAdmin(input.userId);
  if (!env.GOOGLE_AI_API_KEY) throw new Error("AI blog writing is not configured.");
  const topic = cleanText(input.topic, 500);
  if (!topic) throw new Error("Describe the article you want to write.");
  const brief = {
    topic,
    audience: cleanText(input.audience, 240) || "homeschool parents",
    primaryKeyword: cleanText(input.primaryKeyword, 120) || topic,
    angle: cleanText(input.angle, 600),
    desiredLength: input.desiredLength ?? "standard"
  };
  const [run] = await db.insert(blogGenerationRuns).values({
    postId: input.postId || null,
    requestedByUserId: input.userId,
    provider: "google",
    model: BLOG_MODEL,
    briefJson: brief
  }).returning({ id: blogGenerationRuns.id });
  const targetWords = brief.desiredLength === "short" ? 800 : brief.desiredLength === "deep" ? 2200 : 1400;
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${BLOG_MODEL_ENDPOINT}?key=${env.GOOGLE_AI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: [
          "You are the senior human-guided editor for Treeschool, a paper-first homeschool planning platform.",
          `Write an original, useful article of about ${targetWords} words for ${brief.audience}.`,
          `Topic: ${brief.topic}`,
          `Primary search phrase: ${brief.primaryKeyword}`,
          brief.angle ? `Editorial angle and facts supplied by the editor: ${brief.angle}` : "",
          "Optimize for genuine reader value and search discovery without keyword stuffing or clickbait.",
          "Do not invent statistics, studies, rankings, testimonials, laws, or quotations. Never claim Treeschool provides a feature unless it follows from this brief.",
          "The article body must be clean semantic HTML using only p, h2, h3, ul, ol, li, strong, em, blockquote, and a tags. Do not include an h1; the title is rendered separately.",
          "Where contextually useful, link internally with relative URLs to /pricing, /homeschool-lesson-plan-generator, /bookstore, or /blog. Use descriptive anchor text.",
          "Return JSON with title, slug, excerpt, contentHtml, seoTitle, metaDescription, primaryKeyword, categories, and tags. Meta description should be compelling and approximately 150-160 characters."
        ].filter(Boolean).join("\n\n") }] }],
        generationConfig: { temperature: 0.55, responseMimeType: "application/json" }
      })
    });
    const requestId = response.headers.get("x-goog-request-id") ?? response.headers.get("x-request-id");
    if (!response.ok) throw new Error(`AI writing failed (${response.status}).`);
    const payload = await response.json();
    const usage = normalizeGeminiUsage(payload);
    const draft = aiDraftSchema.parse(parseGeminiJson(payload));
    const postId = input.postId
      || (await createManualBlogPost({ userId: input.userId, title: draft.title })).postId;
    const currentRevision = input.postId ? (await latestRevisionRows([input.postId]))[0]?.revision : null;
    const saved = await saveBlogPostRevision({
      userId: input.userId,
      postId,
      title: draft.title,
      slug: draft.slug || draft.title,
      excerpt: draft.excerpt,
      contentHtml: draft.contentHtml,
      seoTitle: draft.seoTitle,
      metaDescription: draft.metaDescription,
      showAuthor: currentRevision?.showAuthor ?? false,
      primaryKeyword: draft.primaryKeyword,
      categories: draft.categories,
      tags: draft.tags,
      source: "ai",
      generationMetadata: { generationRunId: run!.id, provider: "google", model: BLOG_MODEL }
    });
    await db.update(blogGenerationRuns).set({
      postId,
      status: "succeeded",
      providerRequestId: requestId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      durationMs: Date.now() - startedAt,
      outputRevisionNumber: saved.revisionNumber,
      providerUsageJson: usage.providerUsageJson,
      completedAt: new Date()
    }).where(eq(blogGenerationRuns.id, run!.id));
    await recordModelUsage({
      context: { accountId: admin.accountId },
      feature: "blog",
      operation: "draft_article",
      provider: "google",
      model: BLOG_MODEL,
      status: "succeeded",
      providerRequestId: requestId,
      durationMs: Date.now() - startedAt,
      usage
    });
    return { postId, generationRunId: run!.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI writing failed.";
    await db.update(blogGenerationRuns).set({
      status: error instanceof z.ZodError || error instanceof SyntaxError ? "invalid_response" : "failed",
      errorMessage: message.slice(0, 1000),
      durationMs: Date.now() - startedAt,
      completedAt: new Date()
    }).where(eq(blogGenerationRuns.id, run!.id));
    await recordModelUsage({
      context: { accountId: admin.accountId },
      feature: "blog",
      operation: "draft_article",
      provider: "google",
      model: BLOG_MODEL,
      status: error instanceof z.ZodError || error instanceof SyntaxError ? "invalid_response" : "failed",
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof Error ? error.name : "generation_error"
    });
    throw new Error(message);
  }
}

async function publishedRows(categorySlug?: string | null) {
  const conditions = [
    eq(blogPosts.status, "published"),
    sql`${blogPosts.publishedAt} <= now()`,
    eq(blogPostRevisions.revisionNumber, blogPosts.publishedRevisionNumber)
  ];
  if (categorySlug) {
    conditions.push(sql`exists (
      select 1 from blog_post_categories bpc
      join blog_categories bc on bc.id = bpc.category_id
      where bpc.post_id = ${blogPosts.id} and lower(bc.slug) = ${categorySlug.toLowerCase()}
    )`);
  }
  return db.select({ post: blogPosts, revision: blogPostRevisions })
    .from(blogPosts)
    .innerJoin(blogPostRevisions, eq(blogPostRevisions.postId, blogPosts.id))
    .where(and(...conditions))
    .orderBy(desc(blogPosts.publishedAt));
}

export async function listPublishedBlogPosts(input?: { category?: string | null; limit?: number }) {
  const rows = (await publishedRows(input?.category)).slice(0, Math.min(100, Math.max(1, input?.limit ?? 50)));
  const taxonomy = await taxonomyForPosts(rows.map((row) => row.post.id));
  const authors = await authorNames(rows.map((row) => row.post.authorUserId));
  return rows.map((row) => presentPost(
    row,
    taxonomy.get(row.post.id),
    row.revision.showAuthor && row.post.authorUserId ? authors.get(row.post.authorUserId) : undefined
  ));
}

export async function getPublishedBlogPost(slug: string) {
  const normalized = slugify(slug);
  let [row] = await db.select({ post: blogPosts, revision: blogPostRevisions })
    .from(blogPosts)
    .innerJoin(blogPostRevisions, and(
      eq(blogPostRevisions.postId, blogPosts.id),
      eq(blogPostRevisions.revisionNumber, blogPosts.publishedRevisionNumber)
    ))
    .where(and(
      sql`lower(${blogPosts.slug}) = ${normalized}`,
      eq(blogPosts.status, "published"),
      sql`${blogPosts.publishedAt} <= now()`
    )).limit(1);
  if (!row) {
    const [history] = await db.select({ currentSlug: blogPosts.slug })
      .from(blogPostSlugHistory)
      .innerJoin(blogPosts, eq(blogPosts.id, blogPostSlugHistory.postId))
      .where(and(
        sql`lower(${blogPostSlugHistory.slug}) = ${normalized}`,
        eq(blogPosts.status, "published")
      )).limit(1);
    if (history) return { redirectTo: history.currentSlug, post: null, related: [] };
    return null;
  }
  const taxonomy = await taxonomyForPosts([row.post.id]);
  const authors = await authorNames([row.post.authorUserId]);
  const post = presentPost(
    row,
    taxonomy.get(row.post.id),
    row.revision.showAuthor && row.post.authorUserId ? authors.get(row.post.authorUserId) : undefined
  );
  const relatedRows = (await publishedRows()).filter((candidate) => candidate.post.id !== row.post.id).slice(0, 3);
  const relatedTaxonomy = await taxonomyForPosts(relatedRows.map((candidate) => candidate.post.id));
  const relatedAuthors = await authorNames(relatedRows.map((candidate) => candidate.post.authorUserId));
  return {
    redirectTo: null,
    post,
    related: relatedRows.map((candidate) => presentPost(
      candidate,
      relatedTaxonomy.get(candidate.post.id),
      candidate.revision.showAuthor && candidate.post.authorUserId ? relatedAuthors.get(candidate.post.authorUserId) : undefined
    ))
  };
}

export async function getAdminBlogPreview(input: { userId: string; postId: string }) {
  return (await getAdminBlogPost(input)).post;
}
