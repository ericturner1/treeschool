"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type DownloadFormat = "week" | "days";

function downloadFilename(contentDisposition: string, fallback: string) {
  const encoded = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]?.trim().replace(/^"|"$/g, "");
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Fall through to the plain filename or local fallback.
    }
  }
  return contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1]?.trim() ?? fallback;
}

function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`${className} animate-spin`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function WeeklyPdfButton({
  href,
  weekNumber,
  pageCount,
  dayCount,
  compact = false,
  wiggle = false
}: {
  href: string;
  weekNumber: number;
  pageCount: number;
  dayCount: number;
  compact?: boolean;
  wiggle?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<DownloadFormat>("week");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, pending]);

  function showDialog(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    setFormat("week");
    setError(null);
    setOpen(true);
  }

  async function download() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const separator = href.includes("?") ? "&" : "?";
      const response = await fetch(`${href}${separator}format=${format}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not prepare this download.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fallback = format === "days" ? `week-${weekNumber}-separate-days.zip` : `week-${weekNumber}.pdf`;
      const filename = downloadFilename(disposition, fallback);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setOpen(false);
      router.refresh();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Could not prepare this download.");
    } finally {
      setPending(false);
    }
  }

  const dialog = open ? createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/45 p-2 sm:items-center sm:px-4 sm:py-8"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !pending) setOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`week-${weekNumber}-download-title`}
        className="relative max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-xl overflow-y-auto rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-4 shadow-2xl sm:max-h-[92vh] sm:rounded-[28px] sm:p-8"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          aria-label="Close download options"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl leading-none text-earth shadow-sm transition hover:bg-[#f6eee1] disabled:opacity-40"
        >
          ×
        </button>

        <p className="text-xs font-bold uppercase tracking-[0.14em] text-earth">Week {weekNumber}</p>
        <h2 id={`week-${weekNumber}-download-title`} className="mt-2 pr-12 text-[25px] font-semibold leading-tight tracking-[-0.05em] text-ink sm:text-[30px]">
          How would you like it packaged?
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink/62">Both choices contain the complete week.</p>

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={() => setFormat("week")}
            disabled={pending}
            className={`flex min-w-0 items-center gap-3 rounded-[18px] border-2 px-4 py-3.5 text-left transition sm:gap-4 sm:rounded-[20px] sm:px-5 sm:py-4 ${
              format === "week"
                ? "border-[#82a760] bg-[#eef5e4] shadow-[0_4px_0_#c4d8b2]"
                : "border-[#e1ceb0] bg-white hover:border-[#c8ac84]"
            }`}
          >
            <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 ${format === "week" ? "border-[#6f9550]" : "border-[#cbb99f]"}`}>
              {format === "week" ? <span className="h-3 w-3 rounded-full bg-[#6f9550]" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-ink">One weekly PDF</span>
              <span className="mt-0.5 block text-sm text-ink/58">{pageCount} pages in one printable file</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFormat("days")}
            disabled={pending || dayCount < 1}
            className={`flex min-w-0 items-center gap-3 rounded-[18px] border-2 px-4 py-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 sm:gap-4 sm:rounded-[20px] sm:px-5 sm:py-4 ${
              format === "days"
                ? "border-[#82a760] bg-[#eef5e4] shadow-[0_4px_0_#c4d8b2]"
                : "border-[#e1ceb0] bg-white hover:border-[#c8ac84]"
            }`}
          >
            <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 ${format === "days" ? "border-[#6f9550]" : "border-[#cbb99f]"}`}>
              {format === "days" ? <span className="h-3 w-3 rounded-full bg-[#6f9550]" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-ink">Separate PDF for each day</span>
              <span className="mt-0.5 block text-sm text-ink/58">
                {dayCount > 0
                  ? `${dayCount} daily PDFs · ${Math.max(0, pageCount - 1)} pages total · one ZIP file`
                  : "Day-by-day scheduling is unavailable for this older plan"}
              </span>
            </span>
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-[14px] border border-[#d9afa2] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={download}
          disabled={pending}
          className="cta-button mt-6 w-full justify-center disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? (
            <><Spinner className="h-5 w-5" /><span>Preparing your files…</span></>
          ) : format === "days" ? (
            <span>Download {dayCount} daily PDFs</span>
          ) : (
            <span>Download weekly PDF</span>
          )}
        </button>
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={showDialog}
        disabled={pending}
        aria-busy={pending}
        aria-label={`Choose a download format for Week ${weekNumber}`}
        title="Download lesson plan"
        className={`${compact
          ? "inline-flex h-11 w-14 flex-none items-center justify-center rounded-[14px] border-2 border-[#b8cda8] bg-[#e5efd9] text-[#486a38] shadow-[0_5px_0_#b8cda8] transition duration-150 hover:-translate-y-1 hover:border-[#9ebc8a] hover:bg-[#d9e8cb] hover:shadow-[0_8px_0_#9ebc8a] active:translate-y-[3px] active:shadow-none disabled:opacity-50"
          : "cta-button cta-button--light cta-button--small gap-2 disabled:opacity-50"} ${wiggle && !pending ? "pdf-download-wiggle" : ""}`}
      >
        {pending ? (
          <><Spinner /><span className="sr-only">Preparing download</span></>
        ) : (
          <>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={compact ? "h-7 w-7" : "h-6 w-6"}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 2.75h7l4.5 4.5v14H6.75zM13.75 2.75v4.5h4.5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12.5 10.25v6m0 0 2.5-2.5m-2.5 2.5-2.5-2.5M9.5 19h6" />
            </svg>
            {!compact ? <span>Download Week {weekNumber}</span> : null}
          </>
        )}
      </button>
      {dialog}
    </>
  );
}
