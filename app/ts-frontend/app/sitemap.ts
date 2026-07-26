import type { MetadataRoute } from "next";
import { listPublishedBlogPosts } from "../lib/blog/server";
import { listNativeWorkbookCatalog } from "../lib/native-workbooks/server";

const SITE_URL = "https://www.treehomeschool.com";
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    ["", 1, "weekly"],
    ["/pricing", 0.9, "monthly"],
    ["/homeschool-lesson-plan-generator", 0.9, "monthly"],
    ["/first-grade-homeschool", 0.9, "monthly"],
    ["/first-grade-homeschool-curriculum", 0.95, "weekly"],
    ["/switch-to-paper-based-homeschool", 0.9, "monthly"],
    ["/homeschool-without-a-subscription", 0.85, "monthly"],
    ["/bookstore", 0.8, "weekly"],
    ["/blog", 0.8, "daily"]
  ].map(([path, priority, changeFrequency]) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    priority: priority as number,
    changeFrequency: changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"]
  }));

  const [{ posts }, { workbooks }] = await Promise.all([
    listPublishedBlogPosts({ limit: 200 }).catch(() => ({ posts: [] })),
    listNativeWorkbookCatalog({ grade: null, subject: null }).catch(() => ({ workbooks: [] }))
  ]);
  return [
    ...staticPages,
    ...workbooks.map((workbook) => ({
      url: `${SITE_URL}/bookstore/${workbook.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.75
    })),
    ...posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7
    }))
  ];
}
