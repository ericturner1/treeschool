"use client";

import { useState } from "react";
import type {
  AcademicStandardOption,
  AdminNativeWorkbook,
  CurriculumSubjectOption
} from "../../../lib/native-workbooks/server";
import { WorkbookBundleForm } from "./workbook-bundle-form";
import { WorkbookUploadForm } from "./workbook-upload-form";

export function CatalogItemCreator({
  workbooks,
  prerequisiteChoices,
  workbookStates,
  subjects,
  academicStandards
}: {
  workbooks: AdminNativeWorkbook[];
  prerequisiteChoices: Array<{ id: string; title: string }>;
  workbookStates: Array<{ id: string; state: string }>;
  subjects: CurriculumSubjectOption[];
  academicStandards: AcademicStandardOption[];
}) {
  const [mode, setMode] = useState<"workbook" | "bundle">("workbook");
  return (
    <section>
      <div className="mb-4 grid gap-3 rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-3 sm:grid-cols-2">
        <button type="button" onClick={() => setMode("workbook")} className={`rounded-[16px] border px-5 py-4 text-left transition ${mode === "workbook" ? "border-[#805f45] bg-[#805f45] text-white" : "border-[#dcc8aa] bg-white text-ink"}`}><span className="block text-lg font-semibold">Add workbook</span><span className={`mt-1 block text-xs ${mode === "workbook" ? "text-white/72" : "text-ink/52"}`}>Upload and pre-index one PDF workbook.</span></button>
        <button type="button" onClick={() => setMode("bundle")} className={`rounded-[16px] border px-5 py-4 text-left transition ${mode === "bundle" ? "border-[#567b40] bg-[#64884c] text-white" : "border-[#c5d5b5] bg-white text-ink"}`}><span className="block text-lg font-semibold">Add workbook bundle</span><span className={`mt-1 block text-xs ${mode === "bundle" ? "text-white/72" : "text-ink/52"}`}>Group existing workbooks under one price and cover.</span></button>
      </div>
      {mode === "workbook"
        ? <WorkbookUploadForm prerequisiteChoices={prerequisiteChoices} workbookStates={workbookStates} subjects={subjects} academicStandards={academicStandards} />
        : <WorkbookBundleForm workbooks={workbooks.filter((workbook) => workbook.active && workbook.analysisStatus === "ready")} />}
    </section>
  );
}
