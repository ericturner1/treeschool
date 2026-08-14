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
      <p className="text-xs font-black uppercase tracking-[0.13em] text-[#709255]">Balance breakdown</p>
      <h2 id="points-allocation-title" className="mt-2 text-[26px] font-semibold tracking-[-0.045em] text-ink/90">
        Where the {pluralName.toLowerCase()} are
      </h2>
      <div className="mt-7 grid grid-cols-[112px_minmax(0,1fr)] items-center gap-7 sm:grid-cols-[132px_minmax(0,1fr)]">
        <div
          role="img"
          aria-label={`${formatPoints(availableBalance)} ${unitName(availableBalance)} available and ${formatPoints(bankBalance)} ${unitName(bankBalance)} in the bank`}
          className="aspect-square w-full rounded-full border-[6px] border-white shadow-[0_5px_0_#dce8d2,0_12px_26px_rgba(92,121,68,0.10)]"
          style={{ background: pieBackground }}
        />
        <dl className="grid gap-5">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
            <span className="h-3.5 w-3.5 rounded-full bg-[#f4dfbc] ring-1 ring-[#e8cd9f]" aria-hidden="true" />
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.1em] text-ink/45">Available</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-[-0.045em] text-ink/85">
                {formatPoints(availableBalance)}
              </dd>
            </div>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-t border-[#e3ecd9] pt-5">
            <span className="h-3.5 w-3.5 rounded-full bg-[#b6d39e] ring-1 ring-[#9fc282]" aria-hidden="true" />
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.1em] text-ink/45">In the bank</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-[-0.045em] text-ink/85">
                {formatPoints(bankBalance)}
              </dd>
            </div>
          </div>
        </dl>
      </div>
    </section>
  );
}
