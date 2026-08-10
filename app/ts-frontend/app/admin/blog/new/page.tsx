import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/server";
import { listAdminBlogPosts } from "../../../../lib/blog/server";
import { BlogStartForm } from "./blog-start-form";

type Props = { searchParams?: Promise<{ error?: string }> };

export default async function NewBlogPostPage(props: Props) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/blog/new");
  try { await listAdminBlogPosts(user.id); } catch (error) {
    if (error instanceof Error && error.message === "Administrator access is required.") notFound();
    throw error;
  }
  return <main className="min-h-screen bg-[#f8f1e4] px-4 py-8 text-ink sm:px-6 lg:px-8"><div className="mx-auto max-w-4xl"><header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#567b40]">Treeschool editorial</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Start a new post</h1></div><Link href="/admin/blog" className="cta-button cta-button--outline cta-button--small">Back to posts</Link></header>{searchParams?.error ? <div className="mt-6 rounded-[18px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">{searchParams.error}</div> : null}<section className="mt-8 rounded-[30px] border border-[#dcc8aa] bg-[#fffaf2] p-6 sm:p-8"><h2 className="text-2xl font-semibold tracking-[-0.04em]">How would you like to begin?</h2><p className="mt-2 text-sm leading-6 text-ink/58">Both paths lead to the same rich editor, revision history, SEO controls, preview, and human publishing gate.</p><div className="mt-7"><BlogStartForm /></div></section></div></main>;
}
