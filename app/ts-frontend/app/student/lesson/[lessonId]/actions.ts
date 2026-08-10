"use server";

import { getCurrentStudentAccess } from "../../../../lib/auth/student-access";
import { submitLessonQuiz } from "../../../../lib/lessons/server";
import { initialLessonQuizState, type LessonQuizState } from "./quiz-state";

export async function submitLessonQuizAction(
  _prevState: LessonQuizState,
  formData: FormData
): Promise<LessonQuizState> {
  const profileId = String(formData.get("profileId") ?? "").trim();
  const lessonId = String(formData.get("lessonId") ?? "").trim();

  if (!profileId || !lessonId) {
    return {
      ...initialLessonQuizState,
      error: "Lesson details are missing."
    };
  }

  const access = await getCurrentStudentAccess(profileId);
  if (!access) {
    return {
      ...initialLessonQuizState,
      error: "Please reopen this lesson from the student classroom."
    };
  }

  const answers = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("question:"))
    .map(([key, value]) => ({
      questionId: key.replace(/^question:/, ""),
      choiceIndex: Number(value)
    }))
    .filter((answer) => Number.isInteger(answer.choiceIndex));

  if (answers.length === 0) {
    return {
      ...initialLessonQuizState,
      error: "Choose an answer for each question before submitting."
    };
  }

  try {
    const result = await submitLessonQuiz({
      profileId: access.student.id,
      lessonId,
      answers
    });

    return {
      error: null,
      score: result.score,
      correctCount: result.correctCount,
      totalQuestions: result.totalQuestions,
      passed: result.passed,
      passingScore: result.passingScore,
      masteryStatus: result.mastery.status,
      unlockedNextSkillId: result.mastery.unlockedNextSkillId,
      attemptCount: result.mastery.attemptCount,
      results: result.results
    };
  } catch (error) {
    return {
      ...initialLessonQuizState,
      error: error instanceof Error ? error.message : "Failed to submit quiz."
    };
  }
}
