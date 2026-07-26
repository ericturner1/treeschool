import Image from "next/image";
import Link from "next/link";
import type { BlogPost } from "../../lib/blog/server";
import { BlogHeader } from "./blog-header";

function displayDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "Draft preview";
}

function plainHeading(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function articleHtml(value: string) {
  const used = new Map<string, number>();
  const headings: Array<{ id: string; text: string; level: number }> = [];
  const html = value.replace(
    /<(h[23])>([\s\S]*?)<\/\1>/gi,
    (_, tag: string, content: string) => {
      const text = plainHeading(content);
      const base =
        text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "section";
      const count = (used.get(base) ?? 0) + 1;
      used.set(base, count);
      const id = count === 1 ? base : `${base}-${count}`;
      headings.push({ id, text, level: tag.toLowerCase() === "h2" ? 2 : 3 });
      return `<${tag} id="${id}">${content}</${tag}>`;
    },
  );
  return { html, headings };
}

export function BlogArticle({
  post,
  related = [],
  preview = false,
}: {
  post: BlogPost;
  related?: BlogPost[];
  preview?: boolean;
}) {
  const rendered = articleHtml(post.revision.contentHtml);
  return (
    <main className="min-h-screen bg-[#f8f1e4] text-ink">
      <BlogHeader />
      {preview ? (
        <div className="sticky top-0 z-30 border-b border-[#c7b6d7] bg-[#f1edf6] px-4 py-3 text-center text-sm font-semibold text-[#655777]">
          Draft preview · this is the latest saved revision, not necessarily the
          public version.{" "}
          <Link
            href={`/admin/blog/${post.id}`}
            className="ml-2 underline underline-offset-4"
          >
            Return to editor
          </Link>
        </div>
      ) : null}
      <article>
        <header className="border-b border-[#d8c7ad] bg-[#e8f0e1]">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="mt-7 flex flex-wrap gap-2">
              {post.categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/blog?category=${category.slug}`}
                  className="rounded-full border border-[#9eb889] bg-[#f7fbf1] px-3 py-1.5 text-xs font-bold text-[#486338]"
                >
                  {category.name}
                </Link>
              ))}
            </div>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.12] tracking-[-0.055em] sm:text-6xl">
              {post.revision.title}
            </h1>
            {post.revision.excerpt ? (
              <p className="mt-6 max-w-3xl text-lg leading-8 text-ink/72 sm:text-xl">
                {post.revision.excerpt}
              </p>
            ) : null}
            <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/55">
              {post.revision.showAuthor ? (
                <>
                  <span>By {post.authorName}</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <time dateTime={post.publishedAt ?? post.updatedAt}>
                {displayDate(post.publishedAt)}
              </time>
              <span aria-hidden="true">·</span>
              <span>{post.revision.readingMinutes} min read</span>
            </div>
          </div>
        </header>
        {post.revision.featuredImageUrl ? (
          <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
            <div className="relative aspect-[16/8] overflow-hidden rounded-[26px] border border-[#d8c7ad] bg-white">
              <img
                src={post.revision.featuredImageUrl}
                alt={post.revision.featuredImageAlt || ""}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        ) : null}
        <div
          className={`mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:py-16 ${rendered.headings.filter((heading) => heading.level === 2).length >= 3 ? "lg:grid-cols-[220px_minmax(0,760px)] lg:justify-center" : "max-w-3xl"}`}
        >
          {rendered.headings.filter((heading) => heading.level === 2).length >=
          3 ? (
            <aside className="hidden lg:block">
              <nav
                aria-label="On this page"
                className="sticky top-6 rounded-[18px] border border-[#dcc8aa] bg-[#fffaf2] p-4"
              >
                <p className="text-xs font-black uppercase tracking-[0.12em] text-earth">
                  On this page
                </p>
                <ol className="mt-3 space-y-2">
                  {rendered.headings
                    .filter((heading) => heading.level === 2)
                    .map((heading) => (
                      <li key={heading.id}>
                        <a
                          href={`#${heading.id}`}
                          className="text-sm leading-5 text-ink/60 hover:text-[#486338]"
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                </ol>
              </nav>
            </aside>
          ) : null}
          <div>
            <div
              className="blog-prose"
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
            <aside className="mt-12 rounded-[26px] border border-[#a9c194] bg-[#eef5e4] p-6 sm:p-8">
              <Image
                src="/tree-icon.png"
                alt=""
                width={56}
                height={56}
                className="h-12 w-12"
              />
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                Turn the curriculum you chose into a plan you can teach.
              </h2>
              <p className="mt-3 leading-7 text-ink/65">
                Treeschool is an elementary homeschooling program for grades
                K–4 that organizes PDF workbooks into printable, day-by-day
                weekly lesson plans—without putting your child on another
                screen.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/pricing"
                  className="cta-button cta-button--light cta-button--small"
                >
                  View membership plans
                </Link>
                <Link
                  href="/homeschool-lesson-plan-generator"
                  className="cta-button cta-button--outline cta-button--small"
                >
                  Generate a lesson plan
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </article>
      {related.length ? (
        <section className="border-t border-[#d8c7ad] bg-[#fffaf2]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-[-0.045em]">
              Keep reading
            </h2>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {related.map((item) => (
                <Link
                  key={item.id}
                  href={`/blog/${item.slug}`}
                  className="rounded-[22px] border border-[#dcc8aa] bg-white p-5 transition hover:-translate-y-1 hover:border-[#9eb889]"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#567b40]">
                    {item.categories[0]?.name ?? "Homeschool resources"}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold leading-7 tracking-[-0.03em]">
                    {item.revision.title}
                  </h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink/58">
                    {item.revision.excerpt}
                  </p>
                  <span className="mt-5 inline-block text-sm font-semibold text-[#567b40]">
                    Read article →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <footer className="bg-[#6f513e] px-4 py-10 text-[#f7eddf]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5">
          <Link href="/" className="flex items-center">
            <Image src="/tree-icon.png" alt="" width={52} height={52} />
            <span className="brand-logo text-2xl">treeschool</span>
          </Link>
          <div className="flex gap-5 text-sm">
            <Link href="/blog">Blog</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/bookstore">Bookstore</Link>
            <Link href="/support">Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
