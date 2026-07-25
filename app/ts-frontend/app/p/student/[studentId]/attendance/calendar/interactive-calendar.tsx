"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { useFormStatus } from "react-dom";
import { addHolidayAction, removeHolidayAction } from "./actions";

type ExceptionKind = "holiday" | "school_break" | "vacation" | "personal_day" | "other";

type CalendarCell = {
  date: string;
  inMonth: boolean;
};

type CalendarException = {
  id: string;
  label: string;
  exceptionKind: ExceptionKind;
  startDate: string;
  endDate: string;
};

type InteractiveCalendarProps = {
  cells: CalendarCell[];
  holidays: CalendarException[];
  recurringDaysOff: number[];
  activityDates: string[];
  today: string;
  canManage: boolean;
  profileId: string;
  studentName: string;
  returnPath: string;
};

const exceptionKinds: Array<{
  value: ExceptionKind;
  label: string;
  defaultName: (studentName: string) => string;
}> = [
  { value: "holiday", label: "Holiday", defaultName: () => "Holiday" },
  { value: "school_break", label: "School break", defaultName: () => "School break" },
  { value: "vacation", label: "Vacation", defaultName: () => "Vacation" },
  { value: "personal_day", label: "Personal day", defaultName: (name) => `${name}'s day off` },
  { value: "other", label: "Other day off", defaultName: () => "Day off" }
];

const kindStyles: Record<ExceptionKind, { cell: string; text: string; badge: string }> = {
  holiday: {
    cell: "bg-[#fff3de]",
    text: "text-[#80591f]",
    badge: "bg-[#f8dfb1] text-[#74501d]"
  },
  school_break: {
    cell: "bg-[#eef5e4]",
    text: "text-[#4f703c]",
    badge: "bg-[#dceacb] text-[#466335]"
  },
  vacation: {
    cell: "bg-[#eaf3f5]",
    text: "text-[#426a73]",
    badge: "bg-[#d3e7eb] text-[#365b63]"
  },
  personal_day: {
    cell: "bg-[#f5ebf1]",
    text: "text-[#79546b]",
    badge: "bg-[#ead7e2] text-[#68465c]"
  },
  other: {
    cell: "bg-[#f3eee6]",
    text: "text-ink/55",
    badge: "bg-[#e7dfd2] text-ink/62"
  }
};

