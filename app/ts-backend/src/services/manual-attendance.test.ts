import { describe, expect, test } from "bun:test";
import { normalizeManualAttendanceFields } from "./manual-attendance";

describe("manual attendance editing", () => {
  test("normalizes every parent-editable field", () => {
    expect(normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "field_trip",
      masterSubjectKey: "master_subject:us:science",
      title: "  Visited the natural history museum  ",
      notes: "  Studied dinosaur fossils.  ",
      minutes: 90,
      extraCreditPoints: 5
    })).toEqual({
      attendanceDate: "2026-07-27",
      activityType: "field_trip",
      masterSubjectKey: "master_subject:us:science",
      curriculumAreaKey: null,
      customElectiveId: null,
      customElectiveName: null,
      subjectLabel: null,
      title: "Visited the natural history museum",
      notes: "Studied dinosaur fossils.",
      minutes: 90,
      extraCreditPoints: 5
    });
  });

  test("accepts a stable workbook master subject", () => {
    expect(normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "subject",
      masterSubjectKey: "master_subject:japan:kokugo",
      title: "Kanji practice",
    })).toMatchObject({
      masterSubjectKey: "master_subject:japan:kokugo",
      curriculumAreaKey: null,
      customElectiveId: null,
      customElectiveName: null,
      subjectLabel: null,
    });
  });

  test("accepts either an existing or a newly named custom elective", () => {
    expect(normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "subject",
      customElectiveId: "1aab2716-a14d-4aa3-98cb-7dd0076fa2d1",
      title: "Piano practice"
    })).toMatchObject({
      curriculumAreaKey: null,
      masterSubjectKey: null,
      customElectiveId: "1aab2716-a14d-4aa3-98cb-7dd0076fa2d1",
      customElectiveName: null,
      subjectLabel: null
    });
    expect(normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "subject",
      customElectiveName: "  Piano  ",
      title: "Piano practice"
    })).toMatchObject({
      curriculumAreaKey: null,
      masterSubjectKey: null,
      customElectiveId: null,
      customElectiveName: "Piano",
      subjectLabel: "Piano"
    });
  });

  test("rejects ambiguous or invalid custom elective choices", () => {
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "subject",
      curriculumAreaKey: "arts_and_music",
      customElectiveName: "Piano",
      title: "Piano practice"
    })).toThrow("Choose one subject");
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "subject",
      masterSubjectKey: "master_subject:japan:kokugo",
      customElectiveName: "Piano",
      title: "Piano practice"
    })).toThrow("Choose one subject");
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "subject",
      masterSubjectKey: "not-a-master-subject",
      title: "Learning"
    })).toThrow("Choose a valid workbook subject");
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "subject",
      customElectiveId: "not-an-id",
      title: "Piano practice"
    })).toThrow("Choose a valid custom elective");
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "subject",
      customElectiveName: "  ",
      title: "Piano practice"
    })).toThrow("Add a name for the custom elective");
  });

  test("uses Other when an older client omits the subject area", () => {
    expect(normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "other",
      subjectLabel: " ",
      title: "Independent learning",
      notes: "",
      minutes: null
    })).toMatchObject({
      curriculumAreaKey: "other",
      subjectLabel: "Other",
      notes: null,
      minutes: null,
      extraCreditPoints: null
    });
  });

  test("maps legacy subject labels and requires valid whole-number extra credit", () => {
    expect(normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "project",
      subjectLabel: "Math",
      title: "Math game",
      extraCreditPoints: 5
    })).toMatchObject({
      curriculumAreaKey: "mathematics",
      subjectLabel: "Mathematics"
    });
    expect(() => normalizeManualAttendanceFields({
      attendanceDate: "2026-07-27",
      activityType: "project",
      curriculumAreaKey: "science",
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
