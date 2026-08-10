import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../../lib/auth/server";
import { getAdminBlogPreview } from "../../../../../lib/blog/server";
import { BlogArticle } from "../../../../blog/blog-article";

export const metadata: Metadata = { title: "Blog draft preview | Treeschool", robots: { index: false, follow: false } };

export default async function AdminBlogPreviewPage(props: { params: Promise<{ postId: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin?next=${encodeURIComponent(`/admin/blog/${params.postId}/preview`)}`);
  let post;
  try { post = (await getAdminBlogPreview(user.id, params.postId)).post; } catch (error) {
    if (error instanceof Error && ["Administrator access is required.", "Blog post not found."].includes(error.message)) notFound();
    throw error;
  }
  return <BlogArticle post={post} preview />;
}
