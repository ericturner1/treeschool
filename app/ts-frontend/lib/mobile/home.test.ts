import { describe, expect, test } from "bun:test";
import { buildMobileHomePayload } from "./home";

describe("mobile home payload", () => {
  test("returns students and the first unfinished week with download state", () => {
    const payload = buildMobileHomePayload({
      students: [
        {
          id: "student-1",
          slug: "maya",
          role: "STUDENT",
          accountRole: null,
          isAdmin: false,
          firstName: "Maya",
          birthDate: null,
          gradeLevel: 3,
          accessPin: null,
          avatarUrl: null,
          uiTheme: "playful",
          languagePreference: "en",
          currentNodeId: null,
          gradingScheme: "us",
          learningProfileNotes: null,
          subjectStrengths: {},
          learningProfileUpdatedAt: null,
        },
      ],
      selectedProfileId: "student-1",
      plan: {
        permissions: {
          accountRole: "OWNER",
          canManagePlan: true,
          canRecordLearning: true,
        },
        materialsChanged: false,
        recovery: { available: false, restoreUntil: null },
        regenerationAllowance: {
          source: "subscription",
          periodKey: null,
          limit: 0,
          used: 0,
          remaining: 0,
          resetsAt: null,
          introductoryMonth: false,
        },
        year: null,
        subjectOptions: [],
        documents: [],
        planning: {
          total: 0,
          queued: 0,
          running: 0,
          qualityChecking: 0,
          completed: 0,
          failed: 0,
          qualityControlFailed: false,
          active: 0,
        },
        weeks: [
          {
            id: "week-1",
            weekNumber: 1,
            title: "Week 1",
            summary: null,
            status: "completed",
            downloaded: true,
            preservedForReplan: true,
            pdfQualityStatus: "passed",
            pdfPageCount: 10,
            grade: null,
            parentNotes: null,
            items: [],
            days: [],
            scheduledDayCount: 0,
            attendedDayCount: 0,
            attendanceProgress: 100,
            subjectGrades: [],
          },
          {
            id: "week-2",
            weekNumber: 2,
            title: "Week 2",
            summary: null,
            status: "planned",
            downloaded: true,
            preservedForReplan: true,
            pdfQualityStatus: "passed",
            pdfPageCount: 12,
            grade: null,
            parentNotes: null,
            items: [],
            days: [],
            scheduledDayCount: 0,
            attendedDayCount: 0,
            attendanceProgress: 0,
            subjectGrades: [],
          },
        ],
      },
    });

    expect(payload).toEqual({
      students: [{ id: "student-1", firstName: "Maya" }],
      selectedProfileId: "student-1",
      nextWeek: {
        id: "week-2",
        weekNumber: 2,
        title: "Week 2",
        downloaded: true,
      },
    });
  });
});
