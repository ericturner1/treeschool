"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const CONFIRMATION = "RUN BACKUP";

export function BackupActions({
  configured,
  backupRunning,
}: {
  configured: boolean;
  backupRunning: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting]);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setConfirmation("");
    setError(null);
    setMessage(null);
  };

  const runBackup = async () => {
    if (confirmation !== CONFIRMATION || submitting) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/backups/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const payload = await response.json().catch(() => ({})) as {
        started?: boolean;
        reason?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not start the backup.");
      setMessage(payload.reason === "already_running"
        ? "A backup is already running. No duplicate was started."
        : "Backup requested. It should appear in Recent archives shortly.");
      setConfirmation("");
      window.setTimeout(() => router.refresh(), 1_500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the backup.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMessage(null);
            setError(null);
          }}
          disabled={!configured || backupRunning}
          className="rounded-[14px] border border-[#456a35] bg-[#6f9f52] px-5 py-3 text-sm font-bold text-white shadow-[0_4px_0_#456a35] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-[#b9b4aa] disabled:bg-[#cbc7bf] disabled:shadow-none disabled:hover:translate-y-0"
        >
          {backupRunning ? "Backup in progress" : "Run backup now"}
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="rounded-[14px] border border-[#d8c8ae] bg-white px-5 py-3 text-sm font-semibold text-ink/70 transition hover:border-[#9fbd89] hover:text-[#486a38]"
        >
          Refresh status
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-[#1c241a]/55 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-backup-title"
            className="w-full max-w-lg rounded-[26px] border border-[#d8c8ae] bg-[#fffaf2] p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#567b40]">Manual archive</p>
                <h2 id="run-backup-title" className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Run a backup now?</h2>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                aria-label="Close"
                className="grid h-10 w-10 flex-none place-items-center rounded-full border border-[#d8c8ae] bg-white text-xl text-ink/55 disabled:opacity-40"
              >
                ×
              </button>
            </div>
            <div className="mt-5 rounded-[16px] border border-[#bdd2ad] bg-[#eef6e8] px-4 py-3 text-sm leading-6 text-[#3f5d31]">
              This is non-destructive. It creates a new encrypted archive and does not change production data.
            </div>
            <label className="mt-5 block text-sm font-semibold" htmlFor="backup-confirmation">
              Type <span className="rounded bg-[#eee7dc] px-1.5 py-0.5 font-mono text-xs">{CONFIRMATION}</span> to continue
            </label>
            <input
              id="backup-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoFocus
              disabled={submitting || Boolean(message)}
              className="mt-2 w-full rounded-[14px] border border-[#cdbb9f] bg-white px-4 py-3 font-mono text-sm outline-none focus:border-[#729b58] focus:ring-4 focus:ring-[#dbe9cf] disabled:opacity-60"
            />
            {error ? <p role="alert" className="mt-3 text-sm font-semibold text-[#a54636]">{error}</p> : null}
            {message ? <p role="status" className="mt-3 text-sm font-semibold text-[#456a35]">{message}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {message ? "Done" : "Cancel"}
              </button>
              {!message ? (
                <button
                  type="button"
                  onClick={runBackup}
                  disabled={submitting || confirmation !== CONFIRMATION}
                  className="rounded-[13px] bg-[#567b40] px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#aaa69e]"
                >
                  {submitting ? "Starting…" : "Create backup"}
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
