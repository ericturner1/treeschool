import { describe, expect, test } from "bun:test";
import { buildMobileHomePayload, mobileSchoolDayStatus } from "./home";

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
      points: {
        settings: {
          singularName: "point",
          pluralName: "points",
        },
        summary: {
          totalBalance: 12,
        },
      },
      now: new Date("2026-09-02T12:00:00.000Z"),
      calendar: {
        timeZone: "UTC",
        recurringDaysOff: [0, 6],
        holidays: [],
        activityDates: [],
        streak: {
          mode: "daily",
          timeZone: "UTC",
          currentCount: 4,
          longestCount: 6,
          lastActiveAt: "2026-09-01",
          currentPeriodLabel: "2026-09-02",
          currentPeriodPaused: false,
          currentPeriodCompleted: false,
          pausedWeekdays: [0, 6],
          pausedWeeks: [],
        },
      },
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
      students: [{
        id: "student-1",
        firstName: "Maya",
        avatarUrl: null,
        gradeLevel: 3,
        currentPoints: 12,
        pointSingularName: "point",
        pointPluralName: "points",
      }],
      selectedProfileId: "student-1",
      schoolDay: {
        isSchoolDay: true,
        dayOffReason: null,
      },
      streak: {
        mode: "daily",
        currentCount: 4,
        longestCount: 6,
        currentPeriodPaused: false,
        currentPeriodCompleted: false,
        showWarning: true,
      },
      nextWeek: {
        id: "week-2",
        weekNumber: 2,
        title: "Week 2",
        downloaded: true,
      },
    });
  });

  test("recognizes a calendar exception as a day off", () => {
    expect(mobileSchoolDayStatus({
      timeZone: "America/New_York",
      recurringDaysOff: [0, 6],
      holidays: [{
        id: "break-1",
        label: "Autumn break",
        exceptionKind: "school_break",
        startDate: "2026-09-02",
        endDate: "2026-09-03",
      }],
      activityDates: [],
      streak: {
        mode: "daily",
        timeZone: "America/New_York",
        currentCount: 4,
        longestCount: 6,
        lastActiveAt: "2026-09-01",
        currentPeriodLabel: "2026-09-02",
        currentPeriodPaused: true,
        currentPeriodCompleted: false,
        pausedWeekdays: [0, 6],
        pausedWeeks: [],
      },
    }, new Date("2026-09-02T16:00:00.000Z"))).toEqual({
      isSchoolDay: false,
      dayOffReason: "Autumn break",
    });
  });
});
