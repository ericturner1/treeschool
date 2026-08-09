import { describe, expect, test } from "bun:test";
import { averageWithExtraCredit, resolveExtraCreditSubjectKey } from "./grade-average";

describe("grade averages with extra credit", () => {
  test("adds bonus points without adding another denominator entry", () => {
    expect(averageWithExtraCredit([80, 90], [5])).toBe(88);
  });

  test("does not establish a grade from extra credit alone", () => {
    expect(averageWithExtraCredit([], [10])).toBeNull();
  });

  test("caps the displayed average at 100", () => {
    expect(averageWithExtraCredit([100], [20])).toBe(100);
  });

  test("matches typed other-work subjects to an existing system subject", () => {
    expect(resolveExtraCreditSubjectKey(
      { subjectKey: "custom:math", subjectLabel: "Math" },
      [{ subjectKey: "system:math-id", subjectLabel: "MATH" }]
    )).toBe("system:math-id");
  });
});
