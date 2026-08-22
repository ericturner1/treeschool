"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, ReactNode, UIEvent } from "react";
import { FUNNEL_BUTTON_ICON_OPTIONS, FunnelButtonIconGlyph } from "../../../../components/funnel-button-icon";
import type { BlogCategory, BlogPost } from "../../../../lib/blog/server";
import type { FunnelButtonIcon } from "../../../../lib/funnels/page-document";
import {
  generateBlogDraftAction,
  saveBlogPostAction,
  unpublishBlogPostAction,
} from "../actions";
import { DeleteBlogPostButton } from "./delete-blog-post-button";

/**
 * Mirrors the server allowlist in ts-backend/src/services/blog.ts (sanitizeBlogHtml).
 * Keep the two in sync: anything the editor keeps but the server strips will silently
 * disappear on save, which is exactly the paste-then-save mismatch this guards against.
 */
const EDITOR_ALLOWED_TAGS = new Set([
  "P", "H2", "H3", "H4", "UL", "OL", "LI", "STRONG", "EM", "U", "A",
  "BLOCKQUOTE", "CODE", "PRE", "HR", "BR", "FIGURE", "FIGCAPTION", "IMG", "SPAN", "ASIDE",
]);

const BLOG_FONT_OPTIONS = [
  { label: "Page default", marker: "treeschool-default", className: "blog-font-default" },
  { label: "Treeschool Sans", marker: "treeschool-sans", className: "blog-font-sans" },
  { label: "Comic Neue", marker: "treeschool-comic", className: "blog-font-comic" },
  { label: "Open Sans", marker: "treeschool-open-sans", className: "blog-font-open-sans" },
  { label: "Source Sans 3", marker: "treeschool-source-sans", className: "blog-font-source-sans" },
  { label: "Lato", marker: "treeschool-lato", className: "blog-font-lato" },
  { label: "Merriweather", marker: "treeschool-merriweather", className: "blog-font-merriweather" },
  { label: "Georgia", marker: "treeschool-georgia", className: "blog-font-georgia" },
  { label: "Arial", marker: "treeschool-arial", className: "blog-font-arial" },
  { label: "Verdana", marker: "treeschool-verdana", className: "blog-font-verdana" },
  { label: "Times New Roman", marker: "treeschool-times", className: "blog-font-times" },
] as const;

const BLOG_FONT_CLASSES = new Set<string>(BLOG_FONT_OPTIONS.map((option) => option.className));
const BLOG_CTA_ICON_CLASSES = new Set<string>(
  FUNNEL_BUTTON_ICON_OPTIONS
    .filter((option) => option.value !== "none")
    .map((option) => `blog-cta__icon--${option.value}`),
);
const BLOG_CTA_ICON_POSITION_CLASSES = new Set([
  "blog-cta__icon-left",
  "blog-cta__icon-right",
]);

const EDITOR_ALLOWED_CLASSES: Record<string, Set<string>> = {
  ASIDE: new Set([
    "blog-cta",
    "blog-cta--sage",
    "blog-cta--earth",
    "blog-cta--sunny",
    "blog-cta--button-only",
  ]),
  P: new Set(["blog-cta__message", ...BLOG_FONT_CLASSES]),
  A: new Set(["blog-cta__button", ...BLOG_FONT_CLASSES, ...BLOG_CTA_ICON_POSITION_CLASSES]),
  SPAN: new Set([...BLOG_FONT_CLASSES, "blog-cta__icon", ...BLOG_CTA_ICON_CLASSES]),
};

const DEFAULT_BLOG_FONT_SIZE_PX = 17.25;
const DEFAULT_BLOG_LINE_HEIGHT = 1.85;

type BlogFontMarker = (typeof BLOG_FONT_OPTIONS)[number]["marker"];
type BlogBlockStyle = "p" | "h2" | "h3" | "blockquote";
type BlogCtaTheme = "sage" | "earth" | "sunny";
type BlogCtaIcon = FunnelButtonIcon | "none";
type BlogCtaIconPosition = "left" | "right";

const BLOG_CTA_ICON_GLYPHS: Partial<Record<FunnelButtonIcon, string>> = {
  "arrow-right": "→", "arrow-left": "←", "arrow-up": "↑", "arrow-down": "↓",
  "chevron-right": "›", "chevron-left": "‹", "chevron-up": "⌃", "chevron-down": "⌄",
  check: "✓", plus: "+", minus: "−", info: "ⓘ", "help-circle": "?", "alert-triangle": "⚠",
  "shopping-cart": "🛒", download: "↓", "book-open": "📖", star: "★", sparkles: "✨",
  lock: "🔒", play: "▶", mail: "✉", gift: "🎁", heart: "♥", calendar: "▣",
  "external-link": "↗", phone: "☎", "map-pin": "⌖", clock: "◷", user: "●", users: "●●",
  home: "⌂", globe: "◎", search: "⌕", settings: "⚙", wand: "✦", rocket: "🚀",
  trophy: "🏆", "graduation-cap": "🎓", music: "♪", camera: "📷", image: "▧",
  "file-text": "▤", printer: "▣", share: "↗", refresh: "↻", "thumbs-up": "👍",
  smile: "☺", circle: "●", zap: "⚡", flame: "🔥", sun: "☀", moon: "☾", leaf: "◆",
  menu: "☰", "log-in": "↪", upload: "↑", save: "▣", copy: "⧉", edit: "✎", trash: "⌫",
  eye: "◉", "credit-card": "▭", tag: "◇", percent: "%", "dollar-sign": "$", package: "□",
  pencil: "✎", lightbulb: "💡", headphones: "🎧", video: "▶", microphone: "🎙", bell: "🔔",
  "message-circle": "💬",
};

function blogFontClass(marker: string) {
  return BLOG_FONT_OPTIONS.find((option) => option.marker === marker)?.className
    ?? BLOG_FONT_OPTIONS[0].className;
}

function blogFontMarker(element: Element | null) {
  if (!element) return BLOG_FONT_OPTIONS[0].marker;
  return BLOG_FONT_OPTIONS.find((option) => element.classList.contains(option.className))?.marker
    ?? BLOG_FONT_OPTIONS[0].marker;
}

function blogCtaIconGlyph(icon: FunnelButtonIcon) {
  return BLOG_CTA_ICON_GLYPHS[icon] ?? "•";
}

function blogCtaIconFromLink(link: Element | null): BlogCtaIcon {
  const icon = link?.querySelector(".blog-cta__icon");
  if (!icon) return "none";
  const option = FUNNEL_BUTTON_ICON_OPTIONS.find(
    (candidate) => candidate.value !== "none" && icon.classList.contains(`blog-cta__icon--${candidate.value}`),
  );
  return option?.value ?? "none";
}

function isSafeCtaHref(value: string) {
  const href = value.trim();
  if ((href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#")) return true;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function blockStyleAtSelectionStart(editor: HTMLDivElement, range: Range): BlogBlockStyle {
  let node: Node | null = range.startContainer;
  if (node === editor && range.startOffset < editor.childNodes.length) {
    node = editor.childNodes[range.startOffset] ?? node;
  }
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = (node as Element).tagName.toLowerCase();
      if (tagName === "h2" || tagName === "h3" || tagName === "blockquote") {
        return tagName;
      }
    }
    node = node.parentNode;
  }

  return "p";
}

/**
 * h1 -> h2 because the article template already renders the post title as the page's
 * only <h1>. The server unwraps b/i entirely, so promote them to their semantic
 * equivalents before they reach it.
 */
const EDITOR_TAG_REMAP: Record<string, string> = {
  H1: "H2",
  B: "STRONG",
  I: "EM",
};

