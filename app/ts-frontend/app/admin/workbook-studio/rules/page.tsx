import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/server";
import { listAdminWorkbookStudio } from "../../../../lib/workbook-studio/server";
import { WorkbookRuleManager } from "./workbook-rule-manager";

export default async function WorkbookRuleManagerPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/p/signin?next=/admin/workbook-studio/rules");
  let studio;
  try {
    studio = await listAdminWorkbookStudio(user.id);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Administrator access is required."
    ) {
      notFound();
    }
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
            Rules as records
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            Workbook generation rules
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/58">
            Version the quality rules independently from prompt prose. Prompt
            rules are assembled into applicable generation stages; mechanical
            rules document save or release validation.
          </p>
        </div>
        <WorkbookRuleManager rules={studio.rules} />
      </div>
    </main>
  );
}
