"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { NativeWorkbookPlanningPreview } from "../../../../../lib/native-workbooks/server";

type Lesson = NativeWorkbookPlanningPreview["lessons"][number];

function lessonPageLabel(lesson: Lesson) {
  const ranges = lesson.pageRanges.map((range) => range.pdfPageStart === range.pdfPageEnd
    ? String(range.pdfPageStart)
    : `${range.pdfPageStart}–${range.pdfPageEnd}`);
  return `PDF ${ranges.length === 1 ? "pages" : "page ranges"} ${ranges.join(", ")}`;
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.7 12s3.3-6 9.3-6 9.3 6 9.3 6-3.3 6-9.3 6-9.3-6Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

export function NativeWorkbookContentReview({
  open,
  learningYearId,
  documentId,
  workbookTitle,
  onClose
}: {
  open: boolean;
  learningYearId: string;
  documentId: string;
  workbookTitle: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const lessonTitleId = useId();
  const [preview, setPreview] = useState<NativeWorkbookPlanningPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [lessonPdfUrl, setLessonPdfUrl] = useState<string | null>(null);
  const [lessonPdfLoading, setLessonPdfLoading] = useState(false);
  const [lessonPdfError, setLessonPdfError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  const previewRequestUrl = useMemo(() => {
    const params = new URLSearchParams({ learningYearId, documentId });
    return `/api/native-workbooks/planning-preview?${params}`;
  }, [documentId, learningYearId]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setPreview(null);
    void fetch(previewRequestUrl, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as NativeWorkbookPlanningPreview & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not load the indexed lessons.");
        setPreview(payload);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Could not load the indexed lessons.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, previewRequestUrl, requestVersion]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selectedLesson) setSelectedLesson(null);
      else onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open, selectedLesson]);

  useEffect(() => {
    if (!selectedLesson) {
      setLessonPdfUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setLessonPdfError(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      learningYearId,
      documentId,
      learningUnitId: selectedLesson.id
    });
    setLessonPdfLoading(true);
    setLessonPdfError(null);
    void fetch(`/api/native-workbooks/lesson-preview?${params}`, {
      signal: controller.signal,
      cache: "no-store"
    }).then(async (response) => {
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Could not open the lesson pages.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      setLessonPdfUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return objectUrl;
      });
    }).catch((requestError) => {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setLessonPdfError(requestError instanceof Error ? requestError.message : "Could not open the lesson pages.");
    }).finally(() => {
      if (!controller.signal.aborted) setLessonPdfLoading(false);
    });
    return () => controller.abort();
  }, [documentId, learningYearId, selectedLesson]);

  useEffect(() => () => {
    if (lessonPdfUrl) URL.revokeObjectURL(lessonPdfUrl);
  }, [lessonPdfUrl]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#211c16]/65 p-3 backdrop-blur-[2px] sm:p-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !selectedLesson) onClose();
        }}
      >
        <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[26px] border border-[#ddc9a5] bg-[#fffdf8] shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-[#e8d9bd] px-5 py-4 sm:px-7 sm:py-5">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e3edd8] px-2.5 py-1 text-[11px] font-semibold text-[#52713d]">
                <Image src="/tree-icon.png" alt="" width={15} height={15} className="h-[15px] w-[15px] object-contain" /> Treeschool indexed workbook
              </div>
              <h2 id={titleId} className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-ink">{preview?.title ?? workbookTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-ink/58">
                {preview ? `${preview.lessonCount} ${preview.lessonCount === 1 ? "lesson" : "lessons"}${preview.sectionCount ? ` · ${preview.sectionCount} section ${preview.sectionCount === 1 ? "opener" : "openers"}` : ""} · ${preview.pageCount.toLocaleString()} source pages` : "Review the lessons before approving this curriculum."}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close workbook review" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dfceb0] bg-white text-xl text-earth hover:bg-[#f6eee2]">×</button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="rounded-[16px] bg-[#eef5e4] px-4 py-3 text-sm leading-6 text-[#4d6a39]">
              Use this preview to confirm that the workbook fits your child. When you’re finished, keep it in the planner or close this preview and remove it before academic review.
            </div>
            {loading ? (
              <div className="grid min-h-64 place-items-center">
                <div className="flex items-center gap-3 text-sm font-semibold text-ink/60"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#729954] border-r-transparent" /> Loading indexed lessons…</div>
              </div>
            ) : error ? (
              <div className="mt-5 rounded-[18px] border border-[#efd4c9] bg-[#fff5f1] px-4 py-4 text-sm text-[#7d4034]">
                <p className="font-semibold">The lesson list could not be opened.</p>
                <p className="mt-1 leading-6">{error}</p>
                <button type="button" onClick={() => setRequestVersion((current) => current + 1)} className="mt-3 font-semibold underline underline-offset-4">Try again</button>
              </div>
            ) : preview ? (
              <ol className="mt-5 space-y-3">
                {preview.lessons.map((lesson, index) => (
                  <li key={lesson.id} className="rounded-[18px] border border-[#e2d2b8] bg-white px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.11em] text-earth/70">{lesson.kind === "section" ? "Section opener" : `Lesson ${preview.lessons.slice(0, index + 1).filter((candidate) => candidate.kind === "lesson").length}`}</p>
                        <h3 className="mt-1 text-lg font-semibold leading-6 text-ink">{lesson.title}</h3>
                        <p className="mt-1.5 text-sm leading-6 text-ink/62">{lesson.summary}</p>
                        <p className="mt-2 text-xs font-medium text-ink/45">{lessonPageLabel(lesson)} · {lesson.pageCount} {lesson.pageCount === 1 ? "page" : "pages"} · about {lesson.estimatedMinutes} minutes</p>
                      </div>
                      <button type="button" onClick={() => setSelectedLesson(lesson)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[#b9cea5] bg-[#f5f9f0] px-4 py-2 text-sm font-semibold text-[#52713d] shadow-[0_3px_0_#d7e4c9] hover:-translate-y-px hover:bg-[#eef5e4]">
                        <EyeIcon /> View pages
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>

          <footer className="flex justify-end border-t border-[#e8d9bd] bg-[#fffaf2] px-5 py-4 sm:px-7">
            <button type="button" onClick={onClose} className="cta-button cta-button--muted cta-button--small">Back to Planner</button>
          </footer>
        </section>
      </div>

      {selectedLesson ? (
        <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-[#17130f]/78 p-3 backdrop-blur-[3px] sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby={lessonTitleId} className="flex h-[min(94vh,980px)] w-full max-w-6xl flex-col overflow-hidden rounded-[22px] border border-[#ddc9a5] bg-[#fffaf2] shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-[#e8d9bd] px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.08em] text-[#66864f]">Indexed lesson preview</p>
                <h3 id={lessonTitleId} className="mt-1 truncate text-lg font-semibold text-ink sm:text-xl">{selectedLesson.title}</h3>
                <p className="mt-1 text-sm text-ink/58">{preview?.title ?? workbookTitle} · {lessonPageLabel(selectedLesson)}</p>
              </div>
              <button type="button" onClick={() => setSelectedLesson(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dfceb0] bg-white text-xl text-earth hover:bg-[#f6eee2]" aria-label="Close lesson pages">×</button>
            </header>
            <div className="relative min-h-0 flex-1 bg-[#e9e5de]">
              {lessonPdfLoading ? <div className="absolute inset-0 z-10 grid place-items-center bg-[#f3efe8]"><div className="flex items-center gap-3 text-sm font-semibold text-ink/62"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#729954] border-r-transparent" /> Preparing original lesson pages…</div></div> : null}
              {lessonPdfError ? <div className="absolute inset-0 z-10 grid place-items-center bg-[#f3efe8] p-6"><div className="max-w-md rounded-[18px] bg-white px-5 py-4 text-center text-sm text-[#7d4034]"><p className="font-semibold">These lesson pages could not be opened.</p><p className="mt-1 leading-6">{lessonPdfError}</p></div></div> : null}
              {lessonPdfUrl ? <iframe src={lessonPdfUrl} title={`${selectedLesson.title} lesson pages`} className="h-full w-full border-0" /> : null}
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-[#e8d9bd] px-4 py-3 sm:px-6">
              <p className="text-xs text-ink/50">Original workbook pages are shown uncropped.</p>
              <button type="button" onClick={() => setSelectedLesson(null)} className="cta-button cta-button--muted cta-button--small">Back to lesson list</button>
            </footer>
          </section>
        </div>
      ) : null}
    </>,
    document.body
  );
}
