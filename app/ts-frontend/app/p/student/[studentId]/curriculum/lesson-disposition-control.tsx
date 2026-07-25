"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Disposition = "include" | "already_mastered" | "save_for_later" | "remove";

const options: Array<{ value: Disposition; label: string; help: string }> = [
  {
    value: "include",
    label: "Include",
    help: "Keep this lesson in printable downloads and teach it as planned."
  },
  {
    value: "already_mastered",
    label: "Mastered",
    help: "Keep this lesson visible in the plan, but omit its pages from future downloads because your child already knows it."
  },
  {
    value: "save_for_later",
    label: "Later",
    help: "Leave it out of downloads for now and record it as material to revisit later."
  },
  {
    value: "remove",
    label: "Remove",
    help: "Leave it out without marking it mastered or saving it as future work."
  }
];

export function LessonDispositionControl({
  weeklyPlanItemId,
  value,
  onSaved
}: {
  weeklyPlanItemId: string;
  value: Disposition;
  onSaved?: (disposition: Disposition) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Disposition>(value);
  const [saving, setSaving] = useState<Disposition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSelected(value), [value]);

  async function select(disposition: Disposition) {
    if (saving || disposition === selected) return;
    const previous = selected;
    setSelected(disposition);
    setSaving(disposition);
    setError(null);
    try {
      const response = await fetch("/api/paper-plan/lesson-disposition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyPlanItemId, disposition })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not update this lesson.");
      onSaved?.(disposition);
      router.refresh();
    } catch (caught) {
      setSelected(previous);
      setError(caught instanceof Error ? caught.message : "Could not update this lesson.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-1 rounded-[13px] bg-[#eee5d7] p-1" aria-label="Lesson treatment">
        {options.map((option) => (
          <div key={option.value} className="group/help relative">
            <button
              type="button"
              disabled={Boolean(saving)}
              aria-pressed={selected === option.value}
              aria-label={`${option.label}: ${option.help}`}
              onClick={() => select(option.value)}
              className={`flex min-h-9 w-full items-center justify-center rounded-[10px] px-2 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fa35f] disabled:cursor-wait ${
                selected === option.value
                  ? option.value === "include"
                    ? "bg-[#729954] text-white shadow-sm"
                    : option.value === "already_mastered"
                      ? "bg-[#dceacd] text-[#426331] shadow-sm"
                      : option.value === "save_for_later"
                        ? "bg-[#f2dfb6] text-[#765632] shadow-sm"
                        : "bg-[#f2d8d0] text-[#8b3e2f] shadow-sm"
                  : "text-ink/58 hover:bg-white/70"
              }`}
            >
              {saving === option.value ? (
                <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
              ) : option.label}
            </button>
            <span role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-30 hidden w-56 -translate-x-1/2 rounded-[12px] bg-[#302b25] px-3 py-2 text-left text-xs font-medium leading-5 text-white shadow-xl group-hover/help:block group-focus-within/help:block">
              {option.help}
            </span>
          </div>
        ))}
      </div>
      {error ? <p role="alert" className="mt-1.5 text-xs font-semibold text-[#8b3e2f]">{error}</p> : null}
    </div>
  );
}
