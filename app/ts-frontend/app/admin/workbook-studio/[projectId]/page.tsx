import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/server";
import {
  getAdminWorkbookStudioProject,
  listAdminWorkbookStudio,
} from "../../../../lib/workbook-studio/server";
import { PackAutoRefresh } from "../../../pack/upload/auto-refresh";
import { WorkbookStudioEditor } from "./workbook-studio-editor";

export default async function WorkbookStudioProjectPage(
  props: {
    params: Promise<{ projectId: string }>;
  }
) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user?.id)
    redirect(`/p/signin?next=/admin/workbook-studio/${params.projectId}`);
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
    )
      notFound();
    throw error;
  }
  const working =
    detail.generationRuns.some((run) =>
      ["queued", "running", "retry_wait"].includes(run.status),
    ) ||
    detail.renderRuns.some((run) =>
      ["queued", "running", "retry_wait"].includes(run.status),
    );

  return (
    <main className="min-h-screen bg-[#eee4d4] text-ink">
      <PackAutoRefresh enabled={working} />
      <div className="border-b border-[#d8c8ae] bg-[#fffaf2] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin/workbook-studio"
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-bold"
            >
              ← Studio
            </Link>
            <div className="min-w-0">
              <p className="truncate font-semibold">{detail.project.title}</p>
              <p className="text-xs text-ink/48">
                {detail.project.status} · Theme v
                {detail.effectiveTheme.versionNumber} ·{" "}
                {detail.project.nativeWorkbookId
                  ? "Bookstore linked"
                  : "Authoring only"}
              </p>
            </div>
          </div>
        </div>
      </div>
      {detail.currentRevision ? (
        <WorkbookStudioEditor detail={detail} themes={studio.themes} />
      ) : (
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#9fbd89]/35 border-t-[#567b40]" />
          <h1 className="mt-6 text-3xl font-semibold">
            Generating the structured workbook
          </h1>
          <p className="mt-3 text-ink/55">
            The outline, lesson content, validation, and first PDF preview run
            as queued stages. This page refreshes while they work.
          </p>
          {detail.generationRuns[0]?.errorMessage ? (
            <p className="mt-5 rounded-[14px] bg-[#fff0ea] px-4 py-3 text-sm text-[#8c3f2f]">
              {detail.generationRuns[0].errorMessage}
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}
