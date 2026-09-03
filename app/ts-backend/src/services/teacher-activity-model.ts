export type TeacherActivityEventType =
  | "grade_saved"
  | "grade_removed"
  | "lesson_completed"
  | "attendance_manual"
  | "points_awarded"
  | "points_used";

type RecentActivityCandidate = {
  id: string;
  eventType: string;
  weeklyPlanId: string | null;
  subjectKey: string | null;
  metadata: Record<string, unknown>;
};

export function gradeSaveChangesValue(
  previousScore: number | null | undefined,
  nextScore: number
) {
  return previousScore == null || previousScore !== nextScore;
}

export function isLessonCompletionActivity(event: {
  eventType: string;
  metadata: Record<string, unknown>;
}) {
  return event.eventType === "lesson_completed" ||
    (event.eventType === "grade_saved" && event.metadata.previousScore == null);
}

export function selectDistinctRecentActivityEvents<
  T extends RecentActivityCandidate
>(events: T[], limit = 10) {
  const selected: T[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    const dayNumber = event.metadata.dayNumber;
    const pointTransactionId = event.metadata.pointTransactionId;
    const identity = (event.eventType === "grade_saved" ||
      event.eventType === "lesson_completed") &&
      event.weeklyPlanId &&
      event.subjectKey &&
      typeof dayNumber === "number"
      ? `lesson:${event.weeklyPlanId}:${dayNumber}:${event.subjectKey}`
      : (event.eventType === "points_awarded" || event.eventType === "points_used") &&
          typeof pointTransactionId === "string"
        ? `points:${pointTransactionId}`
        : `event:${event.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    selected.push(event);
    if (selected.length >= limit) break;
  }

  return selected;
}

export function summarizeTeacherActivityEvents(
  events: Array<{ eventType: string }>
) {
  const gradesSaved = events.filter((event) => event.eventType === "grade_saved").length;
  const gradesRemoved = events.filter((event) => event.eventType === "grade_removed").length;
  const attendanceRecorded = events.filter((event) => event.eventType === "attendance_manual").length;
  const pointsAwarded = events.filter((event) => event.eventType === "points_awarded").length;
  const pointsUsed = events.filter((event) => event.eventType === "points_used").length;

  return {
    totalActions: events.length,
    gradingActions: gradesSaved + gradesRemoved,
    gradesSaved,
    gradesRemoved,
    attendanceRecorded,
    pointActions: pointsAwarded + pointsUsed,
    pointsAwarded,
    pointsUsed
  };
}
