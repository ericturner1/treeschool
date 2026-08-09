import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import { listAdminWorkbookStudio } from "../../../lib/workbook-studio/server";
import { PackAutoRefresh } from "../../pack/upload/auto-refresh";
import { CurriculumThemeControls } from "./curriculum-theme-controls";
import { CurriculumCreator } from "./curriculum-creator";
import { GradeBatchCreator } from "./grade-batch-creator";
import { StudioProjectCreator } from "./studio-project-creator";

export default async function WorkbookStudioPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/workbook-studio");
  let studio;
  try {
    studio = await listAdminWorkbookStudio(user.id);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Administrator access is required."
    )
      notFound();
    throw error;
  }
  const working =
    studio.projects.some((project) => project.status === "generating") ||
    studio.activeBatches.length > 0;

  return (
    <main className="min-h-screen px-4 py-8 text-ink sm:px-6 lg:px-8">
      <PackAutoRefresh enabled={working} />
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-earth">
              In-platform authoring
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
              Workbook Studio
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/58">
              Build structured workbooks, generate from reusable prompts,
              validate, render deterministic PDFs, and release through the
              existing bookstore edition system.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CurriculumCreator academicStandards={studio.academicStandards} />
            <GradeBatchCreator
              curricula={studio.curricula}
              prompts={studio.prompts}
            />
            <StudioProjectCreator
              courses={studio.courses}
              curricula={studio.curricula}
              prompts={studio.prompts}
            />
          </div>
        </header>

        {studio.activeBatches.length ? (
          <section className="mt-7 rounded-[20px] border border-[#d5bd79] bg-[#fff4d2] p-4">
            <h2 className="font-bold">Work in progress</h2>
            <div className="mt-2 grid gap-2">
              {studio.activeBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex flex-wrap justify-between gap-2 text-sm"
                >
                  <span className="capitalize">
                    {batch.kind.replaceAll("_", " ")}
                  </span>
                  <span>
                    {batch.completedJobs} of {batch.totalJobs} jobs ·{" "}
                    {batch.status.replaceAll("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-semibold">Authoring projects</h2>
            <span className="text-sm text-ink/50">
              {studio.projects.length}
            </span>
          </div>
          {studio.projects.length ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {studio.projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/admin/workbook-studio/${project.id}`}
                  className="group rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-5 transition hover:-translate-y-0.5 hover:border-[#a9c194] hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#567b40]">
                        {project.subjectLabel} ·{" "}
                        {project.gradeMin === project.gradeMax
                          ? `Grade ${project.gradeMin}`
                          : `Grades ${project.gradeMin}–${project.gradeMax}`}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold group-hover:text-[#486a38]">
                        {project.title}
                      </h3>
                    </div>
                    <span className="rounded-full bg-[#eef4e8] px-2.5 py-1 text-[10px] font-black uppercase text-[#52713f]">
                      {project.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-ink/50">
                    {project.nativeWorkbookId
                      ? "Linked to bookstore"
                      : "Authoring only"}{" "}
                    · {project.layoutProfile} layout · {project.languageCode}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[22px] border border-dashed border-[#bca98a] bg-white/45 px-6 py-12 text-center">
              <p className="font-semibold">No Studio workbooks yet.</p>
              <p className="mt-1 text-sm text-ink/50">
                Create one manually or start from a reusable generation prompt.
              </p>
            </div>
          )}
        </section>

        <div className="mt-10 grid gap-6 xl:grid-cols-3">
          <section className="rounded-[22px] border border-[#d8c8ae] bg-white/65 p-5">
            <div className="flex justify-between">
              <h2 className="text-xl font-semibold">Curricula</h2>
              <span className="text-sm text-ink/45">
                {studio.curricula.length}
              </span>
            </div>
            <CurriculumThemeControls
              curricula={studio.curricula}
              themes={studio.themes}
            />
          </section>
          <section className="rounded-[22px] border border-[#d8c8ae] bg-white/65 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Generation prompts</h2>
              <Link
                href="/admin/workbook-studio/prompts"
                className="text-xs font-bold text-earth"
              >
                Manage →
              </Link>
            </div>
            <div className="mt-4 grid gap-2">
              {studio.prompts.slice(0, 8).map((prompt) => (
                <div
                  key={prompt.id}
                  className="rounded-[13px] bg-[#f6eddd] px-3 py-2"
                >
                  <p className="text-sm font-bold">{prompt.name}</p>
                  <p className="text-xs text-ink/48">
                    {prompt.kind.replaceAll("_", " ")} ·{" "}
                    {prompt.publishedVersionId
                      ? `v${prompt.versionNumber} published`
                      : "draft only"}
                  </p>
                </div>
              ))}
              {!studio.prompts.length ? (
                <p className="text-sm text-ink/48">
                  Import the existing prompt library or create a reusable
                  prompt.
                </p>
              ) : null}
            </div>
          </section>
          <section className="rounded-[22px] border border-[#d8c8ae] bg-white/65 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Themes & rules</h2>
              <div className="flex gap-3 text-xs font-bold text-earth">
                <Link href="/admin/workbook-studio/themes">Themes</Link>
                <Link href="/admin/workbook-studio/rules">Rules →</Link>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {studio.themes.map((theme) => (
                <div
                  key={theme.id}
                  className="rounded-[13px] bg-[#eef4e8] px-3 py-2"
                >
                  <p className="text-sm font-bold">
                    {theme.name} · v{theme.versionNumber}
                  </p>
                  <p className="text-xs text-ink/48">{theme.description}</p>
                </div>
              ))}
              <p className="text-xs leading-5 text-ink/48">
                {studio.rules.length} active rules are stored separately from
                prompt prose.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
