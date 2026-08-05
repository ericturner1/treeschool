import Link from "next/link";
import { getPlanPackStatus } from "../../../lib/plan-pack/server";
import { PackAutoRefresh } from "./auto-refresh";
import { setPlanPackWeekCompressionAction, uploadPlanPackFilesAction } from "../actions";
import { StoredPackUploader } from "./stored-pack-uploader";
import { SUPPORT_EMAIL } from "../../../lib/site";
import { CurriculumReviewGate } from "./curriculum-review-gate";
import { PlanCreationProgress, type PlanCreationProgressValue } from "../../../components/plan-creation-progress";
import { WeeklyPdfButton } from "../../../components/weekly-pdf-button";

type UploadPageProps = {
  searchParams?: {
    intakeId?: string;
    session_id?: string;
    draftKey?: string;
    error?: string;
    message?: string;
  };
};

const ACCEPTED_CURRICULUM_FILES =
  "application/pdf,.pdf,text/plain,text/markdown,.txt,.md,.markdown,.csv,.tsv,image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff";

function decodeParam(value?: string) {
  return value ? decodeURIComponent(value) : null;
}

function statusLabel(status: string) {
  if (status === "ready") return "Ready";
  if (status === "paid" || status === "checkout_started") return "Paid";
  if (status === "uploading") return "Uploading";
  if (status === "processing") return "Processing files";
  if (status === "planning") return "Planning weeks";
  if (status === "curriculum_review") return "Ready for review";
  if (status === "failed") return "Needs attention";
  return status.replace("_", " ");
}

function documentStatusLabel(status: string) {
  if (status === "ready") return "Indexed";
  if (status === "queued" || status === "pending") return "Queued";
  if (status === "analyzing") return "Processing";
  if (status === "failed") return "Failed";
  return status;
}

