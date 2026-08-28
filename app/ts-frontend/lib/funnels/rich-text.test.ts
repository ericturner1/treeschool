import { describe, expect, test } from "bun:test";
import {
  funnelRichTextEditorHtml,
  funnelRichTextPlainText,
  funnelRichTextRunStyle,
  normalizeFunnelRichTextRuns,
  resolveFunnelRichTextRuns
} from "./rich-text";

describe("funnel rich text", () => {
  test("keeps legacy plain text as a rendering fallback", () => {
    expect(resolveFunnelRichTextRuns(undefined, "Existing funnel copy"))
      .toEqual([{ text: "Existing funnel copy" }]);
  });

  test("merges adjacent runs with matching formatting", () => {
    expect(normalizeFunnelRichTextRuns([
      { text: "Clear ", bold: true, color: "#557b3f" },
      { text: "lessons", bold: true, color: "#557b3f" },
      { text: "", italic: true },
      { text: " at home", italic: true }
    ])).toEqual([
      { text: "Clear lessons", bold: true, color: "#557b3f" },
      { text: " at home", italic: true }
    ]);
  });

  test("renders and recovers all supported selection styles safely", () => {
    const runs = [{
      text: "Save <today>",
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      color: "#8b3e2f"
    }];
    expect(funnelRichTextPlainText(runs)).toBe("Save <today>");
    expect(funnelRichTextEditorHtml(runs, "")).toBe(
      '<span style="color:#8b3e2f"><s><u><em><strong>Save &lt;today&gt;</strong></em></u></s></span>'
    );
    expect(funnelRichTextRunStyle(runs[0]!)).toMatchObject({
      fontWeight: 700,
      fontStyle: "italic",
      textDecorationLine: "underline line-through",
      color: "#8b3e2f"
    });
  });

  test("drops unsafe color values from editor markup", () => {
    expect(funnelRichTextEditorHtml([{ text: "Safe", color: 'red;background:url("x")' }], ""))
      .toBe("Safe");
  });
});
