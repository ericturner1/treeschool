"use client";

import type { ReactNode } from "react";
import { DayAttendanceControl } from "./day-attendance-control";
import { usePlanDayProgress } from "./week-progress-state";

export function PlanDayCard({
  profileId,
  weeklyPlanId,
  weekNumber,
  dayNumber,
  subjects,
  children
}: {
  profileId: string;
  weeklyPlanId: string;
  weekNumber: number;
  dayNumber: number;
  subjects: Array<{ subjectKey: string; subjectLabel: string }>;
  children: ReactNode;
}) {
  const day = usePlanDayProgress(dayNumber);
  return (
    <section
      id={`week-${weekNumber}-day-${dayNumber}`}
      className={`scroll-mt-6 overflow-hidden rounded-[20px] border transition-colors ${
        day.status === "completed"
          ? "border-[#bfd2ad] bg-[#f1f6eb]"
          : day.status === "in_progress"
            ? "border-[#9fbd89] bg-[#f8fbf4] shadow-[0_4px_0_#d4e2c9]"
            : "border-[#e2d2b8] bg-[#fffaf2]"
      }`}
    >
      <div className="flex flex-col gap-4 border-b border-[#e7dbc8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold tracking-[-0.035em] text-ink">Day {dayNumber}</h3>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${
              day.status === "completed"
                ? "bg-[#dceacd] text-[#486a38]"
                : day.status === "in_progress"
                  ? "bg-[#f1e5c9] text-[#765632]"
                  : "bg-[#eee8dd] text-ink/48"
            }`}>
              {day.status === "completed" ? "Done" : day.status === "in_progress" ? "Started" : "Not started"}
            </span>
            <span className="text-xs font-semibold text-ink/48">
              {day.completed} of {day.total} lessons done
            </span>
          </div>
          {day.status !== "completed" ? (
            <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-[#e7ded0]">
              <div className="h-full rounded-full bg-[#739e56] transition-[width] duration-300" style={{ width: `${day.progress}%` }} />
            </div>
          ) : null}
        </div>
        <DayAttendanceControl
          profileId={profileId}
          weeklyPlanId={weeklyPlanId}
          dayNumber={dayNumber}
          subjects={subjects}
        />
      </div>
      {children}
    </section>
  );
}
