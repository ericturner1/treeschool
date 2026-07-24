type ActivityDay = {
  date: string;
  count: number;
  minutes?: number;
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

function dateRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates: string[] = [];
  for (let current = start; current <= end; current = new Date(current.getTime() + 86_400_000)) {
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

export function ActivitySquareGrid({
  days,
  dateFrom,
  dateTo,
  noun = "activity",
  explanation = "Lighter squares are quieter days; darker squares have more recorded activity.",
  compact = false
}: {
  days: ActivityDay[];
  dateFrom?: string;
  dateTo?: string;
  noun?: string;
  explanation?: string;
  compact?: boolean;
}) {
  const fallbackFrom = days[0]?.date;
  const fallbackTo = days.at(-1)?.date;
  const from = dateFrom ?? fallbackFrom;
  const to = dateTo ?? fallbackTo;
  if (!from || !to) return null;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const normalizedDays = dateRange(from, to).map((date) => byDate.get(date) ?? { date, count: 0, minutes: 0 });
  const leading = new Date(`${from}T00:00:00Z`).getUTCDay();
  const cells = [
    ...Array.from({ length: leading }, (_, index) => ({ blank: true as const, key: `blank-${index}` })),
    ...normalizedDays.map((day) => ({ ...day, blank: false as const, key: day.date }))
  ];
  const size = compact ? "h-[9px] w-[9px]" : "h-[11px] w-[11px]";

  return (
    <div className={compact ? "overflow-hidden" : "overflow-x-auto pb-2"}>
      <div className={compact ? "" : "min-w-[760px]"}>
        {explanation ? <p className={`${compact ? "mb-2" : "mb-2 pl-8"} text-[11px] leading-5 text-ink/45`}>{explanation}</p> : null}
        <div className="flex gap-2">
          {!compact ? (
            <div className="grid grid-rows-7 gap-[3px] pt-0 text-[10px] leading-[11px] text-ink/45">
              <span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span />
            </div>
          ) : null}
          <div className="grid flex-1 grid-flow-col grid-rows-7 justify-start gap-[3px]">
            {cells.map((cell) => cell.blank ? <span key={cell.key} className={size} /> : (
              <span
                key={cell.key}
                title={`${displayDate(cell.date)}: ${cell.count} ${cell.count === 1 ? noun : `${noun}s`}${cell.minutes ? `, ${cell.minutes} minutes` : ""}`}
                aria-label={`${displayDate(cell.date)}: ${cell.count} ${cell.count === 1 ? noun : `${noun}s`}`}
                className={`${size} rounded-[2px] border ${cell.count === 0 ? "border-[#e5dccd] bg-[#f5efe5]" : cell.count === 1 ? "border-[#c9dcb7] bg-[#dceacd]" : cell.count === 2 ? "border-[#a8c48f] bg-[#bcd5a7]" : cell.count <= 4 ? "border-[#79a15e] bg-[#82aa65]" : "border-[#496d37] bg-[#527b3c]"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
