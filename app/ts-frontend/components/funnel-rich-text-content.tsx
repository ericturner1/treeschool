import type { FunnelRichTextRun } from "../lib/funnels/page-document";
import { funnelRichTextRunStyle, resolveFunnelRichTextRuns } from "../lib/funnels/rich-text";

export function FunnelRichTextContent({
  text,
  runs
}: {
  text: string;
  runs?: FunnelRichTextRun[];
}) {
  return resolveFunnelRichTextRuns(runs, text).map((run, index) => (
    <span key={index} style={funnelRichTextRunStyle(run)}>{run.text}</span>
  ));
}
