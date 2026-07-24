export type LessonQuizState = {
  error: string | null;
  score: number | null;
  correctCount: number | null;
  totalQuestions: number | null;
  passed: boolean;
  passingScore: number | null;
  masteryStatus: string | null;
  unlockedNextSkillId: string | null;
  attemptCount: number | null;
  results: Array<{
    questionId: string;
    prompt: string;
    selectedChoiceIndex: number | null;
    selectedChoice: string | null;
    correctChoiceIndex: number;
    correctChoice: string | null;
    isCorrect: boolean;
    explanation: string;
  }>;
};

export const initialLessonQuizState: LessonQuizState = {
  error: null,
  score: null,
  correctCount: null,
  totalQuestions: null,
  passed: false,
  passingScore: null,
  masteryStatus: null,
  unlockedNextSkillId: null,
  attemptCount: null,
  results: []
};
