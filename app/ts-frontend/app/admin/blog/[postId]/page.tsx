import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/server";
import { getAdminBlogPost } from "../../../../lib/blog/server";
import { BlogEditor } from "./blog-editor";

type Props = { params: Promise<{ postId: string }>; searchParams?: Promise<{ error?: string; message?: string; published?: string }> };

export default async function EditBlogPostPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin?next=${encodeURIComponent(`/admin/blog/${params.postId}`)}`);
  let data;
  try { data = await getAdminBlogPost(user.id, params.postId); } catch (error) {
    if (error instanceof Error && ["Administrator access is required.", "Blog post not found."].includes(error.message)) notFound();
    throw error;
  }
  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${data.post.status === "published" ? "bg-[#dfead4] text-[#4d6a39]" : "bg-[#f2e6d3] text-earth"}`}>
                {data.post.status}
              </span>
              <span className="text-xs text-ink/45">
                Revision {data.post.revision.revisionNumber} · {data.post.revision.source === "ai" ? "AI-assisted" : "Manual"}
              </span>
            </div>
            <h1 className="mt-3 truncate text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">{data.post.revision.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/blog" className="cta-button cta-button--outline cta-button--small">All posts</Link>
            <Link href={`/admin/blog/${data.post.id}/preview`} className="cta-button cta-button--outline cta-button--small">Preview</Link>
            {data.post.status === "published" ? <Link href={`/blog/${data.post.slug}`} className="cta-button cta-button--light cta-button--small">View live</Link> : null}
          </div>
        </header>
        {searchParams?.error ? <div className="mt-6 rounded-[18px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">{searchParams.error}</div> : null}
        <div className="mt-7"><BlogEditor post={data.post} availableCategories={data.categories} /></div>
      </div>
    </main>
  );
}
