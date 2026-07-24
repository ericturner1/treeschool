"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

export type InitialPlanDayProgress = {
  dayNumber: number;
  subjectKeys: string[];
  completedSubjectKeys: string[];
  subjectGrades: Record<string, number | null>;
};

type WeekProgressContextValue = {
  days: InitialPlanDayProgress[];
  completedLessons: number;
  totalLessons: number;
  progress: number;
  status: "planned" | "in_progress" | "completed";
  setSubjectCompleted: (dayNumber: number, subjectKey: string, completed: boolean) => void;
  setSubjectsCompleted: (dayNumber: number, subjectKeys: string[]) => void;
  setSubjectGrade: (dayNumber: number, subjectKey: string, grade: number | null) => void;
};

const WeekProgressContext = createContext<WeekProgressContextValue | null>(null);
const WEEK_PROGRESS_EVENT = "treeschool:week-progress";

function normalizeDay(day: InitialPlanDayProgress): InitialPlanDayProgress {
  const subjectKeys = Array.from(new Set(day.subjectKeys));
  const available = new Set(subjectKeys);
  return {
    dayNumber: day.dayNumber,
    subjectKeys,
    completedSubjectKeys: Array.from(new Set(day.completedSubjectKeys)).filter((key) => available.has(key)),
    subjectGrades: Object.fromEntries(subjectKeys.map((key) => [key, day.subjectGrades[key] ?? null]))
  };
}

function deriveWeekProgress(days: InitialPlanDayProgress[], initialStatus: string) {
  const totalLessons = days.reduce((total, day) => total + day.subjectKeys.length, 0);
  const completedLessons = days.reduce((total, day) => total + day.completedSubjectKeys.length, 0);
  const progress = totalLessons === 0
    ? initialStatus === "completed" ? 100 : 0
    : Math.round((completedLessons / totalLessons) * 100);
  const status = totalLessons === 0
    ? initialStatus === "completed" ? "completed" as const : initialStatus === "in_progress" ? "in_progress" as const : "planned" as const
    : completedLessons === 0
    ? "planned" as const
    : completedLessons >= totalLessons
      ? "completed" as const
      : "in_progress" as const;
  return { totalLessons, completedLessons, progress, status };
}

export function WeekProgressProvider({
  weekId,
  initialStatus,
  initialDays,
  children
}: {
  weekId: string;
  initialStatus: string;
  initialDays: InitialPlanDayProgress[];
  children: ReactNode;
}) {
  const [days, setDays] = useState(() => initialDays.map(normalizeDay));
  const summary = useMemo(() => deriveWeekProgress(days, initialStatus), [days, initialStatus]);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    window.dispatchEvent(new CustomEvent(WEEK_PROGRESS_EVENT, {
      detail: { weekId, status: summary.status }
    }));
  }, [summary.status, weekId]);

  const setSubjectCompleted = useCallback((dayNumber: number, subjectKey: string, completed: boolean) => {
    setDays((current) => current.map((day) => {
      if (day.dayNumber !== dayNumber || !day.subjectKeys.includes(subjectKey)) return day;
      const completedKeys = new Set(day.completedSubjectKeys);
      if (completed) completedKeys.add(subjectKey);
      else completedKeys.delete(subjectKey);
      return { ...day, completedSubjectKeys: Array.from(completedKeys) };
    }));
  }, []);

  const setSubjectsCompleted = useCallback((dayNumber: number, subjectKeys: string[]) => {
    setDays((current) => current.map((day) => {
      if (day.dayNumber !== dayNumber) return day;
      const completedKeys = new Set(day.completedSubjectKeys);
      for (const subjectKey of subjectKeys) {
        if (day.subjectKeys.includes(subjectKey)) completedKeys.add(subjectKey);
      }
      return { ...day, completedSubjectKeys: Array.from(completedKeys) };
    }));
  }, []);

  const setSubjectGrade = useCallback((dayNumber: number, subjectKey: string, grade: number | null) => {
    setDays((current) => current.map((day) => day.dayNumber === dayNumber && day.subjectKeys.includes(subjectKey)
      ? { ...day, subjectGrades: { ...day.subjectGrades, [subjectKey]: grade } }
      : day));
  }, []);

  const value = useMemo<WeekProgressContextValue>(() => ({
    days,
    ...summary,
    setSubjectCompleted,
    setSubjectsCompleted,
    setSubjectGrade
  }), [days, setSubjectCompleted, setSubjectGrade, setSubjectsCompleted, summary]);

  return <WeekProgressContext.Provider value={value}>{children}</WeekProgressContext.Provider>;
}

