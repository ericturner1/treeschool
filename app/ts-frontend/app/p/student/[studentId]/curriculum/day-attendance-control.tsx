"use client";

import { type FormEvent, useState } from "react";
import { usePlanDayProgress, useWeekProgress } from "./week-progress-state";

type SubjectOption = { subjectKey: string; subjectLabel: string };

export function DayAttendanceControl({
  profileId,
  weeklyPlanId,
  dayNumber,
  subjects
}: {
  profileId: string;
  weeklyPlanId: string;
  dayNumber: number;
  subjects: SubjectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = usePlanDayProgress(dayNumber);
  const { setSubjectCompleted, setSubjectsCompleted } = useWeekProgress();
  const completedKeys = new Set(day.completedSubjectKeys);
  const remainingSubjects = subjects.filter((subject) => !completedKeys.has(subject.subjectKey));
  const today = new Date().toISOString().slice(0, 10);

  const buttonLabel = day.status === "completed"
    ? "Done ✓"
    : day.status === "in_progress"
      ? "Mark remaining done"
      : "Mark all done";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || remainingSubjects.length === 0) return;
    const formData = new FormData(event.currentTarget);
    const subjectKeys = remainingSubjects.map((subject) => subject.subjectKey);
    setPending(true);
    setError(null);
    setSubjectsCompleted(dayNumber, subjectKeys);
    try {
      const response = await fetch("/api/paper-plan/lesson-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          weeklyPlanId,
          dayNumber,
          subjectKeys,
          attendanceDate: String(formData.get("attendanceDate") ?? today)
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not complete the lessons.");
      setOpen(false);
    } catch (caught) {
      for (const subjectKey of subjectKeys) setSubjectCompleted(dayNumber, subjectKey, false);
      setError(caught instanceof Error ? caught.message : "Could not complete the lessons.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true); }}
        disabled={day.status === "completed" || remainingSubjects.length === 0}
        className="rounded-full border border-[#a9c491] bg-white px-3 py-2 text-xs font-semibold text-[#4d6a39] transition hover:bg-[#eef5e4] disabled:cursor-default disabled:border-[#ced9c4] disabled:bg-[#eef2ea] disabled:text-[#718067]"
      >
        {buttonLabel}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`day-${weeklyPlanId}-${dayNumber}-attendance-title`}
          className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-[#2d241c]/45 p-2 sm:items-center sm:px-4 sm:py-8"
          onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}
        >
          <form onSubmit={submit} className="relative max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-4 shadow-2xl sm:rounded-[26px] sm:p-7">
            <button type="button" disabled={pending} onClick={() => setOpen(false)} aria-label="Close attendance dialog" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl text-earth shadow-sm disabled:opacity-50">×</button>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-earth">Day {dayNumber}</p>
            <h3 id={`day-${weeklyPlanId}-${dayNumber}-attendance-title`} className="mt-2 pr-12 text-[26px] font-semibold tracking-[-0.05em] text-ink">
              Mark the remaining lessons done?
            </h3>
            <p className="mt-2 text-sm leading-6 text-ink/62">
              This records attendance and completes every unfinished lesson in Day {dayNumber}. You can mark lessons individually from their cards instead.
            </p>
            <label className="mt-5 block text-sm font-semibold text-ink">
              Date
              <input type="date" name="attendanceDate" defaultValue={today} required className="mt-1.5 block w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5" />
            </label>
            <div className="mt-5 rounded-[16px] border border-[#e2d2b8] bg-white px-4 py-4">
              <p className="text-sm font-semibold text-ink">Lessons this will complete</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/64">
                {remainingSubjects.map((subject) => (
                  <li key={subject.subjectKey}>{subject.subjectLabel}</li>
                ))}
              </ul>
            </div>
            {error ? <p role="alert" className="mt-4 rounded-[12px] bg-[#fff0eb] px-3 py-2 text-sm font-semibold text-[#8b3e2f]">{error}</p> : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="cta-button cta-button--outline cta-button--small disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={pending} className="cta-button cta-button--light cta-button--small disabled:cursor-wait disabled:opacity-60">
                {pending ? "Marking lessons…" : "Mark remaining lessons done"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
