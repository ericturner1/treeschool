"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  completeWorkbookUploadAction,
  discardWorkbookUploadAction,
  prepareWorkbookUploadAction
} from "./actions";
import { parseWorkbookPriceInCents } from "../../../lib/native-workbooks/price";
import type {
  AcademicStandardOption,
  CurriculumSubjectOption
} from "../../../lib/native-workbooks/server";
import { selectedCurriculumSubjectId, SubjectTaxonomyFields } from "./subject-taxonomy-fields";

const GRADE_OPTIONS = [
  { value: 0, label: "Kindergarten" },
  ...Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `Grade ${index + 1}` }))
];

async function uploadFile(label: string, url: string, file: File, contentType: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file
    });
  } catch {
    throw new Error(`${label} could not reach cloud storage. Check the storage upload policy and try again.`);
  }
  if (!response.ok) {
    throw new Error(`${label} was rejected by cloud storage (HTTP ${response.status}).`);
  }
}

export function WorkbookUploadForm({
  prerequisiteChoices = [],
  workbookStates = [],
  subjects = [],
  academicStandards = []
}: {
  prerequisiteChoices?: Array<{ id: string; title: string }>;
  workbookStates?: Array<{ id: string; state: string }>;
  subjects?: CurriculumSubjectOption[];
  academicStandards?: AcademicStandardOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const [queuedWorkbookId, setQueuedWorkbookId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [descriptionMode, setDescriptionMode] = useState<"auto" | "custom">("auto");
  const [gradeMin, setGradeMin] = useState("");
  const [gradeMax, setGradeMax] = useState("");
  const [isMultiGrade, setIsMultiGrade] = useState(false);

  useEffect(() => {
    if (!queuedWorkbookId) return;
    const workbook = workbookStates.find((item) => item.id === queuedWorkbookId);
    if (!workbook || !["ready", "failed"].includes(workbook.state)) return;
    setQueued(false);
    setQueuedWorkbookId(null);
    setStatus(null);
  }, [queuedWorkbookId, workbookStates]);

  async function submit(formData: FormData) {
    if (busy || queued) return;
    let preparedUpload: { workbookId: string; versionId: string } | null = null;
    setBusy(true);
    setError(null);
    setStatus("Preparing secure uploads…");
    try {
      const pdf = formData.get("pdf") as File | null;
      if (!pdf?.size) throw new Error("Choose a workbook PDF.");
      const priceInCents = parseWorkbookPriceInCents(formData.get("price"));
      if (priceInCents == null) throw new Error("Enter a price between $0.00 and $1,000.00, using no more than two decimal places.");
      const rawGradeMin = String(formData.get("gradeMin") ?? "");
      const rawGradeMax = String(formData.get("gradeMax") ?? "");
      const selectedGradeMin = Number(rawGradeMin);
      const selectedGradeMax = Number(rawGradeMax);
      if (!rawGradeMin || !rawGradeMax || !Number.isInteger(selectedGradeMin) || !Number.isInteger(selectedGradeMax)) {
        throw new Error("Choose the workbook grade.");
      }
      if (selectedGradeMax < selectedGradeMin) {
        throw new Error("Through grade must be the same as or later than From grade.");
      }
      const prepared = await prepareWorkbookUploadAction({
        title: String(formData.get("title") ?? ""),
        subject: String(formData.get("subject") ?? ""),
        curriculumSubjectId: selectedCurriculumSubjectId(formData),
        addSubjectToTaxonomy: formData.get("addSubjectToTaxonomy") === "on",
        academicStandardKey: String(formData.get("academicStandardKey") ?? "us"),
        curriculumAreaKey: String(formData.get("curriculumAreaKey") ?? "other"),
        gradeMin: selectedGradeMin,
        gradeMax: selectedGradeMax,
        languageCode: String(formData.get("languageCode") ?? "en"),
        descriptionMode: formData.get("descriptionMode") === "custom" ? "custom" : "auto",
        description: String(formData.get("description") ?? ""),
        type: formData.get("type") === "elective" ? "elective" : "core",
        priceInCents,
        coverageTags: String(formData.get("coverageTags") ?? ""),
        prerequisiteWorkbookId: String(formData.get("prerequisiteWorkbookId") ?? "") || null,
        editionLabel: String(formData.get("editionLabel") ?? ""),
        pdfFilename: pdf.name,
        pdfMimeType: pdf.type || "application/pdf"
      });
      if (!prepared.ok) throw new Error(prepared.error);
      preparedUpload = prepared.upload;
      setStatus("Uploading the workbook PDF…");
      await uploadFile("The workbook PDF", prepared.upload.pdfUploadUrl, pdf, "application/pdf");
      setStatus("Upload complete. Queuing the pre-indexing job…");
      const completed = await completeWorkbookUploadAction({
        workbookId: prepared.upload.workbookId,
        versionId: prepared.upload.versionId
      });
      if (!completed.ok) throw new Error(completed.error);
      setDescriptionMode("auto");
      setGradeMin("");
      setGradeMax("");
      setIsMultiGrade(false);
      setQueuedWorkbookId(prepared.upload.workbookId);
      setQueued(true);
      setStatus("Queued for indexing. This page will show when it is ready to publish.");
      router.refresh();
    } catch (caught) {
      if (preparedUpload) {
        await discardWorkbookUploadAction(preparedUpload).catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : "Could not upload the workbook.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  function beginAnotherUpload() {
    setQueued(false);
    setQueuedWorkbookId(null);
    setStatus(null);
    setError(null);
    setDescriptionMode("auto");
    setGradeMin("");
    setGradeMax("");
    setIsMultiGrade(false);
  }

  return (
    <form action={submit} className="rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-earth">Catalog ingestion</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Add a workbook</h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-ink/55">The PDF is indexed once and reused whenever a family adds it to a plan.</p>
      </div>

      {queued ? (
        <div className="mt-6 rounded-[20px] border border-[#bfd2aa] bg-[#eef5e4] p-5 sm:p-6">
          <p className="text-lg font-semibold text-[#4d6a39]">✓ Workbook queued for indexing</p>
          <p className="mt-2 text-sm leading-6 text-ink/65">The upload form has been cleared. The catalog list below will update when the workbook is ready to publish.</p>
          <button type="button" onClick={beginAnotherUpload} className="cta-button cta-button--outline cta-button--small mt-5">Upload another workbook</button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-ink">Title<input required name="title" maxLength={180} className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /></label>
        <SubjectTaxonomyFields subjects={subjects} academicStandards={academicStandards} />
        <div className="grid gap-4 sm:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-ink">
              {isMultiGrade ? "From grade" : "Grade"}
              <select
                required
                name="gradeMin"
                value={gradeMin}
                onChange={(event) => {
                  const nextGrade = event.target.value;
                  setGradeMin(nextGrade);
                  if (gradeMax && Number(gradeMax) < Number(nextGrade)) setGradeMax("");
                }}
                className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12"
              >
                <option value="" disabled>Choose a grade</option>
                {GRADE_OPTIONS.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}
              </select>
            </label>
            {isMultiGrade ? (
              <label className="grid gap-2 text-sm font-semibold text-ink">
                Through grade
                <select
                  required
                  name="gradeMax"
                  value={gradeMax}
                  onChange={(event) => setGradeMax(event.target.value)}
                  className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12"
                >
                  <option value="" disabled>Choose a grade</option>
                  {GRADE_OPTIONS.filter((grade) => grade.value >= Number(gradeMin)).map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          {gradeMin ? (
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={isMultiGrade}
                onChange={(event) => {
                  setIsMultiGrade(event.target.checked);
                  setGradeMax("");
                }}
                className="h-5 w-5 accent-[#678e4d]"
              />
              This is a multi-grade workbook
            </label>
          ) : null}
          {!isMultiGrade ? <input type="hidden" name="gradeMax" value={gradeMin} /> : null}
        </div>
        <label className="grid gap-2 text-sm font-semibold text-ink">Catalog role<select name="type" defaultValue="core" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12"><option value="core">Core subject</option><option value="elective">Elective</option></select></label>
        <label className="grid gap-2 text-sm font-semibold text-ink">One-time price (USD)<input required name="price" type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" defaultValue="3.99" autoComplete="off" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /></label>
        <label className="grid gap-2 text-sm font-semibold text-ink">Edition<input required name="editionLabel" maxLength={80} defaultValue="1st edition" placeholder="1st edition, Revised edition…" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /></label>
        <label className="grid gap-2 text-sm font-semibold text-ink">Coverage tags<input name="coverageTags" placeholder="reading, phonics, comprehension" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /></label>
        <label className="grid gap-2 text-sm font-semibold text-ink sm:col-span-2">
          Starts after <span className="font-normal text-ink/50">(optional)</span>
          <select
            name="prerequisiteWorkbookId"
            defaultValue=""
            disabled={prerequisiteChoices.length === 0}
            className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12 disabled:bg-[#f3eee5] disabled:text-ink/45"
          >
            <option value="">{prerequisiteChoices.length ? "No workbook prerequisite" : "Create another workbook first"}</option>
            {prerequisiteChoices.map((workbook) => <option key={workbook.id} value={workbook.id}>{workbook.title}</option>)}
          </select>
          <span className="text-xs font-normal leading-5 text-ink/50">Processing workbooks may be selected here. Treeschool verifies that both books use the same academic standard, subject, and language, then schedules this workbook after its prerequisite.</span>
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold text-ink">Product description</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-[16px] border p-4 ${descriptionMode === "auto" ? "border-[#7fa35e] bg-[#eef5e4]" : "border-[#dcc8aa] bg-white"}`}>
              <input type="radio" name="descriptionMode" value="auto" checked={descriptionMode === "auto"} onChange={() => setDescriptionMode("auto")} className="mr-2" />
              <span className="font-semibold">Auto-generate</span>
              <span className="mt-1 block text-xs font-normal leading-5 text-ink/55">Treeschool writes a factual description from the indexed lessons and topics.</span>
            </label>
            <label className={`cursor-pointer rounded-[16px] border p-4 ${descriptionMode === "custom" ? "border-[#7fa35e] bg-[#eef5e4]" : "border-[#dcc8aa] bg-white"}`}>
              <input type="radio" name="descriptionMode" value="custom" checked={descriptionMode === "custom"} onChange={() => setDescriptionMode("custom")} className="mr-2" />
              <span className="font-semibold">Write my own</span>
              <span className="mt-1 block text-xs font-normal leading-5 text-ink/55">Use exactly the description entered below.</span>
            </label>
          </div>
          {descriptionMode === "custom" ? <textarea required name="description" rows={4} maxLength={3000} placeholder="Describe what the workbook teaches and how it is organized." className="mt-3 w-full rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 text-sm" /> : null}
        </fieldset>
        <label className="grid gap-2 text-sm font-semibold text-ink sm:col-span-2">Workbook PDF<input required name="pdf" type="file" accept="application/pdf,.pdf" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /><span className="text-xs font-normal leading-5 text-ink/50">The first page becomes the cover image. Treeschool also creates representative sample thumbnails during indexing.</span></label>
          </div>
          {status ? <p className="mt-5 rounded-[14px] bg-[#eef5e4] px-4 py-3 text-sm font-semibold text-[#4d6a39]">{status}</p> : null}
          {error ? <p className="mt-5 rounded-[14px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">{error}</p> : null}
          <button disabled={busy} type="submit" className="cta-button cta-button--dark mt-5 disabled:opacity-60">
            {busy ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Uploading…</> : "Upload and pre-index"}
          </button>
        </>
      )}
    </form>
  );
}
