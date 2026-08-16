import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/server";
import { getAdminWorkbookStudioProject } from "../../../../lib/workbook-studio/server";
import { PackAutoRefresh } from "../../../pack/upload/auto-refresh";
import { WorkbookCoverPreview } from "./workbook-cover-preview";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "completed" || status === "released") {
    return "border-[#b9d1a5] bg-[#edf5e7] text-[#486a38]";
  }
  if (status === "failed") {
    return "border-[#e4b9a9] bg-[#fff0ea] text-[#8c3f2f]";
  }
  return "border-[#dcc8aa] bg-[#fff8e9] text-[#795d39]";
}

export default async function WorkbookStudioProjectPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect(`/p/signin?next=/admin/workbook-studio/${params.projectId}`);
  }

  let detail;
  try {
    detail = await getAdminWorkbookStudioProject(user.id, params.projectId);
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "Administrator access is required.",
        "Workbook project not found.",
      ].includes(error.message)
    ) {
      notFound();
    }
    throw error;
  }

  const working =
    detail.generationRuns.some((run) =>
      ["queued", "running", "retry_wait"].includes(run.status),
    ) ||
    detail.renderRuns.some((run) =>
      ["queued", "running", "retry_wait"].includes(run.status),
    );
  const content = detail.currentRevision?.contentJson;
  const chapters = content?.chapters.length ?? 0;
  const lessons =
    content?.chapters.reduce(
      (total, chapter) => total + chapter.lessons.length,
      0,
    ) ?? 0;
  const exercises =
    content?.chapters.reduce(
      (chapterTotal, chapter) =>
        chapterTotal +
        chapter.lessons.reduce(
          (lessonTotal, lesson) =>
            lessonTotal +
            lesson.exercises.reduce(
              (exerciseTotal, exercise) =>
                exerciseTotal +
                (exercise.type === "layout_row"
                  ? exercise.columns.reduce(
                      (columnTotal, column) =>
                        columnTotal + column.exercises.length,
                      0,
                    )
                  : 1),
              0,
            ),
          0,
        ),
      0,
    ) ?? 0;
  const latestRender = detail.renderRuns[0] ?? null;
  const latestCompletedRender = detail.renderRuns.find(
    (run) => run.status === "completed" && Boolean(run.pageCount),
  );
  const hasCoverPreview = Boolean(latestCompletedRender);
  const coverThumbnailUrl = `/api/workbook-studio/cover-preview/${encodeURIComponent(detail.project.id)}?format=png&render=${encodeURIComponent(latestCompletedRender?.id ?? "latest")}`;
  const latestGeneration = detail.generationRuns[0] ?? null;
  const issueCount =
    detail.currentRevision?.validationJson.issues?.length ?? 0;

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-7 text-ink sm:px-6 lg:px-8">
      <PackAutoRefresh enabled={working} />
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin/workbook-studio"
              className="rounded-[12px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-bold text-ink/65 hover:text-ink"
            >
              ← Studio
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-earth">
                Workbook project
              </p>
              <h1 className="mt-1 truncate text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                {detail.project.title}
              </h1>
            </div>
          </div>
          {detail.currentRevision ? (
            <Link
              href="#chapters"
              className="cta-button cta-button--dark"
            >
              Choose cover or chapter ↓
            </Link>
          ) : null}
        </div>

        <section className="mt-7 overflow-hidden rounded-[26px] border border-[#d8c8ae] bg-[#fffaf2] shadow-[0_12px_36px_rgba(88,67,39,0.08)]">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#e8f0df] px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#4f713d]">
                  {detail.project.status}
                </span>
                <span className="rounded-full border border-[#dfd1bc] bg-white px-3 py-1 text-xs text-ink/55">
                  {detail.project.gradeMin === detail.project.gradeMax
                    ? `Grade ${detail.project.gradeMin}`
                    : `Grades ${detail.project.gradeMin}–${detail.project.gradeMax}`}
                </span>
                <span className="rounded-full border border-[#dfd1bc] bg-white px-3 py-1 text-xs capitalize text-ink/55">
                  {detail.project.layoutProfile} layout
                </span>
              </div>
              <h2 className="mt-6 max-w-3xl text-2xl font-semibold">
                {content?.subtitle ??
                  "Structured workbook content ready for in-platform authoring."}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/55">
                {detail.project.nativeWorkbookId
                  ? "This project is connected to a bookstore workbook. Releasing compatible changes creates a revision; changing the lesson set creates a new edition."
                  : "This is an authoring-only project. It stays separate from the bookstore until its first release is approved."}
              </p>
              <div className="mt-7 grid grid-cols-3 gap-3 sm:max-w-xl">
                {[
                  ["Chapters", chapters],
                  ["Lessons", lessons],
                  ["Exercises", exercises],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[18px] border border-[#e3d5c1] bg-white/75 px-4 py-4"
                  >
                    <strong className="block text-2xl">{value}</strong>
                    <span className="text-xs text-ink/48">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div
              className="grid min-h-[280px] place-items-center border-t border-[#d8c8ae] p-7 lg:border-l lg:border-t-0"
              style={{ backgroundColor: detail.effectiveTheme.colorSand }}
            >
              {hasCoverPreview ? (
                <div className="relative aspect-[210/297] w-full max-w-[205px] overflow-hidden rounded-[7px] border border-[#8bac70] bg-white shadow-[0_14px_30px_rgba(61,46,29,0.2)]">
                  <Image
                    src={coverThumbnailUrl}
                    alt={`${content?.subjectLabel ?? detail.project.title} rendered cover`}
                    fill
                    sizes="205px"
                    priority
                    unoptimized
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="grid aspect-[210/297] w-full max-w-[205px] place-items-center rounded-[7px] border-2 border-dashed border-[#b7a88e] bg-white/60 p-6 text-center text-sm text-ink/45">
                  Render the workbook to see its real cover here.
                </div>
              )}
            </div>
          </div>
        </section>

        {content ? (
          <section id="chapters" className="mt-6 scroll-mt-6 rounded-[24px] border border-[#d8c8ae] bg-white/75 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.13em] text-earth">
                Workbook structure
              </p>
              <h2 className="mt-1 text-2xl font-semibold">Choose the cover or a chapter</h2>
              <p className="mt-2 text-sm text-ink/50">
                Preview the exact rendered cover, or open a chapter’s lessons,
                element palette, canvas, and context inspector.
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <WorkbookCoverPreview
                projectId={detail.project.id}
                title={content.subjectLabel}
                editionLabel={content.editionLabel}
                available={hasCoverPreview}
                renderKey={latestCompletedRender?.id}
              />
              {content.chapters.map((chapter, chapterIndex) => (
                <Link
                  key={chapter.id}
                  href={`/admin/workbook-studio/${detail.project.id}/edit?chapter=${chapterIndex}`}
                  className="group flex min-h-28 items-center gap-4 rounded-[18px] border border-[#dfd1bc] bg-[#fffaf2] p-4 transition hover:border-[#9fbd89] hover:shadow-md"
                >
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-[#e6efdc] text-xl font-black text-[#567b40]">
                    {chapterIndex + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#567b40]">
                      Chapter {chapterIndex + 1}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold leading-6 group-hover:text-[#486a38]">
                      {chapter.title}
                    </h3>
                    <p className="mt-1 text-xs text-ink/45">
                      {chapter.lessons.length} lesson
                      {chapter.lessons.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 text-xs font-bold text-[#567b40]">
                    Edit chapter →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {!detail.currentRevision ? (
          <section className="mt-6 rounded-[22px] border border-[#d8c8ae] bg-white p-8 text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#9fbd89]/35 border-t-[#567b40]" />
            <h2 className="mt-5 text-xl font-semibold">
              Building the structured workbook
            </h2>
            <p className="mt-2 text-sm text-ink/50">
              The editor will be available after the first structured revision
              is ready.
            </p>
            {latestGeneration?.errorMessage ? (
              <p className="mx-auto mt-4 max-w-2xl rounded-[12px] bg-[#fff0ea] px-4 py-3 text-sm text-[#8c3f2f]">
                {latestGeneration.errorMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <section className="rounded-[22px] border border-[#d8c8ae] bg-white/75 p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.13em] text-earth">
              Current content
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Revision {detail.currentRevision?.revisionNumber ?? "—"}
            </h2>
            <p className="mt-2 text-sm capitalize text-ink/50">
              {detail.currentRevision?.source ?? "Not generated"} source
            </p>
            <p className="mt-4 text-sm text-ink/55">
              {issueCount
                ? `${issueCount} saved validation issue${issueCount === 1 ? "" : "s"}`
                : "No saved validation issues"}
            </p>
          </section>

          <section className="rounded-[22px] border border-[#d8c8ae] bg-white/75 p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.13em] text-earth">
              Theme
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Pinned version {detail.effectiveTheme.versionNumber}
            </h2>
            <div className="mt-4 flex gap-2">
              {[
                detail.effectiveTheme.colorCoverAccent,
                detail.effectiveTheme.colorLeaf,
                detail.effectiveTheme.colorEarth,
                detail.effectiveTheme.colorCream,
              ].map((color) => (
                <span
                  key={color}
                  className="h-9 w-9 rounded-full border border-black/10"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </section>

          <section className="rounded-[22px] border border-[#d8c8ae] bg-white/75 p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.13em] text-earth">
              Latest PDF
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              {latestRender?.pageCount
                ? `${latestRender.pageCount} pages`
                : "No completed preview"}
            </h2>
            {latestRender ? (
              <div
                className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${statusTone(latestRender.status)}`}
              >
                {latestRender.status.replaceAll("_", " ")}
              </div>
            ) : null}
          </section>
        </div>

        <section className="mt-6 rounded-[22px] border border-[#d8c8ae] bg-white/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.13em] text-earth">
                Activity
              </p>
              <h2 className="mt-1 text-xl font-semibold">Recent versions and renders</h2>
            </div>
            {detail.currentRevision ? (
              <Link href="#chapters" className="text-sm font-bold text-[#486a38]">
                Choose a chapter →
              </Link>
            ) : null}
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.1em] text-ink/45">
                Content revisions
              </h3>
              <div className="mt-2 grid gap-2">
                {detail.revisions.slice(0, 5).map((revision) => (
                  <div
                    key={revision.id}
                    className="flex items-center justify-between gap-4 rounded-[13px] bg-[#f8f1e5] px-3 py-2 text-sm"
                  >
                    <span>
                      <strong>Revision {revision.revisionNumber}</strong>
                      <span className="ml-2 capitalize text-ink/45">
                        {revision.source}
                      </span>
                    </span>
                    <span className="text-xs text-ink/42">
                      {formatDate(revision.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.1em] text-ink/45">
                PDF renders
              </h3>
              <div className="mt-2 grid gap-2">
                {detail.renderRuns.slice(0, 5).map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between gap-4 rounded-[13px] bg-[#f8f1e5] px-3 py-2 text-sm"
                  >
                    <span className="capitalize">
                      <strong>{run.status.replaceAll("_", " ")}</strong>
                      <span className="ml-2 text-ink/45">
                        {run.pageCount ? `${run.pageCount} pages` : ""}
                      </span>
                    </span>
                    <span className="text-xs text-ink/42">
                      {formatDate(run.createdAt)}
                    </span>
                  </div>
                ))}
                {!detail.renderRuns.length ? (
                  <p className="rounded-[13px] bg-[#f8f1e5] px-3 py-3 text-sm text-ink/45">
                    No PDF renders yet.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
