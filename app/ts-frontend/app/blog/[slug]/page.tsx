import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getPublishedBlogPost } from "../../../lib/blog/server";
import { BlogArticle } from "../blog-article";

type Props = { params: { slug: string } };
const SITE_URL = "https://www.treehomeschool.com";

function absoluteImageUrl(value: string | null) {
  if (!value) return `${SITE_URL}/hero-paper-learning-crop.jpg`;
  return value.startsWith("/") ? `${SITE_URL}${value}` : value;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await getPublishedBlogPost(params.slug).catch(() => null);
  const post = result?.post;
  if (!post) return { title: "Homeschool Resources | Treeschool" };
  const canonical = post.revision.canonicalUrl || `${SITE_URL}/blog/${post.slug}`;
  const title = post.revision.seoTitle || post.revision.title;
  const description = post.revision.metaDescription || post.revision.excerpt;
  const publicAuthor = post.revision.showAuthor ? post.authorName : "Treeschool Editorial Team";
  const images = [{ url: absoluteImageUrl(post.revision.featuredImageUrl), alt: post.revision.featuredImageAlt || post.revision.title || "Paper-first homeschool planning" }];
  return {
    title,
    description,
    alternates: { canonical },
    authors: [{ name: publicAuthor }],
    keywords: [post.revision.primaryKeyword, ...post.tags.map((tag) => tag.name)].filter((value): value is string => Boolean(value)),
    openGraph: { title, description, type: "article", url: canonical, publishedTime: post.publishedAt ?? undefined, modifiedTime: post.updatedAt, authors: [publicAuthor], tags: post.tags.map((tag) => tag.name), images },
    twitter: { card: "summary_large_image", title, description, images: images.map((image) => image.url) }
  };
}

export default async function BlogPostPage({ params }: Props) {
  const result = await getPublishedBlogPost(params.slug).catch(() => null);
  if (!result) notFound();
  if (result.redirectTo) permanentRedirect(`/blog/${result.redirectTo}`);
  if (!result.post) notFound();
  const post = result.post;
  const url = `${SITE_URL}/blog/${post.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.revision.title,
    description: post.revision.metaDescription || post.revision.excerpt,
    image: absoluteImageUrl(post.revision.featuredImageUrl),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: post.revision.showAuthor
      ? { "@type": "Person", name: post.authorName }
      : { "@type": "Organization", name: "Treeschool Editorial Team" },
    publisher: { "@type": "Organization", name: "Treeschool", logo: { "@type": "ImageObject", url: `${SITE_URL}/tree-icon.png` } },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.categories.map((category) => category.name),
    keywords: post.tags.map((tag) => tag.name).join(", "),
    wordCount: post.revision.wordCount
  };
  const breadcrumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Homeschool resources", item: `${SITE_URL}/blog` }, { "@type": "ListItem", position: 3, name: post.revision.title, item: url }] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, "\\u003c") }} /><BlogArticle post={post} related={result.related} /></>;
}
