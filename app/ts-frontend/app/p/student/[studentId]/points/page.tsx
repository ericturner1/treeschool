import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { LocalDateTime } from "../../../../../components/local-date-time";
import { PointIcon } from "../../../../../components/point-icon";
import { PointIconPicker } from "../../../../../components/point-icon-picker";
import { PointReasonField } from "../../../../../components/point-reason-field";
import { getStudentStreakSettings } from "../../../../../lib/accounts/server";
import {
  COMMON_AWARD_REASONS,
  COMMON_REDEMPTION_REASONS,
  frequentPointReasons,
} from "../../../../../lib/points/reasons";
import { getStudentPoints } from "../../../../../lib/points/server";
import { ParentModeGuard } from "../../../parent-mode-guard";
import { getParentStudentPageData, studentRoutePath } from "../student-page-data";
import { StudentShell } from "../student-shell";
import {
  awardStudentPointsAction,
  depositStudentPointsToBankAction,
  redeemStudentPointsAction,
  updateStudentPointSettingsAction,
  withdrawStudentPointsFromBankAction
} from "./actions";
import { PointAwardSuccessSound } from "./point-award-success-sound";
import { PointsBalanceAllocation } from "./points-balance-allocation";
import { PointsBalanceChart } from "./points-balance-chart";
import { PointsSubmitButton } from "./points-submit-button";

type Props = {
  params: Promise<{ studentId?: string }>;
  searchParams?: Promise<{
    lang?: string;
    message?: string;
    error?: string;
    historyPage?: string;
    resetForm?: string;
    resetToken?: string;
  }>;
};

function unitName(amount: number, singularName: string, pluralName: string) {
  return Math.abs(amount) === 1 ? singularName : pluralName;
}

