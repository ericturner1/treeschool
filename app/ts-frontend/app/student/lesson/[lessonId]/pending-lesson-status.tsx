"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type PendingLessonStatusProps = {
  latestGenerationLog: {
    timestamp: string;
    stage: string;
    message: string;
  } | null;
  backLabel: string;
  backHref?: string;
};

function formatGenerationTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "UTC"
  }).format(date);
}

export function PendingLessonStatus({
  latestGenerationLog,
  backLabel,
  backHref = "/student/classroom"
}: PendingLessonStatusProps) {
  const router = useRouter();
  const isRecoveryState =
    latestGenerationLog?.stage === "invalid-quiz" || latestGenerationLog?.stage === "error";
  const isQueuedState = latestGenerationLog?.stage === "queued";

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [router]);

  return (
    <section className="mt-0">
      <div className="site-panel rounded-[28px] px-6 py-10 text-center">
        <div className="mx-auto flex w-fit items-center gap-3 rounded-[999px] bg-[#fffaf2] px-5 py-3">
          <span className="lesson-loading-dot lesson-loading-dot--one" />
          <span className="lesson-loading-dot lesson-loading-dot--two" />
          <span className="lesson-loading-dot lesson-loading-dot--three" />
        </div>
        <p className="mt-5 text-sm uppercase tracking-[0.18em] text-earth/80">Preparing lesson</p>
        <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.05em] text-ink">
          {isQueuedState
            ? "This lesson is waiting for another lesson to finish generating."
            : isRecoveryState
            ? "This lesson had a generation issue and is being prepared again."
            : "This lesson is being prepared. Please come back later."}
        </h2>
        <p className="mt-3 text-base leading-[1.8] text-ink/72">
          {isQueuedState
            ? "Only one lesson is generated at a time. This page checks the queue every 15 seconds."
            : isRecoveryState
            ? "This page checks for regenerated lesson content every 15 seconds."
            : "This page checks for updates every 15 seconds."}
        </p>
        {latestGenerationLog ? (
          <div className="mx-auto mt-5 max-w-2xl rounded-[18px] bg-[#fffaf2] px-4 py-4 text-left">
            <p className="text-xs uppercase tracking-[0.18em] text-earth/70">Latest update</p>
            <p className="mt-2 text-sm font-semibold text-ink">{latestGenerationLog.stage}</p>
            <p className="mt-1 text-sm leading-[1.7] text-ink/72">{latestGenerationLog.message}</p>
            <p className="mt-2 text-xs text-ink/52">
              {formatGenerationTimestamp(latestGenerationLog.timestamp)} UTC
            </p>
          </div>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.refresh()}
            className="cta-button cta-button--light cta-button--small"
          >
            Refresh now
          </button>
          <a href={backHref} className="cta-button cta-button--outline cta-button--small">
            {backLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
