import { describe, expect, test } from "bun:test";
import {
  continuingWeekAction,
  shouldPromptForWeeklyPlanDownload
} from "./student-overview-next-action";

describe("student overview next action", () => {
  test("prompts for a genuinely untouched week", () => {
    expect(shouldPromptForWeeklyPlanDownload({
      weekStatus: "planned",
      progressPercent: 0,
      hasDownloadRecord: false
    })).toBe(true);
  });

  test("continues an in-progress historical week even when its download event is absent", () => {
    expect(shouldPromptForWeeklyPlanDownload({
      weekStatus: "in_progress",
      progressPercent: 0,
      hasDownloadRecord: false
    })).toBe(false);
    expect(continuingWeekAction({ weekNumber: 4, progressPercent: 0 }).label)
      .toBe("Continue working on Week 4");
  });

  test("continues when a download or lesson progress is recorded", () => {
    expect(shouldPromptForWeeklyPlanDownload({
      weekStatus: "planned",
      progressPercent: 0,
      hasDownloadRecord: true
    })).toBe(false);
    expect(shouldPromptForWeeklyPlanDownload({
      weekStatus: "planned",
      progressPercent: 25,
      hasDownloadRecord: false
    })).toBe(false);
  });
});
