import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import { listAdminNativeWorkbooks } from "../../../lib/native-workbooks/server";
import { formatNativeWorkbookGradeRange } from "../../../lib/native-workbooks/grades";
import { curriculumAreaLabel } from "../../../lib/native-workbooks/curriculum-areas";
import { discardWorkbookEditionFormAction, publishWorkbookAction, retryWorkbookIndexingAction, setWorkbookBundleRecommendationAction, setWorkbookBundleVisibilityAction, setWorkbookVisibilityAction } from "./actions";
import { CatalogItemCreator } from "./catalog-item-creator";
import { WorkbookDeleteButton } from "./workbook-delete-button";
import { WorkbookDetailsEditor } from "./workbook-details-editor";
import { WorkbookCoverThumbnail } from "./workbook-cover-thumbnail";
import { WorkbookPdfReplacement } from "./workbook-pdf-replacement";
import { WorkbookEditionCreator } from "./workbook-edition-creator";
import { WorkbookBundleEditor } from "./workbook-bundle-editor";
import { PackAutoRefresh } from "../../pack/upload/auto-refresh";

function isWorkbookIndexing(status: string, analysisStatus: string | null) {
  return status === "indexing" || ["awaiting_upload", "queued", "analyzing"].includes(analysisStatus ?? "");
}

function bundleSharedGradeLevels(members: Array<{ gradeMin: number; gradeMax: number }> | undefined) {
  if (!members?.length) return [];
  const minimum = Math.max(...members.map((member) => member.gradeMin));
  const maximum = Math.min(...members.map((member) => member.gradeMax));
  return minimum <= maximum ? Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index) : [];
}

function ordinal(value: number) {
  const remainder100 = value % 100;
  const suffix = remainder100 >= 11 && remainder100 <= 13
    ? "th"
    : value % 10 === 1
      ? "st"
      : value % 10 === 2
        ? "nd"
        : value % 10 === 3
          ? "rd"
          : "th";
  return `${value}${suffix} edition`;
}

