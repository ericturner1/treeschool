"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  createManualBlogPost,
  deleteBlogPost,
  generateBlogDraft,
  saveBlogPost,
  unpublishBlogPost
} from "../../../lib/blog/server";
import { getCurrentUser } from "../../../lib/auth/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function values(formData: FormData, key: string) {
  return formData.getAll(key).map(String).map((item) => item.trim()).filter(Boolean);
}

function optionalNumber(formData: FormData, key: string) {
  const raw = value(formData, key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function redirectWithError(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/blog");
  return { ...user, id: user.id };
}

export async function createManualBlogPostAction(formData: FormData) {
  const user = await requireUser();
  let result: Awaited<ReturnType<typeof createManualBlogPost>>;
  try {
    result = await createManualBlogPost({ userId: user.id, title: value(formData, "title") });
  } catch (error) {
    redirectWithError("/admin/blog/new", error);
  }
  redirect(`/admin/blog/${result.postId}?message=${encodeURIComponent("Draft created. Start writing when you’re ready.")}`);
}

export async function generateBlogDraftAction(formData: FormData) {
  const user = await requireUser();
  const postId = value(formData, "postId") || null;
  let result: Awaited<ReturnType<typeof generateBlogDraft>>;
  try {
    result = await generateBlogDraft({
      userId: user.id,
      postId,
      topic: value(formData, "topic"),
      audience: value(formData, "audience"),
      primaryKeyword: value(formData, "primaryKeyword"),
      angle: value(formData, "angle"),
      desiredLength: value(formData, "desiredLength") || "standard"
    });
  } catch (error) {
    redirectWithError(postId ? `/admin/blog/${postId}` : "/admin/blog/new", error);
  }
  revalidatePath("/admin/blog");
  redirect(`/admin/blog/${result.postId}?message=${encodeURIComponent("AI draft created. Review every claim, link, and recommendation before publishing.")}`);
}

export async function saveBlogPostAction(formData: FormData) {
  const user = await requireUser();
  const postId = value(formData, "postId");
  const publish = value(formData, "intent") === "publish";
  let result: Awaited<ReturnType<typeof saveBlogPost>>;
  try {
    result = await saveBlogPost({
      userId: user.id,
      postId,
      title: value(formData, "title"),
      slug: value(formData, "slug"),
      excerpt: value(formData, "excerpt"),
      contentHtml: value(formData, "contentHtml"),
      bodyFontSizePx: optionalNumber(formData, "bodyFontSizePx"),
      bodyLineHeight: optionalNumber(formData, "bodyLineHeight"),
      seoTitle: value(formData, "seoTitle"),
      metaDescription: value(formData, "metaDescription"),
      canonicalUrl: value(formData, "canonicalUrl"),
      featuredImageUrl: value(formData, "featuredImageUrl"),
      featuredImageAlt: value(formData, "featuredImageAlt"),
      showAuthor: formData.has("showAuthor"),
      primaryKeyword: value(formData, "primaryKeyword"),
      categories: values(formData, "categories"),
      tags: value(formData, "tags").split(",").map((item) => item.trim()).filter(Boolean),
      source: "manual",
      publish
    });
  } catch (error) {
    redirectWithError(`/admin/blog/${postId}`, error);
  }
  revalidatePath("/blog");
  revalidatePath(`/blog/${result.slug}`);
  revalidatePath("/blog/rss.xml");
  revalidatePath("/sitemap.xml");
  revalidateTag("blog:published");
  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${postId}`);
  const publishedQuery = publish ? `&published=${encodeURIComponent(result.slug)}` : "";
  redirect(`/admin/blog/${postId}?message=${encodeURIComponent(publish ? "Post published." : "Draft saved as a new revision.")}${publishedQuery}`);
}

export async function unpublishBlogPostAction(formData: FormData) {
  const user = await requireUser();
  const postId = value(formData, "postId");
  try {
    await unpublishBlogPost({ userId: user.id, postId });
  } catch (error) {
    redirectWithError(`/admin/blog/${postId}`, error);
  }
  revalidatePath("/blog");
  revalidatePath("/blog/rss.xml");
  revalidatePath("/sitemap.xml");
  revalidateTag("blog:published");
  revalidatePath("/admin/blog");
  redirect(`/admin/blog/${postId}?message=${encodeURIComponent("Post returned to draft. Its published URL is no longer public.")}`);
}

export async function deleteBlogPostAction(formData: FormData) {
  const user = await requireUser();
  const postId = value(formData, "postId");
  try {
    await deleteBlogPost({ userId: user.id, postId });
  } catch (error) {
    redirectWithError(`/admin/blog/${postId}`, error);
  }
  revalidatePath("/blog");
  revalidatePath("/blog/rss.xml");
  revalidatePath("/sitemap.xml");
  revalidateTag("blog:published");
  revalidatePath("/admin/blog");
  redirect(`/admin/blog?message=${encodeURIComponent("Post permanently deleted.")}`);
}
