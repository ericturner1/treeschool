"use client";

import { useState } from "react";

function filenameFromDisposition(disposition: string, fallback: string) {
  const encoded = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]?.trim().replace(/^"|"$/g, "");
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Use the plain filename or fallback below.
    }
  }
  return disposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1]?.trim() ?? fallback;
}

function DownloadIcon({ spinning }: { spinning: boolean }) {
  return spinning ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18v2h14v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReportDownloadButton({
  href,
  label,
  fallbackFilename,
}: {
  href: string;
  label: string;
  fallbackFilename: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not prepare this PDF.");
      }
      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("Content-Disposition") ?? "",
        fallbackFilename,
      );
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Could not prepare this PDF.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={download}
        disabled={pending}
        className="cta-button cta-button--light cta-button--small disabled:cursor-wait disabled:opacity-65"
      >
        <DownloadIcon spinning={pending} />
        {pending ? "Preparing PDF..." : label}
      </button>
      {error ? <p role="alert" className="max-w-[280px] text-xs font-semibold leading-5 text-[#8b3e2f]">{error}</p> : null}
    </div>
  );
}