function orderedRange(first: string, second: string) {
  return first <= second
    ? { startDate: first, endDate: second }
    : { startDate: second, endDate: first };
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function CalendarEntryFormFields({
  exceptionKind,
  label,
  studentName,
  onCancel,
  onKindChange,
  onLabelChange,
  onPendingChange
}: {
  exceptionKind: ExceptionKind;
  label: string;
  studentName: string;
  onCancel: () => void;
  onKindChange: (kind: ExceptionKind) => void;
  onLabelChange: (label: string) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { pending } = useFormStatus();
  useEffect(() => {
    onPendingChange(pending);
  }, [onPendingChange, pending]);
  return (
    <fieldset disabled={pending} className="space-y-5 disabled:cursor-wait disabled:opacity-70">
      <label className="block text-sm font-semibold text-ink">
        What is this time off?
        <select
          name="exceptionKind"
          value={exceptionKind}
          onChange={(event) => onKindChange(event.target.value as ExceptionKind)}
          className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white py-3 pl-4 pr-12 text-base text-ink"
        >
          {exceptionKinds.map((kind) => (
            <option key={kind.value} value={kind.value}>{kind.label}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold text-ink">
        Name
        <input
          required
          autoFocus
          name="label"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          placeholder="Example: Christmas break"
          className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base text-ink"
        />
      </label>
      <div className={`rounded-[16px] px-4 py-3 text-sm font-semibold ${kindStyles[exceptionKind].badge}`}>
        This range will not interrupt {studentName}&apos;s learning streak.
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="min-h-12 rounded-[14px] px-5 text-sm font-semibold text-ink/55 transition hover:bg-white hover:text-ink disabled:cursor-wait disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="cta-button cta-button--light cta-button--small disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Adding…" : "Add to calendar"}
        </button>
      </div>
    </fieldset>
  );
}

function RemoveCalendarEntryButtons({
  onCancel,
  onPendingChange
}: {
  onCancel: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { pending } = useFormStatus();
  useEffect(() => {
    onPendingChange(pending);
  }, [onPendingChange, pending]);
  return (
    <fieldset
      disabled={pending}
      className="flex flex-col-reverse gap-3 disabled:cursor-wait disabled:opacity-70 sm:flex-row sm:justify-end"
    >
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="min-h-12 rounded-[14px] px-5 text-sm font-semibold text-ink/55 transition hover:bg-white hover:text-ink disabled:cursor-wait disabled:opacity-40"
      >
        Keep it
      </button>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[3.2rem] items-center justify-center rounded-[16px] border-2 border-[#7f382f] bg-[#a94f42] px-6 py-3 text-sm font-semibold text-white shadow-[0_7px_0_#7f382f] transition hover:-translate-y-1 hover:bg-[#963f35] hover:shadow-[0_10px_0_#713129] active:translate-y-1 active:shadow-none disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Removing…" : "Remove from calendar"}
      </button>
    </fieldset>
  );
}

export function InteractiveCalendar({
  cells,
  holidays,
  recurringDaysOff,
  activityDates,
  today,
  canManage,
  profileId,
  studentName,
  returnPath
}: InteractiveCalendarProps) {
  const activityDateSet = useMemo(() => new Set(activityDates), [activityDates]);
  const dragRef = useRef(false);
  const selectionRef = useRef<{ anchor: string; edge: string } | null>(null);
  const softClickAudioPoolRef = useRef<HTMLAudioElement[]>([]);
  const softClickAudioIndexRef = useRef(0);
  const selectionPopAudioRef = useRef<HTMLAudioElement | null>(null);
  const calendarSubmissionStartedRef = useRef(false);
  const removalSubmissionStartedRef = useRef(false);
  const [selection, setSelection] = useState<{ anchor: string; edge: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null);
  const [hoverHint, setHoverHint] = useState<{ x: number; y: number; text: string } | null>(null);
  const [exceptionKind, setExceptionKind] = useState<ExceptionKind>("school_break");
  const [label, setLabel] = useState("School break");
  const previousDefaultLabel = useRef("School break");

  const playSoftClick = useCallback(() => {
    const pool = softClickAudioPoolRef.current;
    if (pool.length === 0) return;
    const audio = pool[softClickAudioIndexRef.current % pool.length]!;
    softClickAudioIndexRef.current += 1;
    try {
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    } catch {
      // Sound is optional; selection must continue if the browser blocks audio.
    }
  }, []);

  const playSelectionPop = useCallback(() => {
    const audio = selectionPopAudioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    } catch {
      // Sound is optional; opening the dialog must never depend on playback.
    }
  }, []);

  const handlePendingChange = useCallback((pending: boolean) => {
    setSubmitting(pending);
    if (pending) {
      calendarSubmissionStartedRef.current = true;
      return;
    }
    if (!calendarSubmissionStartedRef.current) return;
    calendarSubmissionStartedRef.current = false;
    selectionRef.current = null;
    setSelection(null);
    setDialogOpen(false);
  }, []);

  const handleRemovalPendingChange = useCallback((pending: boolean) => {
    setRemoving(pending);
    if (pending) {
      removalSubmissionStartedRef.current = true;
      return;
    }
    if (!removalSubmissionStartedRef.current) return;
    removalSubmissionStartedRef.current = false;
    setSelectedExceptionId(null);
  }, []);

  const selectedRange = selection
    ? orderedRange(selection.anchor, selection.edge)
    : null;
  const selectedException = selectedExceptionId
    ? holidays.find((holiday) => holiday.id === selectedExceptionId) ?? null
    : null;

  function updateSelection(next: { anchor: string; edge: string } | null) {
    selectionRef.current = next;
    setSelection(next);
  }

  useEffect(() => {
    const softClickPool = Array.from({ length: 4 }, () => {
      const audio = new Audio("/sounds/calendar-soft-click.mp3");
      audio.preload = "auto";
      audio.volume = 0.62;
      audio.load();
      return audio;
    });
    const selectionPop = new Audio("/sounds/calendar-selection-pop.mp3");
    selectionPop.preload = "auto";
    selectionPop.volume = 0.72;
    selectionPop.load();
    softClickAudioPoolRef.current = softClickPool;
    selectionPopAudioRef.current = selectionPop;

    return () => {
      softClickPool.forEach((audio) => audio.pause());
      selectionPop.pause();
      softClickAudioPoolRef.current = [];
      selectionPopAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    function finishSelection() {
      if (!dragRef.current) return;
      dragRef.current = false;
      if (selectionRef.current) {
        playSelectionPop();
        setDialogOpen(true);
      }
    }
    function cancelSelection() {
      dragRef.current = false;
      updateSelection(null);
    }
    window.addEventListener("pointerup", finishSelection);
    window.addEventListener("pointercancel", cancelSelection);
    return () => {
      window.removeEventListener("pointerup", finishSelection);
      window.removeEventListener("pointercancel", cancelSelection);
    };
  }, [playSelectionPop]);

  useEffect(() => {
    if (!dialogOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDialogOpen(false);
        updateSelection(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialogOpen]);

  function beginSelection(date: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (!canManage || event.button !== 0) return;
    event.preventDefault();
    dragRef.current = true;
    setHoverHint(null);
    setDialogOpen(false);
    updateSelection({ anchor: date, edge: date });
    playSoftClick();
  }

  function openExistingException(
    exception: CalendarException,
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (!canManage || event.button !== 0) return;
    event.preventDefault();
    dragRef.current = false;
    setHoverHint(null);
    setDialogOpen(false);
    updateSelection(null);
    setSelectedExceptionId(exception.id);
  }

  function continueSelection(date: string) {
    const current = selectionRef.current;
    if (!dragRef.current || !current || current.edge === date) return;
    const previousRange = orderedRange(current.anchor, current.edge);
    const nextRange = orderedRange(current.anchor, date);
    updateSelection({ ...current, edge: date });
    if (
      nextRange.startDate < previousRange.startDate ||
      nextRange.endDate > previousRange.endDate
    ) {
      playSoftClick();
    }
  }

  function continueSelectionFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const dateCell = target?.closest<HTMLElement>("[data-calendar-date][data-in-month='true']");
    const date = dateCell?.dataset.calendarDate;
    if (dragRef.current) {
      event.preventDefault();
      setHoverHint(null);
      if (date) continueSelection(date);
      return;
    }
    if (
      canManage &&
      event.pointerType === "mouse" &&
      (
        dateCell?.dataset.calendarEmpty === "true" ||
        Boolean(dateCell?.dataset.calendarExceptionId)
      )
    ) {
      setHoverHint({
        x: Math.max(8, Math.min(event.clientX + 14, window.innerWidth - 230)),
        y: Math.max(8, Math.min(event.clientY + 18, window.innerHeight - 54)),
        text: dateCell?.dataset.calendarExceptionId
          ? "Click to manage this day off"
          : "Click or drag to set days off"
      });
    } else {
      setHoverHint(null);
    }
  }

  function closeDialog() {
    if (submitting) return;
    setDialogOpen(false);
    updateSelection(null);
  }

  function closeExistingExceptionDialog() {
    if (removing) return;
    setSelectedExceptionId(null);
  }

  function changeKind(nextKind: ExceptionKind) {
    const nextDefault = exceptionKinds.find((item) => item.value === nextKind)!.defaultName(studentName);
    if (!label.trim() || label === previousDefaultLabel.current) {
      setLabel(nextDefault);
    }
    previousDefaultLabel.current = nextDefault;
    setExceptionKind(nextKind);
  }

  return (
    <>
      <div className="overflow-hidden rounded-[22px] border border-[#dfcfb5] bg-white">
        <div className="grid grid-cols-7 border-b border-[#dfcfb5] bg-[#f6ecdc]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="px-1 py-3 text-center text-xs font-bold uppercase tracking-[0.08em] text-ink/55">
              {day}
            </div>
          ))}
        </div>
        <div
          className={`grid grid-cols-7 ${canManage ? "select-none" : ""}`}
          style={canManage ? { touchAction: "none" } : undefined}
          onPointerMove={continueSelectionFromPointer}
          onPointerLeave={() => setHoverHint(null)}
        >
          {cells.map((cell, index) => {
            const dayOfWeek = new Date(`${cell.date}T00:00:00.000Z`).getUTCDay();
            const holiday = holidays.find((item) =>
              item.startDate <= cell.date && item.endDate >= cell.date
            );
            const recurringDayOff = recurringDaysOff.includes(dayOfWeek);
            const hasActivity = activityDateSet.has(cell.date);
            const isDayOff = Boolean(holiday || recurringDayOff);
            const selected = Boolean(
              selectedRange &&
              cell.inMonth &&
              selectedRange.startDate <= cell.date &&
              selectedRange.endDate >= cell.date
            );
            const kindStyle = holiday ? kindStyles[holiday.exceptionKind] : null;
            return (
              <div
                key={cell.date}
                data-calendar-date={cell.date}
                data-in-month={String(cell.inMonth)}
                data-calendar-empty={String(
                  cell.inMonth && !holiday && !recurringDayOff && !hasActivity
                )}
                data-calendar-exception-id={holiday?.id}
                onPointerDown={(event) => {
                  if (!cell.inMonth) return;
                  if (holiday) {
                    openExistingException(holiday, event);
                  } else {
                    beginSelection(cell.date, event);
                  }
                }}
                onPointerEnter={() => cell.inMonth && continueSelection(cell.date)}
                className={`relative min-h-[88px] origin-center border-b border-r border-[#eee3d1] p-2 transition-[background-color,transform,box-shadow,border-radius] duration-150 sm:min-h-[112px] sm:p-3 ${
                  index % 7 === 6 ? "border-r-0" : ""
                } ${cell.inMonth ? "bg-white" : "bg-[#fbf7ef] text-ink/30"} ${
                  holiday && cell.inMonth
                    ? kindStyle!.cell
                    : isDayOff && cell.inMonth ? "bg-[#f6f0e6]" : ""
                } ${
                  canManage && cell.inMonth
                    ? holiday
                      ? "cursor-pointer hover:brightness-[0.98]"
                      : "cursor-crosshair hover:bg-[#f2f7eb]"
                    : ""
                } ${
                  selected
                    ? "z-10 scale-[1.025] rounded-[14px] !border-transparent !bg-[#dceacb] shadow-[0_6px_16px_rgba(79,112,60,0.22),inset_0_0_0_3px_#7fa35f] sm:scale-[1.04]"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                    cell.date === today ? "bg-[#6f9853] text-white" : "text-ink/70"
                  }`}>
                    {Number(cell.date.slice(-2))}
                  </span>
                  {hasActivity ? (
                    <span className="h-3 w-3 rounded-full bg-[#6f9853]" title="Learning recorded" />
                  ) : null}
                </div>
                {cell.inMonth && holiday ? (
                  <p className={`mt-2 line-clamp-2 text-[11px] font-semibold leading-4 ${kindStyle!.text}`}>
                    {holiday.label}
                  </p>
                ) : cell.inMonth && recurringDayOff ? (
                  <p className="mt-2 text-[11px] font-semibold text-ink/42">Regular day off</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {hoverHint ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[170] rounded-[10px] border border-[#d8c5a8] bg-[#fffaf2] px-3 py-2 text-xs font-semibold text-ink/70 shadow-[0_8px_20px_rgba(55,43,31,0.16)]"
          style={{ left: hoverHint.x, top: hoverHint.y }}
        >
          {hoverHint.text}
        </div>
      ) : null}
      {canManage ? (
        <p className="mt-3 text-xs font-semibold text-[#4f703c]">
          Tip: click a date—or drag across several dates—to add time off.
        </p>
      ) : null}

      {dialogOpen && selectedRange ? (
        <div
          className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto bg-[rgba(37,32,27,0.48)] p-2 sm:items-center sm:px-4 sm:py-8"
          onMouseDown={(event) => {
            if (!submitting && event.currentTarget === event.target) closeDialog();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-selection-title"
            className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-4 py-5 shadow-[0_24px_56px_rgba(37,32,27,0.28)] sm:max-h-[90vh] sm:rounded-[28px] sm:px-7 sm:py-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-earth">Selected dates</p>
                <h2 id="calendar-selection-title" className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-ink">
                  {displayDate(selectedRange.startDate)}
                  {selectedRange.endDate !== selectedRange.startDate
                    ? `–${displayDate(selectedRange.endDate)}`
                    : ""}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={submitting}
                aria-label="Close"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white text-2xl text-ink/55 shadow-sm transition hover:text-ink disabled:cursor-wait disabled:opacity-40"
              >
                ×
              </button>
            </div>

            <form
              action={addHolidayAction}
              className="mt-6"
            >
              <input type="hidden" name="profileId" value={profileId} />
              <input type="hidden" name="returnPath" value={returnPath} />
              <input type="hidden" name="startDate" value={selectedRange.startDate} />
              <input type="hidden" name="endDate" value={selectedRange.endDate} />
              <CalendarEntryFormFields
                exceptionKind={exceptionKind}
                label={label}
                studentName={studentName}
                onCancel={closeDialog}
                onKindChange={changeKind}
                onLabelChange={setLabel}
                onPendingChange={handlePendingChange}
              />
            </form>
          </div>
        </div>
      ) : null}

      {selectedException ? (
        <div
          className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto bg-[rgba(37,32,27,0.48)] p-2 sm:items-center sm:px-4 sm:py-8"
          onMouseDown={(event) => {
            if (!removing && event.currentTarget === event.target) {
              closeExistingExceptionDialog();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-calendar-entry-title"
            className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-4 py-5 shadow-[0_24px_56px_rgba(37,32,27,0.28)] sm:rounded-[28px] sm:px-7 sm:py-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${kindStyles[selectedException.exceptionKind].badge}`}>
                  {exceptionKinds.find((kind) => kind.value === selectedException.exceptionKind)?.label}
                </span>
                <h2
                  id="remove-calendar-entry-title"
                  className="mt-3 text-[30px] font-semibold tracking-[-0.05em] text-ink"
                >
                  {selectedException.label}
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">
                  {displayDate(selectedException.startDate)}
                  {selectedException.endDate !== selectedException.startDate
                    ? `–${displayDate(selectedException.endDate)}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={closeExistingExceptionDialog}
                disabled={removing}
                aria-label="Close"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white text-2xl text-ink/55 shadow-sm transition hover:text-ink disabled:cursor-wait disabled:opacity-40"
              >
                ×
              </button>
            </div>
            <p className="mt-5 rounded-[16px] bg-[#fff0eb] px-4 py-4 text-sm leading-6 text-[#8b3e2f]">
              Removing this entry restores every date in this range to the regular school-week schedule.
            </p>
            <form action={removeHolidayAction} className="mt-6">
              <input type="hidden" name="profileId" value={profileId} />
              <input type="hidden" name="exceptionId" value={selectedException.id} />
              <input type="hidden" name="returnPath" value={returnPath} />
              <RemoveCalendarEntryButtons
                onCancel={closeExistingExceptionDialog}
                onPendingChange={handleRemovalPendingChange}
              />
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
