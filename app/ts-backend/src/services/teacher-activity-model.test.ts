import { describe, expect, test } from "bun:test";
import {
  gradeSaveChangesValue,
  isLessonCompletionActivity,
  selectDistinctRecentActivityEvents,
  summarizeTeacherActivityEvents
} from "./teacher-activity-model";

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

describe("recent account activity", () => {
  test("does not audit an idempotent repeat grade save", () => {
    expect(gradeSaveChangesValue(null, 90)).toBe(true);
    expect(gradeSaveChangesValue(80, 90)).toBe(true);
    expect(gradeSaveChangesValue(90, 90)).toBe(false);
  });

  test("does not present a later grade edit as another completion", () => {
    expect(isLessonCompletionActivity({
      eventType: "grade_saved",
      metadata: { previousScore: null }
    })).toBe(true);
    expect(isLessonCompletionActivity({
      eventType: "grade_saved",
      metadata: { previousScore: 80 }
    })).toBe(false);
    expect(isLessonCompletionActivity({
      eventType: "lesson_completed",
      metadata: {}
    })).toBe(true);
  });

  test("keeps separate school days while collapsing repeat saves and transactions", () => {
    const events = [
      {
        id: "day-3-newest",
        eventType: "lesson_completed",
        weeklyPlanId: "week-1",
        subjectKey: "japanese",
        metadata: { dayNumber: 3 }
      },
      {
        id: "day-3-grade-save",
        eventType: "grade_saved",
        weeklyPlanId: "week-1",
        subjectKey: "japanese",
        metadata: { dayNumber: 3, previousScore: null }
      },
      {
        id: "day-2-newest",
        eventType: "grade_saved",
        weeklyPlanId: "week-1",
        subjectKey: "japanese",
        metadata: { dayNumber: 2 }
      },
      {
        id: "day-2-repeat",
        eventType: "grade_saved",
        weeklyPlanId: "week-1",
        subjectKey: "japanese",
        metadata: { dayNumber: 2 }
      },
      {
        id: "points-newest",
        eventType: "points_awarded",
        weeklyPlanId: null,
        subjectKey: null,
        metadata: { pointTransactionId: "transaction-1" }
      },
      {
        id: "points-repeat",
        eventType: "points_awarded",
        weeklyPlanId: null,
        subjectKey: null,
        metadata: { pointTransactionId: "transaction-1" }
      }
    ];

    expect(selectDistinctRecentActivityEvents(events, 10).map((event) => event.id)).toEqual([
      "day-3-newest",
      "day-2-newest",
      "points-newest"
    ]);
  });
});
