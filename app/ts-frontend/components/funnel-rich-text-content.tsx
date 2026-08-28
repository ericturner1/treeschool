import type { FunnelRichTextRun } from "../lib/funnels/page-document";
import { funnelRichTextRunStyle, resolveFunnelRichTextRuns } from "../lib/funnels/rich-text";

export function FunnelRichTextContent({
  text,
  runs,
  trimBoundaryLineBreaks = false
}: {
  text: string;
  runs?: FunnelRichTextRun[];
  trimBoundaryLineBreaks?: boolean;
}) {
  return resolveFunnelRichTextRuns(runs, text, { trimBoundaryLineBreaks }).map((run, index) => (
    <span key={index} style={funnelRichTextRunStyle(run)}>{run.text}</span>
  ));
}
