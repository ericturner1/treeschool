import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { ParentModeGuard } from "../../../parent-mode-guard";
import { getPaperPlan, type PaperPlanWeek } from "../../../../../lib/paper-plans/server";
import { getParentStudentPageData, studentRoutePath } from "../student-page-data";
import { StudentShell } from "../student-shell";
import { AutoRefresh } from "./auto-refresh";
import { AuthenticatedPlanGenerator } from "./authenticated-plan-generator";
import { WeeklyPdfButton } from "./weekly-pdf-button";
import { AdminManifestButton } from "./admin-manifest-button";
import { DaySubjectGradeField } from "./day-subject-grade-field";
import { LessonCompletionButton } from "./lesson-completion-button";
import { LessonDispositionControl } from "./lesson-disposition-control";
import { LessonPreviewButton } from "./lesson-preview-button";
import { letterGrade } from "./grade-utils";
import { RestorePreviousPlanButton } from "./restore-previous-plan-button";
import { getParentBillingOverview } from "../../../../../lib/billing/server";
import { PremiumFeatureLock } from "../../../../../components/premium-feature-lock";
import { getParentAccountPreferences } from "../../../../../lib/accounts/server";
import type { PlanCreationProgressValue } from "../../../../../components/plan-creation-progress";
import { headers } from "next/headers";
import { inferPrintPageSizeFromHeaders } from "../../../../../lib/print-page-size-inference";
import { listNativeWorkbookCatalog } from "../../../../../lib/native-workbooks/server";
import { LessonPlanEmptyState } from "./lesson-plan-empty-state";
import { PlanDayCard } from "./plan-day-card";
import { PlanDaySubjectCard } from "./plan-day-subject-card";
import { weekSubjectSummaries, workbookLessonSummary } from "./week-subject-summaries";
import {
  WeekPlanDetails,
  WeekProgressProvider,
  WeekProgressSummary,
  WeeklyPlansCollectionSummary
} from "./week-progress-state";
import {
  addNativeWorkbooksToPlanAction,
  addMaterialsFromGeneratorAction,
  createPlanFromGeneratorAction,
  restorePreviousPlanAction,
  deletePaperPlanDocumentAction,
  deletePaperPlanDocumentByIdAction,
  startPaperPlanPlanningAction,
  retryFailedPaperPlanPlanningAction,
  evaluatePaperPlanCompletenessAction,
  setPaperPlanWeekCompressionAction,
  updatePlanDetailsAction,
  updatePaperPlanDocumentAction,
  purchaseNativeWorkbookForPlanAction,
  upgradeNativeWorkbookEditionAction
} from "./actions";

type PageProps = {
  params: { studentId?: string };
  searchParams?: {
    lang?: string;
    error?: string;
    message?: string;
    clearDraft?: string;
    nativeWorkbooks?: string;
    checkout?: string;
    weeklyPlanId?: string;
    week?: string;
    day?: string;
  };
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: string) {
  if (status === "ready") return "Indexed";
  if (status === "queued" || status === "pending") return "Queued";
  if (status === "analyzing") return "Processing";
  if (status === "failed") return "Failed";
  return status;
}

function documentStatusLabel(document: {
  analysisStatus: string;
  analysisJson: { analysisMethod?: string };
}) {
  if (document.analysisJson.analysisMethod === "uploaded_file") return "Stored";
  return statusLabel(document.analysisStatus);
}

function fileKindLabel(document: { sourceKind?: string; mimeType?: string; pageCount: number }) {
  if (document.sourceKind === "text") return "text";
  if (document.sourceKind === "image") return "image";
  return `${document.pageCount} ${document.pageCount === 1 ? "page" : "pages"}`;
}