export default async function PackUploadPage({ searchParams }: UploadPageProps) {
  const intakeId = searchParams?.intakeId ?? "";
  const checkoutSessionId = searchParams?.session_id ?? "";
  const draftKey = searchParams?.draftKey ?? "";
  const error = decodeParam(searchParams?.error);

  if (!intakeId || !checkoutSessionId) {
    return (
      <main className="min-h-screen bg-[#f8f1e4] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[32px] bg-[#fffaf2] px-6 py-10 text-center">
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-ink">Missing checkout details</h1>
          <p className="mt-4 text-ink/70">Please return from Stripe Checkout or start the printable-plan setup again.</p>
          <Link href="/homeschool-lesson-plan-generator" className="cta-button cta-button--light mt-6">
            Start setup
          </Link>
        </div>
      </main>
    );
  }

  let status;
  try {
    status = await getPlanPackStatus({ intakeId, checkoutSessionId });
  } catch (statusError) {
    return (
      <main className="min-h-screen bg-[#f8f1e4] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[32px] bg-[#fffaf2] px-6 py-10 text-center">
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-ink">Checkout issue</h1>
          <p className="mt-4 text-ink/70">
            {statusError instanceof Error ? statusError.message : "Could not verify this checkout session."}
          </p>
          <Link href="/homeschool-lesson-plan-generator" className="cta-button cta-button--light mt-6">
            Start setup
          </Link>
        </div>
      </main>
    );
  }

  const returnPath = `/homeschool-lesson-plan-generator/upload?intakeId=${encodeURIComponent(intakeId)}&session_id=${encodeURIComponent(checkoutSessionId)}${
    draftKey ? `&draftKey=${encodeURIComponent(draftKey)}` : ""
  }`;
  const hasUploadedOwnMaterials = status.documents.some((document) => document.sourceKind !== "native_workbook");
  const uploadNeeded = status.draft.subjects.length > 0 && !hasUploadedOwnMaterials;
  const active = status.activeDocumentCount > 0 || status.planning.active > 0 || ["processing", "planning"].includes(status.status);
  const ready = status.weeks.length > 0 && status.planning.active === 0 && status.activeDocumentCount === 0 && status.status === "ready";
  const awaitingCurriculumReview = status.status === "curriculum_review";
  const totalUploadedPages = status.documents.reduce((total, document) => total + Math.max(0, document.pageCount), 0);
  const processedDocumentCount = status.documents.filter((document) => ["ready", "failed"].includes(document.analysisStatus)).length;
  const planCreationProgress: PlanCreationProgressValue | null = status.activeDocumentCount > 0
    ? {
        stage: "indexing" as const,
        percent: 5 + (processedDocumentCount / Math.max(1, status.documents.length)) * 30,
        label: "Reading and indexing your materials…",
        detail: `${processedDocumentCount}/${status.documents.length} files indexed. The academic review comes next.`
      }
    : status.planning.active > 0 && status.planning.total > 0
      ? {
          stage: status.planning.qualityChecking > 0 ? "quality_review" : "planning",
          percent: Math.min(99, 45 + ((
            status.planning.completed +
            status.planning.qualityChecking * 0.8 +
            status.planning.running * 0.35
          ) / status.planning.total) * 54),
          label: status.planning.qualityChecking > 0 ? "Reviewing the weekly plans…" : "Building the weekly lesson plans…",
          detail: `${status.planning.completed}/${status.planning.total} weeks finished${status.planning.qualityChecking > 0 ? ` · ${status.planning.qualityChecking} in final review` : ""}. You may leave this page and return from your delivery link.`
        }
      : awaitingCurriculumReview
        ? { stage: "academic_review" as const, state: "waiting" as const, percent: 40, label: "Ready for your curriculum review.", detail: "Review and approve the curriculum when you’re ready. Treeschool will not begin building the plan until you do." }
        : null;

  return (
    <main className="min-h-screen bg-[#f8f1e4]">
      <PackAutoRefresh enabled={active} />
      <header className="border-b border-[#e7d8c1] bg-[#fffaf2]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-0">
            <img src="/tree-icon.png" alt="treeschool tree icon" className="h-24 w-24 object-contain" />
            <p className="brand-logo text-[28px] font-semibold leading-none tracking-[-0.05em] text-ink">
              treeschool
            </p>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/support" className="text-sm font-semibold text-earth underline underline-offset-4">Support</Link>
            <div className="rounded-full bg-[#eef5e4] px-4 py-2 text-sm font-semibold text-[#4d6a39]">
              {statusLabel(status.status)}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)] lg:px-8">
        <section className="site-panel rounded-[32px] px-6 py-8 sm:px-8">
          {error ? (
            <div className="mb-6 rounded-[20px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">
              {error}
            </div>
          ) : null}
          {status.lastError ? (
            <div className="mb-6 rounded-[20px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-sm font-semibold text-[#8b3e2f]">
              <p>{status.lastError}</p>
              <p className="mt-2 font-medium">We have recorded the failure. If you need help, email <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}?subject=Printable%20plan%20${encodeURIComponent(intakeId)}`}>{SUPPORT_EMAIL}</a> and include plan ID <span className="font-mono">{intakeId}</span>.</p>
            </div>
          ) : null}

          <p className="text-sm font-black uppercase tracking-[0.14em] text-earth">Printable school-year plan</p>
          <h1 className="mt-2 text-[36px] font-semibold tracking-[-0.055em] text-ink">
            {uploadNeeded
              ? status.documents.length > 0 ? "Add your own materials to the selected Treeschool workbooks." : "Finalizing your selected PDFs."
              : ready ? "Your weekly print packets are ready."
                : awaitingCurriculumReview ? "Your materials are ready for an academic check."
                  : "Treeschool is building your printable weeks."}
          </h1>
          <p className="mt-3 text-sm leading-[1.7] text-ink/68">
            Delivery email: <span className="font-semibold text-ink">{status.email}</span>
          </p>

          {uploadNeeded ? (
            <>
            <StoredPackUploader
              draftKey={draftKey}
              intakeId={intakeId}
              checkoutSessionId={checkoutSessionId}
              draft={status.draft}
              returnPath={returnPath}
            />
            <form action={uploadPlanPackFilesAction} className="mt-7 space-y-5">
              <input type="hidden" name="intakeId" value={intakeId} />
              <input type="hidden" name="checkoutSessionId" value={checkoutSessionId} />
              <input type="hidden" name="returnPath" value={returnPath} />
              <input type="hidden" name="draftJson" value={JSON.stringify(status.draft)} />
              <div className="rounded-[22px] bg-[#fffaf2] px-5 py-4 text-sm leading-[1.7] text-ink/66">
                If the automatic upload above does not finish, attach the files again here. The purchase is already verified.
              </div>

              {status.draft.subjects.map((subject, index) => (
                <section key={`${subject.subjectLabel}-${index}`} className="rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] p-4">
                  <input type="hidden" name="subjectIndexes" value={index} />
                  <p className="text-sm font-black uppercase tracking-[0.13em] text-earth">Subject {index + 1}</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-ink">{subject.subjectLabel}</h2>
                  {subject.parentNotes ? (
                    <p className="mt-2 text-sm leading-[1.6] text-ink/62">{subject.parentNotes}</p>
                  ) : null}
                  <label className="mt-4 block rounded-[20px] border border-dashed border-[#c8af8b] bg-white px-4 py-5 text-sm font-semibold text-ink">
                    <span className="block">Upload files for {subject.subjectLabel}</span>
                    <span className="mt-1 block text-xs font-medium leading-[1.55] text-ink/55">
                      PDF, text, or image. PDFs become printable weekly packets; text/images act as planning support.
                    </span>
                    <input
                      name={`files-${index}`}
                      type="file"
                      accept={ACCEPTED_CURRICULUM_FILES}
                      multiple
                      className="mt-4 block w-full text-sm text-ink file:mr-4 file:rounded-full file:border-0 file:bg-[#7fa15a] file:px-4 file:py-2 file:font-semibold file:text-white"
                    />
                  </label>
                </section>
              ))}

              <button type="submit" className="cta-button cta-button--light w-full">
                Upload files and start processing
              </button>
            </form>
            </>
          ) : (
            <div className="mt-7 rounded-[22px] bg-[#eef5e4] px-5 py-5 text-sm leading-[1.7] text-[#4d6a39]">
              <p className="font-semibold">
                {status.documents.length} file{status.documents.length === 1 ? "" : "s"} uploaded ·{" "}
                {status.planning.total > 0
                  ? status.planning.qualityChecking > 0
                    ? `${status.planning.completed}/${status.planning.total} weekly plans reviewed`
                    : `${status.planning.completed}/${status.planning.total} weeks planned`
                  : awaitingCurriculumReview ? "materials indexed and ready for review" : "waiting for PDF indexing"}
              </p>
              {active ? (
                <p className="mt-1">This page refreshes while processing. You can also come back to this link later.</p>
              ) : null}
              {planCreationProgress ? (
                <div className="mt-4 rounded-[16px] border border-[#c7d7b3] bg-white/55 px-4 py-4 text-ink">
                  <PlanCreationProgress progress={planCreationProgress} compact />
                </div>
              ) : null}
              {awaitingCurriculumReview ? (
                <CurriculumReviewGate
                  intakeId={intakeId}
                  checkoutSessionId={checkoutSessionId}
                  materialCount={status.documents.length}
                  pageCount={totalUploadedPages}
                  learningYearId={status.learningYearId}
                />
              ) : null}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="site-panel rounded-[32px] px-6 py-7">
            <h2 className="text-[26px] font-semibold tracking-[-0.05em] text-ink">Files</h2>
            <div className="mt-5 space-y-3">
              {status.documents.length === 0 ? (
                <p className="rounded-[20px] bg-[#fffaf2] px-5 py-7 text-center text-sm text-ink/55">
                  Uploaded files will appear here after the selected PDFs finish uploading.
                </p>
              ) : (
                status.documents.map((document) => (
                  <article key={document.id} className={`rounded-[20px] border border-[#dcc8aa] px-5 py-4 ${document.sourceKind === "native_workbook" ? "bg-[#edf4e5]" : "bg-[#fffaf2]"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-ink">{document.label}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.11em] text-ink/50">
                          {document.subjectLabel ?? "Uncategorized"} · {document.sourceKind}
                          {document.sourceKind === "pdf" || document.sourceKind === "native_workbook" ? ` · ${document.pageCount} pages` : ""}
                        </p>
                        {document.sourceKind === "native_workbook" ? <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#567b40]">Treeschool workbook</p> : null}
                      </div>
                      <span className="rounded-full bg-[#f4ead8] px-3 py-1 text-xs font-semibold text-earth">
                        {documentStatusLabel(document.analysisStatus)}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="site-panel rounded-[32px] px-6 py-7">
            <h2 className="text-[26px] font-semibold tracking-[-0.05em] text-ink">Weekly packets</h2>
            <div className="mt-5 space-y-3">
              {status.weeks.length === 0 ? (
                <p className="rounded-[20px] bg-[#fffaf2] px-5 py-7 text-center text-sm text-ink/55">
                  Weekly PDFs will appear here after file indexing and planning finish.
                </p>
              ) : (
                status.weeks.map((week) => (
                  <article key={week.id} className="rounded-[20px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-earth">Week {week.weekNumber}</p>
                          {ready && status.canAdjustPlan && week.canShrink ? (
                            <span className="inline-flex rounded-full border border-[#abc790] bg-[#eaf4df] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#486a38]">
                              Can be shortened
                            </span>
                          ) : ready && status.canAdjustPlan && week.isShrunk ? (
                            <span className="inline-flex rounded-full border border-[#b8cf9f] bg-[#eef5e4] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#567b40]">
                              Practice reduced
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-ink">Week {week.weekNumber} Plan ({week.pageCount} pages)</h3>
                        {week.summary ? <p className="mt-1 text-sm leading-[1.6] text-ink/62">{week.summary}</p> : null}
                      </div>
                      {ready && week.itemCount > 0 ? (
                        <WeeklyPdfButton
                          href={`/api/plan-pack/packet?intakeId=${encodeURIComponent(intakeId)}&session_id=${encodeURIComponent(checkoutSessionId)}&weeklyPlanId=${encodeURIComponent(week.id)}`}
                          weekNumber={week.weekNumber}
                          pageCount={week.pageCount}
                          dayCount={week.dayCount}
                        />
                      ) : null}
                    </div>
                    {ready && status.canAdjustPlan && (week.canShrink || week.isShrunk) ? (
                      <form action={setPlanPackWeekCompressionAction} className="mt-4 rounded-[14px] border border-[#c8d8b6] bg-[#f1f7e9] px-4 py-3">
                        <input type="hidden" name="intakeId" value={intakeId} />
                        <input type="hidden" name="checkoutSessionId" value={checkoutSessionId} />
                        <input type="hidden" name="weeklyPlanId" value={week.id} />
                        <input type="hidden" name="returnPath" value={returnPath} />
                        <input type="hidden" name="compressed" value={week.isShrunk ? "false" : "true"} />
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs leading-5 text-[#567347]">
                            {week.isShrunk
                              ? `${week.excludedRangeCount} repeated-practice range${week.excludedRangeCount === 1 ? " is" : "s are"} excluded. Restore the complete ${week.restoredPageCount}-page set whenever you like.`
                              : `Reduce this plan from ${week.pageCount} to about ${week.shrunkenPageCount} pages while retaining every detected concept and assessment.`}
                          </p>
                          <button
                            type="submit"
                            title={week.isShrunk
                              ? "Put the excluded repeated-practice ranges back into this weekly PDF."
                              : `Reduce this plan to about ${week.shrunkenPageCount} pages while retaining every detected concept and assessment.`}
                            className="cta-button cta-button--light cta-button--small flex-none"
                          >
                            {week.isShrunk ? "Restore practice pages" : "Shrink this plan?"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
