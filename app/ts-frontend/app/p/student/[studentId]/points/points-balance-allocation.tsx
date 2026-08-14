function formatPoints(amount: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(amount);
}

export function PointsBalanceAllocation({
  availableBalance,
  bankBalance,
  singularName,
  pluralName
}: {
  availableBalance: number;
  bankBalance: number;
  singularName: string;
  pluralName: string;
}) {
  const total = Math.max(0, availableBalance) + Math.max(0, bankBalance);
  const bankPercent = total > 0 ? Math.max(0, Math.min(100, bankBalance / total * 100)) : 0;
  const unitName = (amount: number) => Math.abs(amount) === 1 ? singularName : pluralName;
  const pieBackground = total > 0
    ? `conic-gradient(#b6d39e 0% ${bankPercent}%, #f4dfbc ${bankPercent}% 100%)`
    : "#e8eee1";

  return (
    <section
      aria-labelledby="points-allocation-title"
      className="min-w-0 rounded-[28px] border border-[#d6e4c8] bg-[#fcfef9] px-7 py-7 shadow-[0_7px_0_#e2ecd8,0_16px_34px_rgba(92,121,68,0.07)]"
    >
      <div className="grid min-w-0 items-center gap-7 sm:grid-cols-[minmax(140px,0.55fr)_minmax(0,1.45fr)] sm:gap-10">
        <div
          role="img"
          aria-label={`${formatPoints(availableBalance)} ${unitName(availableBalance)} available and ${formatPoints(bankBalance)} ${unitName(bankBalance)} in the bank`}
          className="mx-auto aspect-square w-36 max-w-full rounded-full border-[6px] border-white shadow-[0_5px_0_#dce8d2,0_12px_26px_rgba(92,121,68,0.10)] sm:w-40"
          style={{ background: pieBackground }}
        />
        <div className="min-w-0">
          <p id="points-allocation-title" className="text-xs font-black uppercase tracking-[0.13em] text-[#709255]">Balance breakdown</p>
          <dl className="mt-5 grid min-w-0 grid-cols-2 gap-4">
            <div className="min-w-0 rounded-[20px] border border-[#f0dfc2] bg-[#fff8eb] px-5 py-5">
              <dt className="flex min-w-0 items-start gap-2 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink/48">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-[#f4dfbc] ring-1 ring-[#e8cd9f]" aria-hidden="true" />
                <span className="min-w-0 break-words">Available</span>
              </dt>
              <dd className="mt-2 min-w-0 break-words text-xl font-semibold leading-none tracking-[-0.04em] text-ink/85 sm:text-2xl">
                {formatPoints(availableBalance)}
              </dd>
            </div>
            <div className="min-w-0 rounded-[20px] border border-[#dce9d1] bg-[#f2f8ec] px-5 py-5">
              <dt className="flex min-w-0 items-start gap-2 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink/48">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-[#b6d39e] ring-1 ring-[#9fc282]" aria-hidden="true" />
                <span className="min-w-0 break-words">In the bank</span>
              </dt>
              <dd className="mt-2 min-w-0 break-words text-xl font-semibold leading-none tracking-[-0.04em] text-ink/85 sm:text-2xl">
                {formatPoints(bankBalance)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
