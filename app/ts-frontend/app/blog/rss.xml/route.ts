import { listPublishedBlogPosts } from "../../../lib/blog/server";

const SITE_URL = "https://www.treehomeschool.com";
export const revalidate = 300;

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const { posts } = await listPublishedBlogPosts({ limit: 50 }).catch(() => ({ posts: [] }));
  const items = posts.map((post) => {
    const url = `${SITE_URL}/blog/${post.slug}`;
    return `<item><title>${xml(post.revision.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><description>${xml(post.revision.excerpt)}</description><pubDate>${new Date(post.publishedAt ?? post.createdAt).toUTCString()}</pubDate></item>`;
  }).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Treeschool Homeschool Resources</title><link>${SITE_URL}/blog</link><description>Practical homeschool planning, curriculum, and paper-first learning guidance.</description><language>en</language>${items}</channel></rss>`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
    }
  });
}
