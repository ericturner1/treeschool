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

test("keeps only approved blog font classes", () => {
  const sanitized = sanitizeBlogHtml([
    '<p><span class="blog-font-comic">Friendly type</span></p>',
    '<p><span class="blog-font-open-sans">Readable type</span></p>',
    '<p><span class="blog-font-source-sans">Editorial type</span></p>',
    '<p><span class="blog-font-lato">Warm type</span></p>',
    '<p><span class="blog-font-merriweather">Serif type</span></p>',
    '<p><span class="untrusted-font" style="font-family:evil">Untrusted type</span></p>'
  ].join(""));

  expect(sanitized).toContain('<span class="blog-font-comic">Friendly type</span>');
  expect(sanitized).toContain('<span class="blog-font-open-sans">Readable type</span>');
  expect(sanitized).toContain('<span class="blog-font-source-sans">Editorial type</span>');
  expect(sanitized).toContain('<span class="blog-font-lato">Warm type</span>');
  expect(sanitized).toContain('<span class="blog-font-merriweather">Serif type</span>');
  expect(sanitized).not.toContain("untrusted-font");
  expect(sanitized).not.toContain("font-family:evil");
});

test("keeps underline formatting in stored blog HTML", () => {
  expect(sanitizeBlogHtml("<p>Read the <u>important part</u>.</p>"))
    .toBe("<p>Read the <u>important part</u>.</p>");
});

test("keeps branded blog CTAs while removing unapproved CTA markup", () => {
  const sanitized = sanitizeBlogHtml([
    '<aside class="blog-cta blog-cta--sage evil-class" onclick="alert(1)">',
    '<p class="blog-cta__message">Ready to begin?</p>',
    '<a class="blog-cta__button evil-button" href="/pricing">See plans</a>',
    '</aside>',
    '<aside class="unknown-callout"><a class="unknown-button" href="javascript:alert(2)">Bad</a></aside>'
  ].join(""));

  expect(sanitized).toContain('<aside class="blog-cta blog-cta--sage">');
  expect(sanitized).toContain('<p class="blog-cta__message">Ready to begin?</p>');
  expect(sanitized).toContain('<a class="blog-cta__button" href="/pricing">See plans</a>');
  expect(sanitized).not.toContain("onclick");
  expect(sanitized).not.toContain("evil-class");
  expect(sanitized).not.toContain("evil-button");
  expect(sanitized).not.toContain("javascript:");
  expect(sanitized).not.toContain("unknown-callout");
  expect(sanitized).not.toContain("unknown-button");
});
