import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfileCookie } from "../../../lib/accounts/active-profile";
import { getCurrentUser } from "../../../lib/auth/server";
import { getParentBillingOverview } from "../../../lib/billing/server";
import { getRequestDictionary } from "../../../lib/i18n/server";
import { getStudentClassroom } from "../../../lib/lessons/server";
import { startLessonAction } from "./actions";

type StudentClassroomPageProps = {
  searchParams?: {
    lang?: string;
    error?: string;
    message?: string;
  };
};

export default async function StudentClassroomPage({
  searchParams
}: StudentClassroomPageProps) {
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { home, student } = dictionary;
  const currentUser = await getCurrentUser();
  const activeProfile = getActiveProfileCookie();

  if (!currentUser?.id || !currentUser.email) {
    redirect(`/signin?lang=${locale}&message=Please sign in again.`);
  }

  if (!activeProfile || activeProfile.role !== "STUDENT") {
    redirect(`/p/dashboard?lang=${locale}&error=Open a child record from the parent dashboard first.`);
  }

  const billing = await getParentBillingOverview({
    userId: currentUser.id
  });

  if (billing.accessRestricted) {
    redirect(
      `/p/billing?lang=${locale}&error=${encodeURIComponent(student.classroom.billingRestricted)}`
    );
  }

  const classroom = await getStudentClassroom({
    profileId: activeProfile.id,
    languageCode: locale
  });

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-[24px] border border-[#dec9a9] bg-[#fffaf2] px-4 py-4 lg:sticky lg:top-4 lg:h-fit">
          <Link
            href="/"
            className="flex w-full flex-col items-center justify-center text-center text-[28px] font-semibold tracking-[-0.05em] text-ink"
          >
            <img src="/tree-icon.png" alt="treeschool tree icon" className="h-24 w-24 object-contain" />
            <span className="brand-logo">{home.brand.name}</span>
          </Link>

          <div className="mt-6 rounded-[20px] border border-[#dcc8aa] bg-[#f8f1e4] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-earth/80">Streak</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-ink">
              {classroom.streak.currentCount}
            </p>
            <p className="mt-1 text-sm font-semibold text-earth">
              {classroom.streak.mode === "daily" ? "day streak" : "week streak"}
            </p>
            <p className="mt-3 text-sm leading-[1.7] text-ink/72">
              {classroom.streak.currentPeriodPaused
                ? `${classroom.streak.currentPeriodLabel} is paused.`
                : classroom.streak.currentPeriodCompleted
                  ? `${classroom.streak.currentPeriodLabel} is complete.`
                : `Finish one task to keep ${classroom.streak.currentPeriodLabel} active.`}
            </p>
          </div>

          <div className="mt-6 flex justify-center border-t border-[#eadbc2] pt-4">
            <Link
              href={{ pathname: "/p/dashboard", query: { lang: locale } }}
              className="text-sm font-semibold text-earth underline decoration-[#c8af8b] underline-offset-4 transition-colors hover:text-ink"
            >
              {student.classroom.backToParent}
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          <section className="mt-6">
            <div className="site-panel rounded-[28px] px-6 py-7">
              <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">
                Today&apos;s Lessons
              </h2>
              <div className="mt-6 space-y-4">
                {classroom.enrolledSubjects.length === 0 ? (
                  <p className="text-sm text-ink/65">{student.classroom.noCurriculum}</p>
                ) : (
                  classroom.enrolledSubjects.map((subjectNode) => (
                    <div
                      key={subjectNode.id}
                      className="rounded-[20px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-4"
                    >
                      <p className="text-lg font-semibold tracking-[-0.05em] text-ink">
                        {subjectNode.title ?? subjectNode.fallbackTitle}
                      </p>
                      {subjectNode.description ? (
                        <p className="mt-2 text-sm leading-[1.7] text-ink/72">
                          {subjectNode.description}
                        </p>
                      ) : null}
                      <div className="mt-4 rounded-[18px] bg-[#f8f1e4] px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-earth/80">
                            Completion
                          </p>
                          <p className="text-sm font-semibold text-ink">
                            {subjectNode.progress.completedCount}/{subjectNode.progress.totalCount} items completed (
                            {subjectNode.progress.percentDone}% done)
                          </p>
                        </div>
                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#e4d5bd]">
                          <div
                            className="h-full rounded-full bg-[#8eb35f]"
                            style={{ width: `${subjectNode.progress.percentDone}%` }}
                          />
                        </div>
                      </div>

                      {subjectNode.nextLesson ? (
                        <div className="mt-4 rounded-[18px] border border-[#dcc8aa] bg-[#f3eadb] px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-[999px] bg-[#fffaf2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-earth/80">
                              Next lesson
                            </span>
                            {subjectNode.nextLesson.domainTitle ? (
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/58">
                                {subjectNode.nextLesson.domainTitle}
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-ink">
                            {subjectNode.nextLesson.title}
                          </h3>
                          {subjectNode.nextLesson.clusterTitle ? (
                            <p className="mt-2 text-sm font-semibold text-earth">
                              Class: {subjectNode.nextLesson.clusterTitle}
                            </p>
                          ) : null}
                          {subjectNode.nextLesson.summary ? (
                            <p className="mt-2 text-sm leading-[1.7] text-ink/72">
                              {subjectNode.nextLesson.summary}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-[18px] border border-[#d9ceb8] bg-[#f7f0e3] px-4 py-4">
                          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-earth/80">
                            Next lesson
                          </p>
                          <p className="mt-2 text-sm leading-[1.7] text-ink/72">
                            This subject is complete for now.
                          </p>
                        </div>
                      )}
                      <form action={startLessonAction} className="mt-4">
                        <input type="hidden" name="profileId" value={activeProfile.id} />
                        <input type="hidden" name="subjectId" value={subjectNode.id} />
                        <button type="submit" className="cta-button cta-button--light cta-button--small">
                          Open lesson
                        </button>
                      </form>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
