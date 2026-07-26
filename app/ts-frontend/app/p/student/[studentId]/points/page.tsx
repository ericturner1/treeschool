import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { LocalDateTime } from "../../../../../components/local-date-time";
import { PointIcon } from "../../../../../components/point-icon";
import { PointIconPicker } from "../../../../../components/point-icon-picker";
import { getStudentStreakSettings } from "../../../../../lib/accounts/server";
import { getStudentPoints } from "../../../../../lib/points/server";
import { ParentModeGuard } from "../../../parent-mode-guard";
import { getParentStudentPageData, studentRoutePath } from "../student-page-data";
import { StudentShell } from "../student-shell";
import {
  awardStudentPointsAction,
  redeemStudentPointsAction,
  updateStudentPointSettingsAction
} from "./actions";
import { PointsSubmitButton } from "./points-submit-button";

type Props = {
  params: { studentId?: string };
  searchParams?: {
    lang?: string;
    message?: string;
    error?: string;
    historyPage?: string;
    resetForm?: string;
    resetToken?: string;
  };
};

function unitName(amount: number, singularName: string, pluralName: string) {
  return Math.abs(amount) === 1 ? singularName : pluralName;
}

export default async function StudentPointsPage({ params, searchParams }: Props) {
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
          {searchParams?.message ? (
            <div className="rounded-[20px] border border-[#b8cf9f] bg-[#eef5e4] px-5 py-4 text-sm font-semibold text-[#4d6a39]">
              {searchParams.message}
            </div>
          ) : null}
          {searchParams?.error ? (
            <div role="alert" className="rounded-[20px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">
              {searchParams.error}
            </div>
          ) : null}

          <section className="overflow-hidden rounded-[30px] border border-[#b7ce9f] bg-[#eef5e4] shadow-[0_8px_0_#cadbb9]">
            <div className="grid gap-6 px-6 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#587443]">Current balance</p>
                <div className="mt-3 flex items-center gap-4">
                  <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-[#6f9852] text-white shadow-[0_5px_0_#4d7137]">
                    <PointIcon iconKey={iconKey} customIconUrl={customIconUrl} className="text-[34px]" />
                  </span>
                  <div>
                    <p className="text-[52px] font-semibold leading-none tracking-[-0.065em] text-ink">
                      {points.summary.balance}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[#587443]">
                      {unitName(points.summary.balance, singularName, pluralName)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-36 rounded-[20px] bg-white/75 px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink/48">Lifetime earned</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-ink">{points.summary.lifetimeEarned}</p>
                </div>
                <div className="min-w-36 rounded-[20px] bg-white/75 px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink/48">Used</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-ink">{points.summary.lifetimeUsed}</p>
                </div>
              </div>
            </div>
          </section>

          {points.canManage ? (
            <section className="grid gap-5 lg:grid-cols-2">
              <form
                key={`award-${searchParams?.resetForm === "award" ? searchParams.resetToken : "initial"}`}
                action={awardStudentPointsAction}
                className="site-panel rounded-[28px] px-6 py-7"
              >
                <input type="hidden" name="profileId" value={student.id} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <p className="text-xs font-black uppercase tracking-[0.13em] text-[#587443]">Recognize good work</p>
                <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-ink">Award {pluralName}</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-[130px_minmax(0,1fr)]">
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
                  <label className="text-sm font-semibold text-ink">
                    Reason
                    <input name="reason" type="text" maxLength={300} required placeholder="Finished a difficult assignment" className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]" />
                  </label>
                </div>
                <div className="mt-5">
                  <PointsSubmitButton idleLabel={`Award ${pluralName}`} pendingLabel="Awarding…" />
                </div>
              </form>

              <form
                key={`redeem-${searchParams?.resetForm === "redeem" ? searchParams.resetToken : "initial"}`}
                action={redeemStudentPointsAction}
                className="site-panel rounded-[28px] px-6 py-7"
              >
                <input type="hidden" name="profileId" value={student.id} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">Rewards and privileges</p>
                <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-ink">Use {pluralName}</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-[130px_minmax(0,1fr)]">
                  <label className="text-sm font-semibold text-ink">
                    Amount
                    <input
                      name="amount"
                      type="number"
                      min="1"
                      max={Math.max(1, points.summary.balance)}
                      step="1"
                      defaultValue={searchParams?.resetForm === "redeem" ? "" : "1"}
                      required
                      disabled={points.summary.balance < 1}
                      className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544] disabled:bg-[#eee9e0]"
                    />
                  </label>
                  <label className="text-sm font-semibold text-ink">
                    Used for
                    <input name="reason" type="text" maxLength={300} required disabled={points.summary.balance < 1} placeholder="Chose tonight's dessert" className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544] disabled:bg-[#eee9e0]" />
                  </label>
                </div>
                <div className="mt-5">
                  <PointsSubmitButton
                    idleLabel={`Use ${pluralName}`}
                    pendingLabel="Using…"
                    disabled={points.summary.balance < 1}
                    tone="outline"
                  />
                </div>
              </form>
            </section>
          ) : (
            <div className="rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-4 text-sm leading-6 text-ink/65">
              Account owners and admins can award or use {pluralName}. Teachers can view the balance and history.
            </div>
          )}

          <section className="site-panel rounded-[28px] px-6 py-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">Ledger</p>
                <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-ink">{pluralName} history</h2>
              </div>
              <p className="text-sm text-ink/52">Every award and use remains recorded.</p>
            </div>
            <div className="mt-6 space-y-3">
              {points.transactions.length === 0 ? (
                <p className="rounded-[18px] bg-[#fffaf2] px-5 py-7 text-sm text-ink/58">No {pluralName.toLowerCase()} activity yet.</p>
              ) : points.transactions.map((transaction) => (
                <article key={transaction.id} className={`flex flex-col gap-3 rounded-[19px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
                  transaction.reversed
                    ? "border-[#ddd7cc] bg-[#f3f0eb] opacity-60"
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
                        fallbackTimeZone={streakSettings.timeZone}
                      />
                      {transaction.reversed ? " · Completion undone" : ""}
                    </p>
                  </div>
                  <p className={`flex-none text-xl font-semibold ${
                    transaction.reversed
                      ? "text-ink/40 line-through"
                      : transaction.amount > 0
                        ? "text-[#52783e]"
                        : "text-earth"
                  }`}>
                    {transaction.amount > 0 ? "+" : ""}{transaction.amount} {unitName(transaction.amount, singularName, pluralName)}
                  </p>
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
