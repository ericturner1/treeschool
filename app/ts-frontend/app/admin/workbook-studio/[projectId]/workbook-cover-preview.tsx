"use client";

import { useEffect, useState } from "react";

type CoverColors = {
  ink: string;
  leaf: string;
  cream: string;
  canvas: string;
  accent: string;
};

export function WorkbookCoverPreview({
  projectId,
  title,
  gradeLabel,
  editionLabel,
  colors,
  available,
}: {
  projectId: string;
  title: string;
  gradeLabel: string;
  editionLabel: string;
  colors: CoverColors;
  available: boolean;
}) {
  const [open, setOpen] = useState(false);
  const previewUrl = `/api/workbook-studio/cover-preview/${encodeURIComponent(projectId)}`;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => available && setOpen(true)}
        disabled={!available}
        className="group flex min-h-36 items-center gap-4 rounded-[18px] border border-[#b9cfa5] bg-[#edf5e7] p-4 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:border-[#739e56] enabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          className="grid aspect-[210/297] h-24 shrink-0 place-items-center rounded-[4px] border-2 p-2 text-center shadow-md"
          style={{
            backgroundColor: colors.cream,
            borderColor: colors.leaf,
            color: colors.ink,
          }}
        >
          <span>
            <span
              className="block rounded px-1.5 py-1 text-[7px] font-black uppercase tracking-wide"
              style={{ backgroundColor: colors.accent, color: colors.canvas }}
            >
              {gradeLabel}
            </span>
            <span
              className="mt-3 block text-[10px] font-black leading-3"
              style={{ color: colors.accent }}
            >
              {title}
            </span>
          </span>
        </span>
        <span className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#567b40]">
            Front matter
          </span>
          <strong className="mt-1 block text-lg">Cover</strong>
          <span className="mt-2 block text-xs leading-5 text-ink/48">
            {available
              ? `Preview the print-ready ${editionLabel.toLowerCase()} cover.`
              : "Render a PDF to enable the exact cover preview."}
          </span>
          {available ? (
            <span className="mt-3 block text-xs font-bold text-[#486a38]">
              Preview →
            </span>
          ) : null}
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-[#201a14]/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} cover preview`}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div className="flex h-[min(92vh,960px)] w-full max-w-4xl flex-col overflow-hidden rounded-[22px] border border-[#d8c8ae] bg-[#fffaf2] shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-[#d8c8ae] px-4 py-3 sm:px-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-earth">
                  Print-ready preview
                </p>
                <h2 className="mt-1 font-semibold">{title} cover</h2>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-xs font-bold"
                >
                  Open separately ↗
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-[#d8c8ae] bg-white text-xl text-ink/65"
                  aria-label="Close cover preview"
                >
                  ×
                </button>
              </div>
            </div>
            <iframe
              src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              title={`${title} print-ready cover`}
              className="min-h-0 flex-1 bg-[#d8d2c9]"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
