import { describe, expect, test } from "bun:test";
import { dateKeyInTimeZone, formatDateTimeInTimeZone } from "./date-time";

const timestamp = "2026-07-25T02:07:17.196Z";

describe("formatDateTimeInTimeZone", () => {
  test("renders point activity in the configured local timezone", () => {
    const local = formatDateTimeInTimeZone(timestamp, "Asia/Tokyo");
    expect(local).toContain("11:07");
    expect(local).toContain("Japan Time");
    expect(local).not.toContain("2:07 AM");
  });

  test("falls back safely when a stored timezone is invalid", () => {
    const fallback = formatDateTimeInTimeZone(timestamp, "not/a-timezone");
    expect(fallback).toContain("2:07");
  });
});

describe("dateKeyInTimeZone", () => {
  test("uses the configured local calendar day", () => {
    const instant = "2026-09-10T15:30:00.000Z";

    expect(dateKeyInTimeZone(instant, "Asia/Tokyo")).toBe("2026-09-11");
    expect(dateKeyInTimeZone(instant, "America/Los_Angeles")).toBe("2026-09-10");
  });
});