export function useWeekProgress() {
  const value = useContext(WeekProgressContext);
  if (!value) throw new Error("Week progress controls must be inside WeekProgressProvider.");
  return value;
}

export function usePlanDayProgress(dayNumber: number) {
  const week = useWeekProgress();
  const day = week.days.find((candidate) => candidate.dayNumber === dayNumber);
  if (!day) throw new Error(`Plan day ${dayNumber} was not found.`);
  const completed = day.completedSubjectKeys.length;
  const total = day.subjectKeys.length;
  const status = completed === 0
    ? "not_started" as const
    : completed >= total
      ? "completed" as const
      : "in_progress" as const;
  return {
    ...day,
    completed,
    total,
    status,
    progress: total === 0 ? 0 : Math.round((completed / total) * 100)
  };
}

export function WeekPlanDetails({
  id,
  initialOpen,
  children
}: {
  id: string;
  initialOpen: boolean;
  children: ReactNode;
}) {
  const { status } = useWeekProgress();
  const [open, setOpen] = useState(initialOpen);
  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={`group rounded-[22px] border border-[#dcc8aa] ${
        status === "completed"
          ? "bg-[#eee9df] opacity-70 open:bg-[#f6f1e8]"
          : status === "in_progress"
            ? "border-[#9fbd89] bg-[#f4f9ed] shadow-[0_6px_0_#c5d9b7] ring-2 ring-[#dceacd] open:bg-white"
            : "bg-[#fffaf2] open:bg-white"
      }`}
    >
      {children}
    </details>
  );
}

export function WeekProgressSummary() {
  const { status, progress } = useWeekProgress();
  const label = status === "completed" ? "Done" : status === "in_progress" ? "Started" : "Not started";
  return (
    <>
      <p className={`mt-1 text-xs font-semibold uppercase tracking-[0.13em] ${
        status === "in_progress"
          ? "inline-flex rounded-full bg-[#dceccd] px-2.5 py-1 text-[#486a38]"
          : "text-earth"
      }`}>
        {label} · {progress}%
      </p>
      {status === "in_progress" ? (
        <div className="mt-3 max-w-sm" aria-label={`${progress}% complete`}>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#e5dccd]">
            <div
              className="h-full rounded-full bg-[#739e56] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

export function WeeklyPlansCollectionSummary({
  initialWeeks,
  totalPages
}: {
  initialWeeks: Array<{ id: string; status: string }>;
  totalPages: number;
}) {
  const [statuses, setStatuses] = useState(() => Object.fromEntries(
    initialWeeks.map((week) => [week.id, week.status === "completed" ? "completed" : week.status])
  ));

  useEffect(() => {
    function update(event: Event) {
      const detail = (event as CustomEvent<{ weekId: string; status: string }>).detail;
      if (!detail?.weekId) return;
      setStatuses((current) => ({ ...current, [detail.weekId]: detail.status }));
    }
    window.addEventListener(WEEK_PROGRESS_EVENT, update);
    return () => window.removeEventListener(WEEK_PROGRESS_EVENT, update);
  }, []);

  const completed = Object.values(statuses).filter((status) => status === "completed").length;
  return (
    <p className="mt-2 text-sm text-ink/62">
      {initialWeeks.length - completed} active · {completed} done · {totalPages.toLocaleString()} total pages
    </p>
  );
}
