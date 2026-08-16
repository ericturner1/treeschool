"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function WorkbookCoverPreview({
  projectId,
  title,
  editionLabel,
  available,
  renderKey,
}: {
  projectId: string;
  title: string;
  editionLabel: string;
  available: boolean;
  renderKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const previewUrl = `/api/workbook-studio/cover-preview/${encodeURIComponent(projectId)}`;
  const thumbnailUrl = `${previewUrl}?format=png&render=${encodeURIComponent(renderKey ?? "latest")}`;

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
        className="group flex min-h-28 w-full items-center gap-4 rounded-[18px] border border-[#b9cfa5] bg-[#edf5e7] p-4 text-left transition enabled:hover:border-[#739e56] enabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="relative aspect-[210/297] h-24 shrink-0 overflow-hidden rounded-[5px] border border-[#9fbd89] bg-white shadow-md">
          {available ? (
            <Image
              src={thumbnailUrl}
              alt={`${title} rendered cover`}
              fill
              sizes="68px"
              unoptimized
              className="object-cover"
            />
          ) : (
            <span className="grid h-full place-items-center px-2 text-center text-[9px] font-bold text-ink/45">
              Not rendered
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#567b40]">
            Front matter
          </span>
          <strong className="mt-1 block text-lg">Cover</strong>
          <span className="mt-2 block text-xs leading-5 text-ink/48">
            {available
              ? `Preview the print-ready ${editionLabel.toLowerCase()} cover.`
              : "Render a PDF to enable the exact cover preview."}
          </span>
        </span>
        {available ? (
          <span className="ml-auto shrink-0 text-sm font-bold text-[#486a38]">
            Open →
          </span>
        ) : null}
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
