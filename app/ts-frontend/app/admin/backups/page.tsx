import { notFound, redirect } from "next/navigation";
import { getAdminBackupStatus, type AdminBackupExecution } from "../../../lib/admin/server";
import { getCurrentUser } from "../../../lib/auth/server";
import { getNativeWorkbookNavigation } from "../../../lib/native-workbooks/server";
import { BackupActions } from "./backup-actions";

const DISPLAY_TIME_ZONE = "Asia/Tokyo";

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

const STATUS_STYLES: Record<AdminBackupExecution["status"], string> = {
  succeeded: "border-[#b7d3a4] bg-[#eef7e8] text-[#456a35]",
  failed: "border-[#e7b9ad] bg-[#fff0ec] text-[#9a4032]",
  running: "border-[#d9c58b] bg-[#fff8de] text-[#79631f]",
  unknown: "border-[#d7d1c8] bg-[#f4f1ec] text-ink/55",
};

function StatusPill({ status }: { status: AdminBackupExecution["status"] }) {
  const label = status === "succeeded" ? "Archived" : status[0].toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[status]}`}>
      <span className={`h-2 w-2 rounded-full ${status === "succeeded" ? "bg-[#65934b]" : status === "failed" ? "bg-[#c55b49]" : status === "running" ? "animate-pulse bg-[#c59e25]" : "bg-[#99948b]"}`} />
      {label}
    </span>
  );
}

export default async function AdminBackupsPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/backups");
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();
  const status = await getAdminBackupStatus(user.id).catch(() => null);
  const running = status?.executions.some((execution) => execution.status === "running") ?? false;

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#567b40]">Resilience & recovery</p>
            <h1 className="mt-2 text-[36px] font-semibold tracking-[-0.055em]">Academic progress backups</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/58">
              Monitor encrypted production archives and request an extra backup before a risky operation.
            </p>
          </div>
          <BackupActions configured={status?.configured ?? false} backupRunning={running} />
        </header>

        {!status ? (
          <section className="mt-8 rounded-[22px] border border-[#e5c2b7] bg-[#fff3ee] px-5 py-4 text-sm text-[#8e4436]">
            Backup status is temporarily unavailable. This does not stop the automatic schedule; check the configured alert channel for failures.
          </section>
        ) : !status.configured ? (
          <section className="mt-8 rounded-[22px] border border-[#dfca8a] bg-[#fff8df] px-5 py-4 text-sm text-[#765f1c]">
            The backup job is not configured in this environment. Manual backup controls are disabled.
          </section>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Backup summary">
          <article className="rounded-[24px] border border-[#bdd2ad] bg-[#f5fbf1] p-5 shadow-[0_9px_24px_rgba(70,95,50,.05)]">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#567b40]">Latest protected archive</p>
            <p className="mt-4 text-xl font-semibold tracking-[-0.025em]">{formatDate(status?.latestSuccessfulAt ?? null)}</p>
            <p className="mt-3 text-sm leading-5 text-ink/52">A successful run means the encrypted upload completed and passed its archive-size check.</p>
          </article>
          <article className="rounded-[24px] border border-[#ddd2c1] bg-white p-5 shadow-[0_9px_24px_rgba(78,61,43,.04)]">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/48">Automatic schedule</p>
            <p className="mt-4 text-xl font-semibold tracking-[-0.025em]">{status?.schedule.description ?? "Daily"}</p>
            <p className="mt-3 text-sm leading-5 text-ink/52">{status?.schedule.timeZone ?? DISPLAY_TIME_ZONE} · failure alerts are sent by the backup infrastructure.</p>
          </article>
          <article className="rounded-[24px] border border-[#ddd2c1] bg-white p-5 shadow-[0_9px_24px_rgba(78,61,43,.04)]">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/48">Retention</p>
            <p className="mt-4 text-xl font-semibold tracking-[-0.025em]">{status?.retention.nightlyDays ?? 100} days</p>
            <p className="mt-3 text-sm leading-5 text-ink/52">Nightly archives are retained, with monthly recovery points kept for {status?.retention.monthlyDays ?? 370} days.</p>
          </article>
        </section>

        <section className="mt-6 overflow-hidden rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2]">
          <div className="border-b border-[#eadcc7] px-5 py-4 sm:px-6">
            <h2 className="text-xl font-semibold tracking-[-0.03em]">Recent backup archives</h2>
            <p className="mt-1 text-sm text-ink/50">Operational status only. Archive contents and encryption keys are deliberately not exposed to the web app.</p>
          </div>
          {status?.executions.length ? (
            <div className="divide-y divide-[#eadcc7]">
              {status.executions.map((execution) => (
                <article key={execution.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold text-ink/62">{execution.id}</p>
                    <p className="mt-1 text-xs text-ink/45">Started {formatDate(execution.startedAt ?? execution.createdAt)}</p>
                  </div>
                  <p className="text-xs font-semibold text-ink/48">{formatDuration(execution.durationSeconds)}</p>
                  <StatusPill status={execution.status} />
                </article>
              ))}
            </div>
          ) : (
            <p className="px-6 py-10 text-sm text-ink/50">No backup executions are visible in this environment yet.</p>
          )}
        </section>

        <section className="mt-6 rounded-[24px] border-2 border-[#d69a8d] bg-[#fff7f4] p-5 sm:p-6">
          <div className="flex gap-4">
            <div className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[#f4d6ce] text-xl" aria-hidden="true">🔒</div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#a34839]">Destructive recovery is deliberately locked out</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">There is no one-click production restore</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/60">
                A restore can overwrite current academic progress. Recovery must be performed manually into an isolated database, validated, and explicitly approved before any production cutover. The application service has neither archive access nor the decryption key.
              </p>
              <div className="mt-4 grid gap-2 text-sm font-semibold text-[#86483d] sm:grid-cols-3">
                <span className="rounded-[12px] border border-[#e2b7ad] bg-white/70 px-3 py-2">1. Restore in isolation</span>
                <span className="rounded-[12px] border border-[#e2b7ad] bg-white/70 px-3 py-2">2. Validate family data</span>
                <span className="rounded-[12px] border border-[#e2b7ad] bg-white/70 px-3 py-2">3. Approve production cutover</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
