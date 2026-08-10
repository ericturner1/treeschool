import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listPublishedBlogPosts } from "../../lib/blog/server";
import { BlogHeader } from "./blog-header";

export const metadata: Metadata = {
  title: "Homeschool Planning & Curriculum Resources | Treeschool",
  description: "Practical elementary homeschool planning, K–4 curriculum, paper-first learning, and family life guidance from Treeschool.",
  alternates: { canonical: "https://www.treehomeschool.com/blog" },
  openGraph: {
    title: "Homeschool Resources from Treeschool",
    description: "Useful, practical guidance for planning and teaching homeschool without another child-facing screen.",
    type: "website",
    url: "https://www.treehomeschool.com/blog"
  }
};

type Props = { searchParams?: Promise<{ category?: string }> };

export default async function BlogIndexPage(props: Props) {
  const searchParams = await props.searchParams;
  const { posts: allPosts } = await listPublishedBlogPosts({ limit: 60 }).catch(() => ({ posts: [] }));
  const categories = Array.from(
    new Map(
      allPosts
        .flatMap((post) => post.categories)
        .map((category) => [category.slug, category])
    ).values()
  );
  const posts = searchParams?.category
    ? allPosts.filter((post) => post.categories.some((category) => category.slug === searchParams.category))
    : allPosts;

  return (
    <main className="min-h-screen bg-[#f8f1e4] text-ink">
      <BlogHeader />
      <section className="border-b border-[#d8c7ad] bg-[#e8f0e1]">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#567b40]">Homeschool resources</p>
          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
            Plan with confidence. Teach with less screen time.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ink/68">
            Useful guidance on K–4 curriculum, elementary homeschool planning, paper-first learning, and the everyday realities of homeschooling.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <nav aria-label="Blog categories" className="flex flex-wrap gap-2">
          <Link href="/blog" className={`rounded-full border px-4 py-2 text-sm font-semibold ${!searchParams?.category ? "border-[#6f9555] bg-[#6f9555] text-white" : "border-[#cbb899] bg-[#fffaf2]"}`}>
            All articles
          </Link>
          {categories.map((category) => (
            <Link key={category.slug} href={`/blog?category=${category.slug}`} className={`rounded-full border px-4 py-2 text-sm font-semibold ${searchParams?.category === category.slug ? "border-[#6f9555] bg-[#6f9555] text-white" : "border-[#cbb899] bg-[#fffaf2]"}`}>
              {category.name}
            </Link>
          ))}
        </nav>

        {posts.length ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <article key={post.id} className={`group overflow-hidden rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] ${index === 0 && !searchParams?.category ? "md:col-span-2 lg:col-span-2 lg:grid lg:grid-cols-2" : ""}`}>
                {post.revision.featuredImageUrl ? (
                  <Link href={`/blog/${post.slug}`} className="relative block min-h-52 overflow-hidden bg-[#e8f0e1]">
                    <img src={post.revision.featuredImageUrl} alt={post.revision.featuredImageAlt || ""} className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                  </Link>
                ) : (
                  <Link href={`/blog/${post.slug}`} className="grid min-h-52 place-items-center bg-[#e8f0e1]">
                    <Image src="/tree-icon.png" alt="" width={96} height={96} className="opacity-80" />
                  </Link>
                )}
                <div className="p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#567b40]">{post.categories[0]?.name ?? "Homeschool resources"}</p>
                  <h2 className={`${index === 0 && !searchParams?.category ? "text-3xl" : "text-2xl"} mt-3 font-semibold leading-tight tracking-[-0.04em]`}>
                    <Link href={`/blog/${post.slug}`}>{post.revision.title}</Link>
                  </h2>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink/60">{post.revision.excerpt}</p>
                  <div className="mt-5 flex items-center justify-between gap-3 text-xs text-ink/45">
                    <span>{post.authorName}</span>
                    <span>{post.revision.readingMinutes} min read</span>
                  </div>
                  <Link href={`/blog/${post.slug}`} className="mt-5 inline-block text-sm font-semibold text-[#567b40]">Read article →</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-[26px] border border-dashed border-[#a9c194] bg-[#f3f8ed] px-6 py-14 text-center">
            <h2 className="text-2xl font-semibold">{searchParams?.category ? "No articles in this category yet." : "Thoughtful homeschool resources are on the way."}</h2>
            <p className="mt-2 text-ink/55">{searchParams?.category ? "Browse all homeschool resources or check back soon." : "Check back soon for practical planning and curriculum guidance."}</p>
            {searchParams?.category ? <Link href="/blog" className="mt-5 inline-block font-semibold text-[#567b40]">View all articles →</Link> : null}
          </div>
        )}
      </div>

      <footer className="bg-[#6f513e] px-4 py-10 text-[#f7eddf]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5">
          <Link href="/" className="flex items-center">
            <Image src="/tree-icon.png" alt="" width={52} height={52} />
            <span className="brand-logo text-2xl">treeschool</span>
          </Link>
          <div className="flex flex-wrap gap-5 text-sm">
            <Link href="/blog">Blog</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/bookstore">Bookstore</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/support">Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
