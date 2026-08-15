"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  playPointAwardSound,
  preloadPointAwardSound,
  unlockPointAwardSound
} from "../../lib/audio/point-award-sound";
import { showGlobalToast } from "../../lib/toast";

const COMMON_REASONS = [
  "Finished a lesson",
  "Excellent effort",
  "Kept trying",
  "Helped without being asked",
  "Great attitude",
  "Completed schoolwork"
] as const;

function formatPoints(amount: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(amount);
}

export function QuickAddPoints({
  profileId,
  studentName,
  initialBalance,
  singularName,
  pluralName,
  frequentReasons
}: {
  profileId: string;
  studentName: string;
  initialBalance: number;
  singularName: string;
  pluralName: string;
  frequentReasons: string[];
}) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(initialBalance);
  const [amount, setAmount] = useState("1");
  const reasons = useMemo(
    () => Array.from(new Set([...frequentReasons, ...COMMON_REASONS])).slice(0, 10),
    [frequentReasons]
  );
  const [reasonChoice, setReasonChoice] = useState(reasons[0] ?? "Finished a lesson");
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void preloadPointAwardSound();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, submitting]);

  function openDialog() {
    setAmount("1");
    setReasonChoice(reasons[0] ?? "Finished a lesson");
    setCustomReason("");
    setError(null);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    void unlockPointAwardSound();
    const pointAmount = Number(amount);
    const reason = reasonChoice === "__custom__" ? customReason.trim() : reasonChoice;
    if (!Number.isInteger(pointAmount) || pointAmount < 1) {
      setError("Enter a whole-number amount of at least 1.");
      return;
    }
    if (!reason) {
      setError("Enter a custom reason.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/student-points/award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, amount: pointAmount, reason })
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        amount?: number;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? `Could not award ${pluralName}.`);
      const awarded = Number(payload?.amount ?? pointAmount);
      setBalance((current) => current + awarded);
      setAmount("1");
      setReasonChoice(reasons[0] ?? "Finished a lesson");
      setCustomReason("");
      setOpen(false);
      showGlobalToast({
        kind: "success",
        text: `${awarded} ${awarded === 1 ? singularName : pluralName} awarded to ${studentName}.`
      });
      await playPointAwardSound();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not award ${pluralName}.`);
    } finally {
      setSubmitting(false);
    }
  }

  const dialog = open && typeof document !== "undefined" ? createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-[rgba(37,32,27,0.52)] p-2 sm:items-center sm:px-4 sm:py-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) setOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`quick-points-title-${profileId}`}
        className="relative w-full max-w-lg rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-6 shadow-[0_24px_70px_rgba(37,32,27,0.35)] sm:rounded-[30px] sm:px-8 sm:py-8"
      >
        <button
          type="button"
          aria-label="Close"
          disabled={submitting}
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white text-2xl text-earth shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          ×
        </button>
        <>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#587443]">Recognize good work</p>
            <h2 id={`quick-points-title-${profileId}`} className="mt-2 pr-12 text-[32px] font-semibold tracking-[-0.055em] text-ink">
              Add {pluralName} for {studentName}
            </h2>
            <form onSubmit={submit} className="mt-6 space-y-5" aria-busy={submitting}>
              <label className="block text-sm font-semibold text-ink">
                Number of {pluralName.toLowerCase()}
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  required
                  autoFocus
                  disabled={submitting}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="mt-2 min-h-14 w-full rounded-[17px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
                />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Reason
                <select
                  value={reasonChoice}
                  disabled={submitting}
                  onChange={(event) => setReasonChoice(event.target.value)}
                  className="mt-2 min-h-14 w-full rounded-[17px] border border-[#dcc8aa] bg-white py-3 pl-4 pr-12 text-base outline-none focus:border-[#8f6544]"
                >
                  {frequentReasons.length > 0 ? (
                    <optgroup label="Frequently used">
                      {frequentReasons.slice(0, 5).map((reason) => <option key={`frequent-${reason}`} value={reason}>{reason}</option>)}
                    </optgroup>
                  ) : null}
                  <optgroup label="Common reasons">
                    {COMMON_REASONS.filter((reason) => !frequentReasons.includes(reason)).map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </optgroup>
                  <option value="__custom__">Type a custom reason…</option>
                </select>
              </label>
              {reasonChoice === "__custom__" ? (
                <label className="block text-sm font-semibold text-ink">
                  Custom reason
                  <input
                    type="text"
                    maxLength={300}
                    required
                    disabled={submitting}
                    value={customReason}
                    onChange={(event) => setCustomReason(event.target.value)}
                    placeholder="What did they do?"
                    className="mt-2 min-h-14 w-full rounded-[17px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
                  />
                </label>
              ) : null}
              {error ? <p role="alert" className="rounded-[15px] border border-[#d9afa2] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">{error}</p> : null}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setOpen(false)}
                  className="px-5 py-3 text-sm font-semibold text-ink/58 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  data-click-sound="none"
                  onPointerDown={() => void unlockPointAwardSound()}
                  className="cta-button cta-button--light cta-button--small disabled:cursor-wait disabled:opacity-65"
                >
                  {submitting ? `Adding ${pluralName}…` : `Add ${pluralName}`}
                </button>
              </div>
            </form>
          </>
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-[#e7efdc] px-3 py-1.5 text-sm font-semibold text-[#4f703c]">
          {formatPoints(balance)}
        </span>
        <button
          type="button"
          onClick={openDialog}
          className="rounded-[12px] border border-[#b6ca9f] bg-white px-3 py-1.5 text-sm font-semibold text-[#55763f] shadow-[0_3px_0_#c8d8b8] transition-transform hover:-translate-y-px hover:text-[#3f5f2d]"
        >
          Add {pluralName}
        </button>
      </div>
      {dialog}
    </>
  );
}
