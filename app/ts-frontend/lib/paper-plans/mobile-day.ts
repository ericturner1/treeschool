type MobileDayWeekInput = {
  id: string;
  weekNumber: number;
  days: Array<{
    dayNumber: number;
    attendedSubjectKeys: string[];
    subjects: Array<{
      subjectKey: string;
      subjectLabel: string;
      title: string;
      assessmentRecommended: boolean;
      grade: number | null;
    }>;
  }>;
};

export function buildMobileDayPayload(input: {
  profileId: string;
  week: MobileDayWeekInput;
  dayNumber: number;
}) {
  const day = input.week.days.find(
    (candidate) => candidate.dayNumber === input.dayNumber,
  );
  if (!day) return null;

  return {
    scope: "day" as const,
    profileId: input.profileId,
    weeklyPlanId: input.week.id,
    weekNumber: input.week.weekNumber,
    dayNumber: day.dayNumber,
    title: `Day ${day.dayNumber}`,
    lessons: day.subjects.map((subject) => ({
      id: subject.subjectKey,
      subjectKey: subject.subjectKey,
      subjectLabel: subject.subjectLabel,
      title: subject.title.trim() || subject.subjectLabel,
      assessmentRecommended: subject.assessmentRecommended,
      grade: subject.grade,
      completed: day.attendedSubjectKeys.includes(subject.subjectKey),
    })),
  };
}
