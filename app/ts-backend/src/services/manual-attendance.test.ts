import { describe, expect, test } from "bun:test";
import { normalizeManualAttendanceFields } from "./manual-attendance";

describe("manual attendance editing", () => {
  test("normalizes every parent-editable field", () => {
    expect(normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "field_trip",
      subjectLabel: "  Science  ",
      title: "  Visited the natural history museum  ",
      notes: "  Studied dinosaur fossils.  ",
      minutes: 90,
      extraCreditPoints: 5
    })).toEqual({
      attendanceDate: "2026-07-27",
      activityType: "field_trip",
      subjectLabel: "Science",
      title: "Visited the natural history museum",
      notes: "Studied dinosaur fossils.",
      minutes: 90,
      extraCreditPoints: 5
    });
  });

  test("allows optional fields to be cleared", () => {
    expect(normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "other",
      subjectLabel: " ",
      title: "Independent learning",
      notes: "",
      minutes: null
    })).toMatchObject({
      subjectLabel: null,
      notes: null,
      minutes: null,
      extraCreditPoints: null
    });
  });

  test("requires a subject and valid whole-number points for extra credit", () => {
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "project",
      title: "Science fair display",
      extraCreditPoints: 5
    })).toThrow("Choose a subject before adding extra credit.");
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "project",
      subjectLabel: "Science",
      title: "Science fair display",
      extraCreditPoints: 2.5
    })).toThrow("Extra credit must be a whole number");
  });

  test("rejects invalid dates, activity types, and minutes", () => {
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-02-31",
      activityType: "other",
      title: "Learning",
      minutes: null
    })).toThrow("Choose a valid learning date.");
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "lesson",
      title: "Learning",
      minutes: null
    })).toThrow("Choose a valid learning activity type.");
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "other",
      title: "Learning",
      minutes: 14.5
    })).toThrow("Minutes must be a whole number");
  });
});
