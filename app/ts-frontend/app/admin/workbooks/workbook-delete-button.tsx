"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteWorkbookAction } from "./actions";

export function WorkbookDeleteButton({ workbookId, title }: { workbookId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await deleteWorkbookAction(workbookId);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${title}`}
        className="cta-button cta-button--outline cta-button--small border-[#c78574] text-[#8b3e2f]"
      >
        Delete
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby={`delete-workbook-${workbookId}`} className="w-full max-w-lg rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] p-6 shadow-2xl sm:p-7">
            <h2 id={`delete-workbook-${workbookId}`} className="text-2xl font-semibold tracking-[-0.035em]">Delete “{title}”?</h2>
            <p className="mt-3 text-sm leading-6 text-ink/65">This permanently removes the workbook, its indexed metadata, cover, and sample images. It cannot be undone.</p>
            {error ? <p role="alert" className="mt-4 rounded-[14px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold leading-6 text-[#8b3e2f]">{error}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" disabled={busy} onClick={close} className="cta-button cta-button--outline cta-button--small disabled:opacity-60">Cancel</button>
              <button type="button" disabled={busy} onClick={remove} className="cta-button cta-button--dark cta-button--small bg-[#8b3e2f] disabled:opacity-60">
                {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Deleting…</> : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