function formatPoints(amount: number, interest = false) {
  return new Intl.NumberFormat("en", {
    minimumFractionDigits: interest ? 2 : 0,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatInterestDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00.000Z`));
}

export default async function StudentPointsPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { dashboard, home, currentUser, student, studentRouteSegment } = await getParentStudentPageData(
    params.studentId,
    searchParams?.lang
  );
  if (params.studentId !== studentRouteSegment) {
    redirect(studentRoutePath(studentRouteSegment, "/points", searchParams));
  }
  const historyPage = Math.max(1, Math.round(Number(searchParams?.historyPage) || 1));
  const historyPageSize = 20;
  const [points, streakSettings] = await Promise.all([
    getStudentPoints({
      parentUserId: currentUser.id,
      profileId: student.id,
      historyLimit: historyPageSize,
      historyOffset: (historyPage - 1) * historyPageSize
    }),
    getStudentStreakSettings({
      parentUserId: currentUser.id,
      profileId: student.id
    })
  ]);
  const returnPath = studentRoutePath(studentRouteSegment, "/points");
  const redirectTo = studentRoutePath(studentRouteSegment, "/points", searchParams);
  const { singularName, pluralName, iconKey, customIconUrl } = points.settings;
  const canRedeemPoints = points.summary.availableBalance >= 1;
  const frequentAwardReasons = frequentPointReasons(points.transactions, "award");
  const frequentRedemptionReasons = frequentPointReasons(points.transactions, "redeem");
  const historyPageCount = Math.max(1, Math.ceil(points.history.total / historyPageSize));
  const historyHref = (page: number) => {
    const query = new URLSearchParams();
    if (searchParams?.lang) query.set("lang", searchParams.lang);
    if (page > 1) query.set("historyPage", String(page));
    return `${returnPath}${query.size > 0 ? `?${query}` : ""}`;
  };

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <StudentShell
        brandName={home.brand.name}
        dashboard={dashboard}
        student={student}
        studentRouteSegment={studentRouteSegment}
        title={`${student.firstName}'s ${pluralName}`}
        activeNav="points"
      >
        <div className="space-y-6">
          <PointAwardSuccessSound
            playKey={searchParams?.resetForm === "award" ? searchParams.resetToken ?? null : null}
          />
          <section className="overflow-hidden rounded-[30px] border border-[#b7ce9f] bg-[#eef5e4] shadow-[0_8px_0_#cadbb9]">
            <div className="grid gap-6 px-6 py-7 sm:px-8 md:grid-cols-[minmax(260px,320px)_minmax(0,760px)] md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#587443]">Total balance</p>
                <div className="mt-3 flex items-center gap-4">
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] bg-[#6f9852] text-white shadow-[0_5px_0_#4d7137]">
                    <PointIcon iconKey={iconKey} customIconUrl={customIconUrl} className="text-[34px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="whitespace-nowrap text-[46px] font-semibold leading-none tracking-[-0.065em] text-ink xl:text-[52px]">
                      {formatPoints(points.summary.totalBalance)}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[#587443]">
                      {unitName(points.summary.totalBalance, singularName, pluralName)}
                    </p>
                  </div>
                </div>
              </div>
              <PointsBalanceChart
                timeline={points.balanceTimeline}
                timeZone={streakSettings.timeZone}
                pluralName={pluralName}
              />
            </div>
          </section>

          <PointsBalanceAllocation
            availableBalance={points.summary.availableBalance}
            bankBalance={points.summary.bankBalance}
            singularName={singularName}
            pluralName={pluralName}
          />

          {points.canTransact ? (
            <section className="grid items-stretch gap-5 lg:grid-cols-2">
                <form
                  key={`award-${searchParams?.resetForm === "award" ? searchParams.resetToken : "initial"}`}
                  action={awardStudentPointsAction}
                  className="site-panel rounded-[28px] px-6 py-7"
                >
                <input type="hidden" name="profileId" value={student.id} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <p className="text-xs font-black uppercase tracking-[0.13em] text-[#587443]">Award {pluralName}</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-[100px_minmax(0,1fr)]">
                  <label className="text-sm font-semibold text-ink">
                    Amount
                    <input
                      name="amount"
                      type="number"
                      min="1"
                      max="100000"
                      step="1"
                      defaultValue={searchParams?.resetForm === "award" ? "" : "1"}
                      required
                      className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
                    />
                  </label>
                  <PointReasonField
                    label="Reason"
                    frequentReasons={frequentAwardReasons}
                    commonReasons={COMMON_AWARD_REASONS}
                  />
                </div>
                <div className="mt-5 [&>button]:!w-full">
                  <PointsSubmitButton
                    idleLabel={`Award ${pluralName}`}
                    pendingLabel="Awarding…"
                    prepareAwardSound
                  />
                </div>
                </form>

                <form
                  key={`redeem-${searchParams?.resetForm === "redeem" ? searchParams.resetToken : "initial"}`}
                  action={redeemStudentPointsAction}
                  className={`site-panel rounded-[28px] px-6 py-7 transition ${
                    canRedeemPoints
                      ? ""
                      : "!border-[#d8d7d2] !bg-[#f4f3f0] !shadow-none opacity-65"
                  }`}
                >
                <input type="hidden" name="profileId" value={student.id} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">Use {pluralName}</p>
                  {!canRedeemPoints ? (
                    <span className="rounded-full border border-[#d4d1ca] bg-white/75 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink/55">
                      No points available
                    </span>
                  ) : null}
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-[100px_minmax(0,1fr)]">
                  <label className="text-sm font-semibold text-ink">
                    Amount
                    <input
                      name="amount"
                      type="number"
                      min="1"
                      max={Math.max(1, points.summary.availableBalance)}
                      step="1"
                      defaultValue={searchParams?.resetForm === "redeem" ? "" : "1"}
                      required
                      disabled={!canRedeemPoints}
                      className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544] disabled:cursor-not-allowed disabled:border-[#d8d5cf] disabled:bg-[#e9e7e2]"
                    />
                  </label>
                  <PointReasonField
                    label="Used for"
                    frequentReasons={frequentRedemptionReasons}
                    commonReasons={COMMON_REDEMPTION_REASONS}
                    disabled={!canRedeemPoints}
                  />
                </div>
                <div className="mt-5 [&>button]:!w-full">
                  <PointsSubmitButton
                    idleLabel={`Use ${pluralName}`}
                    pendingLabel="Using…"
                    disabled={!canRedeemPoints}
                    tone="outline"
                  />
                </div>
                </form>
            </section>
          ) : null}

          {points.canTransact ? (
            <section className="site-panel rounded-[28px] px-6 py-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.13em] text-[#587443]">
                    <span
                      aria-hidden="true"
                      className="grid h-7 w-7 place-items-center rounded-[9px] bg-[#e3eed8] text-[#587443]"
                    >
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
                        <path d="M3.5 9h17L12 4 3.5 9Z" fill="currentColor" />
                        <path d="M5.5 10.5v6m4.3-6v6m4.4-6v6m4.3-6v6M3.5 19h17M4.5 16.5h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>Points bank</span>
                  </p>
                  <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-ink">Save and grow {pluralName.toLowerCase()}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
                    Banked {pluralName.toLowerCase()} earn {points.settings.bank.interestRatePercent}% interest with {points.settings.bank.compoundingInterval} compounding. Transfers never change the total balance.
                  </p>
                </div>
                <div className="rounded-[18px] border border-[#c7d9b5] bg-[#f1f7e9] px-5 py-4 sm:text-right">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink/48">Bank balance</p>
                  <p className="mt-1 text-3xl font-semibold tracking-[-0.05em] text-ink">{formatPoints(points.summary.bankBalance)}</p>
                  <p className="mt-1 text-xs font-semibold text-[#587443]">+{formatPoints(points.summary.bankInterestEarned, true)} earned in interest</p>
                </div>
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <form action={depositStudentPointsToBankAction} className="rounded-[20px] border border-[#c7d9b5] bg-[#f6faef] px-5 py-5">
                  <input type="hidden" name="profileId" value={student.id} />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <h3 className="text-lg font-semibold text-ink">Deposit</h3>
                  <p className="mt-1 text-xs leading-5 text-ink/52">Move available {pluralName.toLowerCase()} into the interest-earning bank.</p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex-1 text-sm font-semibold text-ink">
                      Amount
                      <input
                        name="amount"
                        type="number"
                        min="1"
                        max={Math.max(1, points.summary.availableBalance)}
                        step="1"
                        defaultValue="1"
                        required
                        disabled={points.summary.availableBalance < 1}
                        className="mt-2 min-h-12 w-full rounded-[14px] border border-[#c7d9b5] bg-white px-4 text-base outline-none focus:border-[#6f9852] disabled:bg-[#eee9e0]"
                      />
                    </label>
                    <PointsSubmitButton
                      idleLabel="Deposit"
                      pendingLabel="Depositing…"
                      disabled={points.summary.availableBalance < 1}
                    />
                  </div>
                </form>
                <form action={withdrawStudentPointsFromBankAction} className="rounded-[20px] border border-[#dfc9aa] bg-[#fffaf2] px-5 py-5">
                  <input type="hidden" name="profileId" value={student.id} />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <h3 className="text-lg font-semibold text-ink">Withdraw</h3>
                  <p className="mt-1 text-xs leading-5 text-ink/52">Move banked {pluralName.toLowerCase()} back into the available balance.</p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex-1 text-sm font-semibold text-ink">
                      Amount
                      <input
                        name="amount"
                        type="number"
                        min="1"
                        max={Math.max(1, points.summary.bankBalance)}
                        step="1"
                        defaultValue="1"
                        required
                        disabled={points.summary.bankBalance < 1}
                        className="mt-2 min-h-12 w-full rounded-[14px] border border-[#dfc9aa] bg-white px-4 text-base outline-none focus:border-[#8f6544] disabled:bg-[#eee9e0]"
                      />
                    </label>
                    <PointsSubmitButton
                      idleLabel="Withdraw"
                      pendingLabel="Withdrawing…"
                      disabled={points.summary.bankBalance < 1}
                      tone="outline"
                    />
                  </div>
                </form>
              </div>
            </section>
          ) : null}

          <section aria-label="Lifetime points summary" className="grid gap-4 sm:grid-cols-2">
            <div className="site-panel rounded-[24px] px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink/48">Lifetime earned</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-ink">{formatPoints(points.summary.lifetimeEarned)}</p>
            </div>
            <div className="site-panel rounded-[24px] px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink/48">Used</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-ink">{formatPoints(points.summary.lifetimeUsed)}</p>
            </div>
          </section>

          <section className="site-panel rounded-[28px] px-6 py-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">Ledger</p>
                <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-ink">{pluralName} history</h2>
              </div>
              <p className="text-sm text-ink/52">Awards, spending, bank transfers, and interest remain recorded.</p>
            </div>
            <div className="mt-6 space-y-3">
              {points.transactions.length === 0 ? (
                <p className="rounded-[18px] bg-[#fffaf2] px-5 py-7 text-sm text-ink/58">No {pluralName.toLowerCase()} activity yet.</p>
              ) : points.transactions.map((transaction) => (
                <article key={transaction.id} className={`flex flex-col gap-3 rounded-[19px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
                  transaction.reversed
                    ? "border-[#ddd7cc] bg-[#f3f0eb] opacity-60"
                    : transaction.isTransfer
                      ? "border-[#d8c8af] bg-[#fffaf2]"
                      : transaction.amount > 0
                      ? "border-[#c6d9b4] bg-[#f4f8ed]"
                      : "border-[#dec9a9] bg-[#fffaf2]"
                }`}>
                  <div className="min-w-0">
                    <p className={`font-semibold text-ink ${transaction.reversed ? "line-through" : ""}`}>{transaction.reason}</p>
                    <p className="mt-1 text-xs text-ink/48">
                      {transaction.actorName} ·{" "}
                      <LocalDateTime
                        value={transaction.createdAt}
                        timeZone={streakSettings.timeZone}
                      />
                      {transaction.interestDate ? ` · Interest period ending ${formatInterestDate(transaction.interestDate)}` : ""}
                      {transaction.reversed ? " · Completion undone" : ""}
                    </p>
                  </div>
                  <div className="flex-none sm:text-right">
                    <p className={`text-xl font-semibold ${
                      transaction.reversed
                        ? "text-ink/40 line-through"
                        : transaction.isTransfer
                          ? "text-earth"
                          : transaction.amount > 0
                          ? "text-[#52783e]"
                          : "text-earth"
                    }`}>
                      {transaction.isTransfer
                        ? `${formatPoints(Math.abs(transaction.amount))} ${unitName(transaction.amount, singularName, pluralName)} transferred`
                        : `${transaction.amount > 0 ? "+" : ""}${formatPoints(transaction.amount, transaction.kind === "interest")} ${unitName(transaction.amount, singularName, pluralName)}`}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-ink/48">
                      {transaction.balanceKind === "bank" ? "Bank balance" : "Available"} after: {formatPoints(transaction.balanceAfter)} {unitName(transaction.balanceAfter, singularName, pluralName)}
                      {transaction.balanceKind === "available" && transaction.bankBalanceAfter != null
                        ? ` · Bank: ${formatPoints(transaction.bankBalanceAfter)} ${unitName(transaction.bankBalanceAfter, singularName, pluralName)}`
                        : ""}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            {historyPageCount > 1 ? (
              <nav aria-label={`${pluralName} history pages`} className="mt-6 flex items-center justify-between gap-4 border-t border-[#eadbc2] pt-5">
                {historyPage > 1 ? (
                  <Link href={historyHref(historyPage - 1) as Route} className="text-sm font-semibold text-earth underline underline-offset-4">
                    ← Newer activity
                  </Link>
                ) : <span />}
                <span className="text-xs font-semibold text-ink/48">
                  Page {Math.min(historyPage, historyPageCount)} of {historyPageCount}
                </span>
                {historyPage < historyPageCount ? (
                  <Link href={historyHref(historyPage + 1) as Route} className="text-sm font-semibold text-earth underline underline-offset-4">
                    Older activity →
                  </Link>
                ) : <span />}
              </nav>
            ) : null}
          </section>

          {points.canManage ? (
            <form action={updateStudentPointSettingsAction} className="site-panel rounded-[28px] px-6 py-7">
              <input type="hidden" name="profileId" value={student.id} />
              <input type="hidden" name="returnPath" value={returnPath} />
              <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">Customize</p>
              <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-ink">Point settings</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/62">
                Call them stars, tokens, acorns, or anything that feels motivating to {student.firstName}.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-ink">
                  Singular name
                  <input name="singularName" type="text" required maxLength={30} defaultValue={singularName} placeholder="point" className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]" />
                </label>
                <label className="text-sm font-semibold text-ink">
                  Plural name
                  <input name="pluralName" type="text" required maxLength={30} defaultValue={pluralName} placeholder="points" className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]" />
                </label>
              </div>
              <fieldset className="mt-6">
                <legend className="text-sm font-semibold text-ink">Icon</legend>
                <PointIconPicker initialIconKey={iconKey} customIconUrl={customIconUrl} />
              </fieldset>
              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-[18px] border border-[#c7d9b5] bg-[#f1f7e9] px-4 py-4">
                <input name="autoAwardLessonCompletion" type="checkbox" defaultChecked={points.settings.autoAwardLessonCompletion} className="mt-1 h-5 w-5 accent-[#638b49]" />
                <span>
                  <span className="block font-semibold text-ink">Automatically award 1 {singularName} when a lesson is marked done</span>
                  <span className="mt-1 block text-sm leading-6 text-ink/58">Repeated clicks do not create duplicates, and undoing the lesson reverses its automatic award.</span>
                </span>
              </label>
              <fieldset className="mt-6 rounded-[20px] border border-[#c7d9b5] bg-[#f6faef] px-5 py-5">
                <legend className="px-2 text-sm font-semibold text-ink">Bank interest</legend>
                <p className="max-w-3xl text-sm leading-6 text-ink/58">
                  The rate applies once per selected compounding period. Fractional interest carries forward until it becomes a whole {singularName}, so small balances still receive their full interest over time.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-ink">
                    Interest rate per period
                    <div className="relative mt-2">
                      <input
                        name="bankInterestRatePercent"
                        type="number"
                        min="0.01"
                        max="10"
                        step="0.01"
                        required
                        defaultValue={points.settings.bank.interestRatePercent}
                        className="min-h-14 w-full rounded-[16px] border border-[#c7d9b5] bg-white px-4 pr-10 text-base outline-none focus:border-[#6f9852]"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-semibold text-ink/45">%</span>
                    </div>
                  </label>
                  <label className="text-sm font-semibold text-ink">
                    Compound interest
                    <select
                      name="bankCompoundingInterval"
                      defaultValue={points.settings.bank.compoundingInterval}
                      className="mt-2 min-h-14 w-full rounded-[16px] border border-[#c7d9b5] bg-white px-4 text-base outline-none focus:border-[#6f9852]"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                </div>
              </fieldset>
              <div className="mt-6">
                <PointsSubmitButton idleLabel="Save point settings" pendingLabel="Saving…" />
              </div>
            </form>
          ) : null}
        </div>
      </StudentShell>
    </ParentModeGuard>
  );
}
