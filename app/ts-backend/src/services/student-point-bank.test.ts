import { describe, expect, test } from "bun:test";
import {
  bankAccrualDateKeys,
  calculateBankInterest,
  dateKeyInTimeZone,
  normalizeBankCompoundingInterval,
  normalizeBankInterestBasisPoints,
  pointsFromMicropoints
} from "./student-point-bank";

describe("student point bank", () => {
  test("uses the student's local calendar date", () => {
    const instant = new Date("2026-08-09T15:30:00.000Z");
    expect(dateKeyInTimeZone(instant, "Asia/Tokyo")).toBe("2026-08-10");
    expect(dateKeyInTimeZone(instant, "America/Los_Angeles")).toBe("2026-08-09");
  });

  test("returns each unprocessed date once", () => {
    expect(bankAccrualDateKeys({
      lastAccrualDate: "2026-08-07",
      throughDate: "2026-08-10",
      interval: "daily",
      anchorDay: 7
    })).toEqual(["2026-08-08", "2026-08-09", "2026-08-10"]);
  });

  test("supports weekly and anchored monthly compounding", () => {
    expect(bankAccrualDateKeys({
      lastAccrualDate: "2026-08-01",
      throughDate: "2026-08-31",
      interval: "weekly",
      anchorDay: 1
    })).toEqual(["2026-08-08", "2026-08-15", "2026-08-22", "2026-08-29"]);
    expect(bankAccrualDateKeys({
      lastAccrualDate: "2026-01-31",
      throughDate: "2026-04-30",
      interval: "monthly",
      anchorDay: 31
    })).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  test("carries fractional interest until a whole point can be posted", () => {
    let state = { balance: 25, remainderMicropoints: 0 };
    for (let day = 0; day < 3; day += 1) {
      const result = calculateBankInterest({
        ...state,
        interestRateBasisPoints: 100
      });
      state = {
        balance: result.nextBalance,
        remainderMicropoints: result.nextRemainderMicropoints
      };
      expect(result.awardedPoints).toBe(0);
    }
    const fourthDay = calculateBankInterest({
      ...state,
      interestRateBasisPoints: 100
    });
    expect(fourthDay.awardedPoints).toBe(1);
    expect(fourthDay.nextBalance).toBe(26);
    expect(fourthDay.nextRemainderMicropoints).toBeGreaterThan(0);
  });

  test("presents fractional daily interest without losing micropoint precision", () => {
    expect(pointsFromMicropoints(700_000)).toBe(0.7);
    expect(pointsFromMicropoints(1_385_000)).toBe(1.385);
  });

  test("compounds already-posted interest", () => {
    const firstDay = calculateBankInterest({
      balance: 100,
      remainderMicropoints: 0,
      interestRateBasisPoints: 100
    });
    const secondDay = calculateBankInterest({
      balance: firstDay.nextBalance,
      remainderMicropoints: firstDay.nextRemainderMicropoints,
      interestRateBasisPoints: 100
    });
    expect(firstDay.awardedPoints).toBe(1);
    expect(secondDay.interestMicropoints).toBe(1_010_000);
    expect(secondDay.awardedPoints).toBe(1);
    expect(secondDay.nextRemainderMicropoints).toBe(10_000);
  });

  test("validates a configurable percentage rate", () => {
    expect(normalizeBankInterestBasisPoints(1)).toBe(100);
    expect(normalizeBankInterestBasisPoints(0.01)).toBe(1);
    expect(normalizeBankCompoundingInterval("weekly")).toBe("weekly");
    expect(() => normalizeBankInterestBasisPoints(10.01)).toThrow();
  });
});
