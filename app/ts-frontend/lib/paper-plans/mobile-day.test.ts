import { describe, expect, test } from "bun:test";
import { buildMobileDayPayload } from "./mobile-day";

describe("mobile day payload", () => {
  test("returns the real lesson titles for the requested day", () => {
    const payload = buildMobileDayPayload({
      profileId: "profile-1",
      dayNumber: 2,
      week: {
        id: "week-1",
        weekNumber: 4,
        days: [
          {
            dayNumber: 2,
            attendedSubjectKeys: ["math"],
            subjects: [
              {
                subjectKey: "math",
                subjectLabel: "Math",
                title: "Adding within 20",
                assessmentRecommended: false,
                grade: 90,
              },
              {
                subjectKey: "reading",
                subjectLabel: "Reading",
                title: "Short vowel review",
                assessmentRecommended: true,
                grade: null,
              },
            ],
          },
        ],
      },
    });

    expect(payload).toEqual({
      scope: "day",
      profileId: "profile-1",
      weeklyPlanId: "week-1",
      weekNumber: 4,
      dayNumber: 2,
      title: "Day 2",
      lessons: [
        {
          id: "math",
          subjectKey: "math",
          subjectLabel: "Math",
          title: "Adding within 20",
          assessmentRecommended: false,
          grade: 90,
          completed: true,
        },
        {
          id: "reading",
          subjectKey: "reading",
          subjectLabel: "Reading",
          title: "Short vowel review",
          assessmentRecommended: true,
          grade: null,
          completed: false,
        },
      ],
    });
  });

  test("returns null for a day outside the owned week", () => {
    const payload = buildMobileDayPayload({
      profileId: "profile-1",
      dayNumber: 3,
      week: { id: "week-1", weekNumber: 4, days: [] },
    });

    expect(payload).toBeNull();
  });
});
