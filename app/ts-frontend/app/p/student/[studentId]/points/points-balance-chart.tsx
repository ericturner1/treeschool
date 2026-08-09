type BalancePoint = {
  id: string;
  balance: number;
  createdAt: string;
};

function compactTimeline(points: BalancePoint[], maximumPoints = 120) {
  if (points.length <= maximumPoints) return points;
  const stride = Math.ceil(points.length / maximumPoints);
  const compacted = points.filter((_, index) => index % stride === 0);
  const last = points.at(-1)!;
  if (compacted.at(-1)?.id !== last.id) compacted.push(last);
  return compacted;
}

export function PointsBalanceChart({
  timeline,
  timeZone,
  pluralName
}: {
  timeline: BalancePoint[];
  timeZone: string;
  pluralName: string;
}) {
  const points = compactTimeline(timeline);
  if (points.length === 0) {
    return (
      <div className="grid min-h-32 place-items-center rounded-[20px] border border-white/70 bg-white/45 px-5 text-center text-sm font-medium text-ink/45">
        The balance graph will appear after the first activity.
      </div>
    );
  }
  const width = 480;
  const height = 128;
  const paddingX = 8;
  const paddingY = 10;
  const balances = points.map((point) => point.balance);
  const minimum = Math.min(0, ...balances);
  const maximum = Math.max(1, ...balances);
  const span = Math.max(1, maximum - minimum);
  const coordinates = points.map((point, index) => {
    const x = points.length === 1
      ? width / 2
      : paddingX + (index / (points.length - 1)) * (width - paddingX * 2);
    const y = paddingY + ((maximum - point.balance) / span) * (height - paddingY * 2);
    return { x, y };
  });
  const line = coordinates.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${paddingX},${height - paddingY} ${line} ${width - paddingX},${height - paddingY}`;
  const dateFormatter = new Intl.DateTimeFormat("en", {
    timeZone,
    month: "short",
    day: "numeric"
  });
  const first = points[0]!;
  const last = points.at(-1)!;
  return (
    <div className="rounded-[20px] border border-white/70 bg-white/45 px-4 pb-3 pt-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink/48">Balance over time</p>
        <p className="text-xs font-semibold text-[#587443]">{last.balance} {pluralName}</p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-28 w-full overflow-visible"
        role="img"
        aria-label={`${pluralName} balance over time, ending at ${last.balance}`}
      >
        <defs>
          <linearGradient id="points-balance-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6f9852" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#6f9852" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <line x1={paddingX} x2={width - paddingX} y1={height - paddingY} y2={height - paddingY} stroke="#a8bd96" strokeOpacity="0.45" />
        <polygon points={area} fill="url(#points-balance-area)" />
        <polyline points={line} fill="none" stroke="#5f8747" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={coordinates.at(-1)!.x} cy={coordinates.at(-1)!.y} r="5" fill="#fff" stroke="#5f8747" strokeWidth="3" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] font-semibold text-ink/42">
        <span>{dateFormatter.format(new Date(first.createdAt))}</span>
        <span>{dateFormatter.format(new Date(last.createdAt))}</span>
      </div>
    </div>
  );
}