function languageFamily(value: string | null | undefined) {
  return value?.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

function groupWeekLessons(items: PaperPlanWeek["items"]) {
  const lessons = new Map<string, PaperPlanWeek["items"]>();
  for (const item of items.filter((candidate) => candidate.baseIncludedInPacket)) {
    const key = item.sourceUnitId
      ? `${item.documentId}:unit:${item.sourceUnitId}`
      : `${item.documentId}:legacy:${item.label}:${item.dayNumber ?? "none"}`;
    const group = lessons.get(key) ?? [];
    group.push(item);
    lessons.set(key, group);
  }
  return Array.from(lessons.entries()).map(([key, lessonItems]) => {
    const ordered = lessonItems.slice().sort((left, right) =>
      left.firstPageIndex - right.firstPageIndex || left.sortOrder - right.sortOrder
    );
    const first = ordered[0];
    return {
      key,
      first,
      subjectLabel: first.subjectLabel || "Uncategorized",
      pageStart: Math.min(...ordered.map((item) => item.firstPageIndex)) + 1,
      pageEnd: Math.max(...ordered.map((item) => item.lastPageIndex)) + 1,
      days: Array.from(new Set(ordered.map((item) => item.dayNumber).filter((day): day is number => day != null))).sort((a, b) => a - b)
    };
  }).sort((left, right) =>
    (left.days[0] ?? 999) - (right.days[0] ?? 999) ||
    left.subjectLabel.localeCompare(right.subjectLabel) ||
    left.pageStart - right.pageStart
  );
}

function lessonDispositionPresentation(
  disposition: PaperPlanWeek["items"][number]["lessonDisposition"]
) {
  if (disposition === "already_mastered") {
    return {
      label: "Mastered",
      detail: "Recorded as covered; omitted from future downloads.",
      badgeClass: "bg-[#dceacd] text-[#486a38]"
    };
  }
  if (disposition === "save_for_later") {
    return {
      label: "Later",
      detail: "Saved for a future plan; omitted from current downloads.",
      badgeClass: "bg-[#f2dfb6] text-[#765632]"
    };
  }
  return {
    label: "Removed",
    detail: "Removed from printable downloads, but retained here for reference.",
    badgeClass: "bg-[#f2d8d0] text-[#8b3e2f]"
  };
}

function weekSourcePageCount(items: Array<{
  firstPageIndex: number;
  lastPageIndex: number;
  includedInPacket: boolean;
}>) {
  return items.filter((item) => item.includedInPacket).reduce(
    (total, item) => total + Math.max(0, item.lastPageIndex - item.firstPageIndex + 1),
    0
  );
}

function estimatedPacketPageCount(items: Array<{
  firstPageIndex: number;
  lastPageIndex: number;
  dayNumber: number | null;
  includedInPacket: boolean;
}>) {
  const includedItems = items.filter((item) => item.includedInPacket);
  const daySummaryPages = new Set(
    includedItems.map((item) => item.dayNumber).filter((day): day is number => day != null)
  ).size;
  return 1 + daySummaryPages + weekSourcePageCount(includedItems);
}

export default async function PaperPlanPage({ params, searchParams }: PageProps) {
  const { dashboard, home, currentUser, parentProfile, student, studentRouteSegment } = await getParentStudentPageData(
    params.studentId,
    searchParams?.lang
  );
  if (params.studentId !== studentRouteSegment) {
    redirect(studentRoutePath(studentRouteSegment, "/lesson-plan", searchParams));
  }
  const [plan, billing, preferences, nativeCatalog] = await Promise.all([
    getPaperPlan({
      parentUserId: currentUser.id,
      profileId: student.id
    }),
    getParentBillingOverview({ userId: currentUser.id }),
    getParentAccountPreferences(currentUser.id).catch(() => ({ preferredPrintPageSize: null })),
    listNativeWorkbookCatalog({
      userId: currentUser.id,
      profileId: student.id,
      grade: student.gradeLevel,
      subject: null
    }).catch(() => ({ workbooks: [] }))
  ]);
  const suggestedPrintPageSize = preferences.preferredPrintPageSize
    ? null
    : inferPrintPageSizeFromHeaders(headers());
  const isAdmin = parentProfile?.isAdmin === true;
  const canManagePlan = plan.permissions.canManagePlan;
  const recommendedNativeCurriculum = student.gradeLevel == null
    ? null
    : nativeCatalog.workbooks.find((item) =>
        item.catalogKind === "bundle" &&
        item.isRecommendedCurriculum &&
        item.type === "core" &&
        (item.accessState === "included" || item.accessState === "owned") &&
        item.recommendedGradeLevel === student.gradeLevel &&
        item.members?.length === item.memberCount &&
        item.members.every((member) => member.gradeMin <= student.gradeLevel! && member.gradeMax >= student.gradeLevel!) &&
        languageFamily(item.languageCode) === languageFamily(student.languagePreference)
      ) ?? null;
  const activeDocumentCount = plan.documents.filter((document) =>
    ["queued", "pending", "analyzing"].includes(document.analysisStatus)
  ).length;
  const processedDocumentCount = plan.documents.filter((document) =>
    ["ready", "failed"].includes(document.analysisStatus)
  ).length;
  const readyPlanningDocumentCount = plan.documents.filter(
    (document) => document.analysisStatus === "ready" &&
      (document.sourceKind === "pdf" || document.sourceKind === "native_workbook")
  ).length;
  const planningActive = plan.planning.active > 0;
  const planningFailed = plan.planning.failed > 0 || plan.year?.status === "planning_failed";
  const planningAttempted = plan.planning.total > 0 || ["planning", "quality_check", "planning_failed"].includes(plan.year?.status ?? "");
  const hasPlanningAllowance = plan.weeks.length === 0 || plan.regenerationAllowance.remaining > 0;
  const hasSchoolYearPeriod = Boolean(plan.year?.startDate && plan.year?.endDate);
  const canStartPlanning = hasSchoolYearPeriod && plan.documents.length > 0 && activeDocumentCount === 0 && readyPlanningDocumentCount > 0 && !planningActive && !planningFailed && hasPlanningAllowance && (plan.weeks.length === 0 || plan.materialsChanged);
  const preservedWeekNumbers = plan.weeks
    .filter((week) => week.preservedForReplan)
    .map((week) => week.weekNumber);
  const preservedWeekNumberSet = new Set(preservedWeekNumbers);
  const rebuildWeekNumbers = plan.year
    ? Array.from({ length: plan.year.totalWeeks }, (_, index) => index + 1)
      .filter((weekNumber) => !preservedWeekNumberSet.has(weekNumber))
    : [];
  const nativeWorkbookPlanUpdatePreview = plan.weeks.length > 0
    ? {
        preservedWeekNumbers,
        rebuildWeekNumbers,
        remainingUpdates: plan.regenerationAllowance.remaining,
        blockedReason: planningActive
          ? "A plan update is already running. Wait for it to finish before adding another workbook."
          : planningFailed
            ? "Finish or retry the current plan update before starting another one."
            : activeDocumentCount > 0
              ? "Wait for the current teaching materials to finish processing before updating the plan."
              : !hasSchoolYearPeriod
                ? "Set the school-year dates before updating future weeks."
                : plan.regenerationAllowance.remaining < 1
                  ? plan.regenerationAllowance.introductoryMonth
                    ? "Plan updates unlock after the first regular membership renewal."
                    : "No plan updates remain in the current allowance period."
                  : rebuildWeekNumbers.length === 0
                    ? "Every week is already started, completed, or downloaded, so there are no untouched weeks to rebuild."
                    : null
      }
    : null;
  const readyForInitialReview = plan.weeks.length === 0 && !planningAttempted && canStartPlanning;
  const analyzingDocument = plan.documents.find((document) => document.analysisStatus === "analyzing");
  const queuedDocument = plan.documents.find((document) => ["queued", "pending"].includes(document.analysisStatus));
  const runningWeekNumber = plan.planning.runningWeekNumbers?.[0] ?? null;
  const qualityCheckingWeekNumber = plan.planning.qualityCheckingWeekNumbers?.[0] ?? null;
  const planningProgress: PlanCreationProgressValue | null = activeDocumentCount > 0
    ? {
        stage: "indexing" as const,
        percent: 10 + (processedDocumentCount / Math.max(1, plan.documents.length)) * 25,
        label: analyzingDocument
          ? `Reading and indexing ${analyzingDocument.label}…`
          : queuedDocument ? `Preparing ${queuedDocument.label} for indexing…` : "Finishing material indexing…",
        detail: `${processedDocumentCount}/${plan.documents.length} files indexed · ${activeDocumentCount} remaining. When indexing is finished, you can review the curriculum when you’re ready.`
      }
    : planningActive && plan.planning.total > 0
      ? {
          stage: plan.planning.qualityChecking > 0 ? "quality_review" : "planning",
          percent: Math.min(99, 45 + ((
            plan.planning.completed +
            plan.planning.qualityChecking * 0.8 +
            plan.planning.running * 0.35
          ) / plan.planning.total) * 54),
          label: qualityCheckingWeekNumber
            ? `Reviewing Week ${qualityCheckingWeekNumber}…`
            : runningWeekNumber
              ? `Building Week ${runningWeekNumber} of ${plan.year?.totalWeeks ?? plan.planning.total}…`
              : plan.planning.nextQueuedWeekNumber
                ? `Preparing Week ${plan.planning.nextQueuedWeekNumber}…`
                : "Finishing your lesson plan…",
          detail: `${plan.planning.completed}/${plan.planning.total} weeks finished${plan.planning.lastCompletedWeekNumber ? ` · Week ${plan.planning.lastCompletedWeekNumber} most recently completed` : ""}${plan.planning.qualityChecking > 0 ? ` · ${plan.planning.qualityChecking} in final review` : ""}${plan.planning.running > 0 ? ` · ${plan.planning.running} being planned` : ""}${plan.planning.queued > 0 ? ` · ${plan.planning.queued} waiting` : ""}. You may leave this page and return later.`
        }
      : readyForInitialReview
        ? {
            stage: "academic_review" as const,
            state: "waiting" as const,
            percent: 40,
            label: "Ready for your curriculum review.",
            detail: "Review and approve the curriculum when you’re ready. Treeschool will not begin building the plan until you do."
          }
        : planningFailed && plan.planning.total > 0
          ? {
              stage: plan.planning.qualityControlFailed ? "quality_review" : "planning",
              state: plan.planning.qualityControlFailed ? "recovering" as const : "attention" as const,
              percent: plan.planning.qualityControlFailed
                ? 99
                : Math.min(99, 45 + (plan.planning.completed / plan.planning.total) * 54),
              label: plan.planning.qualityControlFailed
                ? "Treeschool found a scheduling issue and is correcting it automatically."
                : `${plan.planning.failed} ${plan.planning.failed === 1 ? "week needs" : "weeks need"} another attempt.`,
              detail: plan.planning.qualityControlFailed
                ? `Your materials and all ${plan.planning.total} generated weeks are safe. No action is required; this page will update when the corrected plan is ready.`
                : `${plan.planning.completed}/${plan.planning.total} weeks finished. That completed work is safe; retrying will resume only ${plan.planning.failed === 1 ? "the unfinished week" : "the unfinished weeks"}.`
            }
        : null;
  const planningLabel =
    planningActive && plan.planning.total > 0
      ? plan.planning.qualityChecking > 0
        ? `Quality checking ${plan.planning.completed}/${plan.planning.total} weekly manifests`
        : `${plan.planning.completed}/${plan.planning.total} weeks planned`
      : plan.planning.qualityControlFailed
        ? "Final review is being corrected"
        : plan.planning.failed > 0
        ? `${plan.planning.failed} planning job${plan.planning.failed === 1 ? "" : "s"} need attention`
        : plan.weeks.length > 0
          ? `${plan.weeks.length} weeks planned`
          : "Not planned yet";
  const activeWeeks = plan.weeks.filter((week) => week.status !== "completed");
  const completedWeeks = plan.weeks.filter((week) => week.status === "completed");
  const orderedWeeks = [...activeWeeks, ...completedWeeks];
  const totalWeeklyPlanPages = plan.weeks.reduce(
    (total, week) => total + (week.pdfPageCount ?? estimatedPacketPageCount(week.items)),
    0
  );
  const nextWeek = activeWeeks.find((week) => week.items.length > 0);
  const requestedWeekNumber = Number(searchParams?.week);
  const requestedWeek = orderedWeeks.find((week) =>
    week.id === searchParams?.weeklyPlanId ||
    (Number.isInteger(requestedWeekNumber) && requestedWeekNumber > 0 && week.weekNumber === requestedWeekNumber)
  );
  const attentionWeekId = plan.weeks.every((week) => week.status !== "in_progress" && week.status !== "completed")
    ? orderedWeeks.find((week) => week.items.length > 0)?.id
    : undefined;
  const basePath = studentRoutePath(studentRouteSegment, "/lesson-plan");
  const query = new URLSearchParams();
  if (searchParams?.lang) query.set("lang", searchParams.lang);
  if (searchParams?.message) query.set("message", searchParams.message);
  if (searchParams?.error) query.set("error", searchParams.error);
  if (searchParams?.weeklyPlanId) query.set("weeklyPlanId", searchParams.weeklyPlanId);
  if (searchParams?.week) query.set("week", searchParams.week);
  if (searchParams?.day) query.set("day", searchParams.day);
  const redirectTo = query.size ? `${basePath}?${query}` : basePath;

  if (!billing.featureAccess.allowed) {
    return (
      <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
        <StudentShell
          brandName={home.brand.name}
          dashboard={dashboard}
          student={student}
          studentRouteSegment={studentRouteSegment}
          title="Lesson Plan"
          activeNav="curriculum"
          studentIdentityInContent
        >
          <div className="space-y-6">
            {plan.weeks.length > 0 ? (
              <section className="site-panel rounded-[28px] px-6 py-7 sm:px-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-earth">Your printable plan</p>
                  <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-ink">Weekly PDFs</h2>
                  <p className="mt-2 text-sm text-ink/62">Your purchased PDFs remain available whenever you need them.</p>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {plan.weeks.filter((week) => week.items.length > 0).map((week) => (
                    <div key={week.id} className="flex items-center gap-4 rounded-[18px] border border-[#dcc8aa] bg-[#fffaf2] px-4 py-4">
                      <WeeklyPdfButton
                        href={`/api/paper-plan/packet?weeklyPlanId=${week.id}`}
                        weekNumber={week.weekNumber}
                        pageCount={week.pdfPageCount ?? estimatedPacketPageCount(week.items)}
                        dayCount={new Set(
                          week.items
                            .filter((item) => item.includedInPacket && item.dayNumber != null)
                            .map((item) => item.dayNumber)
                        ).size}
                        compact
                      />
                      <div><p className="font-semibold text-ink">Week {week.weekNumber}</p><p className="mt-0.5 text-xs text-ink/52">Printable lesson plan</p></div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <PremiumFeatureLock
              title="Unlock live planning around your PDFs."
              description="Membership adds plan updates, progress states, subject grading, and attendance while keeping your existing printable plan intact."
              returnPath={basePath}
              trialEnded={billing.featureAccess.downloadOnly}
            />
          </div>
        </StudentShell>
      </ParentModeGuard>
    );
  }

  const ownWorkbooksContent = (
    <section className="site-panel min-w-0 max-w-full overflow-hidden rounded-[24px] px-4 py-5 sm:rounded-[28px] sm:px-8 sm:py-7">
      <AuthenticatedPlanGenerator
        profileId={student.id}
        existingLearningYearId={plan.year?.id}
        studentName={student.firstName}
        studentGradeLevel={student.gradeLevel}
        totalWeeks={plan.year?.totalWeeks}
        teachingDaysPerWeek={plan.year?.teachingDaysPerWeek}
        schoolYearStartDate={plan.year?.startDate}
        schoolYearEndDate={plan.year?.endDate}
        preferredPrintPageSize={plan.year?.printPageSize ?? preferences.preferredPrintPageSize}
        suggestedPreferredPrintPageSize={suggestedPrintPageSize}
        submitAction={plan.year ? addMaterialsFromGeneratorAction : createPlanFromGeneratorAction}
        updateDetailsAction={plan.year ? updatePlanDetailsAction : undefined}
        nativeWorkbooks={nativeCatalog.workbooks}
        recommendedNativeCurriculum={recommendedNativeCurriculum}
        addNativeWorkbooksAction={addNativeWorkbooksToPlanAction}
        purchaseNativeWorkbookAction={purchaseNativeWorkbookForPlanAction}
        nativeWorkbookPlanUpdatePreview={nativeWorkbookPlanUpdatePreview}
        checkoutCanceled={searchParams?.checkout === "canceled"}
        clearSavedDraft={searchParams?.clearDraft === "1"}
      />
    </section>
  );
  const hasNoPlanContent = plan.documents.length === 0 && plan.weeks.length === 0;

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <StudentShell
        brandName={home.brand.name}
        dashboard={dashboard}
        student={student}
        studentRouteSegment={studentRouteSegment}
        title="Lesson Plan"
        activeNav="curriculum"
        studentIdentityInContent
      >
        <AutoRefresh
          enabled={activeDocumentCount > 0 || planningActive || (planningFailed && plan.planning.qualityControlFailed)}
          intervalMs={4000}
        />
        <div className="space-y-6">
          {billing.featureAccess.source === "plan_pack_trial" ? (
            <div className="rounded-[20px] border border-[#b8cf9f] bg-[#eef5e4] px-5 py-4 text-sm font-semibold text-[#4d6a39]">
              Membership preview · {billing.featureAccess.trial.daysRemaining} {billing.featureAccess.trial.daysRemaining === 1 ? "day" : "days"} left to try live planning, grades, attendance, and progress.
            </div>
          ) : null}
          {searchParams?.error ? (
            <div className="rounded-[20px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">
              {searchParams.error}
            </div>
          ) : null}

          {hasNoPlanContent && !canManagePlan ? (
            <section className="site-panel rounded-[28px] px-6 py-8">
              <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">No lesson plan yet</h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-ink/65">
                An account owner or admin needs to add teaching materials and create the lesson plan. Once it is ready, you can teach from it, record attendance, add grades, and mark lessons done.
              </p>
            </section>
          ) : hasNoPlanContent ? (
            <LessonPlanEmptyState
              profileId={student.id}
              studentName={student.firstName}
              studentGradeLevel={student.gradeLevel}
              learningYearId={plan.year?.id}
              preferredPrintPageSize={plan.year?.printPageSize ?? preferences.preferredPrintPageSize ?? suggestedPrintPageSize}
              workbooks={nativeCatalog.workbooks}
              recommendedCurriculum={recommendedNativeCurriculum}
              ownWorkbooksContent={ownWorkbooksContent}
              addWorkbooksAction={addNativeWorkbooksToPlanAction}
              purchaseWorkbookAction={purchaseNativeWorkbookForPlanAction}
              openNativeInitially={searchParams?.nativeWorkbooks === "1"}
              checkoutCanceled={searchParams?.checkout === "canceled"}
            />
          ) : !plan.year && canManagePlan ? (
            ownWorkbooksContent
          ) : !plan.year ? (
            <section className="site-panel rounded-[28px] px-6 py-8 text-ink/65">The lesson plan is not ready yet.</section>
          ) : (
            <>
              <section className="grid gap-6">
                {canManagePlan ? <details
                  open={plan.weeks.length === 0 || plan.materialsChanged || activeDocumentCount > 0}
                  className="site-panel group min-w-0 max-w-full overflow-hidden rounded-[24px] px-4 py-4 sm:rounded-[28px] sm:px-6 sm:py-5"
                >
                  <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[21px] font-semibold leading-tight tracking-[-0.045em] text-ink sm:text-[24px]">Plan setup and teaching materials</h2>
                      <p className="mt-1 text-sm text-ink/60">
                        {plan.documents.length} {plan.documents.length === 1 ? "file" : "files"} · {activeDocumentCount > 0 ? `${activeDocumentCount} processing` : planningLabel}
                      </p>
                    </div>
                    <span className="shrink-0 text-2xl text-earth transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <div className="mt-4 min-w-0 max-w-full">
                  {plan.documents.some((document) => document.editionUpdate) ? (
                    <div className="mb-4 grid gap-3">
                      {plan.documents.filter((document) => document.editionUpdate).map((document) => {
                        const update = document.editionUpdate!;
                        return (
                          <section key={document.id} className="rounded-[18px] border border-[#b8cf9f] bg-[#f1f7e9] px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
                            <div>
                              <p className="text-sm font-bold text-[#456536]">A new edition of “{document.label}” is available</p>
                              <p className="mt-1 text-xs leading-5 text-[#567347]">
                                {update.currentEditionLabel} stays in place unless you choose to update to {update.latestEditionLabel}. Started or downloaded weeks will remain exactly as they are; only untouched future weeks will be rebuilt.
                              </p>
                            </div>
                            <form action={upgradeNativeWorkbookEditionAction} className="mt-3 flex-none sm:mt-0">
                              <input type="hidden" name="profileId" value={student.id} />
                              <input type="hidden" name="learningYearId" value={plan.year!.id} />
                              <input type="hidden" name="documentId" value={document.id} />
                              <button
                                type="submit"
                                disabled={planningActive}
                                className="cta-button cta-button--light cta-button--small disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Update future weeks
                              </button>
                            </form>
                          </section>
                        );
                      })}
                    </div>
                  ) : null}
                  <AuthenticatedPlanGenerator
                    profileId={student.id}
                    existingLearningYearId={plan.year.id}
                    studentName={student.firstName}
                    studentGradeLevel={student.gradeLevel}
                    totalWeeks={plan.year.totalWeeks}
                    teachingDaysPerWeek={plan.year.teachingDaysPerWeek}
                    schoolYearStartDate={plan.year.startDate}
                    schoolYearEndDate={plan.year.endDate}
                    preferredPrintPageSize={plan.year.printPageSize}
                    suggestedPreferredPrintPageSize={suggestedPrintPageSize}
                    submitAction={addMaterialsFromGeneratorAction}
                    updateDetailsAction={updatePlanDetailsAction}
                    existingDocuments={plan.documents.map((document) => ({
                      id: document.id,
                      materialSetId: document.materialSetId,
                      prerequisiteMaterialSetId: document.prerequisiteMaterialSetId,
                      label: document.label,
                      subjectLabel: document.subjectLabel,
                      detail: `${document.documentRole.replace("_", " ")} · ${fileKindLabel(document)} · ${formatBytes(document.sizeBytes)}`,
                      status: documentStatusLabel(document),
                      statusKind: document.analysisStatus === "ready"
                        ? "ready"
                        : document.analysisStatus === "failed"
                          ? "failed"
                          : document.analysisStatus === "analyzing" ? "processing" : "queued",
                      summary: document.analysisJson.summary ?? null,
                      parentNotes: document.parentNotes,
                      subjectDaysPerWeek: document.subjectDaysPerWeek,
                      pageCount: document.pageCount,
                      sourceKind: document.sourceKind
                    }))}
                    deleteDocumentAction={deletePaperPlanDocumentByIdAction}
                    updateDocumentAction={updatePaperPlanDocumentAction}
                    planningAction={startPaperPlanPlanningAction}
                    retryPlanningAction={retryFailedPaperPlanPlanningAction}
                    completenessAction={evaluatePaperPlanCompletenessAction}
                    canStartPlanning={canStartPlanning}
                    planningButtonLabel={plan.weeks.length > 0 ? "Review and Approve Plan" : "Review & Approve Curriculum"}
                    showPlanningAction={!planningActive && !planningFailed && activeDocumentCount === 0 && (plan.weeks.length === 0 || plan.materialsChanged)}
                    planningProgress={planningProgress}
                    planBuildActive={planningActive}
                    planningFailed={planningFailed}
                    qualityControlFailed={plan.planning.qualityControlFailed}
                    nativeWorkbooks={nativeCatalog.workbooks}
                    recommendedNativeCurriculum={recommendedNativeCurriculum}
                    addNativeWorkbooksAction={addNativeWorkbooksToPlanAction}
                    purchaseNativeWorkbookAction={purchaseNativeWorkbookForPlanAction}
                    nativeWorkbookPlanUpdatePreview={nativeWorkbookPlanUpdatePreview}
                    checkoutCanceled={searchParams?.checkout === "canceled"}
                    clearSavedDraft={searchParams?.clearDraft === "1"}
                  />
                  {plan.weeks.length > 0 && plan.materialsChanged && plan.regenerationAllowance.remaining === 0 ? (
                    <p className="mt-4 rounded-[18px] border border-[#e5cda7] bg-[#fff7e7] px-5 py-4 text-sm leading-[1.65] text-ink/70">
                      {plan.regenerationAllowance.introductoryMonth
                        ? `Your introductory month includes one initial plan for this student. Plan updates unlock after the first regular renewal${plan.regenerationAllowance.resetsAt ? ` on ${new Date(plan.regenerationAllowance.resetsAt).toLocaleDateString("en", { month: "long", day: "numeric" })}` : ""}. Your current plan is safe.`
                        : plan.regenerationAllowance.source === "subscription"
                        ? `You’ve used all ${plan.regenerationAllowance.limit} plan updates in this billing month. Your current plan is safe${plan.regenerationAllowance.resetsAt ? `, and updates reset on ${new Date(plan.regenerationAllowance.resetsAt).toLocaleDateString("en", { month: "long", day: "numeric" })}` : ""}.`
                        : `You’ve used all ${plan.regenerationAllowance.limit} plan updates included with this printable plan. Your current plan is safe; subscribe or purchase another printable plan to make another version.`}
                    </p>
                  ) : null}
                  </div>
                </details> : null}

                {false ? <div className="site-panel rounded-[28px] px-6 py-7">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-[26px] font-semibold tracking-[-0.05em] text-ink">
                        Content library
                      </h2>
                      <p className="mt-2 text-sm text-ink/65">The complete source set for this year.</p>
                    </div>
                    {plan.documents.length > 0 ? (
                      <form action={startPaperPlanPlanningAction}>
                        <input type="hidden" name="profileId" value={student.id} />
                        <input type="hidden" name="learningYearId" value={plan.year!.id} />
                        <button
                          type="submit"
                          disabled={!canStartPlanning}
                          className="cta-button cta-button--dark cta-button--small disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {plan.weeks.length > 0 ? "Plan again from current files" : "Review & Approve Curriculum"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                  <div className="mt-6 space-y-3">
                    {plan.documents.length === 0 ? (
                      <div className="rounded-[20px] bg-[#fffaf2] px-5 py-8 text-center text-sm text-ink/60">
                        Uploaded files will appear here.
                      </div>
                    ) : (
                      plan.documents.map((document) => (
                        <article
                          key={document.id}
                          className="rounded-[20px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate text-lg font-semibold text-ink">{document.label}</p>
                              <p className="mt-1 text-xs font-medium uppercase tracking-[0.11em] text-ink/50">
                                {document.subjectLabel ? `${document.subjectLabel} · ` : ""}
                                {document.documentRole.replace("_", " ")} · {fileKindLabel(document)} ·{" "}
                                {formatBytes(document.sizeBytes)}
                              </p>
                              {document.parentNotes ? (
                                <p className="mt-2 text-sm leading-[1.55] text-ink/60">
                                  Subject notes: {document.parentNotes}
                                </p>
                              ) : null}
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                document.analysisStatus === "ready"
                                  ? "bg-[#eef5e4] text-[#4d6a39]"
                                  : document.analysisStatus === "failed"
                                    ? "bg-[#fff1ec] text-[#8b3e2f]"
                                    : "bg-[#f4ead8] text-earth"
                              }`}
                            >
                              {documentStatusLabel(document)}
                            </span>
                          </div>
                          {["queued", "pending", "analyzing"].includes(document.analysisStatus) ? (
                            <p className="mt-3 text-sm leading-[1.65] text-earth">
                              {document.analysisStatus === "analyzing"
                                ? "Treeschool is reading this file now. This can take a few minutes for larger books."
                                : "This file is ready and waiting to be read."}
                            </p>
                          ) : null}
                          {document.analysisStatus === "failed" && document.analysisJson.error ? (
                            <p className="mt-3 rounded-[14px] bg-[#fff1ec] px-4 py-3 text-sm leading-[1.6] text-[#8b3e2f]">
                              {document.analysisJson.error}
                            </p>
                          ) : null}
                          {document.analysisJson.summary ? (
                            <p className="mt-3 text-sm leading-[1.65] text-ink/68">
                              {document.analysisJson.summary}
                            </p>
                          ) : null}
                          {document.analysisJson.analysisMethod ? (
                            <p className="mt-2 text-xs font-semibold text-earth">
                              {document.analysisJson.analysisMethod === "pdf_outline"
                                ? "Indexed from PDF bookmarks"
                                : document.analysisJson.analysisMethod === "table_of_contents"
                                  ? "Indexed from table of contents"
                                  : document.analysisJson.analysisMethod === "uploaded_file"
                                    ? "Stored as supporting material"
                                    : "Indexed with full-document review"}
                            </p>
                          ) : null}
                          <form action={deletePaperPlanDocumentAction} className="mt-3">
                            <input type="hidden" name="profileId" value={student.id} />
                            <input type="hidden" name="documentId" value={document.id} />
                            <button type="submit" className="text-xs font-semibold text-[#8b3e2f] underline underline-offset-4">
                              Remove file
                            </button>
                          </form>
                        </article>
                      ))
                    )}
                  </div>
                  {plan.planning.total > 0 ? (
                    <div className="mt-5 rounded-[18px] bg-[#eef5e4] px-5 py-4 text-sm leading-[1.7] text-[#4d6a39]">
                      <p className="font-semibold">
                        {plan.planning.qualityChecking > 0 ? "Final plan review" : "Planning progress"}: {plan.planning.completed}/{plan.planning.total} weeks {plan.planning.qualityChecking > 0 ? "approved" : "complete"}
                        {plan.planning.running > 0 ? ` · ${plan.planning.running} running` : ""}
                        {plan.planning.queued > 0 ? ` · ${plan.planning.queued} queued` : ""}
                        {plan.planning.qualityChecking > 0 ? ` · ${plan.planning.qualityChecking} checking` : ""}
                        {plan.planning.failed > 0 ? ` · ${plan.planning.failed} failed` : ""}
                      </p>
                      {planningActive ? (
                        <p className="mt-1">You can leave this page. Treeschool will keep building and reviewing your lesson plan.</p>
                      ) : null}
                    </div>
                  ) : null}
                  {plan.documents.length > 0 && !canStartPlanning && plan.weeks.length === 0 ? (
                    <p className="mt-5 rounded-[18px] bg-[#fffaf2] px-5 py-4 text-sm leading-[1.7] text-ink/65">
                      {activeDocumentCount > 0
                        ? "Year planning unlocks after all files finish processing."
                        : planningActive
                          ? "Treeschool is creating the weekly plans now."
                          : "Year planning unlocks when at least one PDF is indexed successfully. Text and image files are stored as supporting material."}
                    </p>
                  ) : null}
                </div> : null}
              </section>

              {plan.weeks.length > 0 ? (
                <section className="site-panel rounded-[28px] px-6 py-7 sm:px-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-[30px] font-semibold tracking-[-0.05em] text-ink">
                        Weekly Lesson Plans
                      </h2>
                      <WeeklyPlansCollectionSummary
                        initialWeeks={plan.weeks.map((week) => ({ id: week.id, status: week.status }))}
                        totalPages={totalWeeklyPlanPages}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {canManagePlan && plan.recovery.available ? (
                        <RestorePreviousPlanButton
                          action={restorePreviousPlanAction}
                          profileId={student.id}
                          learningYearId={plan.year.id}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-6 grid gap-4">
                    {orderedWeeks.map((week, index) => {
                      const includedSourcePages = weekSourcePageCount(week.items);
                      const reducibleItems = week.items.filter((item) => item.conceptRedundant && item.includedInPacket);
                      const excludedPracticeItems = week.items.filter((item) => item.conceptRedundant && !item.includedInPacket);
                      const isShrunk = excludedPracticeItems.length > 0;
                      const projectedItems = week.items.map((item) =>
                        item.conceptRedundant ? { ...item, includedInPacket: false } : item
                      );
                      const restoredItems = week.items.map((item) => ({ ...item, includedInPacket: true }));
                      const currentPacketPages = week.pdfPageCount ?? estimatedPacketPageCount(week.items);
                      const subjectSummaries = weekSubjectSummaries(week);
                      const omittedLessons = groupWeekLessons(week.items)
                        .filter((lesson) => lesson.first.lessonDisposition !== "include");
                      const teachingDayCount = new Set(
                        week.items
                          .filter((item) => item.includedInPacket && item.dayNumber != null)
                          .map((item) => item.dayNumber)
                      ).size;
                      const shrunkenPacketPages = estimatedPacketPageCount(projectedItems);
                      const restoredPacketPages = estimatedPacketPageCount(restoredItems);
                      const canShrink = canManagePlan &&
                        !isShrunk &&
                        ["planned", "skipped"].includes(week.status) &&
                        includedSourcePages > 20 &&
                        reducibleItems.length > 0 &&
                        shrunkenPacketPages < currentPacketPages;
                      const initialDays = week.days.map((day) => ({
                        dayNumber: day.dayNumber,
                        subjectKeys: day.subjects.map((subject) => subject.subjectKey),
                        completedSubjectKeys: day.attendedSubjectKeys,
                        subjectGrades: Object.fromEntries(day.subjects.map((subject) => [subject.subjectKey, subject.grade]))
                      }));
                      return (
                      <Fragment key={week.id}>
                      {completedWeeks.length > 0 && index === activeWeeks.length ? (
                        <p className="mt-3 pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
                          Completed weeks
                        </p>
                      ) : null}
                      <WeekProgressProvider weekId={week.id} initialStatus={week.status} initialDays={initialDays}>
                      <WeekPlanDetails
                        id={`week-${week.weekNumber}`}
                        initialOpen={week.id === requestedWeek?.id || (!requestedWeek && week.id === nextWeek?.id)}
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5">
                          {week.items.length > 0 && (
                            week.pdfQualityStatus === "passed" ||
                            !planningActive ||
                            week.status === "in_progress" ||
                            week.status === "completed"
                          ) ? (
                            <WeeklyPdfButton
                              href={`/api/paper-plan/packet?weeklyPlanId=${week.id}`}
                              weekNumber={week.weekNumber}
                              pageCount={currentPacketPages}
                              dayCount={teachingDayCount}
                              compact
                              wiggle={week.id === attentionWeekId}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xl font-semibold tracking-[-0.04em] text-ink">
                                Week {week.weekNumber} Plan ({currentPacketPages} pages)
                              </p>
                              {canShrink ? (
                                <span className="inline-flex rounded-full border border-[#abc790] bg-[#eaf4df] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#486a38]">
                                  Can be shortened
                                </span>
                              ) : isShrunk ? (
                                <span className="inline-flex rounded-full border border-[#b8cf9f] bg-[#eef5e4] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#567b40]">
                                  Practice reduced
                                </span>
                              ) : null}
                            </div>
                            <WeekProgressSummary />
                            {subjectSummaries.length > 0 ? (
                              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs leading-4 text-ink/48">
                                {subjectSummaries.map((subject) => (
                                  <li key={subject.subjectKey}>
                                    {subject.subjectLabel}
                                    {subject.workbooks.length > 0
                                      ? `: ${workbookLessonSummary(subject.workbooks)}`
                                      : subject.title ? `: ${subject.title}` : ""}
                                    {week.status === "completed" && subject.grade != null
                                      ? <span className="ml-1.5 font-semibold text-[#5f7e49]">· {subject.grade}% ({letterGrade(subject.grade)})</span>
                                      : null}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {omittedLessons.length > 0 ? (
                              <p className="mt-2 text-xs font-semibold text-ink/48">
                                {omittedLessons.slice(0, 2).map((lesson) => {
                                  const presentation = lessonDispositionPresentation(lesson.first.lessonDisposition);
                                  return `${lesson.subjectLabel}: ${lesson.first.label} · ${presentation.label}`;
                                }).join(" · ")}
                                {omittedLessons.length > 2 ? ` · +${omittedLessons.length - 2} more` : ""}
                              </p>
                            ) : null}
                          </div>
                          <div className="ml-auto flex items-center gap-3">
                            {isAdmin ? <AdminManifestButton weeklyPlanId={week.id} /> : null}
                            <span className="text-2xl text-earth transition-transform group-open:rotate-45">+</span>
                          </div>
                        </summary>
                        <div className="border-t border-[#eadfcd] px-5 py-5">
                          {week.summary ? <p className="text-sm leading-[1.7] text-ink/70">{week.summary}</p> : null}
                          {canManagePlan && (canShrink || isShrunk) ? (
                            <form action={setPaperPlanWeekCompressionAction} className="mt-4 rounded-[16px] border border-[#c8d8b6] bg-[#f1f7e9] px-4 py-4">
                              <input type="hidden" name="profileId" value={student.id} />
                              <input type="hidden" name="weeklyPlanId" value={week.id} />
                              <input type="hidden" name="compressed" value={isShrunk ? "false" : "true"} />
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-[#456536]">
                                    {isShrunk
                                      ? `${excludedPracticeItems.length} repeated-practice range${excludedPracticeItems.length === 1 ? " is" : "s are"} currently excluded.`
                                      : `This plan can be reduced from ${currentPacketPages} to about ${shrunkenPacketPages} pages.`}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-[#567347]">
                                    {isShrunk
                                      ? `Restore the complete practice set (about ${restoredPacketPages} pages).`
                                      : "Treeschool will remove only ranges marked as repeated practice while retaining every detected concept and assessment."}
                                  </p>
                                </div>
                                <button
                                  type="submit"
                                  title={isShrunk
                                    ? "Put the excluded repeated-practice ranges back into this weekly PDF."
                                    : `Reduce this plan to about ${shrunkenPacketPages} pages while retaining every detected concept and assessment.`}
                                  className="cta-button cta-button--light cta-button--small flex-none"
                                >
                                  {isShrunk ? "Restore practice pages" : "Shrink this plan?"}
                                </button>
                              </div>
                            </form>
                          ) : null}
                          <div className="mt-5 space-y-4">
                            {week.days.length === 0 ? (
                              <div className="rounded-[16px] border border-[#e0cfb4] bg-[#fffaf2] px-5 py-5">
                                <p className="font-semibold text-ink">This older plan has no day-by-day schedule.</p>
                                <p className="mt-1 text-sm leading-6 text-ink/60">Its existing weekly grades remain available on the Grades page. Regenerate the plan to use daily attendance and optional day-level grading.</p>
                              </div>
                            ) : week.days.map((day) => (
                              <PlanDayCard
                                key={day.dayNumber}
                                profileId={student.id}
                                weeklyPlanId={week.id}
                                weekNumber={week.weekNumber}
                                dayNumber={day.dayNumber}
                                subjects={day.subjects.map((subject) => ({
                                  subjectKey: subject.subjectKey,
                                  subjectLabel: subject.subjectLabel
                                }))}
                              >
                                <div className="grid gap-3 p-4 sm:p-5">
                                  {day.subjects.map((subject) => {
                                    const lessons = groupWeekLessons(subject.items);
                                    return (
                                    <PlanDaySubjectCard
                                      key={subject.subjectKey}
                                      dayNumber={day.dayNumber}
                                      subjectKey={subject.subjectKey}
                                      subjectLabel={subject.subjectLabel}
                                    >
                                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <h4 className="font-semibold text-ink">{subject.subjectLabel}</h4>
                                            {subject.assessmentRecommended ? (
                                              <span className="rounded-full bg-[#f3e6c8] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#765632]">Grade recommended</span>
                                            ) : null}
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                                          <LessonCompletionButton
                                            profileId={student.id}
                                            weeklyPlanId={week.id}
                                            dayNumber={day.dayNumber}
                                            subjectKey={subject.subjectKey}
                                            canUndo={canManagePlan}
                                          />
                                          <DaySubjectGradeField
                                            profileId={student.id}
                                            weeklyPlanId={week.id}
                                            dayNumber={day.dayNumber}
                                            subjectKey={subject.subjectKey}
                                            defaultValue={subject.grade}
                                            recommended={subject.assessmentRecommended}
                                            canRemove={canManagePlan}
                                          />
                                        </div>
                                      </div>
                                      <div className="mt-3 grid gap-3 border-t border-[#eee3d2] pt-3">
                                        {lessons.map((lesson) => (
                                          <div key={lesson.key} className={`grid gap-3 rounded-[14px] px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(330px,0.75fr)] lg:items-center ${
                                            lesson.first.lessonDisposition === "include"
                                              ? "bg-[#fbf8f2]"
                                              : "bg-[#f1ede6]"
                                          }`}>
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-semibold text-ink/78">{lesson.first.label}</p>
                                                {lesson.first.lessonDisposition !== "include" ? (
                                                  <span className="rounded-full bg-[#e4ddd1] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-ink/55">
                                                    Omitted from downloads
                                                  </span>
                                                ) : null}
                                              </div>
                                              <p className="mt-1 text-xs leading-5 text-ink/52">
                                                {lesson.first.documentLabel} · {lesson.pageEnd > lesson.pageStart ? "pages" : "page"} {lesson.pageStart}{lesson.pageEnd > lesson.pageStart ? `–${lesson.pageEnd}` : ""}
                                              </p>
                                              <LessonPreviewButton
                                                weeklyPlanItemId={lesson.first.id}
                                                documentId={lesson.first.documentId}
                                                sourceUnitId={lesson.first.sourceUnitId}
                                                lessonLabel={lesson.first.label}
                                                documentLabel={lesson.first.documentLabel}
                                                firstPageIndex={lesson.first.firstPageIndex}
                                                lastPageIndex={lesson.first.lastPageIndex}
                                                pageStart={lesson.pageStart}
                                                pageEnd={lesson.pageEnd}
                                                disposition={lesson.first.lessonDisposition}
                                              />
                                            </div>
                                            {canManagePlan ? (
                                              <LessonDispositionControl
                                                weeklyPlanItemId={lesson.first.id}
                                                value={lesson.first.lessonDisposition}
                                              />
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    </PlanDaySubjectCard>
                                    );
                                  })}
                                </div>
                              </PlanDayCard>
                            ))}
                            {omittedLessons.length > 0 ? (
                              <section className="rounded-[18px] border border-[#ded3c3] bg-[#f6f2eb] px-4 py-4 sm:px-5">
                                <div>
                                  <p className="text-sm font-semibold text-ink">Kept for your records</p>
                                  <p className="mt-1 text-xs leading-5 text-ink/55">
                                    These lessons stay visible here even though their pages are omitted from future downloads.
                                  </p>
                                </div>
                                <div className="mt-3 grid gap-3">
                                  {omittedLessons.map((lesson) => {
                                    const presentation = lessonDispositionPresentation(lesson.first.lessonDisposition);
                                    return (
                                      <div
                                        key={lesson.key}
                                        className="grid gap-3 rounded-[14px] bg-white/75 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(330px,0.72fr)] lg:items-center"
                                      >
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-ink/78">{lesson.first.label}</p>
                                            <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${presentation.badgeClass}`}>
                                              {presentation.label}
                                            </span>
                                          </div>
                                          <p className="mt-1 text-xs leading-5 text-ink/52">
                                            {lesson.subjectLabel}
                                            {lesson.days.length > 0 ? ` · Day ${lesson.days.join(", ")}` : ""}
                                            {` · ${lesson.first.documentLabel} · ${lesson.pageEnd > lesson.pageStart ? "pages" : "page"} ${lesson.pageStart}${lesson.pageEnd > lesson.pageStart ? `–${lesson.pageEnd}` : ""}`}
                                          </p>
                                          <p className="mt-1 text-xs leading-5 text-ink/45">{presentation.detail}</p>
                                          <LessonPreviewButton
                                            weeklyPlanItemId={lesson.first.id}
                                            documentId={lesson.first.documentId}
                                            sourceUnitId={lesson.first.sourceUnitId}
                                            lessonLabel={lesson.first.label}
                                            documentLabel={lesson.first.documentLabel}
                                            firstPageIndex={lesson.first.firstPageIndex}
                                            lastPageIndex={lesson.first.lastPageIndex}
                                            pageStart={lesson.pageStart}
                                            pageEnd={lesson.pageEnd}
                                            disposition={lesson.first.lessonDisposition}
                                          />
                                        </div>
                                        {canManagePlan ? (
                                          <LessonDispositionControl
                                            weeklyPlanItemId={lesson.first.id}
                                            value={lesson.first.lessonDisposition}
                                          />
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              </section>
                            ) : null}
                            {week.days.length > 0 ? (
                              <p className="px-1 text-xs leading-5 text-ink/48">
                                Mark lessons done as they are completed. A day becomes Done automatically when all of its lessons are complete; “Mark all done” is simply a shortcut. Lesson choices affect future downloads, while grades remain optional and never affect progress.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </WeekPlanDetails>
                      </WeekProgressProvider>
                      </Fragment>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </StudentShell>
    </ParentModeGuard>
  );
}
