"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteBlogPostAction } from "../actions";

function DeleteSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-[#9a4335] px-5 font-semibold text-white shadow-[0_5px_0_#6e2f26] transition hover:bg-[#87392e] disabled:cursor-wait disabled:opacity-65"
    >
      {pending ? <span className="activity-spinner" aria-hidden="true" /> : null}
      {pending ? "Deleting…" : "Delete post permanently"}
    </button>
  );
}

export function DeleteBlogPostButton({ postId, title }: { postId: string; title: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <section className="rounded-[22px] border border-[#e1b9ad] bg-[#fff3ef] p-5">
      <h2 className="font-semibold text-[#74352b]">Delete this post</h2>
      <p className="mt-1 text-sm leading-6 text-ink/58">
        Permanently remove the article, all of its revisions, and its uploaded blog images.
      </p>
      <button type="button" onClick={() => setOpen(true)} className="mt-4 text-sm font-semibold text-[#8b3e2f] underline underline-offset-4">
        Delete post…
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-blog-post-title" className="w-full max-w-lg rounded-[24px] border border-[#d9afa2] bg-[#fffaf2] p-6 shadow-2xl sm:p-7">
            <h2 id="delete-blog-post-title" className="text-2xl font-semibold tracking-[-0.04em]">Permanently delete this post?</h2>
            <p className="mt-3 leading-7 text-ink/65">
              <strong className="text-ink">{title}</strong> and every saved revision will be removed. Its public URL will stop working. This cannot be undone.
            </p>
            <form action={deleteBlogPostAction} className="mt-7 flex flex-wrap justify-end gap-3">
              <input type="hidden" name="postId" value={postId} />
              <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center justify-center rounded-[14px] border border-[#cdbb9f] bg-white px-5 font-semibold hover:bg-[#f6efe4]">Cancel</button>
              <DeleteSubmitButton />
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
