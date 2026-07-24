import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

export async function getStudentClassroom(input: {
  profileId: string;
  languageCode?: string;
}) {
  const params = new URLSearchParams({
    profileId: input.profileId
  });

  if (input.languageCode) {
    params.set("languageCode", input.languageCode);
  }

  const response = await backendFetch(`${getBackendUrl()}/internal/student/classroom?${params}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch classroom.");
  }

  return response.json() as Promise<{
    enrolledSubjects: Array<{
      id: string;
      slug: string | null;
      title: string | null;
      fallbackTitle: string;
      description: string | null;
      progress: {
        completedCount: number;
        totalCount: number;
        percentDone: number;
      };
      nextLesson: null | {
        lessonId: string | null;
        nodeId: string;
        title: string;
        summary: string | null;
        status: string | null;
        domainTitle: string | null;
        clusterTitle: string | null;
      };
    }>;
    streak: {
      mode: "daily" | "weekly";
      timeZone: string;
      currentCount: number;
      lastActiveAt: string | null;
      currentPeriodLabel: string;
      currentPeriodPaused: boolean;
      currentPeriodCompleted: boolean;
      pausedWeekdays: number[];
      pausedWeeks: string[];
    };
    lessons: Array<{
      id: string;
      nodeId: string;
      title: string;
      createdAt: string;
      updatedAt: string;
    }>;
  }>;
}

export async function createLessonForSubject(input: {
  profileId: string;
  subjectId: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/lessons`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to create lesson.");
  }

  return response.json() as Promise<{
    id: string;
    nodeId: string;
    title: string;
  }>;
}

export async function createLessonForNode(input: {
  profileId: string;
  nodeId: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/lessons`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to create lesson.");
  }

  return response.json() as Promise<{
    id: string;
    nodeId: string;
    title: string;
  }>;
}

export async function getLesson(input: {
  profileId: string;
  lessonId: string;
}) {
  const params = new URLSearchParams({
    profileId: input.profileId,
    lessonId: input.lessonId
  });

  const response = await backendFetch(`${getBackendUrl()}/internal/lessons?${params}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch lesson.");
  }

  return response.json() as Promise<{
    id: string;
    nodeId: string;
    title: string;
    status: string;
    generationLogs: Array<{
      timestamp: string;
      stage: string;
      message: string;
    }>;
    contentJson: {
      version: "interactive_v8";
      stages: Array<
        | {
            id: string;
            type: "slideDeck";
            slideDeck: {
              title: string;
              objective: string | null;
              summary: string;
              progress: {
                completedSlideIds: string[];
              };
              slides: Array<{
                id: string;
                elements: Array<
                  | {
                      id: string;
                      type: "text";
                      role: "title" | "body";
                      text: string;
                      segments: Array<{
                        text: string;
                        emphasis?: "normal" | "bold";
                      }>;
                      frame: {
                        x: number;
                        y: number;
                        width: number;
                        height: number;
                      };
                    }
                  | {
                      id: string;
                      type: "image";
                      role: "primary";
                      frame: {
                        x: number;
                        y: number;
                        width: number;
                        height: number;
                      };
                      asset: {
                        url: string;
                        alt: string;
                        prompt: string;
                      };
                    }
                >;
                narrationSegments: Array<{
                  id: string;
                  role: "title" | "body";
                  url: string;
                  transcript: string;
                  voiceName: string;
                  languageCode: string;
                }>;
                interactions: Array<{
                  id: string;
                  trigger: {
                    type: "tap" | "audioEnded";
                    targetId: string;
                  };
                  actions: Array<
                    | {
                        type: "playAudio";
                        audioId: string;
                      }
                    | {
                        type: "markSlideComplete";
                      }
                  >;
                }>;
                completionRules: Array<
                  | {
                      type: "audioEnded";
                      audioId: string;
                    }
                  | {
                      type: "interactionCompleted";
                      interactionId: string;
                    }
                >;
              }>;
            };
          }
        | {
            id: string;
            type: "quiz";
            quiz: {
              title: string;
              passingScore: number;
              questions: Array<{
                id: string;
                prompt: string;
                choices: string[];
                correctChoiceIndex: number;
                explanation: string;
                audio: {
                  prompt: {
                    url: string;
                    transcript: string;
                    voiceName: string;
                    languageCode: string;
                  };
                  choices: Array<{
                    url: string;
                    transcript: string;
                    voiceName: string;
                    languageCode: string;
                  }>;
                };
                image?: {
                  url: string;
                  alt: string;
                } | null;
              }>;
            };
          }
      >;
    } | null;
    promptJson: {
      context: {
        node: {
          title: string;
          description: string | null;
          objective: string | null;
          standard: string | null;
        };
      };
    };
  }>;
}

export async function submitLessonQuiz(input: {
  profileId: string;
  lessonId: string;
  answers: Array<{
    questionId: string;
    choiceIndex: number;
  }>;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/lessons/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to submit lesson quiz.");
  }

  return response.json() as Promise<{
    lessonId: string;
    nodeId: string;
    score: number;
    correctCount: number;
    totalQuestions: number;
    passed: boolean;
    passingScore: number;
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
    mastery: {
      attemptCount: number;
      status: string;
      unlockedNextSkillId: string | null;
    };
  }>;
}

export async function markLessonSlideCompleted(input: {
  profileId: string;
  lessonId: string;
  slideId: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/lessons/slide-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to mark lesson slide complete.");
  }

  return response.json() as Promise<{
    lessonId: string;
    slideId: string;
    completedSlideIds: string[];
    streak: {
      mode: "daily" | "weekly";
      currentCount: number;
      currentPeriodLabel: string;
      currentPeriodPaused: boolean;
      currentPeriodCompleted: boolean;
    };
  }>;
}
