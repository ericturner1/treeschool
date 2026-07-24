import { describe, expect, test } from "bun:test";
import { calculateSchoolYearPacing } from "./school-year-pacing";

describe("calculateSchoolYearPacing", () => {
  test("reports no expected work before the school year begins", () => {
    expect(calculateSchoolYearPacing({
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      scheduledTeachingDays: 180,
      completedTeachingDays: 0,
      teachingDaysPerWeek: 5,
      today: "2026-03-15"
    }))?.toMatchObject({ status: "before_start", expectedTeachingDays: 0, behindTeachingDays: 0 });
  });

  test("uses completed teaching days to report how far behind a student is", () => {
    const pacing = calculateSchoolYearPacing({
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      scheduledTeachingDays: 180,
      completedTeachingDays: 35,
      teachingDaysPerWeek: 5,
      today: "2026-07-17"
    });

    expect(pacing).toMatchObject({
      status: "behind",
      expectedTeachingDays: 53,
      completedTeachingDays: 35,
      behindTeachingDays: 18,
      behindWeeks: 3.6
    });
  });

  test("recognizes progress ahead of the proportional school-year pace", () => {
    expect(calculateSchoolYearPacing({
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      scheduledTeachingDays: 180,
      completedTeachingDays: 70,
      teachingDaysPerWeek: 5,
      today: "2026-07-17"
    }))?.toMatchObject({ status: "ahead", aheadTeachingDays: 17, behindTeachingDays: 0 });
  });
});
