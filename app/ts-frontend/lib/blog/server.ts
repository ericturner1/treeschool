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

export type BlogCategory = { id?: string; name: string; slug: string; description?: string | null };
export type BlogTag = { name: string; slug: string };

export type BlogPost = {
  id: string;
  slug: string;
  status: "draft" | "published" | "scheduled" | "archived";
  languageCode: string;
  authorUserId: string | null;
  publishedRevisionNumber: number | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  categories: BlogCategory[];
  tags: BlogTag[];
  revision: {
    id: string;
    postId: string;
    revisionNumber: number;
    title: string;
    excerpt: string;
    contentHtml: string;
    contentText: string;
    bodyFontSizePx: number | null;
    bodyLineHeight: number | null;
    contentSchemaVersion: number;
    seoTitle: string | null;
    metaDescription: string | null;
    canonicalUrl: string | null;
    featuredImageUrl: string | null;
    featuredImageAlt: string | null;
    showAuthor: boolean;
    primaryKeyword: string | null;
    source: "manual" | "ai" | "import";
    generationMetadataJson: Record<string, unknown>;
    createdByUserId: string | null;
    createdAt: string;
    wordCount: number;
    readingMinutes: number;
  };
};

export async function listAdminBlogPosts(userId: string) {
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/blog/admin?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  ), "Could not load blog administration.");
  return response.json() as Promise<{ posts: BlogPost[]; categories: BlogCategory[] }>;
}

export async function getAdminBlogPost(userId: string, postId: string) {
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/blog/admin/post?userId=${encodeURIComponent(userId)}&postId=${encodeURIComponent(postId)}`,
    { cache: "no-store" }
  ), "Could not load the blog post.");
  return response.json() as Promise<{ post: BlogPost; categories: BlogCategory[] }>;
}

export async function getAdminBlogPreview(userId: string, postId: string) {
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/blog/admin/preview?userId=${encodeURIComponent(userId)}&postId=${encodeURIComponent(postId)}`,
    { cache: "no-store" }
  ), "Could not preview the blog post.");
  return response.json() as Promise<{ post: BlogPost }>;
}

export function createManualBlogPost(input: { userId: string; title?: string }) {
  return postJson<{ postId: string }>("/internal/blog/admin/create", input, "Could not create the blog post.");
}

export function saveBlogPost(input: Record<string, unknown>) {
  return postJson<{ postId: string; slug: string; revisionNumber: number; published: boolean }>(
    "/internal/blog/admin/save", input, "Could not save the blog post."
  );
}

export function generateBlogDraft(input: Record<string, unknown>) {
  return postJson<{ postId: string; generationRunId: string }>(
    "/internal/blog/admin/generate", input, "Could not generate the blog draft."
  );
}

export function unpublishBlogPost(input: { userId: string; postId: string }) {
  return postJson<{ unpublished: boolean }>(
    "/internal/blog/admin/unpublish", input, "Could not unpublish the blog post."
  );
}

export function deleteBlogPost(input: { userId: string; postId: string }) {
  return postJson<{ deleted: boolean; slug: string; storageCleanupSucceeded: boolean }>(
    "/internal/blog/admin/delete", input, "Could not delete the blog post."
  );
}

export function prepareBlogImageUpload(input: {
  userId: string;
  postId: string;
  contentType: string;
  sizeBytes: number;
}) {
  return postJson<{ objectPath: string; contentType: string; uploadUrl: string; publicUrl: string }>(
    "/internal/blog/admin/image/prepare", input, "Could not prepare the blog image upload."
  );
}

export function completeBlogImageUpload(input: { userId: string; postId: string; objectPath: string }) {
  return postJson<{ objectPath: string; publicUrl: string; contentType: string; sizeBytes: number }>(
    "/internal/blog/admin/image/complete", input, "Could not save the blog image."
  );
}

export function discardBlogImageUpload(input: { userId: string; postId: string; objectPath: string }) {
  return postJson<{ discarded: boolean }>(
    "/internal/blog/admin/image/discard", input, "Could not discard the blog image upload."
  );
}

export function getBlogImageResponse(input: { postId: string; filename: string }) {
  const query = new URLSearchParams({ postId: input.postId, filename: input.filename });
  return backendFetch(`${getBackendUrl()}/internal/blog/image?${query}`, { cache: "force-cache" });
}

export async function listPublishedBlogPosts(input?: { category?: string | null; limit?: number }) {
  const query = new URLSearchParams();
  if (input?.category) query.set("category", input.category);
  if (input?.limit) query.set("limit", String(input.limit));
  const response = await requireOk(await backendFetch(
    `${getBackendUrl()}/internal/blog/posts?${query}`,
    { next: { revalidate: 300, tags: ["blog:published"] } }
  ), "Could not load blog posts.");
  return response.json() as Promise<{ posts: BlogPost[] }>;
}

export async function getPublishedBlogPost(slug: string) {
  const response = await backendFetch(
    `${getBackendUrl()}/internal/blog/post?slug=${encodeURIComponent(slug)}`,
    { next: { revalidate: 300, tags: ["blog:published", `blog:post:${slug}`] } }
  );
  if (response.status === 404) return null;
  await requireOk(response, "Could not load the blog post.");
  return response.json() as Promise<{ redirectTo: string | null; post: BlogPost | null; related: BlogPost[] }>;
}
