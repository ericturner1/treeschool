"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateStreakSettingsAction } from "./actions";

type StreakSettingsFormProps = {
  action?: (formData: FormData) => Promise<void>;
  profileId: string;
  initialMode: "daily" | "weekly";
  initialPausedWeekdays: number[];
  initialPausedWeeks: string[];
  initialTimeZone: string;
};

const weekdayLabels = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" }
] as const;

function isoWeekInputValue(weekStart: string) {
  const date = new Date(`${weekStart}T00:00:00Z`);
  const working = new Date(date);
  working.setUTCDate(working.getUTCDate() + 3 - ((working.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(working.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((working.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7
    );
  return `${working.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function StreakSettingsForm({
  action = updateStreakSettingsAction,
  profileId,
  initialMode,
  initialPausedWeekdays,
  initialPausedWeeks,
  initialTimeZone
}: StreakSettingsFormProps) {
  const [mode, setMode] = useState<"daily" | "weekly">(initialMode);
  const [pausedWeekdays, setPausedWeekdays] = useState<number[]>(initialPausedWeekdays);
  const [pausedWeeks, setPausedWeeks] = useState<string[]>(initialPausedWeeks);
  const [weekInput, setWeekInput] = useState("");
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || initialTimeZone || "UTC",
    [initialTimeZone]
  );

  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="timeZone" value={timeZone} />
      <input type="hidden" name="pausedWeekdays" value={JSON.stringify(pausedWeekdays)} />
      <input type="hidden" name="pausedWeeks" value={JSON.stringify(pausedWeeks)} />

      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-earth/80">Streak type</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["daily", "weekly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`rounded-[18px] border px-4 py-4 text-left transition ${
                mode === value
                  ? "border-[#8eb35f] bg-[#eef6e4]"
                  : "border-[#dcc8aa] bg-[#fffaf2]"
              }`}
              onClick={() => setMode(value)}
            >
              <p className="text-base font-semibold text-ink">
                {value === "daily" ? "Daily streak" : "Weekly streak"}
              </p>
              <p className="mt-1 text-sm leading-[1.6] text-ink/70">
                {value === "daily"
                  ? "One task on active days keeps the streak going."
                  : "One task during each active week keeps the streak going."}
              </p>
            </button>
          ))}
        </div>
      </div>

      {mode === "daily" ? (
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-earth/80">
            Pause specific weekdays
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {weekdayLabels.map((day) => {
              const selected = pausedWeekdays.includes(day.value);

              return (
                <button
                  key={day.value}
                  type="button"
                  className={`rounded-[999px] border px-4 py-2 text-sm font-semibold transition ${
                    selected
                      ? "border-[#c97d68] bg-[#f6ddd8] text-[#7c3d32]"
                      : "border-[#dcc8aa] bg-[#fffaf2] text-ink"
                  }`}
                  onClick={() =>
                    setPausedWeekdays((value) =>
                      value.includes(day.value)
                        ? value.filter((item) => item !== day.value)
                        : [...value, day.value].sort((left, right) => left - right)
                    )
                  }
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-earth/80">
            Pause entire weeks
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="week"
              value={weekInput}
              onChange={(event) => setWeekInput(event.target.value)}
              className="min-h-12 rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-sm text-ink outline-none transition-colors focus:border-[#8f6544]"
            />
            <button
              type="button"
              className="cta-button cta-button--outline cta-button--small"
              onClick={() => {
                if (!weekInput) {
                  return;
                }

                const [year, week] = weekInput.split("-W");
                if (!year || !week) {
                  return;
                }

                const jan4 = new Date(Date.UTC(Number(year), 0, 4));
                const day = (jan4.getUTCDay() + 6) % 7;
                jan4.setUTCDate(jan4.getUTCDate() - day + (Number(week) - 1) * 7);
                const normalized = jan4.toISOString().slice(0, 10);

                setPausedWeeks((value) => [...new Set([...value, normalized])].sort());
                setWeekInput("");
              }}
            >
              Add paused week
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {pausedWeeks.length === 0 ? (
              <p className="text-sm text-ink/65">No weeks paused.</p>
            ) : (
              pausedWeeks.map((weekStart) => (
                <button
                  key={weekStart}
                  type="button"
                  className="rounded-[999px] border border-[#c97d68] bg-[#f6ddd8] px-4 py-2 text-sm font-semibold text-[#7c3d32]"
                  onClick={() =>
                    setPausedWeeks((value) => value.filter((item) => item !== weekStart))
                  }
                >
                  {isoWeekInputValue(weekStart)} ×
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="cta-button cta-button--light cta-button--small" disabled={pending}>
      {pending ? "Saving..." : "Save streak settings"}
    </button>
  );
}
