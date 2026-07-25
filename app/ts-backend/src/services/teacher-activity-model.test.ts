import { describe, expect, test } from "bun:test";
import { summarizeTeacherActivityEvents } from "./teacher-activity-model";

describe("teacher activity summary", () => {
  test("counts manually recorded learning alongside grading actions", () => {
    expect(summarizeTeacherActivityEvents([
      { eventType: "attendance_manual" },
      { eventType: "grade_saved" },
      { eventType: "grade_removed" },
      { eventType: "attendance_manual" }
    ])).toEqual({
      totalActions: 4,
      gradingActions: 2,
      gradesSaved: 1,
      gradesRemoved: 1,
      attendanceRecorded: 2
    });
  });
});
