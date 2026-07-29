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
      minutes: 90
    })).toEqual({
      attendanceDate: "2026-07-27",
      activityType: "field_trip",
      subjectLabel: "Science",
      title: "Visited the natural history museum",
      notes: "Studied dinosaur fossils.",
      minutes: 90
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
      minutes: null
    });
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
