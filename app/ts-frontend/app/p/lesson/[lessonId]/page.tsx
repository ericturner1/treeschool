import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { bootstrapParentAccount, listHouseholdProfiles } from "../../../../lib/accounts/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { getRequestDictionary } from "../../../../lib/i18n/server";
import { getLesson } from "../../../../lib/lessons/server";
import { LessonExperience } from "../../../student/lesson/[lessonId]/lesson-experience";
import { PendingLessonStatus } from "../../../student/lesson/[lessonId]/pending-lesson-status";
import { ParentModeGuard } from "../../parent-mode-guard";

type ParentLessonPreviewPageProps = {
  params: {
    lessonId: string;
  };
  searchParams?: {
    lang?: string;
    profileId?: string;
    returnTo?: string;
  };
};

function getSafeReturnTo(input: string | undefined) {
  if (!input || !input.startsWith("/") || input.startsWith("//")) {
    return "/p/curriculums";
  }

  return input;
}

async function getHouseholdLessonById(input: {
  lessonId: string;
  preferredProfileId?: string;
  householdProfiles: Array<{
    id: string;
    role: "PARENT" | "STUDENT";
  }>;
}) {
  const studentProfiles = input.householdProfiles.filter((profile) => profile.role === "STUDENT");
  const orderedProfiles = input.preferredProfileId
    ? [
        ...studentProfiles.filter((profile) => profile.id === input.preferredProfileId),
        ...studentProfiles.filter((profile) => profile.id !== input.preferredProfileId)
      ]
    : studentProfiles;

  for (const profile of orderedProfiles) {
    try {
      const lesson = await getLesson({
        profileId: profile.id,
        lessonId: input.lessonId
      });

      return lesson;
    } catch {
      continue;
    }
  }

  return null;
}

export default async function ParentLessonPreviewPage({
  params,
  searchParams
}: ParentLessonPreviewPageProps) {
  const { locale, dictionary } = await getRequestDictionary(searchParams?.lang);
  const { student, home, dashboard } = dictionary;
  const currentUser = await getCurrentUser();

  if (!currentUser?.id || !currentUser.email) {
    redirect(`/p/signin?lang=${locale}&message=Please sign in again.`);
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

  const householdProfiles = await listHouseholdProfiles(currentUser.id);
  const parentProfile = householdProfiles.find((profile) => profile.role === "PARENT");

  if (!parentProfile) {
    notFound();
  }

  const redirectTo = `/p/lesson/${params.lessonId}`;
  const lesson = await getHouseholdLessonById({
    lessonId: params.lessonId,
    preferredProfileId: searchParams?.profileId,
    householdProfiles
  });

  if (!lesson) {
    notFound();
  }

  const lessonPending = lesson.status !== "ready" || !lesson.contentJson;
  const lessonContent = lesson.contentJson;
  const latestGenerationLog = lesson.generationLogs.at(-1) ?? null;
  const slideDeckStage = lessonContent?.stages.find((stage) => stage.type === "slideDeck");
  const quizStage = lessonContent?.stages.find((stage) => stage.type === "quiz");
  const lessonReady = !lessonPending && lessonContent && slideDeckStage && quizStage;
  const returnTo = getSafeReturnTo(searchParams?.returnTo);

  return (
    <ParentModeGuard lang={searchParams?.lang} redirectTo={redirectTo}>
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
                href={returnTo as Route}
                className="inline-flex min-h-[54px] w-full items-center justify-center rounded-[20px] border-4 border-[#6f8d4b] bg-[#e4f0d7] px-4 text-[18px] font-semibold tracking-[-0.03em] text-[#36511f] shadow-[0_8px_0_#bfd39f] transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_0_#bfd39f] active:translate-y-1 active:shadow-[0_4px_0_#bfd39f]"
              >
                {dashboard.curriculumDetail.backToCurriculums}
              </Link>
            </nav>
          </aside>

          <div className="min-w-0">
            {!lessonReady ? (
              <PendingLessonStatus
                latestGenerationLog={latestGenerationLog}
                backLabel={dashboard.curriculumDetail.backToCurriculums}
                backHref={returnTo}
              />
            ) : (
              <LessonExperience
                lessonId={lesson.id}
                lessonTitle={lesson.title}
                slides={slideDeckStage.slideDeck.slides}
                completedSlideIds={[]}
                questions={quizStage.quiz.questions}
                mode="preview"
                previewBackHref={returnTo}
                previewBackLabel={dashboard.curriculumDetail.backToCurriculums}
              />
            )}
          </div>
        </div>
      </main>
    </ParentModeGuard>
  );
}
