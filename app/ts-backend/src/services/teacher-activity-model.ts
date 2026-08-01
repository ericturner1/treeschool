export type TeacherActivityEventType =
  | "grade_saved"
  | "grade_removed"
  | "attendance_manual"
  | "points_awarded"
  | "points_used";

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
