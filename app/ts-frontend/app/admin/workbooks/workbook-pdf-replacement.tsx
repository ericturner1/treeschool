"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  completeWorkbookReplacementAction,
  discardWorkbookReplacementAction,
  prepareWorkbookReplacementAction
} from "./actions";

async function uploadReplacementPdf(url: string, file: File) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file
    });
  } catch {
    throw new Error("The replacement PDF could not reach cloud storage. Please try again.");
  }
  if (!response.ok) {
    throw new Error(`Cloud storage rejected the replacement PDF (HTTP ${response.status}).`);
  }
}

export function WorkbookPdfReplacement({ workbookId, title }: { workbookId: string; title: string }) {
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

  async function replacePdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const pdf = formData.get("replacementPdf") as File | null;
    if (!pdf?.size) {
      setError("Choose a replacement PDF.");
      return;
    }
    if (pdf.type && pdf.type !== "application/pdf" && !pdf.name.toLowerCase().endsWith(".pdf")) {
      setError("The replacement file must be a PDF.");
      return;
    }

    let prepared: { workbookId: string; versionId: string } | null = null;
    setBusy(true);
    setError(null);
    setStatus("Checking that the workbook is still safe to replace…");
    try {
      const result = await prepareWorkbookReplacementAction({
        workbookId,
        pdfFilename: pdf.name,
        pdfMimeType: pdf.type || "application/pdf"
      });
      if (!result.ok) throw new Error(result.error);
      prepared = result.upload;
      setStatus("Uploading the replacement PDF…");
      await uploadReplacementPdf(result.upload.pdfUploadUrl, pdf);
      setStatus("Upload complete. Starting indexing and thumbnail regeneration…");
      const completed = await completeWorkbookReplacementAction({
        workbookId: result.upload.workbookId,
        versionId: result.upload.versionId
      });
      if (!completed.ok) throw new Error(completed.error);
      prepared = null;
      setBusy(false);
      setOpen(false);
      setStatus(null);
      router.refresh();
    } catch (caught) {
      if (prepared) {
        await discardWorkbookReplacementAction(prepared).catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : "Could not replace the workbook PDF.");
      setStatus(null);
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setStatus(null); setOpen(true); }}
        className="cta-button cta-button--outline cta-button--small"
      >
        Replace PDF
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
        >
          <form
            onSubmit={replacePdf}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`replace-workbook-pdf-${workbookId}`}
            className="w-full max-w-xl rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] p-6 shadow-2xl sm:p-7"
          >
            <h2 id={`replace-workbook-pdf-${workbookId}`} className="text-2xl font-semibold tracking-[-0.035em]">
              Replace the PDF for “{title}”?
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink/65">
              Treeschool will index the new file and regenerate its cover and sample thumbnails. The current file remains in place unless the replacement finishes successfully.
            </p>
            <p className="mt-2 text-sm leading-6 text-ink/65">
              This is only allowed while no parent has purchased the workbook or added it to a lesson plan. Treeschool checks that again when you upload.
            </p>
            <label className="mt-5 grid gap-2 text-sm font-semibold text-ink">
              Replacement workbook PDF
              <input
                autoFocus
                required
                name="replacementPdf"
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 disabled:opacity-60"
              />
            </label>
            {status ? (
              <p className="mt-4 flex items-center gap-2 rounded-[14px] bg-[#eef5e4] px-4 py-3 text-sm font-semibold leading-6 text-[#4d6a39]">
                <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-[#4d6a39]/30 border-t-[#4d6a39]" aria-hidden="true" />
                {status}
              </p>
            ) : null}
            {error ? <p role="alert" className="mt-4 rounded-[14px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold leading-6 text-[#8b3e2f]">{error}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" disabled={busy} onClick={close} className="cta-button cta-button--outline cta-button--small disabled:opacity-60">Cancel</button>
              <button type="submit" disabled={busy} className="cta-button cta-button--dark cta-button--small disabled:opacity-60">
                {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Replacing…</> : "Replace and re-index"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
