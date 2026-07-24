import { describe, expect, test } from "bun:test";
import { nativeWorkbookErrorReference } from "./native-workbooks";

describe("native workbook processing errors", () => {
  test("creates a short support reference without exposing internal details", () => {
    expect(nativeWorkbookErrorReference("3b463b20-44a8-45a3-8af8-f79ce1cbf7f5"))
      .toBe("NW-3B463B20");
  });
});
