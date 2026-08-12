"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ManagedFunnelPageRevisionSummary } from "../../../lib/funnels/server";

const SOURCE_LABELS: Record<ManagedFunnelPageRevisionSummary["source"], string> = {
  manual: "Manual edit",
  ai: "AI generation",
  imported: "Imported page"
};

function revisionDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value)) + " UTC";
}

export function FunnelVersionsPanel({
  funnelId,
  stepId,
  pageId,
  latestRevisionNumber,
  publishedRevisionNumber,
  revisions
}: {
  funnelId: string;
  stepId: string;
  pageId: string;
  latestRevisionNumber: number;
  publishedRevisionNumber: number | null;
  revisions: ManagedFunnelPageRevisionSummary[];
}) {
  const router = useRouter();
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pastRevisions = revisions.filter(
    (revision) => revision.revisionNumber !== latestRevisionNumber
  );

  async function restore() {
    if (!selectedRevision || restoring) return;
    if (!window.confirm(
      `Restore revision ${selectedRevision} as a new draft? The live page will not change until you publish it.`
    )) return;

    setRestoring(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/funnels/pages/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          funnelId,
          stepId,
          pageId,
          revisionNumber: selectedRevision
        })
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        page?: { latestRevisionNumber: number };
      };
      if (!response.ok || !payload.page) {
        throw new Error(payload.error || "Could not restore the page revision.");
      }
      setNotice(
        `Revision ${selectedRevision} was restored as new draft revision ${payload.page.latestRevisionNumber}.`
      );
      setSelectedRevision(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore the page revision.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <section className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-[-0.04em]">Page versions</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/55">
            Select a past revision to copy it into a new draft. Revision history is
            preserved, and the live page stays unchanged until you publish.
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedRevision || restoring}
          onClick={() => void restore()}
          className="cta-button cta-button--light cta-button--small min-w-40 justify-center disabled:cursor-not-allowed disabled:opacity-45"
        >
          {restoring ? (
            <span className="inline-flex items-center gap-2">
              <span className="ts-spinner h-4 w-4" aria-hidden="true" />
              Restoring…
            </span>
          ) : selectedRevision ? `Restore revision ${selectedRevision}` : "Select a version"}
        </button>
      </div>

      {notice ? (
        <p role="status" className="mt-5 rounded-[14px] border border-[#b9cfa5] bg-[#eef5e7] px-4 py-3 text-sm font-semibold text-[#4f6f3c]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 rounded-[14px] border border-[#e0ac9f] bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#8c4536]">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-2">
        {revisions.map((revision) => {
          const isCurrent = revision.revisionNumber === latestRevisionNumber;
          const isPublished = revision.revisionNumber === publishedRevisionNumber;
          const selected = revision.revisionNumber === selectedRevision;
          return (
            <label
              key={revision.revisionNumber}
              className={`flex items-center gap-4 rounded-[16px] border px-4 py-4 transition ${
                isCurrent
                  ? "cursor-default border-[#b9cfa5] bg-[#f1f7eb]"
                  : selected
                    ? "cursor-pointer border-[#739655] bg-[#f7fbf3] ring-2 ring-[#739655]/20"
                    : "cursor-pointer border-[#ded3c3] bg-white hover:border-[#b9cfa5]"
              }`}
            >
              <input
                type="radio"
                name="funnel-page-revision"
                value={revision.revisionNumber}
                checked={selected}
                disabled={isCurrent || restoring}
                onChange={() => setSelectedRevision(revision.revisionNumber)}
                className="h-4 w-4 shrink-0 accent-[#6f994f]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong>Revision {revision.revisionNumber}</strong>
                  {isCurrent ? <span className="rounded-full bg-[#dfead4] px-2 py-0.5 text-[10px] font-black uppercase tracking-[.08em] text-[#4f6f3c]">Current draft</span> : null}
                  {isPublished ? <span className="rounded-full bg-[#f3e7cf] px-2 py-0.5 text-[10px] font-black uppercase tracking-[.08em] text-[#76552f]">Live</span> : null}
                </span>
                <span className="mt-1 block text-xs text-ink/48">
                  {SOURCE_LABELS[revision.source]} · {revisionDate(revision.createdAt)}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {!pastRevisions.length ? (
        <p className="mt-5 rounded-[16px] border border-dashed border-[#cdbfa9] bg-white p-5 text-sm text-ink/52">
          No past versions yet. Each save in the page editor creates another immutable revision here.
        </p>
      ) : null}
    </section>
  );
}
