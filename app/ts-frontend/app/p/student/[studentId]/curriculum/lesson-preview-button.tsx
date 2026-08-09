"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { LessonDispositionControl } from "./lesson-disposition-control";

type Disposition = "include" | "already_mastered" | "save_for_later" | "remove";

export function LessonPreviewButton({
  weeklyPlanItemId,
  documentId,
  sourceUnitId,
  lessonLabel,
  documentLabel,
  firstPageIndex,
  lastPageIndex,
  pageStart,
  pageEnd,
  disposition
}: {
  weeklyPlanItemId: string;
  documentId: string;
  sourceUnitId: string | null;
  lessonLabel: string;
  documentLabel: string;
  firstPageIndex: number;
  lastPageIndex: number;
  pageStart: number;
  pageEnd: number;
  disposition: Disposition;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [currentDisposition, setCurrentDisposition] = useState(disposition);
  const previewParams = new URLSearchParams({
    weeklyPlanItemId,
    documentId,
    lessonLabel,
    firstPageIndex: String(firstPageIndex),
    lastPageIndex: String(lastPageIndex),
    ...(sourceUnitId ? { sourceUnitId } : {})
  });
  const previewUrl = `/api/paper-plan/lesson-preview?${previewParams.toString()}`;

  useEffect(() => setCurrentDisposition(disposition), [disposition]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function openPreview() {
    setLoaded(false);
    setOpen(true);
  }

  const pageLabel = pageEnd > pageStart
    ? `Pages ${pageStart}–${pageEnd}`
    : `Page ${pageStart}`;

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-[10px] border border-[#ccb995] bg-white px-3 py-1.5 text-xs font-bold text-[#55783f] shadow-[0_3px_0_#dfcfb2] transition hover:-translate-y-px hover:bg-[#f7fbf3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa35f]"
        aria-haspopup="dialog"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.9">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.7 12s3.3-6 9.3-6 9.3 6 9.3 6-3.3 6-9.3 6-9.3-6-9.3-6Z" />
          <circle cx="12" cy="12" r="2.75" />
        </svg>
        View
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-[#211c16]/70 p-3 backdrop-blur-[2px] sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex h-[min(94vh,980px)] w-full max-w-6xl flex-col overflow-hidden rounded-[22px] border border-[#ddc9a5] bg-[#fffaf2] shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#e8d9bd] px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.08em] text-[#66864f]">Lesson preview</p>
                <h3 id={titleId} className="mt-1 truncate text-lg font-semibold text-ink sm:text-xl">{lessonLabel}</h3>
                <p className="mt-1 text-sm text-ink/58">{documentLabel} · {pageLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dfceb0] bg-white text-xl font-semibold text-[#7b4e31] hover:bg-[#f6eee2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa35f]"
                aria-label="Close lesson preview"
              >
                ×
              </button>
            </header>

            <div className="relative min-h-0 flex-1 bg-[#e9e5de]">
              {!loaded ? (
                <div className="absolute inset-0 z-10 grid place-items-center bg-[#f3efe8]">
                  <div className="flex items-center gap-3 text-sm font-semibold text-ink/62">
                    <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[#729954] border-r-transparent" />
                    Loading lesson pages…
                  </div>
                </div>
              ) : null}
              <iframe
                src={previewUrl}
                title={`${lessonLabel} lesson pages`}
                className="h-full w-full border-0"
                onLoad={() => setLoaded(true)}
              />
            </div>

            <footer className="border-t border-[#e8d9bd] bg-[#fffaf2] px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">What would you like to do with this lesson?</p>
                  <p className="mt-1 text-xs leading-5 text-ink/55">Your choice updates future PDF downloads.</p>
                </div>
                <div className="w-full lg:max-w-xl">
                  <LessonDispositionControl
                    weeklyPlanItemId={weeklyPlanItemId}
                    value={currentDisposition}
                    onSaved={setCurrentDisposition}
                  />
                </div>
              </div>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs font-semibold text-[#55783f] underline underline-offset-4"
              >
                Open preview in a new tab
              </a>
            </footer>
          </section>
        </div>,
        document.body
      ) : null}
    </>
  );
}