const EDITOR_KEEP_ATTRS: Record<string, string[]> = {
  A: ["href", "title", "target", "rel", "class"],
  IMG: ["src", "alt", "title", "width", "height", "loading"],
  SPAN: ["class", "aria-hidden"],
  ASIDE: ["class"],
  P: ["class"],
};

/**
 * Reduces clipboard HTML to the same shape the server will accept, so that what the
 * editor displays after a paste is what actually gets stored. Browsers put heavily
 * inline-styled markup on the clipboard when copying rendered pages; without this the
 * editor renders that pasted CSS and the styling vanishes on the next save.
 */
export function normalizePastedHtml(dirty: string): string {
  const doc = new DOMParser().parseFromString(dirty, "text/html");

  const clean = (parent: Node) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }

      const element = child as Element;
      clean(element); // depth-first, so children are settled before the parent moves

      const mapped = EDITOR_TAG_REMAP[element.tagName] ?? element.tagName;

      if (!EDITOR_ALLOWED_TAGS.has(mapped)) {
        element.replaceWith(...element.childNodes); // unwrap, keep the text
        continue;
      }

      let target = element;
      if (mapped !== element.tagName) {
        target = doc.createElement(mapped.toLowerCase());
        while (element.firstChild) target.appendChild(element.firstChild);
        element.replaceWith(target);
      }

      const keep = EDITOR_KEEP_ATTRS[target.tagName] ?? [];
      for (const attribute of [...target.attributes]) {
        if (!keep.includes(attribute.name)) target.removeAttribute(attribute.name);
      }

      if (EDITOR_ALLOWED_CLASSES[target.tagName]) {
        const allowedClasses = [...target.classList].filter((className) =>
          EDITOR_ALLOWED_CLASSES[target.tagName].has(className),
        );
        if (allowedClasses.length) {
          target.setAttribute("class", allowedClasses.join(" "));
        } else if (target.tagName === "SPAN") {
          target.replaceWith(...target.childNodes);
          continue;
        } else {
          target.removeAttribute("class");
        }
      }
    }
  };

  clean(doc.body);
  return doc.body.innerHTML;
}

function ToolbarButton({
  label,
  title,
  onClick,
  disabled = false,
}: {
  label: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border border-[#d8c7ad] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#f4ecdf] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {label}
    </button>
  );
}

function BulletedListIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="4" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="15" r="1" fill="currentColor" stroke="none" />
      <path d="M8 5h8M8 10h8M8 15h8" />
    </svg>
  );
}

function NumberedListIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 3.5h1v4M3.5 7.5h2M3.4 11.4c.3-.5.8-.8 1.3-.8.8 0 1.3.5 1.3 1.1 0 1.1-2.6 1.7-2.6 3.2H6M9 5h7M9 10h7M9 15h7" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.2 12.8 6.8 14.2a3 3 0 0 1-4.2-4.2l2.3-2.3a3 3 0 0 1 4.2 0M11.8 7.2l1.4-1.4a3 3 0 1 1 4.2 4.2l-2.3 2.3a3 3 0 0 1-4.2 0M7.2 12.8l5.6-5.6" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="3" width="15" height="14" rx="2" />
      <circle cx="7" cy="8" r="1.5" />
      <path d="m4.5 15 4-4 2.5 2.5 1.8-1.8 2.7 3.3" />
    </svg>
  );
}

function CtaIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <path d="M6 7.5h8M6 11h5M12.5 13.5h2.5" />
      <path d="m13.5 12.5 1.5 1-1.5 1" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7 6-3 3 3 3" />
      <path d="M4 9h7a5 5 0 0 1 5 5v1" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m13 6 3 3-3 3" />
      <path d="M16 9H9a5 5 0 0 0-5 5v1" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7 5-5 5 5 5M13 5l5 5-5 5M11.5 3 8.5 17" />
    </svg>
  );
}

function ReadingGlassesIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 7.5 4 5.5M17.5 7.5 16 5.5" />
      <circle cx="6" cy="10.5" r="3.25" />
      <circle cx="14" cy="10.5" r="3.25" />
      <path d="M9.25 10.25c.5-.45 1-.45 1.5 0" />
    </svg>
  );
}

type HtmlSyntaxKind = "plain" | "punctuation" | "tag" | "attribute" | "value" | "comment" | "entity";

type HtmlSyntaxToken = {
  kind: HtmlSyntaxKind;
  text: string;
};

const HTML_SYNTAX_COLORS: Record<HtmlSyntaxKind, string> = {
  plain: "#d8e2dc",
  punctuation: "#91a398",
  tag: "#ff9b72",
  attribute: "#82cfff",
  value: "#a8d882",
  comment: "#7f9287",
  entity: "#e7c66b",
};

function tokenizeHtmlTag(tag: string): HtmlSyntaxToken[] {
  if (tag.startsWith("<!--")) return [{ kind: "comment", text: tag }];
  if (/^<!/i.test(tag)) return [{ kind: "tag", text: tag }];

  const tokens: HtmlSyntaxToken[] = [];
  let cursor = 0;
  let foundTagName = false;
  while (cursor < tag.length) {
    const remainder = tag.slice(cursor);
    const punctuation = remainder.match(/^(?:<\/?|\/?>|=)/);
    if (punctuation) {
      tokens.push({ kind: "punctuation", text: punctuation[0] });
      cursor += punctuation[0].length;
      continue;
    }
    const whitespace = remainder.match(/^\s+/);
    if (whitespace) {
      tokens.push({ kind: "plain", text: whitespace[0] });
      cursor += whitespace[0].length;
      continue;
    }
    const quotedValue = remainder.match(/^(?:"[^"]*"|'[^']*')/);
    if (quotedValue) {
      tokens.push({ kind: "value", text: quotedValue[0] });
      cursor += quotedValue[0].length;
      continue;
    }
    const word = remainder.match(/^[A-Za-z_:][\w:.-]*/);
    if (word) {
      tokens.push({
        kind: foundTagName ? "attribute" : "tag",
        text: word[0],
      });
      foundTagName = true;
      cursor += word[0].length;
      continue;
    }
    tokens.push({ kind: "plain", text: remainder[0] });
    cursor += 1;
  }
  return tokens;
}

function tokenizeHtmlSource(source: string): HtmlSyntaxToken[] {
  const tokens: HtmlSyntaxToken[] = [];
  const markup = /<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>/g;
  let cursor = 0;
  for (const match of source.matchAll(markup)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      const text = source.slice(cursor, index);
      const textParts = text.split(/(&(?:#\d+|#x[\da-f]+|[a-z][\w-]*);)/gi);
      for (const part of textParts) {
        if (!part) continue;
        tokens.push({
          kind: /^&(?:#\d+|#x[\da-f]+|[a-z][\w-]*);$/i.test(part) ? "entity" : "plain",
          text: part,
        });
      }
    }
    tokens.push(...tokenizeHtmlTag(match[0]));
    cursor = index + match[0].length;
  }
  if (cursor < source.length) tokens.push({ kind: "plain", text: source.slice(cursor) });
  return tokens;
}

const HTML_BLOCK_TAGS = new Set([
  "blockquote", "figcaption", "figure", "h1", "h2", "h3", "h4", "hr", "li", "ol", "p", "pre", "ul",
]);

function formatHtmlSource(source: string) {
  let formatted = source.trim();
  const adjacentTags = /(<\/?([a-z][\w-]*)\b[^>]*>)\s*(<\/?([a-z][\w-]*)\b[^>]*>)/gi;

  // Add line breaks only at block-element boundaries. Inline elements retain
  // their exact spacing, so formatting source does not change prose such as
  // </strong><em> into a visible extra space.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = formatted.replace(adjacentTags, (boundary, left, leftName, right, rightName) => (
      HTML_BLOCK_TAGS.has(String(leftName).toLowerCase()) || HTML_BLOCK_TAGS.has(String(rightName).toLowerCase())
        ? `${left}\n${right}`
        : boundary
    ));
    if (next === formatted) break;
    formatted = next;
  }

  let depth = 0;
  return formatted.split("\n").map((rawLine) => {
    const line = rawLine.trim();
    if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
    const indented = `${"  ".repeat(depth)}${line}`;
    const opening = line.match(/^<([a-z][\w-]*)\b[^>]*>$/i);
    if (opening && HTML_BLOCK_TAGS.has(opening[1].toLowerCase()) && !/^<(?:hr)\b/i.test(line)) {
      depth += 1;
    }
    return indented;
  }).join("\n");
}

function HtmlSourceEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tokens = useMemo(() => tokenizeHtmlSource(value), [value]);
  const lineCount = value ? value.split("\n").length : 1;

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;
    onChange(nextValue);
    requestAnimationFrame(() => {
      input.selectionStart = start + 2;
      input.selectionEnd = start + 2;
    });
  };

  return (
    <div className="overflow-hidden rounded-[16px] border border-[#4d6254] bg-[#18211b] shadow-inner focus-within:border-[#8bb76b] focus-within:ring-4 focus-within:ring-[#7fa460]/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#202c24] px-4 py-2.5">
        <p className="font-mono text-xs text-[#9fb0a5]">
          Syntax highlighted · {lineCount} {lineCount === 1 ? "line" : "lines"}
        </p>
        <button
          type="button"
          onClick={() => {
            const formatted = formatHtmlSource(value);
            onChange(formatted);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
          className="rounded-[8px] border border-[#62786a] bg-[#29372e] px-3 py-1.5 text-xs font-bold text-[#dce8df] transition hover:border-[#9bc37e] hover:bg-[#344638]"
        >
          Format HTML
        </button>
      </div>
      <div className="grid min-h-[560px]">
        <pre
          ref={highlightRef}
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 m-0 min-h-[560px] overflow-hidden whitespace-pre p-5 font-mono text-[14px] leading-6"
          style={{ tabSize: 2 }}
        >
          <code>
            {tokens.map((token, index) => (
              <span key={`${index}:${token.kind}`} style={{ color: HTML_SYNTAX_COLORS[token.kind] }}>
                {token.text}
              </span>
            ))}
            {"\n"}
          </code>
        </pre>
        <textarea
          ref={textareaRef}
          aria-label="Article HTML source"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          wrap="off"
          spellCheck={false}
          className="z-10 col-start-1 row-start-1 min-h-[560px] w-full resize-y overflow-auto whitespace-pre border-0 bg-transparent p-5 font-mono text-[14px] leading-6 outline-none selection:bg-[#54765d]/75"
          style={{
            color: "transparent",
            caretColor: "#f6f2e9",
            tabSize: 2,
            WebkitTextFillColor: "transparent",
          }}
        />
      </div>
    </div>
  );
}

async function uploadError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error || fallback;
}