export default async function AdminWorkbooksPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/workbooks");
  let workbooks;
  let bundles;
  let subjects;
  try {
    const catalog = await listAdminNativeWorkbooks(user.id);
    workbooks = catalog.workbooks;
    bundles = catalog.bundles;
    subjects = catalog.subjects;
  } catch (error) {
    if (error instanceof Error && error.message === "Administrator access is required.") notFound();
    throw error;
  }
  const prerequisiteChoices = Array.from(new Map(
    workbooks
      .filter((workbook) => workbook.analysisStatus === "ready")
      .map((workbook) => [workbook.id, { id: workbook.id, title: workbook.title }])
  ).values());

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <PackAutoRefresh enabled={workbooks.some((workbook) => ["awaiting_upload", "queued", "analyzing"].includes(workbook.analysisStatus ?? "") || workbook.status === "indexing")} />
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-earth">Treeschool administration</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Workbooks</h1>
          </div>
          <div className="flex flex-wrap gap-3"><Link href="/bookstore" className="cta-button cta-button--light cta-button--small">View bookstore</Link></div>
        </header>

        <div className="mt-8">
          <CatalogItemCreator
            workbooks={workbooks}
            prerequisiteChoices={prerequisiteChoices}
            workbookStates={workbooks.map((workbook) => ({
              id: workbook.id,
              state: workbook.analysisStatus ?? workbook.status
            }))}
            subjects={subjects}
          />
        </div>

        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-4"><h2 className="text-3xl font-semibold tracking-[-0.04em]">Workbook bundles</h2><p className="text-sm text-ink/55">{bundles.length} bundle{bundles.length === 1 ? "" : "s"}</p></div>
          {bundles.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {bundles.map((bundle) => <article key={bundle.id} className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-[#bfd1ad] bg-[#f3f8ed] p-4 sm:p-5">
              <div className="flex gap-4">
                <div className="relative flex h-32 w-32 flex-none items-center justify-center overflow-hidden rounded-[12px] border border-[#bfd1ad] bg-white"><WorkbookCoverThumbnail title={bundle.title} thumbnailUrl={bundle.thumbnailUrl} fit="contain" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#dfead4] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#4d6a39]">Bundle</span>{bundle.isRecommendedCurriculum ? <span className="rounded-full bg-[#638b48] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white">Recommended curriculum · {bundle.recommendedGradeLevel === 0 ? "Kindergarten" : `Grade ${bundle.recommendedGradeLevel}`}</span> : null}{!bundle.active ? <span className="rounded-full bg-[#f2e6d3] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-earth">Hidden</span> : null}</div>
                  <h3 className="mt-2 text-xl font-semibold">{bundle.title}</h3>
                  <p className="mt-1 text-sm text-ink/58">{bundle.memberCount} workbooks · {formatNativeWorkbookGradeRange(bundle.gradeMin, bundle.gradeMax)} · ${(bundle.priceInCents / 100).toFixed(2)}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink/52">{bundle.description}</p>
                </div>
              </div>
              <div className="mt-4 rounded-[14px] border border-[#d6e1cb] bg-white/70 px-3 py-3"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#567b40]">Included workbooks</p><p className="mt-1 text-sm leading-6 text-ink/62">{bundle.members?.map((member) => member.title).join(" · ")}</p></div>
              <div className="mt-4 flex flex-wrap gap-2">
                <WorkbookBundleEditor bundle={bundle} workbooks={workbooks} />
                {bundle.active ? <form action={setWorkbookBundleVisibilityAction.bind(null, bundle.id, false)}><button className="cta-button cta-button--outline cta-button--small">Hide from store</button></form> : <form action={setWorkbookBundleVisibilityAction.bind(null, bundle.id, true)}><button className="cta-button cta-button--light cta-button--small">Republish</button></form>}
                {bundle.isRecommendedCurriculum ? (
                  <form action={setWorkbookBundleRecommendationAction.bind(null, bundle.id, false)}><button className="cta-button cta-button--outline cta-button--small">Remove recommendation</button></form>
                ) : bundle.active && bundle.type === "core" && bundle.languageCode !== "multi" && bundleSharedGradeLevels(bundle.members).length ? (
                  <form action={setWorkbookBundleRecommendationAction.bind(null, bundle.id, true)} className="flex flex-wrap items-center gap-2">
                    <select name="recommendedGradeLevel" aria-label={`Recommended grade for ${bundle.title}`} className="rounded-[12px] border border-[#bfd1ad] bg-white px-3 py-2 pr-10 text-sm font-semibold">
                      {bundleSharedGradeLevels(bundle.members).map((grade) => <option key={grade} value={grade}>{grade === 0 ? "Kindergarten" : `Grade ${grade}`}</option>)}
                    </select>
                    <button className="cta-button cta-button--light cta-button--small">Make recommended</button>
                  </form>
                ) : null}
              </div>
            </article>)}
          </div> : <p className="mt-5 rounded-[22px] border border-dashed border-[#a9c194] bg-[#f3f8ed] px-5 py-8 text-center text-ink/55">No workbook bundles yet.</p>}
        </section>

        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-4"><h2 className="text-3xl font-semibold tracking-[-0.04em]">Individual workbooks</h2><p className="text-sm text-ink/55">{workbooks.length} workbook{workbooks.length === 1 ? "" : "s"}</p></div>
          {workbooks.length ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {workbooks.map((workbook) => {
                const indexing = isWorkbookIndexing(workbook.status, workbook.analysisStatus);
                return (
                <article
                  key={`${workbook.id}:${workbook.versionId}`}
                  aria-busy={indexing}
                  className={`min-w-0 max-w-full overflow-hidden rounded-[24px] border p-4 transition-colors sm:p-5 ${indexing ? "border-[#d7bd72] bg-[#fff4d2]" : "border-[#dcc8aa] bg-[#fffaf2]"}`}
                >
                  <div className="flex gap-4">
                    <div className="relative flex h-28 w-[88px] flex-none items-center justify-center overflow-hidden rounded-[12px] border border-[#dcc8aa] bg-white">
                      <WorkbookCoverThumbnail title={workbook.title} thumbnailUrl={workbook.thumbnailUrl} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        {indexing || (workbook.analysisStatus ?? workbook.status) !== "ready" ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${indexing ? "bg-[#f1dda1] text-[#70521f]" : "bg-[#eef5e4] text-[#4d6a39]"}`}>
                            {indexing ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#70521f]/30 border-t-[#70521f]" aria-hidden="true" /> : null}
                            {indexing ? "Indexing" : workbook.analysisStatus ?? workbook.status}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-[#f2e6d3] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-earth">{workbook.type}</span>
                        {workbook.curriculumCoverageProfiledAt ? (
                          <span
                            className="rounded-full bg-[#dfead4] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#4d6a39]"
                            title={workbook.curriculumCoverageScores.map((profile) => `${profile.gradeLevel === 0 ? "K" : `Grade ${profile.gradeLevel}`}: Math ${profile.scores.mathematics}%, Language arts ${profile.scores.languageArts}%, Science ${profile.scores.science}%, Social studies ${profile.scores.socialStudies}%`).join(" · ")}
                          >
                            Coverage profiled
                          </span>
                        ) : workbook.analysisStatus === "ready" ? (
                          <span className="rounded-full bg-[#fff0cf] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#7b5a1f]">Coverage pending</span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 truncate text-xl font-semibold">{workbook.title}</h3>
                      <p className="mt-1 text-sm text-ink/58">{curriculumAreaLabel(workbook.curriculumAreaKey)} · {workbook.subjectLabel} · {formatNativeWorkbookGradeRange(workbook.gradeMin, workbook.gradeMax)} · ${(workbook.priceInCents / 100).toFixed(2)}</p>
                      <p className="mt-1 text-xs text-ink/48">{workbook.editionLabel ?? "1st edition"} · {workbook.pageCount || "—"} pages</p>
                      {workbook.prerequisiteWorkbookTitle ? <p className="mt-1 text-xs font-semibold text-[#567b40]">Starts after {workbook.prerequisiteWorkbookTitle}</p> : null}
                    </div>
                  </div>
                  {workbook.lastError ? (
                    <div className="mt-4 rounded-[12px] bg-[#fff1ec] px-3 py-2 text-xs leading-5 text-[#8b3e2f]">
                      <p>{workbook.lastError}</p>
                      {workbook.lastErrorCode ? (
                        <p className="mt-1 font-semibold tracking-[0.04em]">Reference: {workbook.lastErrorCode}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {indexing ? (
                      <>
                        <button type="button" disabled className="cta-button cta-button--outline cta-button--small cursor-not-allowed opacity-45">Edit details</button>
                        <button type="button" disabled className="cta-button cta-button--outline cta-button--small cursor-not-allowed opacity-45">Delete</button>
                      </>
                    ) : (
                      <>
                        {workbook.canPublishVersion ? <form action={publishWorkbookAction.bind(null, workbook.id)}><button className="cta-button cta-button--dark cta-button--small">Publish new edition</button></form> : null}
                        {workbook.analysisStatus === "ready" && !workbook.active && !workbook.canPublishVersion ? <form action={publishWorkbookAction.bind(null, workbook.id)}><button className="cta-button cta-button--dark cta-button--small">Publish</button></form> : null}
                        {workbook.analysisStatus === "failed" ? <form action={retryWorkbookIndexingAction.bind(null, workbook.id)}><button className="cta-button cta-button--dark cta-button--small">Retry indexing</button></form> : null}
                        {workbook.versionId && workbook.releaseStatus === "draft" && workbook.analysisStatus === "failed" ? (
                          <form action={discardWorkbookEditionFormAction.bind(
                            null,
                            workbook.id,
                            workbook.versionId
                          )}>
                            <button className="cta-button cta-button--outline cta-button--small">Discard draft edition</button>
                          </form>
                        ) : null}
                        {workbook.active ? <form action={setWorkbookVisibilityAction.bind(null, workbook.id, false)}><button className="cta-button cta-button--outline cta-button--small">Hide from store</button></form> : workbook.status === "unpublished" ? <form action={setWorkbookVisibilityAction.bind(null, workbook.id, true)}><button className="cta-button cta-button--light cta-button--small">Republish</button></form> : null}
                        <WorkbookDetailsEditor workbook={workbook} prerequisiteChoices={prerequisiteChoices.filter((choice) => choice.id !== workbook.id)} subjects={subjects} />
                        {workbook.canReplacePdf ? <WorkbookPdfReplacement workbookId={workbook.id} title={workbook.title} /> : null}
                        {workbook.isActiveVersion && workbook.analysisStatus === "ready" ? (
                          <WorkbookEditionCreator
                            workbookId={workbook.id}
                            title={workbook.title}
                            nextEditionLabel={ordinal(new Set(workbook.releases.map((release) => release.editionId)).size + 1)}
                          />
                        ) : null}
                        <WorkbookDeleteButton workbookId={workbook.id} title={workbook.title} />
                      </>
                    )}
                  </div>
                  {workbook.releases.length ? (
                    <details className="mt-4 rounded-[14px] border border-[#eadbc5] bg-white/65 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-bold text-earth">
                        Release history · {new Set(workbook.releases.map((release) => release.editionId)).size} edition{new Set(workbook.releases.map((release) => release.editionId)).size === 1 ? "" : "s"} · {workbook.releases.length} revision{workbook.releases.length === 1 ? "" : "s"}
                      </summary>
                      <ol className="mt-2 grid gap-2">
                        {workbook.releases.map((release) => (
                          <li key={release.versionId} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-[#fffaf2] px-3 py-2 text-xs text-ink/65">
                            <span>
                              <strong className="text-ink">{release.editionLabel}</strong>
                              {" · "}Revision {release.revisionNumber}
                              {" · "}{release.pageCount || "—"} pages
                            </span>
                            <span className="rounded-full bg-[#edf3e5] px-2 py-1 font-bold capitalize text-[#52713f]">
                              {release.releaseStatus === "draft" ? release.analysisStatus.replaceAll("_", " ") : release.releaseStatus}
                            </span>
                            {release.changeNotes ? <span className="w-full text-ink/50">{release.changeNotes}</span> : null}
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </article>
              );})}
            </div>
          ) : <p className="mt-5 rounded-[22px] border border-dashed border-[#c9ae87] bg-[#fffaf2] px-5 py-8 text-center text-ink/55">No workbooks yet.</p>}
        </section>
      </div>
    </main>
  );
}
