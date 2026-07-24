"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export type PlanCreationStage =
  | "uploading"
  | "indexing"
  | "academic_review"
  | "planning"
  | "quality_review"
  | "ready";

export type PlanCreationProgressValue = {
  percent: number;
  label: string;
  detail?: string | null;
  stage?: PlanCreationStage;
  state?: "active" | "waiting" | "attention" | "recovering";
};

const PLAN_STAGES: Array<{ id: PlanCreationStage; label: string }> = [
  { id: "uploading", label: "Upload" },
  { id: "indexing", label: "Indexing" },
  { id: "academic_review", label: "Academic review" },
  { id: "planning", label: "Build plan" },
  { id: "quality_review", label: "Final review" },
  { id: "ready", label: "Ready" }
];

function inferStage(progress: PlanCreationProgressValue): PlanCreationStage {
  if (progress.stage) return progress.stage;
  if (progress.percent >= 100) return "ready";
  if (progress.percent >= 85) return "quality_review";
  if (progress.percent >= 45) return "planning";
  if (progress.percent >= 35) return "academic_review";
  if (progress.percent >= 10) return "indexing";
  return "uploading";
}

export function PlanCreationProgress({
  progress,
  compact = false
}: {
  progress: PlanCreationProgressValue;
  compact?: boolean;
}) {
  const router = useRouter();
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  const stage = inferStage(progress);
  const attention = progress.state === "attention";
  const recovering = progress.state === "recovering";
  const waiting = progress.state === "waiting";
  const warning = attention || recovering;
  const stageIndex = Math.max(0, PLAN_STAGES.findIndex((item) => item.id === stage));
  const progressSignature = useMemo(
    () => JSON.stringify([progress.percent, progress.label, progress.detail, stage, progress.state]),
    [progress.percent, progress.label, progress.detail, progress.state, stage]
  );
  const lastStatusChangeAt = useRef(Date.now());
  const lastRefreshAt = useRef(0);
  const statusCheckTimer = useRef<number | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    if (statusCheckTimer.current != null) window.clearTimeout(statusCheckTimer.current);
    lastStatusChangeAt.current = Date.now();
    lastRefreshAt.current = 0;
    setCheckingStatus(false);
  }, [progressSignature]);

  useEffect(() => {
    if (attention || !(["indexing", "planning", "quality_review"] as PlanCreationStage[]).includes(stage)) return;

    const handle = window.setInterval(() => {
      const now = Date.now();
      if (now - lastStatusChangeAt.current < 60_000 || now - lastRefreshAt.current < 20_000) return;
      lastRefreshAt.current = now;
      setCheckingStatus(true);
      router.refresh();
      statusCheckTimer.current = window.setTimeout(() => {
        lastStatusChangeAt.current = Date.now();
        setCheckingStatus(false);
      }, 4_000);
    }, 5_000);

    return () => {
      window.clearInterval(handle);
      if (statusCheckTimer.current != null) window.clearTimeout(statusCheckTimer.current);
    };
  }, [attention, router, stage, progressSignature]);

  const displayedLabel = checkingStatus ? "Getting the latest status…" : progress.label;
  const displayedDetail = checkingStatus
    ? "Treeschool is checking your materials and plan now. This page will update automatically."
    : progress.detail;

  return (
    <div className="w-full" role="status" aria-live="polite">
      <ol className="mb-3 flex w-full items-center gap-1 overflow-x-auto pb-1" aria-label="Plan creation steps">
        {PLAN_STAGES.map((item, index) => {
          const complete = stage === "ready" ? index <= stageIndex : index < stageIndex;
          const active = index === stageIndex && stage !== "ready";
          return (
            <li key={item.id} className="flex min-w-0 shrink-0 items-center gap-1">
              {index > 0 ? <span aria-hidden="true" className="text-[10px] font-black text-ink/24">›</span> : null}
              <span
                aria-current={active ? "step" : undefined}
                className={`rounded-full border px-2 py-1 text-[10px] font-bold whitespace-nowrap ${
                  complete
                    ? "border-[#91ae70] bg-[#7fa15a] text-white"
                    : active
                      ? warning
                        ? "border-[#c99749] bg-[#fff4d9] text-[#805c22]"
                        : "border-[#6f914f] bg-[#eef5e4] text-[#4d6a39]"
                      : "border-[#ded7cb] bg-white text-ink/42"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {active && attention ? (
                    <span aria-hidden="true" className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-[#c99749] text-[9px] font-black leading-none text-white">!</span>
                  ) : active && waiting ? (
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-current bg-white" />
                  ) : active ? (
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
                    />
                  ) : complete ? <span aria-hidden="true">✓</span> : null}
                  <span>{item.label}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-baseline justify-between gap-4">
        <p className={`${compact ? "text-sm" : "text-base"} font-semibold ${warning ? "text-[#805c22]" : "text-[#4d6a39]"}`}>{displayedLabel}</p>
        <span className={`shrink-0 text-xs font-black ${warning ? "text-[#805c22]" : "tabular-nums text-[#567b40]"}`}>
          {attention ? "Action required" : recovering ? "Correcting automatically" : waiting ? "Waiting for you" : `${percent}%`}
        </span>
      </div>
      <div
        className={`${compact ? "mt-2 h-2.5" : "mt-3 h-3"} overflow-hidden rounded-full border ${warning ? "border-[#d7b26f] bg-[#fffaf0]" : "border-[#bfd1aa] bg-white"}`}
        role="progressbar"
        aria-label={displayedLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${warning ? "bg-gradient-to-r from-[#c99749] to-[#e0bd78]" : "bg-gradient-to-r from-[#7fa15a] to-[#a9c37f]"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {displayedDetail ? <p className="mt-2 text-xs leading-5 text-ink/58">{displayedDetail}</p> : null}
    </div>
  );
}
