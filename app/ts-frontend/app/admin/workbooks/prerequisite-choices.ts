import type { AdminNativeWorkbook } from "../../../lib/native-workbooks/server";

type PrerequisiteChoiceWorkbook = Pick<
  AdminNativeWorkbook,
  "id" | "title" | "subjectLabel" | "academicStandardKey" | "analysisStatus" | "status"
>;

export function buildPrerequisiteChoices(workbooks: PrerequisiteChoiceWorkbook[]) {
  return Array.from(new Map(
    workbooks
      .filter((workbook) =>
        workbook.analysisStatus !== "failed" && workbook.status !== "indexing_failed"
      )
      .map((workbook) => {
        const state = workbook.analysisStatus === "ready" ? "READY" : "PROCESSING";
        return [workbook.id, {
          id: workbook.id,
          title: `${workbook.title} — ${workbook.subjectLabel} [${workbook.academicStandardKey.toUpperCase()} · ${state}]`
        }] as const;
      })
  ).values());
}
