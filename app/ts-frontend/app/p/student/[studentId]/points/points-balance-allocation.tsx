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
    ? `conic-gradient(#6f9852 0% ${bankPercent}%, #a97552 ${bankPercent}% 100%)`
    : "#ded8ce";

  return (
    <section
      aria-labelledby="points-allocation-title"
      className="site-panel w-full max-w-[580px] rounded-[26px] px-6 py-6"
    >
      <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">Balance breakdown</p>
      <h2 id="points-allocation-title" className="mt-2 text-[26px] font-semibold tracking-[-0.045em] text-ink">
        Where the {pluralName.toLowerCase()} are
      </h2>
      <div className="mt-5 grid grid-cols-[124px_minmax(0,1fr)] items-center gap-6 sm:grid-cols-[148px_minmax(0,1fr)]">
        <div
          role="img"
          aria-label={`${formatPoints(availableBalance)} ${unitName(availableBalance)} available and ${formatPoints(bankBalance)} ${unitName(bankBalance)} in the bank`}
          className="aspect-square w-full rounded-full border-[5px] border-white shadow-[0_5px_0_#d9c8ae,0_10px_24px_rgba(79,54,34,0.10)]"
          style={{ background: pieBackground }}
        />
        <dl className="grid gap-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
            <span className="h-3.5 w-3.5 rounded-full bg-[#a97552]" aria-hidden="true" />
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.1em] text-ink/48">Available</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-[-0.045em] text-ink">
                {formatPoints(availableBalance)}
              </dd>
            </div>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-t border-[#e7dac7] pt-4">
            <span className="h-3.5 w-3.5 rounded-full bg-[#6f9852]" aria-hidden="true" />
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.1em] text-ink/48">In the bank</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-[-0.045em] text-ink">
                {formatPoints(bankBalance)}
              </dd>
            </div>
          </div>
        </dl>
      </div>
    </section>
  );
}
