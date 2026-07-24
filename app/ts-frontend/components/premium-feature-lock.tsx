import { startCoreSubscriptionCheckoutAction } from "../app/billing-actions";

export function PremiumFeatureLock({
  title,
  description,
  returnPath,
  trialEnded = false
}: {
  title: string;
  description: string;
  returnPath: string;
  trialEnded?: boolean;
}) {
  return (
    <section className="site-panel overflow-hidden rounded-[28px]">
      <div className="bg-[linear-gradient(135deg,#f4ead8_0%,#eef5e4_100%)] px-6 py-9 sm:px-10">
        <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.13em] text-earth">
          {trialEnded ? "Your 7-day preview has ended" : "Treeschool membership"}
        </span>
        <h2 className="mt-4 max-w-2xl text-[34px] font-semibold tracking-[-0.055em] text-ink">{title}</h2>
        <p className="mt-3 max-w-2xl text-base leading-[1.75] text-ink/72">{description}</p>
        <ul className="mt-6 grid gap-2 text-sm font-semibold text-ink/72 sm:grid-cols-2">
          <li>✓ Live grades by year and subject</li>
          <li>✓ Attendance and learning activity</li>
          <li>✓ Progress states and plan updates</li>
          <li>✓ Regenerate future weeks as plans change</li>
        </ul>
        <form action={startCoreSubscriptionCheckoutAction} className="mt-7">
          <input type="hidden" name="interval" value="monthly" />
          <input type="hidden" name="returnPath" value={returnPath} />
          <input type="hidden" name="successPath" value={returnPath} />
          <button type="submit" className="cta-button">Upgrade to membership</button>
        </form>
        {trialEnded ? (
          <p className="mt-4 text-sm text-ink/58">Your generated lesson-plan PDFs remain available to download.</p>
        ) : null}
      </div>
    </section>
  );
}
