import { describe, expect, test } from "bun:test";
import { buildCompletionPushMessages } from "./mobile-push-notifications";

describe("completion push messages", () => {
  test("names the teacher, student, lesson, and completed week", () => {
    const messages = buildCompletionPushMessages({
      actorName: "Eric",
      studentName: "Maya",
      studentProfileId: "student-1",
      weeklyPlanId: "week-3",
      weekNumber: 3,
      weekTitle: "Week 3",
      dayNumber: 5,
      lessons: [{ subjectKey: "math", title: "Equivalent fractions" }],
      weekNewlyCompleted: true
    });

    expect(messages.map((message) => ({ title: message.title, body: message.body }))).toEqual([
      {
        title: "Lesson completed",
        body: "Eric marked Maya as done with Equivalent fractions."
      },
      {
        title: "Week completed",
        body: "Eric marked Maya as done with Week 3."
      }
    ]);
    expect(messages[0]?.data).toMatchObject({
      type: "lesson_completed",
      studentProfileId: "student-1",
      weeklyPlanId: "week-3",
      dayNumber: "5",
      subjectKey: "math"
    });
  });

  test("does not announce a week that was already complete", () => {
    const messages = buildCompletionPushMessages({
      actorName: "Eric",
      studentName: "Maya",
      studentProfileId: "student-1",
      weeklyPlanId: "week-3",
      weekNumber: 3,
      weekTitle: "Week 3",
      dayNumber: 2,
      lessons: [{ subjectKey: "reading", title: "Main idea" }],
      weekNewlyCompleted: false
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.title).toBe("Lesson completed");
  });
});
