import { describe, expect, test } from "bun:test";
import { frequentPointReasons } from "./reasons";

describe("point reason choices", () => {
  test("ranks prior award and redemption reasons independently", () => {
    const transactions = [
      { kind: "award", amount: 2, reason: "Great effort", reversed: false },
      { kind: "award", amount: 1, reason: "Great effort", reversed: false },
      { kind: "award", amount: 1, reason: "Finished reading", reversed: false },
      { kind: "redeem", amount: -3, reason: "Extra play time", reversed: false },
      { kind: "redeem", amount: -2, reason: "Extra play time", reversed: true },
    ];

    expect(frequentPointReasons(transactions, "award")).toEqual([
      "Great effort",
      "Finished reading",
    ]);
    expect(frequentPointReasons(transactions, "redeem")).toEqual(["Extra play time"]);
  });
});
