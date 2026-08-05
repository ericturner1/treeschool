"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { showGlobalToast } from "../../../lib/toast";
import {
  completeWorkbookEditionAction,
  discardWorkbookEditionAction,
  prepareWorkbookEditionAction
} from "./actions";

async function uploadEditionPdf(url: string, file: File) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file
    });
  } catch {
    throw new Error("The new-edition PDF could not reach cloud storage. Please try again.");
  }
  if (!response.ok) throw new Error(`Cloud storage rejected the PDF (HTTP ${response.status}).`);
}

export function WorkbookEditionCreator({
  workbookId,
  title,
  nextEditionLabel
}: {
  workbookId: string;
  title: string;
  nextEditionLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setStatus(null);
    setError(null);
  }

  async function createEdition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const pdf = formData.get("editionPdf") as File | null;
    if (!pdf?.size) {
      setError("Choose the new-edition PDF.");
      return;
    }
    if (pdf.type && pdf.type !== "application/pdf" && !pdf.name.toLowerCase().endsWith(".pdf")) {
      setError("The new edition must be a PDF.");
      return;
    }
    let prepared: { workbookId: string; versionId: string } | null = null;
    setBusy(true);
    setError(null);
    setStatus("Preparing a protected upload…");
    try {
      const result = await prepareWorkbookEditionAction({
        workbookId,
        editionLabel: String(formData.get("editionLabel") ?? ""),
        changeNotes: String(formData.get("changeNotes") ?? ""),
        pdfFilename: pdf.name,
        pdfMimeType: pdf.type || "application/pdf"
      });
      if (!result.ok) throw new Error(result.error);
      prepared = result.upload;
      setStatus("Uploading the new edition…");
      await uploadEditionPdf(result.upload.pdfUploadUrl, pdf);
      setStatus("Upload complete. Starting lesson indexing…");
      const completed = await completeWorkbookEditionAction({
        workbookId: result.upload.workbookId,
        versionId: result.upload.versionId
      });
      if (!completed.ok) throw new Error(completed.error);
      prepared = null;
      setOpen(false);
      setStatus(null);
      showGlobalToast({ kind: "success", text: "The new workbook edition was uploaded and queued for indexing." });
      router.refresh();
    } catch (caught) {
      if (prepared) await discardWorkbookEditionAction(prepared).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : "Could not create the new edition.");
      setStatus(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setStatus(null); setOpen(true); }}
        className="cta-button cta-button--outline cta-button--small"
      >
        Add new edition
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
        >
          <form
            onSubmit={createEdition}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`new-workbook-edition-${workbookId}`}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] p-6 shadow-2xl sm:p-7"
          >
            <h2 id={`new-workbook-edition-${workbookId}`} className="text-2xl font-semibold tracking-[-0.035em]">
              Add a new edition of “{title}”
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink/65">
              Use this for substantial lesson, ordering, or page-count changes. Existing purchases and lesson plans will remain pinned to their original edition. After indexing, publish this edition when it is ready for new customers.
            </p>
            <label className="mt-5 grid gap-2 text-sm font-semibold text-ink">
              Edition
              <input
                required
                name="editionLabel"
                defaultValue={nextEditionLabel}
                disabled={busy}
                className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 disabled:opacity-60"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
              What changed? <span className="font-normal text-ink/50">(optional, internal)</span>
              <textarea
                name="changeNotes"
                rows={3}
                disabled={busy}
                placeholder="Example: Reorganized lessons and added a new geometry unit."
                className="resize-y rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 disabled:opacity-60"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
              New-edition PDF
              <input
                required
                name="editionPdf"
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 disabled:opacity-60"
              />
            </label>
            {status ? (
              <p className="mt-4 flex items-center gap-2 rounded-[14px] bg-[#eef5e4] px-4 py-3 text-sm font-semibold text-[#4d6a39]">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#4d6a39]/30 border-t-[#4d6a39]" />
                {status}
              </p>
            ) : null}
            {error ? <p role="alert" className="mt-4 rounded-[14px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">{error}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" disabled={busy} onClick={close} className="cta-button cta-button--outline cta-button--small disabled:opacity-60">Cancel</button>
              <button type="submit" disabled={busy} className="cta-button cta-button--dark cta-button--small disabled:opacity-60">
                {busy ? "Uploading…" : "Upload new edition"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
