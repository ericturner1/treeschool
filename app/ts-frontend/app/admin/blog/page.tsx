import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import { listAdminBlogPosts } from "../../../lib/blog/server";

type Props = { searchParams?: { error?: string; message?: string } };

function formatDate(value: string | null) {
  if (!value) return "Not published";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

export default async function AdminBlogPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/blog");
  let data;
  try {
    data = await listAdminBlogPosts(user.id);
  } catch (error) {
    if (error instanceof Error && error.message === "Administrator access is required.") notFound();
    throw error;
  }

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#567b40]">Treeschool administration</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Blog</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-ink/62">Build genuinely useful homeschool resources, preserve editorial history, and publish search-ready articles.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/blog" className="cta-button cta-button--outline cta-button--small">View public blog</Link>
            <Link href="/admin/blog/new" className="cta-button cta-button--light cta-button--small">New post</Link>
          </div>
        </header>

        {searchParams?.error ? <div className="mt-6 rounded-[18px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">{searchParams.error}</div> : null}

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["Published", data.posts.filter((post) => post.status === "published").length],
            ["Drafts", data.posts.filter((post) => post.status === "draft").length],
            ["Total revisions", data.posts.reduce((total, post) => total + post.revision.revisionNumber, 0)]
          ].map(([label, count]) => <div key={label} className="rounded-[22px] border border-[#c9d9b7] bg-[#f3f8ed] px-5 py-5"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#567b40]">{label}</p><p className="mt-2 text-4xl font-semibold tracking-[-0.06em]">{count}</p></div>)}
        </section>

        <section className="mt-9">
          <div className="flex items-baseline justify-between gap-4"><h2 className="text-3xl font-semibold tracking-[-0.04em]">Articles</h2><p className="text-sm text-ink/50">{data.posts.length} total</p></div>
          {data.posts.length ? (
            <div className="mt-5 space-y-4">
              {data.posts.map((post) => (
                <article key={post.id} className="rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${post.status === "published" ? "bg-[#dfead4] text-[#4d6a39]" : "bg-[#f2e6d3] text-earth"}`}>{post.status}</span>
                        <span className="text-xs font-semibold text-ink/45">Revision {post.revision.revisionNumber}</span>
                        {post.revision.source === "ai" ? <span className="rounded-full bg-[#e8e6f2] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#665b83]">AI-assisted</span> : null}
                      </div>
                      <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{post.revision.title}</h3>
                      <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-ink/60">{post.revision.excerpt || "No excerpt yet."}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/48"><span>/blog/{post.slug}</span><span>{post.revision.wordCount.toLocaleString()} words</span><span>{post.revision.readingMinutes} min read</span><span>{formatDate(post.publishedAt)}</span></div>
                    </div>
                    <div className="flex flex-none flex-wrap gap-2">
                      {post.status === "published" ? <Link href={`/blog/${post.slug}`} className="cta-button cta-button--outline cta-button--small">View live</Link> : null}
                      <Link href={`/admin/blog/${post.id}/preview`} className="cta-button cta-button--outline cta-button--small">Preview</Link>
                      <Link href={`/admin/blog/${post.id}`} className="cta-button cta-button--light cta-button--small">Edit</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[28px] border border-dashed border-[#a9c194] bg-[#f3f8ed] px-6 py-14 text-center"><h3 className="text-2xl font-semibold">Your editorial library starts here.</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink/60">Create a manual post or give Treeschool a brief and turn the resulting draft into something distinctly yours.</p><Link href="/admin/blog/new" className="cta-button cta-button--light mt-6">Create the first post</Link></div>
          )}
        </section>
      </div>
    </main>
  );
}
