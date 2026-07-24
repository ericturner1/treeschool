import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfileCookie } from "../../../../lib/accounts/active-profile";
import { getCurrentUser } from "../../../../lib/auth/server";
import { getParentBillingOverview } from "../../../../lib/billing/server";
import { getRequestDictionary } from "../../../../lib/i18n/server";
import { getLesson } from "../../../../lib/lessons/server";
import { LessonExperience } from "./lesson-experience";
import { PendingLessonStatus } from "./pending-lesson-status";

type StudentLessonPageProps = {
  params: {
    lessonId: string;
  };
  searchParams?: {
    lang?: string;
  };
};

export default async function StudentLessonPage({
  params,
  searchParams
}: StudentLessonPageProps) {
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { student } = dictionary;
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

  const lesson = await getLesson({
    profileId: activeProfile.id,
    lessonId: params.lessonId
  });

  const lessonPending = lesson.status !== "ready" || !lesson.contentJson;
  const lessonContent = lesson.contentJson;
  const latestGenerationLog = lesson.generationLogs.at(-1) ?? null;
  const slideDeckStage = lessonContent?.stages.find((stage) => stage.type === "slideDeck");
  const quizStage = lessonContent?.stages.find((stage) => stage.type === "quiz");
  const lessonReady = !lessonPending && lessonContent && slideDeckStage && quizStage;

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 pb-2 pt-2 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1400px] gap-2 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
        <aside className="rounded-[24px] border border-[#dec9a9] bg-[#fffaf2] px-4 py-3 lg:sticky lg:top-2">
          <Link
            href={{ pathname: "/", query: { lang: locale } }}
            className="flex w-full flex-col items-center justify-center text-center text-[24px] font-semibold tracking-[-0.05em] text-ink"
          >
            <img src="/tree-icon.png" alt="treeschool tree icon" className="h-24 w-24 object-contain" />
            <span className="brand-logo">treeschool</span>
          </Link>
          <nav className="mt-5">
            <Link
              href={{ pathname: "/student/classroom", query: { lang: locale } }}
              className="inline-flex min-h-[54px] w-full items-center justify-center rounded-[20px] border-4 border-[#6f8d4b] bg-[#e4f0d7] px-4 text-[18px] font-semibold tracking-[-0.03em] text-[#36511f] shadow-[0_8px_0_#bfd39f] transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_0_#bfd39f] active:translate-y-1 active:shadow-[0_4px_0_#bfd39f]"
            >
              Back to classroom
            </Link>
          </nav>
        </aside>

        <div className="min-w-0">
          {!lessonReady ? (
            <PendingLessonStatus
              latestGenerationLog={latestGenerationLog}
              backLabel={student.lesson.back}
            />
          ) : (
            <LessonExperience
              profileId={activeProfile.id}
              lessonId={lesson.id}
              lessonTitle={lesson.title}
              slides={slideDeckStage.slideDeck.slides}
              completedSlideIds={slideDeckStage.slideDeck.progress.completedSlideIds}
              questions={quizStage.quiz.questions}
            />
          )}
        </div>
      </div>
    </main>
  );
}
