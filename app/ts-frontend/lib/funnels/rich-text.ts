import type { CSSProperties } from "react";
import type { FunnelRichTextRun } from "./page-document";

const SAFE_COLOR = /^(?:#[0-9a-f]{3}(?:[0-9a-f]{1}|[0-9a-f]{3}(?:[0-9a-f]{2})?)?|rgba?\([\d\s.,%]+\)|[a-z]{1,20})$/i;

type FunnelRichTextStyle = Omit<FunnelRichTextRun, "text">;

function sameStyle(left: FunnelRichTextStyle, right: FunnelRichTextStyle) {
  return Boolean(left.bold) === Boolean(right.bold)
    && Boolean(left.italic) === Boolean(right.italic)
    && Boolean(left.underline) === Boolean(right.underline)
    && Boolean(left.strikethrough) === Boolean(right.strikethrough)
    && (left.color ?? "") === (right.color ?? "");
}

export function normalizeFunnelRichTextColor(color?: string | null) {
  const value = color?.trim() ?? "";
  return SAFE_COLOR.test(value) ? value : undefined;
}

export function normalizeFunnelRichTextRuns(runs: FunnelRichTextRun[]) {
  const normalized: FunnelRichTextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const color = normalizeFunnelRichTextColor(run.color);
    const style: FunnelRichTextStyle = {
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italic: true } : {}),
      ...(run.underline ? { underline: true } : {}),
      ...(run.strikethrough ? { strikethrough: true } : {}),
      ...(color ? { color } : {})
    };
    const previous = normalized.at(-1);
    if (previous && sameStyle(previous, style)) {
      previous.text += run.text;
    } else {
      normalized.push({ text: run.text, ...style });
    }
  }
  return normalized;
}

export function resolveFunnelRichTextRuns(runs: FunnelRichTextRun[] | undefined, fallbackText: string) {
  const normalized = normalizeFunnelRichTextRuns(runs ?? []);
  return normalized.length > 0 ? normalized : [{ text: fallbackText }];
}

export function funnelRichTextPlainText(runs: FunnelRichTextRun[]) {
  return normalizeFunnelRichTextRuns(runs).map((run) => run.text).join("");
}

export function funnelRichTextRunStyle(run: FunnelRichTextRun): CSSProperties {
  const decorations = [
    run.underline ? "underline" : "",
    run.strikethrough ? "line-through" : ""
  ].filter(Boolean).join(" ");
  return {
    fontWeight: run.bold ? 700 : undefined,
    fontStyle: run.italic ? "italic" : undefined,
    textDecorationLine: decorations || undefined,
    color: normalizeFunnelRichTextColor(run.color)
  };
}

function escapeEditorHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br>");
}

export function funnelRichTextEditorHtml(runs: FunnelRichTextRun[] | undefined, fallbackText: string) {
  return resolveFunnelRichTextRuns(runs, fallbackText).map((run) => {
    let value = escapeEditorHtml(run.text);
    if (run.bold) value = `<strong>${value}</strong>`;
    if (run.italic) value = `<em>${value}</em>`;
    if (run.underline) value = `<u>${value}</u>`;
    if (run.strikethrough) value = `<s>${value}</s>`;
    const color = normalizeFunnelRichTextColor(run.color);
    if (color) value = `<span style="color:${color}">${value}</span>`;
    return value;
  }).join("");
}
