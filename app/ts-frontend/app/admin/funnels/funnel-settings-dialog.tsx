"use client";

import { useRef } from "react";
import type { AdminFunnel, AdminFunnelStatus } from "../../../lib/funnels/server";
import { deleteFunnelAction, saveFunnelAction } from "./actions";
import { FunnelSubmitButton } from "./funnel-submit-button";

export function FunnelSettingsDialog({
  funnel,
  statuses
}: {
  funnel: AdminFunnel;
  statuses: readonly AdminFunnelStatus[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-[#d8c7ae] bg-[#fffaf2] px-4 text-sm font-semibold text-[#74573e] transition hover:border-[#9a795c] hover:bg-white hover:text-[#4f3524] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f994f]"
        aria-label="Funnel settings"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9v.01A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
        </svg>
        Funnel settings
      </button>

      <dialog
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        className="m-auto w-[min(760px,calc(100%-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] p-0 text-ink shadow-[0_28px_90px_rgba(42,29,18,.28)] backdrop:bg-[#2b2118]/55"
        aria-labelledby="funnel-settings-title"
      >
        <div className="flex items-start justify-between gap-5 border-b border-[#eadbc5] px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6f994f]">Funnel</p>
            <h2 id="funnel-settings-title" className="mt-1 text-3xl font-semibold tracking-[-0.045em]">Settings</h2>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#ddd0bd] bg-white text-2xl leading-none text-ink/55 transition hover:text-ink"
            aria-label="Close funnel settings"
          >
            &times;
          </button>
        </div>

        <form action={saveFunnelAction} className="grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
          <input type="hidden" name="id" value={funnel.id} />
          <input type="hidden" name="currentSlug" value={funnel.slug} />
          <label className="grid gap-2 text-sm font-semibold">
            Funnel name
            <input name="name" required defaultValue={funnel.name} className="ts-input" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Admin URL slug
            <input name="slug" required defaultValue={funnel.slug} className="ts-input" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Status
            <select name="status" defaultValue={funnel.status} className="ts-input">
              {statuses.map((status) => (
                <option key={status} value={status}>{status[0]?.toUpperCase()}{status.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Badge label
            <input name="badgeLabel" defaultValue={funnel.badgeLabel ?? ""} className="ts-input" />
          </label>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
            Audience
            <textarea name="audience" rows={2} defaultValue={funnel.audience} className="ts-input resize-y" />
          </label>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
            Objective
            <textarea name="objective" rows={2} defaultValue={funnel.objective} className="ts-input resize-y" />
          </label>
          <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
            <button type="button" onClick={closeDialog} className="cta-button cta-button--outline cta-button--small">
              Cancel
            </button>
            <FunnelSubmitButton label="Save settings" />
          </div>
        </form>

        <div className="border-t border-[#eadbc5] bg-[#fff7f3] p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-lg">
              <h3 className="text-base font-semibold text-[#8c4536]">Delete funnel</h3>
              <p className="mt-1 text-sm leading-6 text-ink/65">
                Permanently remove this funnel, its pages, experiments, leads, and analytics. Completed sale records remain in your business history.
              </p>
            </div>
            <form action={deleteFunnelAction}>
              <input type="hidden" name="funnelId" value={funnel.id} />
              <input type="hidden" name="funnelSlug" value={funnel.slug} />
              <FunnelSubmitButton
                label="Delete funnel"
                pendingLabel="Deleting…"
                tone="danger"
                confirmMessage={`Permanently delete “${funnel.name}”? Its pages, experiments, leads, and analytics will be removed. This cannot be undone.`}
                className="shrink-0"
              />
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
