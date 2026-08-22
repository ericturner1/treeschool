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
  const sectionHeadings = rendered.headings.filter((heading) => heading.level === 2);
  const showTableOfContents = sectionHeadings.length >= 3;
  return (
    <main className="min-h-screen bg-[#f3eee6] text-ink">
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
        <header className="border-b border-[#d5e0ca] bg-[#edf4e7]">
          <div className="mx-auto max-w-[1160px] px-6 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
            <div className={`grid items-center gap-x-12 ${post.revision.featuredImageUrl ? "lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]" : ""}`}>
              <div className="lg:col-start-1 lg:row-start-1">
                <div className="flex flex-wrap gap-2">
                  {post.categories.map((category) => (
                    <Link
                      key={category.slug}
                      href={`/blog?category=${category.slug}`}
                      className="rounded-full border border-[#a9c497] bg-white/75 px-3.5 py-1.5 text-xs font-bold text-[#486338] transition hover:border-[#719359] hover:bg-white"
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
                <h1 className="mt-4 max-w-[760px] text-4xl font-semibold leading-[1.06] tracking-[-0.055em] sm:text-[52px] lg:text-[60px]">
                  {post.revision.title}
                </h1>
                {post.revision.excerpt ? (
                  <p className="mt-5 max-w-[720px] text-lg leading-8 text-ink/68 sm:text-xl sm:leading-8">
                    {post.revision.excerpt}
                  </p>
                ) : null}
              </div>
              {post.revision.featuredImageUrl ? (
                <div className="relative mt-7 aspect-[16/10] w-full max-w-[680px] overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_14px_34px_rgba(67,50,34,.1)] sm:rounded-[24px] lg:col-start-2 lg:row-start-1 lg:mt-0 lg:max-w-[420px]">
                  <img
                    src={post.revision.featuredImageUrl}
                    alt={post.revision.featuredImageAlt || ""}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink/55 lg:col-start-1 lg:row-start-2">
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
          </div>
        </header>
        <div
          className={`mx-auto grid gap-8 px-4 py-6 sm:px-8 sm:py-8 lg:gap-12 lg:px-10 lg:py-10 ${showTableOfContents ? "max-w-[1200px] lg:grid-cols-[220px_minmax(0,820px)] lg:justify-center" : "max-w-[940px]"}`}
        >
          {showTableOfContents ? (
            <aside className="hidden lg:block">
              <nav
                aria-label="On this page"
                className="sticky top-6 rounded-[20px] border border-[#dfe5d8] bg-white/80 p-5 shadow-[0_10px_30px_rgba(67,50,34,.06)] backdrop-blur"
              >
                <p className="label-font text-sm text-[#567b40]">
                  On this page
                </p>
                <ol className="mt-4 space-y-3 border-l border-[#dce7d3] pl-4">
                  {sectionHeadings.map((heading) => (
                      <li key={heading.id}>
                        <a
                          href={`#${heading.id}`}
                          className="block text-sm leading-5 text-ink/58 transition hover:translate-x-0.5 hover:text-[#486338]"
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                </ol>
              </nav>
            </aside>
          ) : null}
          <div className="min-w-0 rounded-[26px] border border-[#e6ded2] bg-white px-5 py-7 shadow-[0_20px_60px_rgba(67,50,34,.07)] sm:rounded-[32px] sm:px-10 sm:py-9 lg:px-14 lg:py-10">
            {showTableOfContents ? (
              <details className="mb-9 rounded-[16px] border border-[#dce7d3] bg-[#f6faf2] p-4 lg:hidden">
                <summary className="label-font cursor-pointer text-[#567b40]">On this page</summary>
                <ol className="mt-4 space-y-2.5 border-l border-[#cfddc4] pl-4">
                  {sectionHeadings.map((heading) => (
                    <li key={heading.id}>
                      <a href={`#${heading.id}`} className="text-sm leading-5 text-ink/62 underline decoration-[#a8bf96] underline-offset-4">
                        {heading.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
            <div
              className="blog-prose mx-auto max-w-[68ch]"
              style={{
                fontSize: post.revision.bodyFontSizePx
                  ? `${post.revision.bodyFontSizePx}px`
                  : undefined,
                lineHeight: post.revision.bodyLineHeight ?? undefined,
              }}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
            <aside className="mx-auto mt-14 max-w-[68ch] border-t border-[#e5ded2] pt-10">
              <div className="rounded-[24px] border border-[#b9cca9] bg-[#eff6e9] p-6 sm:p-8">
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
                <p className="mt-3 max-w-[58ch] leading-7 text-ink/65">
                  Treeschool organizes PDF workbooks into printable, day-by-day
                  weekly lesson plans—without putting your child on another
                  screen.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
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
                    Try the planning tool
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </article>
      {related.length ? (
        <section className="border-t border-[#e0d8cc] bg-[#faf7f1]">
          <div className="mx-auto max-w-6xl px-6 py-14 sm:px-10 lg:px-12 lg:py-16">
            <h2 className="text-3xl font-semibold tracking-[-0.045em]">
              Keep reading
            </h2>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {related.map((item) => (
                <Link
                  key={item.id}
                  href={`/blog/${item.slug}`}
                  className="rounded-[22px] border border-[#e2d9cc] bg-white p-6 shadow-[0_10px_30px_rgba(67,50,34,.05)] transition hover:-translate-y-1 hover:border-[#9eb889] hover:shadow-[0_16px_35px_rgba(67,50,34,.09)]"
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
