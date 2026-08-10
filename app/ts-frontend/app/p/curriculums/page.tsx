import Link from "next/link";
import { redirect } from "next/navigation";
import { bootstrapParentAccount } from "../../../lib/accounts/server";
import { getCurrentUser } from "../../../lib/auth/server";
import { listParentCurriculumPrograms } from "../../../lib/curriculum/server";
import { getRequestDictionary } from "../../../lib/i18n/server";
import { ParentModeGuard } from "../parent-mode-guard";

const programCardMeta: Record<
  string,
  {
    icon: string;
    accentClassName: string;
    fallbackDescription: string;
  }
> = {
  "Elementary Core K-6": {
    icon: "K-6",
    accentClassName: "bg-[#eef5e4] text-[#4d6a39]",
    fallbackDescription:
      "A full elementary curriculum with grade-based subjects organized for younger learners."
  },
  "Tree Academy": {
    icon: "6-12",
    accentClassName: "bg-[#e9eff9] text-[#46648f]",
    fallbackDescription:
      "A structured upper-grade curriculum with grade-level subject pathways."
  }
};

function formatGradeSpan(gradeTitles: string[]) {
  if (gradeTitles.length === 0) {
    return "";
  }

  const first = gradeTitles[0] === "Kindergarten" ? "K" : gradeTitles[0].replace("Grade ", "");
  const lastTitle = gradeTitles[gradeTitles.length - 1];
  const last = lastTitle === "Kindergarten" ? "K" : lastTitle.replace("Grade ", "");
  return `${first}-${last}`;
}

function getProgramDisplayName(program: { title: string; gradeTitles: string[] }) {
  const span = formatGradeSpan(program.gradeTitles);

  if (program.title === "Elementary Core K-6") {
    return "Elementary Core K-6";
  }

  return span ? `${program.title} (${span})` : program.title;
}

type ParentCurriculumsPageProps = {
  searchParams?: Promise<{
    lang?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function ParentCurriculumsPage(props: ParentCurriculumsPageProps) {
  const searchParams = await props.searchParams;
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { home, dashboard } = dictionary;
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser.email) {
    redirect(`/p/signin?lang=${locale}`);
  }

  const parentFirstName =
    currentUser.user_metadata?.first_name ??
    currentUser.user_metadata?.name ??
    currentUser.user_metadata?.full_name?.split(" ")[0];

  await bootstrapParentAccount({
    userId: currentUser.id,
    email: currentUser.email,
    firstName: parentFirstName
  });

  const programs = await listParentCurriculumPrograms(locale);

  const redirectTo = searchParams?.lang
    ? `/p/curriculums?lang=${searchParams.lang}`
    : "/p/curriculums";

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <main className="min-h-screen bg-[#f8f1e4] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="border-b border-[#e2d0b1] pb-6">
            <Link href="/" className="inline-flex items-center gap-0 text-[28px] font-semibold tracking-[-0.05em] text-ink">
              <img src="/tree-icon.png" alt="treeschool tree icon" className="h-28 w-28 object-contain" />
              <span className="brand-logo">{home.brand.name}</span>
            </Link>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <Link
                  href="/p/dashboard"
                  className="text-sm font-semibold text-earth underline underline-offset-4"
                >
                  Back to parent dashboard
                </Link>
                <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">
                  Curriculums
                </h1>
                <p className="mt-3 max-w-3xl text-lg leading-[1.75] text-ink/76 sm:text-[21px]">
                  Start with the full curriculum, then drill into the grade-level subjects inside it.
                </p>
              </div>
            </div>
          </div>

          <section className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {programs.map((program) => {
              const meta = programCardMeta[program.title] ?? null;

              return (
                <div
                  key={program.id}
                  className="site-panel rounded-[28px] px-6 py-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-[18px] text-lg font-black tracking-[-0.05em] ${meta?.accentClassName ?? "bg-[#eef5e4] text-[#4d6a39]"}`}
                    >
                      {meta?.icon ?? "K-1"}
                    </div>
                    <span className="mt-1 text-3xl text-earth">→</span>
                  </div>
                  <div className="mt-5 flex items-center gap-3">
                    <span className="rounded-[999px] bg-[#fffaf2] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-earth shadow-[inset_0_0_0_1px_rgba(143,101,68,0.14)]">
                      Curriculum
                    </span>
                    {program.gradeTitles.length > 0 ? (
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/48">
                        {formatGradeSpan(program.gradeTitles)}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-4 text-[30px] font-semibold tracking-[-0.05em] text-ink">
                    {getProgramDisplayName(program)}
                  </h2>
                  <p className="mt-3 text-base leading-[1.8] text-ink/72">
                    {program.description ??
                      meta?.fallbackDescription ??
                      "Open this curriculum to review its grade-level subjects and standards."}
                  </p>
                  <div className="mt-6">
                    <Link
                      href={`/p/curriculums/${program.slug ?? program.id}`}
                      className="cta-button cta-button--small cta-button--outline inline-flex"
                    >
                      {dashboard.curriculumDetail.openCurriculum}
                    </Link>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </main>
    </ParentModeGuard>
  );
}
