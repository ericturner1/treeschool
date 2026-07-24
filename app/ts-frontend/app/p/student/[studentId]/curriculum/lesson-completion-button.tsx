"use client";

import { useState } from "react";
import { usePlanDayProgress, useWeekProgress } from "./week-progress-state";

export function LessonCompletionButton({
  profileId,
  weeklyPlanId,
  dayNumber,
  subjectKey,
  canUndo
}: {
  profileId: string;
  weeklyPlanId: string;
  dayNumber: number;
  subjectKey: string;
  canUndo: boolean;
}) {
  const day = usePlanDayProgress(dayNumber);
  const { setSubjectCompleted } = useWeekProgress();
  const completed = day.completedSubjectKeys.includes(subjectKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(nextCompleted: boolean) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/paper-plan/lesson-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          weeklyPlanId,
          dayNumber,
          subjectKey,
          completed: nextCompleted
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not update the lesson.");
      setSubjectCompleted(dayNumber, subjectKey, nextCompleted);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the lesson.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {completed ? (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#e1edd7] px-3 py-2 text-xs font-bold text-[#486a38]">Done ✓</span>
          {canUndo ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => update(false)}
              className="text-xs font-semibold text-ink/48 underline decoration-ink/25 underline-offset-4 hover:text-earth disabled:cursor-wait disabled:opacity-55"
            >
              {pending ? "Undoing…" : "Undo"}
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => update(true)}
          className="rounded-full border border-[#97b67f] bg-[#f6faef] px-4 py-2 text-xs font-bold text-[#486a38] shadow-[0_2px_0_#c9dbba] transition hover:bg-[#ebf4df] disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Marking…" : "Mark done"}
        </button>
      )}
      {error ? <p role="alert" className="mt-1.5 max-w-52 text-right text-[11px] font-semibold text-[#8b3e2f]">{error}</p> : null}
    </div>
  );
}