async function uploadBlogImage(postId: string, file: File) {
  const contentType = file.type.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new Error("Blog images may be up to 10 MB.");
  }
  const prepareResponse = await fetch("/api/blog/images/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId, contentType, sizeBytes: file.size }),
  });
  if (!prepareResponse.ok)
    throw new Error(
      await uploadError(prepareResponse, "Could not prepare the image upload."),
    );
  const prepared = (await prepareResponse.json()) as {
    objectPath: string;
    uploadUrl: string;
    contentType: string;
  };
  try {
    const uploadResponse = await fetch(prepared.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": prepared.contentType },
      body: file,
    });
    if (!uploadResponse.ok)
      throw new Error("The image could not be uploaded to storage.");
    const completeResponse = await fetch("/api/blog/images/upload", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, objectPath: prepared.objectPath }),
    });
    if (!completeResponse.ok)
      throw new Error(
        await uploadError(
          completeResponse,
          "Could not verify the uploaded image.",
        ),
      );
    return (await completeResponse.json()) as {
      objectPath: string;
      publicUrl: string;
    };
  } catch (error) {
    await fetch("/api/blog/images/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, objectPath: prepared.objectPath }),
    }).catch(() => undefined);
    throw error;
  }
}

function BlogFeaturedImageField({
  postId,
  initialUrl,
}: {
  postId: string;
  initialUrl: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialUrl ?? "");
  const [uploadedObjectPath, setUploadedObjectPath] = useState<string | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discardUpload = async (objectPath: string) => {
    await fetch("/api/blog/images/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, objectPath }),
    }).catch(() => undefined);
  };

  const upload = async (file: File) => {
    if (uploading) return;
    setError(null);
    setUploading(true);
    try {
      const completed = await uploadBlogImage(postId, file);
      if (uploadedObjectPath && uploadedObjectPath !== completed.objectPath)
        await discardUpload(uploadedObjectPath);
      setUploadedObjectPath(completed.objectPath);
      setImageUrl(completed.publicUrl);
    } catch (uploadFailure) {
      setError(
        uploadFailure instanceof Error
          ? uploadFailure.message
          : "Could not upload the image.",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = async () => {
    const stagedPath = uploadedObjectPath;
    setImageUrl("");
    setUploadedObjectPath(null);
    setError(null);
    if (stagedPath) await discardUpload(stagedPath);
  };

  return (
    <div>
      <input type="hidden" name="featuredImageUrl" value={imageUrl} readOnly />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-disabled={uploading}
        aria-busy={uploading}
        onClick={() => {
          if (!uploading) fileInputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (!uploading && ["Enter", " "].includes(event.key)) {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file && !uploading) void upload(file);
        }}
        className={`group relative flex aspect-[16/9] min-h-[120px] max-h-[170px] cursor-pointer items-center justify-center overflow-hidden rounded-[16px] border-2 border-dashed transition ${dragging ? "border-[#6f994f] bg-[#eef5e4]" : "border-[#cdb996] bg-white hover:border-[#7fa460] hover:bg-[#fbfdf8]"} ${uploading ? "cursor-wait opacity-80" : ""}`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Current featured image preview"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="px-4 text-center">
            <span
              aria-hidden="true"
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf2e1] text-xl text-[#567b40]"
            >
              ↑
            </span>
            <p className="mt-2 text-sm font-semibold">Drop a featured image here</p>
            <p className="mt-1 text-sm text-ink/52">
              or click to choose a file
            </p>
          </div>
        )}
        {imageUrl && !uploading ? (
          <div className="absolute inset-x-0 bottom-0 bg-black/55 px-4 py-3 text-center text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
            Click to replace image
          </div>
        ) : null}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-3 bg-[#fffaf2]/90 font-semibold">
            <span className="activity-spinner" aria-hidden="true" /> Uploading
            image…
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 text-ink/50">
          JPEG, PNG, or WebP · up to 10 MB
        </p>
        {imageUrl ? (
          <button
            type="button"
            onClick={() => void removeImage()}
            disabled={uploading}
            className="text-sm font-semibold text-[#8b3e2f] underline underline-offset-4 disabled:opacity-50"
          >
            Remove image
          </button>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[12px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function BlogEditor({
  post,
  availableCategories,
}: {
  post: BlogPost;
  availableCategories: BlogCategory[];
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const editingCtaRef = useRef<HTMLElement | null>(null);
  const initializedRevisionRef = useRef<number | null>(null);
  const [title, setTitle] = useState(post.revision.title);
  const [excerpt, setExcerpt] = useState(post.revision.excerpt);
  const [seoTitle, setSeoTitle] = useState(post.revision.seoTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(
    post.revision.metaDescription ?? "",
  );
  const [editorMode, setEditorMode] = useState<"visual" | "source">("visual");
  const [activeBlockStyle, setActiveBlockStyle] = useState<BlogBlockStyle>("p");
  const [sourceHtml, setSourceHtml] = useState(post.revision.contentHtml);
  const [bodyFontSizePx, setBodyFontSizePx] = useState<number | null>(
    post.revision.bodyFontSizePx,
  );
  const [bodyLineHeight, setBodyLineHeight] = useState<number | null>(
    post.revision.bodyLineHeight,
  );
  const [uploadingInlineImage, setUploadingInlineImage] = useState(false);
  const [inlineImageError, setInlineImageError] = useState<string | null>(null);
  const [ctaComposerOpen, setCtaComposerOpen] = useState(false);
  const [ctaMessage, setCtaMessage] = useState("Ready to make homeschooling simpler?");
  const [ctaButtonText, setCtaButtonText] = useState("See how Treeschool works");
  const [ctaHref, setCtaHref] = useState("/pricing");
  const [ctaTheme, setCtaTheme] = useState<BlogCtaTheme>("sage");
  const [ctaMessageFont, setCtaMessageFont] = useState<BlogFontMarker>(BLOG_FONT_OPTIONS[0].marker);
  const [ctaButtonFont, setCtaButtonFont] = useState<BlogFontMarker>(BLOG_FONT_OPTIONS[0].marker);
  const [ctaIcon, setCtaIcon] = useState<BlogCtaIcon>("none");
  const [ctaIconPosition, setCtaIconPosition] = useState<BlogCtaIconPosition>("right");
  const [ctaIconPickerOpen, setCtaIconPickerOpen] = useState(false);
  const [ctaIconSearch, setCtaIconSearch] = useState("");
  const [ctaError, setCtaError] = useState<string | null>(null);
  const selectedCategories = useMemo(
    () => new Set(post.categories.map((category) => category.name)),
    [post.categories],
  );

  const syncEditorHtml = () => {
    if (htmlInputRef.current)
      htmlInputRef.current.value = editorRef.current?.innerHTML ?? "";
  };

  const rememberEditorSelection = useCallback(() => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection?.rangeCount || !editor) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedSelectionRef.current = range.cloneRange();
    setActiveBlockStyle(blockStyleAtSelectionStart(editor, range));
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", rememberEditorSelection);
    return () => document.removeEventListener("selectionchange", rememberEditorSelection);
  }, [rememberEditorSelection]);

  const restoreEditorSelection = () => {
    const range = savedSelectionRef.current;
    const editor = editorRef.current;
    if (!range || !editor || !editor.contains(range.commonAncestorContainer)) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const attachEditor = useCallback(
    (node: HTMLDivElement | null) => {
      editorRef.current = node;
      if (
        node &&
        initializedRevisionRef.current !== post.revision.revisionNumber
      ) {
        node.innerHTML = post.revision.contentHtml;
        initializedRevisionRef.current = post.revision.revisionNumber;
        if (htmlInputRef.current)
          htmlInputRef.current.value = post.revision.contentHtml;
      }
    },
    [post.revision.contentHtml, post.revision.revisionNumber],
  );

  const command = (name: string, value?: string) => {
    editorRef.current?.focus();
    restoreEditorSelection();
    document.execCommand(name, false, value);
    syncEditorHtml();
    rememberEditorSelection();
  };

  const applyFont = (marker: string) => {
    const option = BLOG_FONT_OPTIONS.find((candidate) => candidate.marker === marker);
    const editor = editorRef.current;
    if (!option || !editor) return;
    editor.focus();
    restoreEditorSelection();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("fontName", false, option.marker);
    for (const font of editor.querySelectorAll("font[face]")) {
      const matched = BLOG_FONT_OPTIONS.find((candidate) => candidate.marker === font.getAttribute("face"));
      if (!matched) continue;
      const span = document.createElement("span");
      span.className = matched.className;
      span.replaceChildren(...font.childNodes);
      font.replaceWith(span);
    }
    syncEditorHtml();
    rememberEditorSelection();
  };

  const toggleSourceMode = () => {
    if (editorMode === "visual") {
      const currentHtml = editorRef.current?.innerHTML ?? "";
      const formattedHtml = formatHtmlSource(currentHtml);
      setSourceHtml(formattedHtml);
      if (htmlInputRef.current) htmlInputRef.current.value = formattedHtml;
      setEditorMode("source");
      return;
    }

    const cleanHtml = normalizePastedHtml(sourceHtml);
    if (editorRef.current) editorRef.current.innerHTML = cleanHtml;
    if (htmlInputRef.current) htmlInputRef.current.value = cleanHtml;
    setSourceHtml(cleanHtml);
    setEditorMode("visual");
    requestAnimationFrame(() => editorRef.current?.focus());
  };
  const addLink = () => {
    const href = window.prompt("Paste an internal path or a complete URL");
    if (href) command("createLink", href);
  };
  const closeCtaComposer = () => {
    editingCtaRef.current = null;
    setCtaIconPickerOpen(false);
    setCtaComposerOpen(false);
    setCtaError(null);
  };
  const openCtaComposer = () => {
    rememberEditorSelection();
    editingCtaRef.current = null;
    setCtaMessage("Ready to make homeschooling simpler?");
    setCtaButtonText("See how Treeschool works");
    setCtaHref("/pricing");
    setCtaTheme("sage");
    setCtaMessageFont(BLOG_FONT_OPTIONS[0].marker);
    setCtaButtonFont(BLOG_FONT_OPTIONS[0].marker);
    setCtaIcon("none");
    setCtaIconPosition("right");
    setCtaIconSearch("");
    setCtaError(null);
    setCtaComposerOpen(true);
  };
  const editCta = (cta: HTMLElement) => {
    const message = cta.querySelector(".blog-cta__message");
    const link = cta.querySelector<HTMLAnchorElement>(".blog-cta__button");
    const theme = cta.classList.contains("blog-cta--earth")
      ? "earth"
      : cta.classList.contains("blog-cta--sunny")
        ? "sunny"
        : "sage";
    editingCtaRef.current = cta;
    setCtaMessage(message?.textContent?.trim() ?? "");
    setCtaButtonText(
      [...(link?.childNodes ?? [])]
        .filter((node) => !(node.nodeType === Node.ELEMENT_NODE && (node as Element).classList.contains("blog-cta__icon")))
        .map((node) => node.textContent ?? "")
        .join("")
        .trim(),
    );
    setCtaHref(link?.getAttribute("href") ?? "/pricing");
    setCtaTheme(theme);
    setCtaMessageFont(blogFontMarker(message));
    setCtaButtonFont(blogFontMarker(link));
    setCtaIcon(blogCtaIconFromLink(link));
    setCtaIconPosition(link?.classList.contains("blog-cta__icon-left") ? "left" : "right");
    setCtaIconSearch("");
    setCtaError(null);
    setCtaComposerOpen(true);
  };
  const saveCta = () => {
    const editor = editorRef.current;
    const message = ctaMessage.trim();
    const buttonText = ctaButtonText.trim();
    const href = ctaHref.trim();
    if (!editor || !buttonText) {
      setCtaError("Add a button label.");
      return;
    }
    if (!isSafeCtaHref(href)) {
      setCtaError("Use an internal path such as /pricing or a complete http/https URL.");
      return;
    }

    const existingCta = editingCtaRef.current;
    const cta = existingCta ?? document.createElement("aside");
    cta.className = `blog-cta blog-cta--${ctaTheme}${message ? "" : " blog-cta--button-only"}`;
    cta.replaceChildren();
    if (message) {
      const messageElement = document.createElement("p");
      messageElement.className = `blog-cta__message ${blogFontClass(ctaMessageFont)}`;
      messageElement.textContent = message;
      cta.appendChild(messageElement);
    }
    const link = document.createElement("a");
    link.className = [
      "blog-cta__button",
      blogFontClass(ctaButtonFont),
      ...(ctaIcon === "none" ? [] : [`blog-cta__icon-${ctaIconPosition}`]),
    ].join(" ");
    link.href = href;
    const buttonLabel = document.createTextNode(buttonText);
    if (ctaIcon === "none") {
      link.appendChild(buttonLabel);
    } else {
      const icon = document.createElement("span");
      icon.className = `blog-cta__icon blog-cta__icon--${ctaIcon}`;
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = blogCtaIconGlyph(ctaIcon);
      if (ctaIconPosition === "left") link.append(icon, buttonLabel);
      else link.append(buttonLabel, icon);
    }
    cta.appendChild(link);

    if (!existingCta) {
      const nextParagraph = document.createElement("p");
      nextParagraph.appendChild(document.createElement("br"));
      const range = savedSelectionRef.current;
      let selectedBlock: Element | null = null;
      if (range && editor.contains(range.commonAncestorContainer)) {
        const selectionNode = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? range.commonAncestorContainer as Element
          : range.commonAncestorContainer.parentElement;
        selectedBlock = selectionNode?.closest("p,h2,h3,h4,ul,ol,blockquote,pre,figure,aside") ?? null;
        if (selectedBlock && !editor.contains(selectedBlock)) selectedBlock = null;
      }
      if (selectedBlock) selectedBlock.after(cta, nextParagraph);
      else editor.append(cta, nextParagraph);

      const caret = document.createRange();
      caret.selectNodeContents(nextParagraph);
      caret.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(caret);
      savedSelectionRef.current = caret.cloneRange();
    }
    syncEditorHtml();
    closeCtaComposer();
    editor.focus();
  };
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const html = event.clipboardData.getData("text/html");
    if (!html) return; // plain-text pastes carry no markup to clean
    event.preventDefault();
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, normalizePastedHtml(html));
    syncEditorHtml();
    rememberEditorSelection();
  };
  const chooseInlineImage = () => {
    rememberEditorSelection();
    setInlineImageError(null);
    inlineImageInputRef.current?.click();
  };
  const insertInlineImage = (publicUrl: string, alt: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = publicUrl;
    image.alt = alt;
    image.loading = "lazy";
    figure.appendChild(image);
    const nextParagraph = document.createElement("p");
    nextParagraph.appendChild(document.createElement("br"));
    const range = savedSelectionRef.current;
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(figure);
      figure.after(nextParagraph);
    } else {
      editor.append(figure, nextParagraph);
    }
    const caret = document.createRange();
    caret.selectNodeContents(nextParagraph);
    caret.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caret);
    savedSelectionRef.current = caret.cloneRange();
    editor.focus();
    syncEditorHtml();
  };
  const uploadInlineImage = async (file: File) => {
    if (uploadingInlineImage) return;
    setUploadingInlineImage(true);
    setInlineImageError(null);
    const filenameDescription = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim();
    const alt =
      window.prompt(
        "Briefly describe this image for readers using assistive technology.",
        filenameDescription,
      ) ?? filenameDescription;
    try {
      const completed = await uploadBlogImage(post.id, file);
      insertInlineImage(completed.publicUrl, alt.trim());
    } catch (uploadFailure) {
      setInlineImageError(
        uploadFailure instanceof Error
          ? uploadFailure.message
          : "Could not upload the image.",
      );
    } finally {
      setUploadingInlineImage(false);
      if (inlineImageInputRef.current) inlineImageInputRef.current.value = "";
    }
  };
  const slugPreview = post.slug || "article-slug";
  const searchTitle = seoTitle || title || "Article title";
  const searchDescription =
    metaDescription || excerpt || "Your article description will appear here.";
  const selectedCtaIconOption = FUNNEL_BUTTON_ICON_OPTIONS.find((option) => option.value === ctaIcon)
    ?? FUNNEL_BUTTON_ICON_OPTIONS[0];
  const matchingCtaIconOptions = FUNNEL_BUTTON_ICON_OPTIONS.filter((option) =>
    `${option.label} ${option.category}`.toLowerCase().includes(ctaIconSearch.trim().toLowerCase()),
  );
  const ctaIconCategories = ["General", "Navigation", "Actions", "Commerce", "Learning", "People"] as const;
  const submitBlogPost = async (formData: FormData) => {
    const contentHtml = editorMode === "source"
      ? normalizePastedHtml(sourceHtml)
      : editorRef.current?.innerHTML ?? "";
    formData.set("contentHtml", contentHtml);
    await saveBlogPostAction(formData);
  };

  return (
    <div className="space-y-7">
      <form action={submitBlogPost} className="space-y-7">
        <input type="hidden" name="postId" value={post.id} />
        <input
          ref={htmlInputRef}
          type="hidden"
          name="contentHtml"
          defaultValue={post.revision.contentHtml}
        />
        <input
          type="hidden"
          name="bodyFontSizePx"
          value={bodyFontSizePx ?? ""}
        />
        <input
          type="hidden"
          name="bodyLineHeight"
          value={bodyLineHeight ?? ""}
        />
        <section className="rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:p-7">
          <div className="grid gap-5">
            <label className="grid gap-2 text-sm font-semibold">
              Title
              <input
                name="title"
                required
                maxLength={180}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-h-14 rounded-[15px] border border-[#d7c3a3] bg-white px-4 text-lg font-semibold"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <label className="grid gap-2 text-sm font-semibold">
                URL slug
                <div className="flex min-h-14 items-center rounded-[15px] border border-[#d7c3a3] bg-white px-4">
                  <span className="text-ink/38">/blog/</span>
                  <input
                    name="slug"
                    required
                    defaultValue={post.slug}
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                </div>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Language
                <select
                  name="languageCode"
                  defaultValue={post.languageCode}
                  disabled
                  className="min-h-14 rounded-[15px] border border-[#d7c3a3] bg-[#f6f0e6] px-4 pr-10"
                >
                  <option value="en">English</option>
                </select>
              </label>
            </div>
            <label className="grid gap-2 text-sm font-semibold">
              Excerpt{" "}
              <span className="text-xs font-normal text-ink/48">
                Used on the blog index and social previews.
              </span>
              <textarea
                name="excerpt"
                maxLength={500}
                rows={3}
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                className="rounded-[15px] border border-[#d7c3a3] bg-white px-4 py-3 leading-7"
              />
            </label>
            <div className="border-t border-[#e3d4bd] pt-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Featured image</h2>
                  <p className="mt-1 text-xs leading-5 text-ink/50">
                    Used on the article, blog cards, and social link previews.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
                <BlogFeaturedImageField
                  postId={post.id}
                  initialUrl={post.revision.featuredImageUrl}
                />
                <label className="grid gap-2 text-sm font-semibold">
                  Image alt text{" "}
                  <span className="text-xs font-normal leading-5 text-ink/48">
                    Briefly describe the image for readers who use assistive technology.
                  </span>
                  <textarea
                    name="featuredImageAlt"
                    defaultValue={post.revision.featuredImageAlt ?? ""}
                    maxLength={180}
                    rows={3}
                    className="rounded-[14px] border border-[#d7c3a3] bg-white px-4 py-3 leading-6"
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#dcc8aa] bg-white">
          <input
            ref={inlineImageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadInlineImage(file);
            }}
          />
          <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-t-[27px] border-b border-[#e5d7c1] bg-[#f7efe3]/95 px-4 py-3 shadow-[0_8px_20px_rgba(67,50,34,.1)] backdrop-blur-md">
            <select
              aria-label="Text style"
              value={activeBlockStyle}
              disabled={editorMode === "source"}
              onMouseDown={rememberEditorSelection}
              onChange={(event) => {
                const blockStyle = event.target.value as BlogBlockStyle;
                setActiveBlockStyle(blockStyle);
                command("formatBlock", blockStyle);
              }}
              className="rounded-[9px] border border-[#d8c7ad] bg-white px-3 py-2 pr-9 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="p">Paragraph</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="blockquote">Quote</option>
            </select>
            <select
              aria-label="Font family"
              defaultValue=""
              disabled={editorMode === "source"}
              onMouseDown={rememberEditorSelection}
              onChange={(event) => {
                if (event.target.value) applyFont(event.target.value);
                event.currentTarget.value = "";
              }}
              className="rounded-[9px] border border-[#d8c7ad] bg-white px-3 py-2 pr-9 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            >
              <option value="" disabled>Font</option>
              {BLOG_FONT_OPTIONS.map((option) => <option key={option.marker} value={option.marker}>{option.label}</option>)}
            </select>
            <ToolbarButton
              label="B"
              title="Bold"
              onClick={() => command("bold")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <span aria-hidden="true" className="font-serif text-lg italic">
                  I
                </span>
              }
              title="Italic"
              onClick={() => command("italic")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <span aria-hidden="true" className="font-serif text-lg underline underline-offset-2">
                  U
                </span>
              }
              title="Underline"
              onClick={() => command("underline")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <BulletedListIcon /> Bullets
                </>
              }
              title="Bulleted list"
              onClick={() => command("insertUnorderedList")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <NumberedListIcon /> Numbered
                </>
              }
              title="Numbered list"
              onClick={() => command("insertOrderedList")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <LinkIcon /> Link
                </>
              }
              title="Add link"
              onClick={addLink}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <CtaIcon /> CTA
                </>
              }
              title="Insert call to action"
              onClick={openCtaComposer}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                uploadingInlineImage ? (
                  <>
                    <span className="activity-spinner" aria-hidden="true" />{" "}
                    Uploading…
                  </>
                ) : (
                  <>
                    <ImageIcon /> Image
                  </>
                )
              }
              title="Upload and insert image"
              onClick={chooseInlineImage}
              disabled={uploadingInlineImage || editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <UndoIcon /> Undo
                </>
              }
              title="Undo"
              onClick={() => command("undo")}
              disabled={editorMode === "source"}
            />
            <ToolbarButton
              label={
                <>
                  <RedoIcon /> Redo
                </>
              }
              title="Redo"
              onClick={() => command("redo")}
              disabled={editorMode === "source"}
            />
            <span className="min-w-0 flex-1" aria-hidden="true" />
            <ToolbarButton
              label={<><CodeIcon /> {editorMode === "visual" ? "HTML" : "Visual"}</>}
              title={editorMode === "visual" ? "Edit HTML source" : "Return to visual editor"}
              onClick={toggleSourceMode}
            />
            <details className="group relative">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[9px] border border-[#d8c7ad] bg-white px-3 py-2 text-sm font-semibold marker:hidden hover:bg-[#fbf7ef]">
                <ReadingGlassesIcon />
                Reading
                <span className="text-xs font-normal text-ink/48">
                  {bodyFontSizePx ?? DEFAULT_BLOG_FONT_SIZE_PX}px · {bodyLineHeight ?? DEFAULT_BLOG_LINE_HEIGHT}
                </span>
              </summary>
              <div className="absolute right-0 top-[calc(100%+.55rem)] z-50 w-[min(320px,calc(100vw-2rem))] rounded-[16px] border border-[#d8c7ad] bg-[#fffdf8] p-4 shadow-[0_14px_36px_rgba(67,50,34,.2)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold">Article typography</p>
                    <p className="mt-1 text-xs leading-5 text-ink/50">
                      Applies to the full article body in the editor, preview, and published page.
                    </p>
                  </div>
                  {bodyFontSizePx !== null || bodyLineHeight !== null ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBodyFontSizePx(null);
                        setBodyLineHeight(null);
                      }}
                      className="shrink-0 text-xs font-semibold text-[#567b40] underline underline-offset-4"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
                <label className="mt-4 grid gap-2 text-xs font-semibold">
                  <span className="flex items-center justify-between gap-3">
                    Font size
                    <output>{bodyFontSizePx ?? DEFAULT_BLOG_FONT_SIZE_PX}px</output>
                  </span>
                  <input
                    type="range"
                    min="14"
                    max="24"
                    step="0.25"
                    value={bodyFontSizePx ?? DEFAULT_BLOG_FONT_SIZE_PX}
                    onChange={(event) => setBodyFontSizePx(Number(event.target.value))}
                    className="w-full accent-[#6f994f]"
                  />
                </label>
                <label className="mt-4 grid gap-2 text-xs font-semibold">
                  <span className="flex items-center justify-between gap-3">
                    Line height
                    <output>{bodyLineHeight ?? DEFAULT_BLOG_LINE_HEIGHT}</output>
                  </span>
                  <input
                    type="range"
                    min="1.35"
                    max="2.25"
                    step="0.05"
                    value={bodyLineHeight ?? DEFAULT_BLOG_LINE_HEIGHT}
                    onChange={(event) => setBodyLineHeight(Number(event.target.value))}
                    className="w-full accent-[#6f994f]"
                  />
                </label>
                {bodyFontSizePx === null && bodyLineHeight === null ? (
                  <p className="mt-3 text-xs font-medium text-[#567b40]">
                    Using the site defaults. Move either slider to customize this revision.
                  </p>
                ) : null}
              </div>
            </details>
          </div>
          {ctaComposerOpen ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="blog-cta-composer-title"
              onClick={(event) => {
                if (event.target === event.currentTarget) closeCtaComposer();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !ctaIconPickerOpen) closeCtaComposer();
              }}
              className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[#172033]/45 p-4 backdrop-blur-sm"
            >
              <div className="my-6 w-full max-w-[640px] rounded-[24px] border border-[#d8c7ad] bg-[#fffaf2] p-5 shadow-[0_28px_80px_rgba(23,32,51,.28)] sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="label-font text-xs text-[#567b40]">Article conversion</p>
                    <h2 id="blog-cta-composer-title" className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                      {editingCtaRef.current ? "Edit call to action" : "Insert a call to action"}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-ink/50">
                      {editingCtaRef.current ? "Update this CTA without removing and reinserting it." : "Add a branded next step inside the article."}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close call to action composer"
                    onClick={closeCtaComposer}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d8c7ad] bg-white text-xl hover:bg-[#f4ecdf]"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-6 grid gap-4">
                  <label className="grid gap-2 text-sm font-semibold">
                    <span>Message <span className="font-normal text-ink/48">(optional)</span></span>
                    <input
                      autoFocus
                      value={ctaMessage}
                      maxLength={180}
                      onChange={(event) => setCtaMessage(event.target.value)}
                      placeholder="Leave blank to show the button without a card"
                      className="min-h-12 rounded-[12px] border border-[#d7c3a3] bg-white px-4 font-normal"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold">
                      Button text
                      <input
                        value={ctaButtonText}
                        maxLength={80}
                        onChange={(event) => setCtaButtonText(event.target.value)}
                        className="min-h-12 rounded-[12px] border border-[#d7c3a3] bg-white px-4 font-normal"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Link
                      <input
                        value={ctaHref}
                        onChange={(event) => setCtaHref(event.target.value)}
                        placeholder="/pricing"
                        className="min-h-12 rounded-[12px] border border-[#d7c3a3] bg-white px-4 font-normal"
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold">
                      Message font
                      <select
                        value={ctaMessageFont}
                        onChange={(event) => setCtaMessageFont(event.target.value as BlogFontMarker)}
                        disabled={!ctaMessage.trim()}
                        className="min-h-12 rounded-[12px] border border-[#d7c3a3] bg-white px-4 pr-10 font-normal disabled:opacity-45"
                      >
                        {BLOG_FONT_OPTIONS.map((option) => <option key={option.marker} value={option.marker}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      Button font
                      <select
                        value={ctaButtonFont}
                        onChange={(event) => setCtaButtonFont(event.target.value as BlogFontMarker)}
                        className="min-h-12 rounded-[12px] border border-[#d7c3a3] bg-white px-4 pr-10 font-normal"
                      >
                        {BLOG_FONT_OPTIONS.map((option) => <option key={option.marker} value={option.marker}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <fieldset className="rounded-[14px] border border-[#dfcfb7] bg-white/65 p-4">
                    <legend className="px-1 text-sm font-semibold">Button icon</legend>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-[#edf5e7] text-[#4e7139]">
                        {selectedCtaIconOption.value === "none" ? <span className="text-xl font-light" aria-hidden="true">—</span> : <FunnelButtonIconGlyph icon={selectedCtaIconOption.value} className="h-6 w-6" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">{selectedCtaIconOption.label}</strong>
                        <span className="text-xs text-ink/45">{selectedCtaIconOption.category}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setCtaIconPickerOpen(true)}
                        className="rounded-[10px] border border-[#b8cba7] bg-[#f5faef] px-4 py-2.5 text-sm font-semibold text-[#4d6a39]"
                      >
                        Choose icon
                      </button>
                    </div>
                    {ctaIcon !== "none" ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {(["left", "right"] as const).map((position) => (
                          <button
                            key={position}
                            type="button"
                            aria-pressed={ctaIconPosition === position}
                            onClick={() => setCtaIconPosition(position)}
                            className={`rounded-[10px] border px-3 py-2.5 text-xs font-semibold ${ctaIconPosition === position ? "border-[#5f8546] bg-[#e5f0dc] text-[#466333]" : "border-[#dfcfb7] bg-white"}`}
                          >
                            Icon on {position}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </fieldset>
                  <fieldset>
                    <legend className="text-sm font-semibold">Color scheme</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {([
                        ["sage", "Sage", "border-[#a9c497] bg-[#edf4e7] text-[#39552d]"],
                        ["earth", "Earth", "border-[#b89170] bg-[#f1e2d5] text-[#67452f]"],
                        ["sunny", "Sunny", "border-[#e1bd65] bg-[#fff2bd] text-[#654f17]"],
                      ] as const).map(([value, label, previewClass]) => (
                        <label
                          key={value}
                          className={`flex cursor-pointer items-center gap-2 rounded-[12px] border px-3 py-3 text-sm font-semibold transition ${previewClass} ${ctaTheme === value ? "ring-2 ring-[#172033]/25 ring-offset-2" : "opacity-75 hover:opacity-100"}`}
                        >
                          <input
                            type="radio"
                            name="blogCtaTheme"
                            value={value}
                            checked={ctaTheme === value}
                            onChange={() => setCtaTheme(value)}
                            className="accent-[#567b40]"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
                {ctaError ? (
                  <p role="alert" className="mt-4 rounded-[12px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">
                    {ctaError}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeCtaComposer}
                    className="cta-button cta-button--outline cta-button--small"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveCta}
                    className="cta-button cta-button--light cta-button--small"
                  >
                    {editingCtaRef.current ? "Save CTA" : "Insert CTA"}
                  </button>
                </div>
              </div>
              {ctaIconPickerOpen ? (
                <div
                  className="fixed inset-0 z-[90] grid place-items-center bg-[#172033]/55 p-4 backdrop-blur-sm"
                  onMouseDown={() => setCtaIconPickerOpen(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setCtaIconPickerOpen(false);
                    }
                  }}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="blog-cta-icon-picker-title"
                    className="flex max-h-[86vh] w-full max-w-[860px] flex-col overflow-hidden rounded-[24px] border border-[#cdbb9f] bg-[#fffaf2] shadow-2xl"
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-4 border-b border-[#e3d6c2] px-5 py-4 sm:px-6">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">Blog CTA</p>
                        <h3 id="blog-cta-icon-picker-title" className="mt-1 text-xl font-semibold">Choose an icon</h3>
                      </div>
                      <button type="button" onClick={() => setCtaIconPickerOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-[#d7c6ad] bg-white text-xl text-ink/60" aria-label="Close icon picker">×</button>
                    </div>
                    <div className="border-b border-[#e3d6c2] px-5 py-3 sm:px-6">
                      <label className="grid gap-1.5 text-xs font-semibold">
                        Search icons
                        <input autoFocus value={ctaIconSearch} onChange={(event) => setCtaIconSearch(event.target.value)} placeholder="Try cart, book, arrow, person…" className="min-h-11 rounded-[11px] border border-[#d7c3a3] bg-white px-4 font-normal" />
                      </label>
                    </div>
                    <div className="overflow-y-auto px-5 py-5 sm:px-6">
                      {matchingCtaIconOptions.length ? (
                        <div className="grid gap-6">
                          {ctaIconCategories.map((category) => {
                            const options = matchingCtaIconOptions.filter((option) => option.category === category);
                            if (!options.length) return null;
                            return (
                              <section key={category}>
                                <h4 className="mb-2 text-[10px] font-black uppercase tracking-[.12em] text-[#567b40]">{category}</h4>
                                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                                  {options.map((option) => {
                                    const selected = ctaIcon === option.value;
                                    return (
                                      <button
                                        key={option.value}
                                        type="button"
                                        aria-pressed={selected}
                                        title={option.label}
                                        onClick={() => {
                                          setCtaIcon(option.value);
                                          setCtaIconPickerOpen(false);
                                        }}
                                        className={`grid min-h-[76px] place-items-center gap-1 rounded-[12px] border px-1.5 py-2 text-center transition ${selected ? "border-[#5f8546] bg-[#e5f0dc] text-[#466333] ring-2 ring-[#739655]/25" : "border-[#dfcfb7] bg-white text-ink/65 hover:border-[#9bb586] hover:bg-[#f6faf2]"}`}
                                      >
                                        {option.value === "none" ? <span className="grid h-7 w-7 place-items-center text-xl font-light" aria-hidden="true">—</span> : <FunnelButtonIconGlyph icon={option.value} className="h-7 w-7" />}
                                        <span className="text-[9px] font-semibold leading-3">{option.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="py-16 text-center text-sm text-ink/50">No icons match “{ctaIconSearch}”.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {inlineImageError ? (
            <p
              role="alert"
              className="border-b border-[#efc9bc] bg-[#fff1ec] px-5 py-3 text-sm font-semibold text-[#8b3e2f]"
            >
              {inlineImageError}
            </p>
          ) : null}
          <div
            ref={attachEditor}
            contentEditable
            suppressContentEditableWarning
            onClick={(event) => {
              const target = event.target instanceof Element ? event.target : null;
              const cta = target?.closest("aside.blog-cta");
              if (!cta || !event.currentTarget.contains(cta)) return;
              event.preventDefault();
              editCta(cta as HTMLElement);
            }}
            onPaste={handlePaste}
            onInput={() => {
              syncEditorHtml();
              rememberEditorSelection();
            }}
            onKeyUp={rememberEditorSelection}
            onMouseUp={rememberEditorSelection}
            role="textbox"
            aria-label="Article body"
            aria-multiline="true"
            style={{
              fontSize: bodyFontSizePx ? `${bodyFontSizePx}px` : undefined,
              lineHeight: bodyLineHeight ?? undefined,
            }}
            className={`blog-editor min-h-[560px] px-6 py-7 text-[18px] leading-8 outline-none sm:px-10 sm:py-10 ${editorMode === "source" ? "hidden" : ""}`}
          />
          {editorMode === "source" ? (
            <div className="grid gap-3 px-5 py-5 sm:px-7 sm:py-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[.11em] text-[#567b40]">HTML source</p>
                <p className="text-xs text-ink/48">Unsupported tags and attributes are removed when you return to Visual mode or save.</p>
              </div>
              <HtmlSourceEditor
                value={sourceHtml}
                onChange={(nextHtml) => {
                  setSourceHtml(nextHtml);
                  if (htmlInputRef.current) htmlInputRef.current.value = nextHtml;
                }}
              />
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:p-7">
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">
              Organization
            </h2>
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold">Categories</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {availableCategories.map((category) => (
                  <label
                    key={category.slug}
                    className="flex items-center gap-2 rounded-[12px] border border-[#e3d4bd] bg-white px-3 py-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="categories"
                      value={category.name}
                      defaultChecked={selectedCategories.has(category.name)}
                    />
                    <span>{category.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-5 grid gap-2 text-sm font-semibold">
              Tags{" "}
              <span className="text-xs font-normal text-ink/48">
                Comma separated
              </span>
              <input
                name="tags"
                defaultValue={post.tags.map((tag) => tag.name).join(", ")}
                className="min-h-12 rounded-[14px] border border-[#d7c3a3] bg-white px-4"
              />
            </label>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[14px] border border-[#d7c3a3] bg-white px-4 py-4">
              <input
                type="checkbox"
                name="showAuthor"
                defaultChecked={post.revision.showAuthor}
                className="mt-1 h-4 w-4 accent-[#6f994f]"
              />
              <span>
                <strong className="block text-sm">Show author</strong>
                <span className="mt-1 block text-xs leading-5 text-ink/50">
                  Display the author’s byline above the published article.
                </span>
              </span>
            </label>
            <label className="mt-5 grid gap-2 text-sm font-semibold">
              Primary search phrase
              <input
                name="primaryKeyword"
                defaultValue={post.revision.primaryKeyword ?? ""}
                maxLength={120}
                className="min-h-12 rounded-[14px] border border-[#d7c3a3] bg-white px-4"
              />
            </label>
          </div>
          <div className="rounded-[28px] border border-[#c5d7b2] bg-[#f1f7e9] p-5 sm:p-7">
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">
              Search appearance
            </h2>
            <div className="mt-5 rounded-[17px] border border-[#d7dfcd] bg-white px-4 py-4">
              <p className="truncate text-lg text-[#1a0dab]">{searchTitle}</p>
              <p className="mt-1 text-sm text-[#188038]">
                www.treehomeschool.com › blog › {slugPreview}
              </p>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#4d5156]">
                {searchDescription}
              </p>
            </div>
            <label className="mt-5 grid gap-2 text-sm font-semibold">
              SEO title{" "}
              <span
                className={`text-xs font-normal ${seoTitle.length > 60 ? "text-[#9a4a35]" : "text-ink/48"}`}
              >
                {seoTitle.length}/70 characters
              </span>
              <input
                name="seoTitle"
                maxLength={70}
                value={seoTitle}
                onChange={(event) => setSeoTitle(event.target.value)}
                className="min-h-12 rounded-[14px] border border-[#c5d7b2] bg-white px-4"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              Meta description{" "}
              <span
                className={`text-xs font-normal ${metaDescription.length > 160 ? "text-[#9a4a35]" : "text-ink/48"}`}
              >
                {metaDescription.length}/170 characters
              </span>
              <textarea
                name="metaDescription"
                maxLength={170}
                rows={3}
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
                className="rounded-[14px] border border-[#c5d7b2] bg-white px-4 py-3"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              Canonical URL{" "}
              <span className="text-xs font-normal text-ink/48">
                Leave blank unless this content’s primary URL is elsewhere.
              </span>
              <input
                name="canonicalUrl"
                type="url"
                defaultValue={post.revision.canonicalUrl ?? ""}
                className="min-h-12 rounded-[14px] border border-[#c5d7b2] bg-white px-4"
              />
            </label>
          </div>
        </section>

        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[#c5b18f] bg-[#fffaf2]/95 p-3 shadow-[0_12px_36px_rgba(73,52,34,0.18)] backdrop-blur">
          <div className="px-2 text-xs text-ink/50">
            Saving creates revision {post.revision.revisionNumber + 1}.
            Published content changes only when you explicitly publish.
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/admin/blog/${post.id}/preview`}
              className="cta-button cta-button--outline cta-button--small"
            >
              Preview saved version
            </a>
            <button
              type="submit"
              name="intent"
              value="save"
              className="cta-button cta-button--outline cta-button--small"
            >
              Save draft
            </button>
            <button
              type="submit"
              name="intent"
              value="publish"
              className="cta-button cta-button--light cta-button--small"
            >
              Publish now
            </button>
          </div>
        </div>
      </form>

      <details className="rounded-[24px] border border-[#c9c4dc] bg-[#f4f2f8] p-5 sm:p-6">
        <summary className="cursor-pointer text-lg font-semibold">
          AI writing assistant
        </summary>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/58">
          Generate a new editable revision from a fresh brief. The current
          revision remains in history, and nothing publishes automatically.
        </p>
        <form action={generateBlogDraftAction} className="mt-5 grid gap-4">
          <input type="hidden" name="postId" value={post.id} />
          <label className="grid gap-2 text-sm font-semibold">
            What should the next draft accomplish?
            <textarea
              required
              name="topic"
              rows={3}
              maxLength={500}
              defaultValue={post.revision.title}
              className="rounded-[14px] border border-[#c9c4dc] bg-white px-4 py-3"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Audience
              <input
                name="audience"
                defaultValue="Homeschool parents"
                className="min-h-12 rounded-[14px] border border-[#c9c4dc] bg-white px-4"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Primary search phrase
              <input
                name="primaryKeyword"
                defaultValue={post.revision.primaryKeyword ?? ""}
                className="min-h-12 rounded-[14px] border border-[#c9c4dc] bg-white px-4"
              />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-semibold">
            Editor’s facts and direction
            <textarea
              name="angle"
              rows={3}
              maxLength={600}
              className="rounded-[14px] border border-[#c9c4dc] bg-white px-4 py-3"
            />
          </label>
          <label className="grid max-w-xs gap-2 text-sm font-semibold">
            Depth
            <select
              name="desiredLength"
              defaultValue="standard"
              className="min-h-12 rounded-[14px] border border-[#c9c4dc] bg-white px-4 pr-10"
            >
              <option value="short">Focused</option>
              <option value="standard">Standard</option>
              <option value="deep">In depth</option>
            </select>
          </label>
          <button
            type="submit"
            className="cta-button cta-button--outline justify-self-start"
          >
            Generate a new draft revision
          </button>
        </form>
      </details>

      {post.status === "published" ? (
        <form
          action={unpublishBlogPostAction}
          className="rounded-[22px] border border-[#e0c79c] bg-[#fff7e7] p-5"
        >
          <input type="hidden" name="postId" value={post.id} />
          <h2 className="font-semibold">Publication controls</h2>
          <p className="mt-1 text-sm text-ink/58">
            Unpublishing removes the article from the public blog while
            preserving every revision and its URL history.
          </p>
          <button className="mt-4 text-sm font-semibold text-[#825d2e] underline underline-offset-4">
            Return post to draft
          </button>
        </form>
      ) : null}

      <DeleteBlogPostButton postId={post.id} title={post.revision.title} />
    </div>
  );
}
