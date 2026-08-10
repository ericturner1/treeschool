import { expect, test } from "bun:test";
import { sanitizeBlogHtml } from "./blog";

test("removes executable markup from stored blog HTML", () => {
  const sanitized = sanitizeBlogHtml([
    '<p onclick="alert(1)">Safe text</p>',
    '<script>alert(2)</script>',
    '<a href="javascript:alert(3)">bad link</a>',
    '<img src="data:text/html,boom" onerror="alert(4)">'
  ].join(""));

  expect(sanitized).toContain("<p>Safe text</p>");
  expect(sanitized).not.toContain("onclick");
  expect(sanitized).not.toContain("<script");
  expect(sanitized).not.toContain("javascript:");
  expect(sanitized).not.toContain("onerror");
  expect(sanitized).not.toContain("data:text/html");
});
