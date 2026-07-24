"use client";

import { type FormEvent, useEffect, useState } from "react";
import { letterGrade } from "./grade-utils";
import { useWeekProgress } from "./week-progress-state";

export function DaySubjectGradeField({
  profileId,
  weeklyPlanId,
  dayNumber,
  subjectKey,
  defaultValue,
  recommended,
  canRemove
}: {
  profileId: string;
  weeklyPlanId: string;
  dayNumber: number;
  subjectKey: string;
  defaultValue: number | null;
  recommended: boolean;
  canRemove: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [savedValue, setSavedValue] = useState(defaultValue);
  const [value, setValue] = useState(defaultValue == null ? "" : String(defaultValue));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setSubjectCompleted, setSubjectGrade } = useWeekProgress();
  const grade = value === "" ? null : letterGrade(value);

  useEffect(() => {
    setSavedValue(defaultValue);
    setValue(defaultValue == null ? "" : String(defaultValue));
  }, [defaultValue]);

  async function save(score: number | null) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/paper-plan/day-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, weeklyPlanId, dayNumber, subjectKey, score })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not save the grade.");
      setSavedValue(score);
      setValue(score == null ? "" : String(score));
      setSubjectGrade(dayNumber, subjectKey, score);
      if (score != null) setSubjectCompleted(dayNumber, subjectKey, true);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the grade.");
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const score = Number(value);
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      setError("Enter a whole-number grade from 0 to 100.");
      return;
    }
    void save(score);
  }

  if (!editing) {
    return (
      <div>
        {savedValue == null ? (
          <button type="button" onClick={() => { setError(null); setEditing(true); }} className={`text-sm font-semibold underline underline-offset-4 ${recommended ? "text-[#52753f]" : "text-ink/48 hover:text-[#52753f]"}`}>
            Add grade <span className="font-normal">(optional)</span>
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#e5efd9] px-3 py-1.5 text-sm font-semibold text-[#486a38]">{savedValue}% · {letterGrade(savedValue)}</span>
            <button type="button" onClick={() => { setError(null); setEditing(true); }} className="text-xs font-semibold text-[#567b40] underline underline-offset-4">Edit grade</button>
          </div>
        )}
        {error ? <p role="alert" className="mt-1.5 text-xs font-semibold text-[#8b3e2f]">{error}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        min="0"
        max="100"
        step="1"
        required
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="0–100"
        className="min-h-10 w-24 rounded-[12px] border border-[#dcc8aa] bg-white px-3 text-sm"
      />
      {grade ? <span className="rounded-[10px] bg-[#e5efd9] px-3 py-2 text-sm font-semibold text-[#486a38]">{grade}</span> : null}
      <button type="submit" disabled={saving} className="rounded-[12px] border border-[#b8cda8] bg-white px-4 py-2 text-sm font-semibold text-[#486a38] shadow-[0_3px_0_#b8cda8] disabled:cursor-wait disabled:opacity-60">{saving ? "Saving…" : "Save grade"}</button>
      <button type="button" disabled={saving} onClick={() => { setValue(savedValue == null ? "" : String(savedValue)); setError(null); setEditing(false); }} className="px-2 py-2 text-xs font-semibold text-ink/55 disabled:opacity-50">Cancel</button>
      {canRemove && savedValue != null ? <button type="button" disabled={saving} onClick={() => void save(null)} className="px-2 py-2 text-xs font-semibold text-[#8b3e2f] underline underline-offset-4 disabled:opacity-50">{saving ? "Removing…" : "Remove"}</button> : null}
      {error ? <p role="alert" className="basis-full text-xs font-semibold text-[#8b3e2f]">{error}</p> : null}
    </form>
  );
}
