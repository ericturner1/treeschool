"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { letterGrade } from "./grade-utils";
import { usePlanDayProgress } from "./week-progress-state";

export function PlanDaySubjectCard({
  dayNumber,
  subjectKey,
  subjectLabel,
  children
}: {
  dayNumber: number;
  subjectKey: string;
  subjectLabel: string;
  children: ReactNode;
}) {
  const day = usePlanDayProgress(dayNumber);
  const completed = day.completedSubjectKeys.includes(subjectKey);
  const grade = day.subjectGrades[subjectKey] ?? null;
  const [expanded, setExpanded] = useState(false);

  if (!completed) {
    return (
      <article className="rounded-[16px] border border-[#eadbc2] bg-white px-4 py-4">
        {children}
      </article>
    );
  }

  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="rounded-[16px] border border-[#c9dab9] bg-[#f8fbf4] open:bg-white"
    >
      <summary
        title={`Review ${subjectLabel}`}
        className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3.5 marker:hidden"
      >
        <h4 className="min-w-0 flex-1 font-semibold text-ink">{subjectLabel}</h4>
        <span className="rounded-full bg-[#dfead4] px-3 py-1.5 text-xs font-bold text-[#486a38]">Done ✓</span>
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
          grade == null ? "bg-[#eee9df] text-ink/48" : "bg-[#e5efd9] text-[#486a38]"
        }`}>
          {grade == null ? "No grade" : `${grade}% · ${letterGrade(grade)}`}
        </span>
      </summary>
      <div className="border-t border-[#e4ddcf] px-4 pb-4 pt-3">
        {children}
      </div>
    </details>
  );
}
