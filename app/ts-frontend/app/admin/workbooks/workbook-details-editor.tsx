"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AcademicStandardOption,
  AdminNativeWorkbook,
  CurriculumSubjectOption
} from "../../../lib/native-workbooks/server";
import { parseWorkbookPriceInCents } from "../../../lib/native-workbooks/price";
import { updateWorkbookDetailsAction } from "./actions";
import { selectedCurriculumSubjectId, SubjectTaxonomyFields } from "./subject-taxonomy-fields";

const GRADE_OPTIONS = [
  { value: 0, label: "Kindergarten" },
  ...Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `Grade ${index + 1}` }))
];

export function WorkbookDetailsEditor({
  workbook,
  prerequisiteChoices,
  subjects,
  academicStandards
}: {
  workbook: AdminNativeWorkbook;
  prerequisiteChoices: Array<{ id: string; title: string }>;
  subjects: CurriculumSubjectOption[];
  academicStandards: AcademicStandardOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const gradeMin = Number(formData.get("gradeMin"));
    const gradeMax = Number(formData.get("gradeMax"));
    const priceInCents = parseWorkbookPriceInCents(formData.get("price"));
    if (gradeMax < gradeMin) {
      setError("The ending grade cannot be lower than the starting grade.");
      return;
    }
    if (priceInCents == null) {
      setError("Enter a price between $0.00 and $1,000.00, using no more than two decimal places.");
      return;
    }

    setBusy(true);
    setError(null);
    const result = await updateWorkbookDetailsAction({
      workbookId: workbook.id,
      title: String(formData.get("title") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      curriculumSubjectId: selectedCurriculumSubjectId(formData),
      addSubjectToTaxonomy: formData.get("addSubjectToTaxonomy") === "on",
      academicStandardKey: String(formData.get("academicStandardKey") ?? "us"),
      curriculumAreaKey: String(formData.get("curriculumAreaKey") ?? "other"),
      gradeMin,
      gradeMax,
      languageCode: String(formData.get("languageCode") ?? "en"),
      description: String(formData.get("description") ?? ""),
      coverageTags: String(formData.get("coverageTags") ?? ""),
      type: formData.get("type") === "elective" ? "elective" : "core",
      priceInCents,
      prerequisiteWorkbookId: String(formData.get("prerequisiteWorkbookId") ?? "") || null,
      editionLabel: String(formData.get("editionLabel") ?? "")
    });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => { setError(null); setOpen(true); }} className="cta-button cta-button--outline cta-button--small">
        Edit details
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby={`edit-workbook-${workbook.id}`} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] p-6 shadow-2xl sm:p-7">
            <h2 id={`edit-workbook-${workbook.id}`} className="text-2xl font-semibold tracking-[-0.035em]">Edit “{workbook.title}”</h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">Changes appear in the bookstore immediately. The existing URL remains unchanged so shared links keep working.</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-ink">Title<input autoFocus required name="title" maxLength={180} defaultValue={workbook.title} className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /></label>
              <SubjectTaxonomyFields
                subjects={subjects}
                academicStandards={academicStandards}
                initialAcademicStandardKey={workbook.academicStandardKey}
                initialCurriculumAreaKey={workbook.curriculumAreaKey}
                initialCurriculumSubjectId={workbook.curriculumSubjectId}
                initialSubjectLabel={workbook.subjectLabel}
                initialLanguageCode={workbook.languageCode}
              />
              <label className="grid gap-2 text-sm font-semibold text-ink">From grade<select name="gradeMin" defaultValue={String(workbook.gradeMin)} className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12">{GRADE_OPTIONS.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}</select></label>
              <label className="grid gap-2 text-sm font-semibold text-ink">Through grade<select name="gradeMax" defaultValue={String(workbook.gradeMax)} className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12">{GRADE_OPTIONS.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}</select></label>
              <label className="grid gap-2 text-sm font-semibold text-ink">Catalog role<select name="type" defaultValue={workbook.type} className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12"><option value="core">Core subject</option><option value="elective">Elective</option></select></label>
              <label className="grid gap-2 text-sm font-semibold text-ink">Price ({workbook.currencyCode})<input required name="price" type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" defaultValue={(workbook.priceInCents / 100).toFixed(2)} autoComplete="off" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /></label>
              <label className="grid gap-2 text-sm font-semibold text-ink">Edition<input required name="editionLabel" maxLength={80} defaultValue={workbook.editionLabel ?? "1st edition"} placeholder="1st edition, Revised edition…" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /></label>
              <label className="grid gap-2 text-sm font-semibold text-ink">Coverage tags<input name="coverageTags" defaultValue={workbook.coverageTags.join(", ")} placeholder="reading, phonics, comprehension" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /></label>
              <label className="grid gap-2 text-sm font-semibold text-ink sm:col-span-2">
                Starts after <span className="font-normal text-ink/50">(optional)</span>
                <select name="prerequisiteWorkbookId" defaultValue={workbook.prerequisiteWorkbookId ?? ""} className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12">
                  <option value="">No native workbook prerequisite</option>
                  {prerequisiteChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.title}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-ink sm:col-span-2">Description<textarea name="description" rows={5} maxLength={3000} defaultValue={workbook.description} className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 text-sm" /></label>
            </div>

            <p className="mt-4 text-sm leading-6 text-ink/60">For published workbooks, Treeschool also updates the Stripe product title and description. A changed amount becomes a new active Stripe price; previous purchases are unaffected.</p>
            {error ? <p role="alert" className="mt-4 rounded-[14px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold leading-6 text-[#8b3e2f]">{error}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" disabled={busy} onClick={close} className="cta-button cta-button--outline cta-button--small disabled:opacity-60">Cancel</button>
              <button type="submit" disabled={busy} className="cta-button cta-button--dark cta-button--small disabled:opacity-60">
                {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Saving…</> : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
