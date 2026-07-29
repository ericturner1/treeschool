import { describe, expect, test } from "bun:test";
import {
  isPublicAnalyticsPath,
  requiresPriorAnalyticsConsent,
  shouldEnablePublicAnalytics
} from "./public-routes";

describe("public analytics route policy", () => {
  test("allows public marketing and product pages", () => {
    expect(isPublicAnalyticsPath("/")).toBe(true);
    expect(isPublicAnalyticsPath("/pricing")).toBe(true);
    expect(isPublicAnalyticsPath("/bookstore")).toBe(true);
    expect(isPublicAnalyticsPath("/bookstore/reading-level-d")).toBe(true);
    expect(isPublicAnalyticsPath("/blog/how-to-start-homeschooling")).toBe(true);
    expect(isPublicAnalyticsPath("/first-grade-homeschool-curriculum")).toBe(true);
    expect(isPublicAnalyticsPath("/offers/us/first-grade-japanese")).toBe(true);
  });

  test("blocks private, identifying, authentication, and admin pages", () => {
    expect(isPublicAnalyticsPath("/p/dashboard")).toBe(false);
    expect(isPublicAnalyticsPath("/p/student/gajou/lesson-plan")).toBe(false);
    expect(isPublicAnalyticsPath("/admin/workbooks")).toBe(false);
    expect(isPublicAnalyticsPath("/signin")).toBe(false);
    expect(isPublicAnalyticsPath("/auth/confirm")).toBe(false);
    expect(isPublicAnalyticsPath("/q/weekly-plan-id/1")).toBe(false);
    expect(isPublicAnalyticsPath("/student/classroom")).toBe(false);
  });

  test("only enables collection on the production hostname", () => {
    expect(shouldEnablePublicAnalytics("/pricing", "www.treehomeschool.com")).toBe(true);
    expect(shouldEnablePublicAnalytics("/pricing", "treehomeschool.com")).toBe(true);
    expect(shouldEnablePublicAnalytics("/pricing", "dev.treehomeschool.com")).toBe(false);
    expect(shouldEnablePublicAnalytics("/pricing", "localhost")).toBe(false);
    expect(shouldEnablePublicAnalytics("/p/dashboard", "www.treehomeschool.com")).toBe(false);
  });

  test("requires opt-in for UK, EEA, and Swiss visitors only", () => {
    expect(requiresPriorAnalyticsConsent("GB")).toBe(true);
    expect(requiresPriorAnalyticsConsent("DE")).toBe(true);
    expect(requiresPriorAnalyticsConsent("CH")).toBe(true);
    expect(requiresPriorAnalyticsConsent("US")).toBe(false);
    expect(requiresPriorAnalyticsConsent("CA")).toBe(false);
    expect(requiresPriorAnalyticsConsent("AU")).toBe(false);
    expect(requiresPriorAnalyticsConsent(null)).toBe(true);
  });
});
