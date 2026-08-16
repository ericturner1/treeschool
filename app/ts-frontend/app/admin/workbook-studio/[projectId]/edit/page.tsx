import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../../lib/auth/server";
import {
  getAdminWorkbookStudioProject,
  listAdminWorkbookStudio,
} from "../../../../../lib/workbook-studio/server";
import { PackAutoRefresh } from "../../../../pack/upload/auto-refresh";
import { WorkbookStudioEditor } from "../workbook-studio-editor";

export default async function WorkbookStudioEditorPage(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ chapter?: string; view?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect(
      `/p/signin?next=/admin/workbook-studio/${params.projectId}/edit`,
    );
  }

  let detail;
  let studio;
  try {
    [detail, studio] = await Promise.all([
      getAdminWorkbookStudioProject(user.id, params.projectId),
      listAdminWorkbookStudio(user.id),
    ]);
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
  const requestedChapter = Number.parseInt(searchParams.chapter ?? "0", 10);
  const initialChapter = Number.isFinite(requestedChapter)
    ? Math.max(requestedChapter, 0)
    : 0;
  const initialView = searchParams.view === "cover" ? "cover" : "chapter";
  const selectedChapter =
    detail.currentRevision?.contentJson.chapters[
      Math.min(
        initialChapter,
        detail.currentRevision.contentJson.chapters.length - 1,
      )
    ];

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#eee4d4] text-ink">
      <PackAutoRefresh enabled={working} />
      <header className="z-30 shrink-0 border-b border-[#d8c8ae] bg-[#fffaf2]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/admin/workbook-studio/${detail.project.id}`}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-bold"
            >
              ← Project
            </Link>
            <div className="min-w-0">
              <p className="truncate font-semibold">{detail.project.title}</p>
              <p className="text-xs text-ink/48">
                {initialView === "cover"
                  ? "Cover"
                  : selectedChapter
                  ? `Chapter ${Math.min(initialChapter, detail.currentRevision!.contentJson.chapters.length - 1) + 1}: ${selectedChapter.title}`
                  : "Editor"}{" "}
                · {detail.project.status} · Theme v
                {detail.effectiveTheme.versionNumber}
              </p>
            </div>
          </div>
          <Link
            href="/admin/workbook-studio"
            className="text-xs font-bold text-earth"
          >
            All Studio projects
          </Link>
        </div>
      </header>

      {detail.currentRevision ? (
        <WorkbookStudioEditor
          detail={detail}
          themes={studio.themes}
          initialChapter={initialChapter}
          initialView={initialView}
        />
      ) : (
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#9fbd89]/35 border-t-[#567b40]" />
          <h1 className="mt-6 text-3xl font-semibold">
            Generating the structured workbook
          </h1>
          <p className="mt-3 text-ink/55">
            Return to the project overview while the first structured revision
            is prepared.
          </p>
        </div>
      )}
    </main>
  );
}
