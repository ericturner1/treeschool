import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../../lib/auth/server";
import {
  getAdminWorkbookStudioCurriculum,
  listAdminWorkbookStudio,
} from "../../../../../lib/workbook-studio/server";
import { PackAutoRefresh } from "../../../../pack/upload/auto-refresh";
import { CurriculumEditor } from "./curriculum-editor";

export default async function WorkbookCurriculumPage(
  props: {
    params: Promise<{ curriculumId: string }>;
  }
) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user?.id)
    redirect(
      `/p/signin?next=/admin/workbook-studio/curricula/${params.curriculumId}`,
    );
  let detail;
  let studio;
  try {
    [detail, studio] = await Promise.all([
      getAdminWorkbookStudioCurriculum(user.id, params.curriculumId),
      listAdminWorkbookStudio(user.id),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "Administrator access is required.",
        "Workbook curriculum not found.",
      ].includes(error.message)
    )
      notFound();
    throw error;
  }
  const working = detail.batches.some((batch) =>
    ["queued", "running", "retry_wait"].includes(batch.status),
  );
  return (
    <main className="min-h-screen px-4 py-8 text-ink sm:px-6 lg:px-8">
      <PackAutoRefresh enabled={working} />
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin/workbook-studio"
          className="text-sm font-bold text-earth"
        >
          ← Workbook Studio
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-earth">
              Curriculum plan
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
              {detail.curriculum.name}
            </h1>
            <p className="mt-2 text-sm text-ink/50">
              Grade {detail.curriculum.gradeLevel} ·{" "}
              {detail.curriculum.languageCode} · {detail.curriculum.status}
            </p>
          </div>
          {working ? (
            <span className="rounded-full bg-[#fff0cf] px-3 py-1.5 text-xs font-bold text-[#76571f]">
              Generation running
            </span>
          ) : null}
        </div>
        <CurriculumEditor
          detail={detail}
          prompts={studio.prompts}
          academicStandards={studio.academicStandards}
          curriculumSubjects={studio.curriculumSubjects}
          themes={studio.themes}
        />
      </div>
    </main>
  );
}
