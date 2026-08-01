import { describe, expect, test } from "bun:test";
import { summarizeTeacherActivityEvents } from "./teacher-activity-model";

describe("teacher activity summary", () => {
  test("counts points, manually recorded learning, and grading actions", () => {
    expect(summarizeTeacherActivityEvents([
      { eventType: "attendance_manual" },
      { eventType: "grade_saved" },
      { eventType: "grade_removed" },
      { eventType: "attendance_manual" },
      { eventType: "points_awarded" },
      { eventType: "points_used" },
      { eventType: "points_awarded" }
    ])).toEqual({
      totalActions: 7,
      gradingActions: 2,
      gradesSaved: 1,
      gradesRemoved: 1,
      attendanceRecorded: 2,
      pointActions: 3,
      pointsAwarded: 2,
      pointsUsed: 1
    });
  });
});
