"use client";

import { useEffect, useMemo, useState } from "react";

type StudentCalendarSetupProps = {
  studentName: string;
  birthDate: string;
  disabled?: boolean;
};

type BreakPreset = {
  key: string;
  label: string;
  exceptionKind: "holiday" | "school_break" | "vacation" | "personal_day" | "other";
  startDate: string;
  endDate: string;
  disabled?: boolean;
  helper?: string;
};

const DAY_MS = 86_400_000;

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function upcomingDate(monthIndex: number, day: number, today: Date) {
  const thisYear = new Date(Date.UTC(today.getUTCFullYear(), monthIndex, day));
  return thisYear < today
    ? new Date(Date.UTC(today.getUTCFullYear() + 1, monthIndex, day))
    : thisYear;
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function upcomingEaster(today: Date) {
  const thisYear = easterSunday(today.getUTCFullYear());
  return thisYear < today ? easterSunday(today.getUTCFullYear() + 1) : thisYear;
}

function birthdayPreset(birthDate: string, today: Date, studentName: string): BreakPreset {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) {
    return {
      key: "birthday",
      label: `${studentName.trim() || "Student"}'s birthday`,
      exceptionKind: "personal_day",
      startDate: "",
      endDate: "",
      disabled: true,
      helper: "Enter the birth date above to add this day automatically."
    };
  }
  const birthday = upcomingDate(Number(match[2]) - 1, Number(match[3]), today);
  return {
    key: "birthday",
    label: `${studentName.trim() || "Student"}'s birthday`,
    exceptionKind: "personal_day",
    startDate: dateKey(birthday),
    endDate: dateKey(birthday)
  };
}

function getBreakPresets(birthDate: string, studentName: string) {
  const today = new Date(`${dateKey(new Date())}T00:00:00.000Z`);
  const christmasStart = upcomingDate(11, 21, today);
  const easter = upcomingEaster(today);
  const springStart = upcomingDate(2, 23, today);
  const summerStart = upcomingDate(5, 15, today);
  return [
    birthdayPreset(birthDate, today, studentName),
    {
      key: "christmas",
      label: "Christmas break",
      exceptionKind: "holiday",
      startDate: dateKey(christmasStart),
      endDate: dateKey(new Date(Date.UTC(christmasStart.getUTCFullYear() + 1, 0, 3)))
    },
    {
      key: "easter",
      label: "Easter break",
      exceptionKind: "holiday",
      startDate: dateKey(addDays(easter, -2)),
      endDate: dateKey(addDays(easter, 1))
    },
    {
      key: "spring",
      label: "Spring break",
      exceptionKind: "school_break",
      startDate: dateKey(springStart),
      endDate: dateKey(addDays(springStart, 6)),
      helper: "Dates vary by family and location. Adjust these before saving."
    },
    {
      key: "summer",
      label: "Summer vacation",
      exceptionKind: "vacation",
      startDate: dateKey(summerStart),
      endDate: dateKey(new Date(Date.UTC(summerStart.getUTCFullYear(), 7, 15))),
      helper: "Adjust this range to match your family's calendar."
    }
  ] satisfies BreakPreset[];
}

export function StudentCalendarSetup({
  studentName,
  birthDate,
  disabled = false
}: StudentCalendarSetupProps) {
  const presets = useMemo(
    () => getBreakPresets(birthDate, studentName),
    [birthDate, studentName]
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [timeZone, setTimeZone] = useState("UTC");

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  return (
    <section className="rounded-[20px] border border-[#d8c7ab] bg-white px-4 py-4">
      <input type="hidden" name="calendarTimeZone" value={timeZone} />
      <label htmlFor="modal-daysOffPreset" className="text-sm font-semibold text-ink">
        Regular days off
      </label>
      <select
        id="modal-daysOffPreset"
        name="daysOffPreset"
        defaultValue="sat_sun"
        disabled={disabled}
        className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-[#fffaf2] py-3 pl-4 pr-12 text-base text-ink outline-none transition-colors focus:border-[#8f6544]"
      >
        <option value="sat_sun">Saturday and Sunday</option>
        <option value="fri_sat">Friday and Saturday</option>
        <option value="sun_only">Sunday only</option>
        <option value="fri_sat_sun">Friday, Saturday, and Sunday</option>
        <option value="none">No regular days off</option>
      </select>
      <p className="mt-2 text-xs leading-5 text-ink/55">
        These days will not interrupt the student&apos;s learning streak. You can customize individual weekdays later in Attendance.
      </p>

      <details className="mt-4 rounded-[16px] bg-[#f8f1e4] px-4 py-4">
        <summary className="cursor-pointer list-none font-semibold text-ink">
          Add common holidays and school breaks <span className="font-normal text-ink/55">(optional)</span>
        </summary>
        <p className="mt-2 text-sm leading-6 text-ink/60">
          Check any useful shortcuts, then adjust their dates to fit your family.
        </p>
        <div className="mt-4 space-y-3">
          {presets.map((preset) => {
            const checked = Boolean(selected[preset.key]);
            return (
              <div
                key={`${preset.key}-${preset.startDate}`}
                className={`rounded-[16px] border px-4 py-3 ${
                  checked ? "border-[#a8c58e] bg-[#f3f8ec]" : "border-[#dfcfb5] bg-white"
                } ${preset.disabled ? "opacity-55" : ""}`}
              >
                <label className={`flex items-center gap-3 font-semibold text-ink ${preset.disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    name="calendarBreak"
                    value={preset.key}
                    checked={checked}
                    disabled={disabled || preset.disabled}
                    onChange={(event) => setSelected((current) => ({
                      ...current,
                      [preset.key]: event.target.checked
                    }))}
                    className="h-5 w-5 accent-[#6f9853]"
                  />
                  {preset.label}
                </label>
                <input type="hidden" name={`calendarBreak-${preset.key}-label`} value={preset.label} />
                <input type="hidden" name={`calendarBreak-${preset.key}-exceptionKind`} value={preset.exceptionKind} />
                {preset.disabled ? (
                  <p className="mt-2 pl-8 text-xs leading-5 text-ink/55">{preset.helper}</p>
                ) : (
                  <>
                    <div className="mt-3 grid gap-3 pl-8 sm:grid-cols-2">
                      <label className="text-xs font-semibold text-ink/65">
                        Starts
                        <input
                          type="date"
                          name={`calendarBreak-${preset.key}-startDate`}
                          defaultValue={preset.startDate}
                          required={checked}
                          disabled={disabled || !checked}
                          className="mt-1.5 min-h-11 w-full rounded-[12px] border border-[#dcc8aa] bg-white px-3 text-sm text-ink"
                        />
                      </label>
                      <label className="text-xs font-semibold text-ink/65">
                        Ends
                        <input
                          type="date"
                          name={`calendarBreak-${preset.key}-endDate`}
                          defaultValue={preset.endDate}
                          required={checked}
                          disabled={disabled || !checked}
                          className="mt-1.5 min-h-11 w-full rounded-[12px] border border-[#dcc8aa] bg-white px-3 text-sm text-ink"
                        />
                      </label>
                    </div>
                    {preset.helper ? (
                      <p className="mt-2 pl-8 text-xs leading-5 text-ink/55">{preset.helper}</p>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
