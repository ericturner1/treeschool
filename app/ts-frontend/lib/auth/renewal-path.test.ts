import { describe, expect, test } from "bun:test";
import {
  authRenewalPathFor,
  safeAuthRenewalReturnPath
} from "./renewal-path";

describe("authentication renewal paths", () => {
  test("preserves the protected path and query string", () => {
    expect(
      authRenewalPathFor(
        new URL("https://www.treehomeschool.com/p/student/gajou/lesson-plan?week=4")
      )
    ).toBe(
      "/auth/renew?next=%2Fp%2Fstudent%2Fgajou%2Flesson-plan%3Fweek%3D4"
    );
  });

  test("does not allow an external redirect", () => {
    expect(safeAuthRenewalReturnPath("//example.com")).toBe("/p/dashboard");
    expect(safeAuthRenewalReturnPath("https://example.com")).toBe("/p/dashboard");
    expect(safeAuthRenewalReturnPath("/p/dashboard")).toBe("/p/dashboard");
  });
});
