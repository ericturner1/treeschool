import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/server";
import { listAdminWorkbookStudio } from "../../../../lib/workbook-studio/server";
import { WorkbookThemeManager } from "./workbook-theme-manager";

export default async function WorkbookThemeManagerPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/workbook-studio/themes");
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
  return (
    <main className="min-h-screen px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin/workbook-studio"
          className="text-sm font-bold text-earth"
        >
          ← Workbook Studio
        </Link>
        <div className="mt-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-earth">
            Versioned design system
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            Workbook themes
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/58">
            Create themes from structured tokens only. A published version is
            immutable; saving again creates the next version. Assigning a
            different version to released workbooks creates new editions.
          </p>
        </div>
        <WorkbookThemeManager themes={studio.themes} />
      </div>
    </main>
  );
}
