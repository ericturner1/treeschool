import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { bootstrapParentAccount } from "../../../../../lib/accounts/server";
import { getCurrentUser } from "../../../../../lib/auth/server";
import {
  listParentCurriculumPrograms,
  listParentCurriculumSubjectsByProgram
} from "../../../../../lib/curriculum/server";
import { getRequestDictionary } from "../../../../../lib/i18n/server";
import { ParentModeGuard } from "../../../parent-mode-guard";

const subjectCardMeta: Record<
  string,
  {
    icon: string;
    accentClassName: string;
    fallbackDescription: string;
  }
> = {
  "math-g1": {
    icon: "123",
    accentClassName: "bg-[#eef5e4] text-[#4d6a39]",
    fallbackDescription:
      "Number sense, operations, place value, and early problem solving for Grade 1."
  },
  "ela-g1": {
    icon: "Aa",
    accentClassName: "bg-[#e9eff9] text-[#46648f]",
    fallbackDescription:
      "Reading, phonics, writing, speaking, listening, and language foundations for Grade 1."
  },
  "science-g1": {
    icon: "SCI",
    accentClassName: "bg-[#f5eddc] text-[#8a6137]",
    fallbackDescription:
      "Life science, earth science, weather, matter, and observation skills for Grade 1."
  },
  "social-studies-g1": {
    icon: "USA",
    accentClassName: "bg-[#f8e3dd] text-[#9a5647]",
    fallbackDescription:
      "Community, citizenship, history, geography, timelines, and economics for Grade 1."
  }
};

type ParentCurriculumSubjectsPageProps = {
  params: {
    curriculumSlug: string;
  };
  searchParams?: {
    lang?: string;
  };
};

export default async function ParentCurriculumSubjectsPage({
  params,
  searchParams
}: ParentCurriculumSubjectsPageProps) {
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
  const program = programs.find(
    (candidate) => candidate.slug === params.curriculumSlug || candidate.id === params.curriculumSlug
  );
  if (!program) {
    notFound();
  }

  const subjects = await listParentCurriculumSubjectsByProgram(program.id, locale);

  const gradeMap = new Map<
    string,
    {
      title: string;
      order: number;
      subjects: typeof subjects;
    }
  >();

  for (const subject of subjects) {
    const existing = gradeMap.get(subject.gradeId);
    if (existing) {
      existing.subjects.push(subject);
      continue;
    }

    gradeMap.set(subject.gradeId, {
      title: subject.gradeTitle,
      order: subject.gradeOrder,
      subjects: [subject]
    });
  }

  const grades = Array.from(gradeMap.values()).sort((left, right) => left.order - right.order);
  const redirectTo = searchParams?.lang
    ? `/p/curriculums/${program.slug ?? program.id}/subjects?lang=${searchParams.lang}`
    : `/p/curriculums/${program.slug ?? program.id}/subjects`;

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
      <main className="min-h-screen bg-[#f8f1e4] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="border-b border-[#e2d0b1] pb-6">
            <Link href="/" className="inline-flex items-center gap-0 text-[28px] font-semibold tracking-[-0.05em] text-ink">
              <img src="/tree-icon.png" alt="treeschool tree icon" className="h-28 w-28 object-contain" />
              <span className="brand-logo">{home.brand.name}</span>
            </Link>
            <div className="mt-6">
              <Link
                href="/p/curriculums"
                className="text-sm font-semibold text-earth underline underline-offset-4"
              >
                Back to curriculums
              </Link>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">
                {program.title}
              </h1>
              <p className="mt-3 max-w-3xl text-lg leading-[1.75] text-ink/76 sm:text-[21px]">
                Open a subject to inspect its domains, clusters, standards, and generated lessons.
              </p>
            </div>
          </div>

          <section className="mt-10 space-y-8">
            {grades.map((grade) => (
              <div key={grade.title}>
                <h2 className="text-[30px] font-semibold tracking-[-0.05em] text-ink">{grade.title}</h2>
                <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {grade.subjects.map((subject) => {
                    const meta = subject.slug ? subjectCardMeta[subject.slug] : null;

                    return (
                      <div
                        key={subject.id}
                        className="site-panel rounded-[28px] px-6 py-6"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div
                            className={`flex h-14 w-14 items-center justify-center rounded-[18px] text-lg font-black tracking-[-0.05em] ${meta?.accentClassName ?? "bg-[#eef5e4] text-[#4d6a39]"}`}
                          >
                            {meta?.icon ?? "SUB"}
                          </div>
                          <span className="mt-1 text-3xl text-earth">→</span>
                        </div>
                        <div className="mt-5 flex items-center gap-3">
                          <span className="rounded-[999px] bg-[#fffaf2] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-earth shadow-[inset_0_0_0_1px_rgba(143,101,68,0.14)]">
                            Subject
                          </span>
                        </div>
                        <h3 className="mt-4 text-[30px] font-semibold tracking-[-0.05em] text-ink">
                          {subject.title}
                        </h3>
                        <p className="mt-3 text-base leading-[1.8] text-ink/72">
                          {subject.description ??
                            meta?.fallbackDescription ??
                            "Open this subject to review its domains, clusters, and standards."}
                        </p>
                        <div className="mt-6">
                          <Link
                            href={
                              subject.slug
                                ? `/p/curriculums/${program.slug ?? program.id}/subjects/${subject.slug}`
                                : `/p/curriculums/${program.slug ?? program.id}/subjects`
                            }
                            className="cta-button cta-button--small cta-button--outline inline-flex"
                          >
                            {dashboard.curriculumDetail.openSubject}
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>
    </ParentModeGuard>
  );
}
