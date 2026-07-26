"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { NativeWorkbookCatalogItem } from "../../../../../lib/native-workbooks/server";
import { formatNativeWorkbookGradeRange } from "../../../../../lib/native-workbooks/grades";

function formatPrice(priceInCents: number, currencyCode: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2
  }).format(priceInCents / 100);
}

function WorkbookProgressSummary({ workbook }: { workbook: NativeWorkbookCatalogItem }) {
  const progress = workbook.progressSummary;
  if (!progress) return null;
  const parts = [
    progress.completed ? `${progress.completed} completed` : null,
    progress.mastered ? `${progress.mastered} mastered` : null,
    progress.deferred ? `${progress.deferred} saved for later` : null,
    progress.notStarted ? `${progress.notStarted} not started` : null
  ].filter(Boolean);
  return (
    <div className="mt-3 rounded-[12px] bg-[#eef5e7] px-3 py-2 text-xs font-semibold leading-5 text-[#4f7339]">
      <span className="font-black">Prior progress:</span> {parts.join(" · ")}
      <span className="mt-0.5 block font-medium text-[#5d7650]">Completed and mastered lessons stay out; saved lessons carry into the new plan.</span>
    </div>
  );
}

function AddSelectedButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending || count === 0} className="cta-button cta-button--dark disabled:cursor-not-allowed disabled:opacity-45">
      {pending ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Adding selection…</> : `Add ${count || "selected"} workbook${count === 1 ? "" : "s"}`}
    </button>
  );
}

function AddRecommendedCurriculumButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="cta-button cta-button--dark w-full justify-center px-6 py-5 text-lg disabled:cursor-wait disabled:opacity-65"
    >
      {pending
        ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Adding the curriculum…</>
        : <span className="flex flex-col items-center leading-tight"><span>Add Curriculum</span><span className="mt-1 text-xs font-medium">(Included with plan)</span></span>}
    </button>
  );
}

function PurchaseButton({ price }: { price: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="cta-button cta-button--light cta-button--small disabled:opacity-55">
      {pending ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#567b40]/30 border-t-[#567b40]" /> Opening checkout…</> : `Add for ${price}`}
    </button>
  );
}

function WorkbookCover({ workbook }: { workbook: NativeWorkbookCatalogItem }) {
  return (
    <div className={`relative h-28 flex-none overflow-hidden rounded-[10px] border border-[#ddc9aa] bg-white ${workbook.catalogKind === "bundle" ? "w-28" : "w-20"}`}>
      <span className="absolute inset-0 grid place-items-center text-[#a9835c]" aria-hidden="true">
        <svg viewBox="0 0 48 48" className="h-10 w-10" fill="none">
          <path d="M10 8.5A4.5 4.5 0 0 1 14.5 4H38v34H14.5A4.5 4.5 0 0 0 10 42.5v-34Z" fill="currentColor" opacity=".18" />
          <path d="M10 8.5A4.5 4.5 0 0 1 14.5 4H38v34H14.5A4.5 4.5 0 0 0 10 42.5v-34Zm0 34A4.5 4.5 0 0 1 14.5 38H38M16 12h15M16 18h11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {workbook.thumbnailUrl ? <Image src={workbook.thumbnailUrl} alt="" fill unoptimized className={workbook.catalogKind === "bundle" ? "object-contain p-1" : "object-cover"} onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
    </div>
  );
}

export function NativeWorkbookChooserDialog({
  profileId,
  studentName,
  studentGradeLevel,
  learningYearId,
  preferredPrintPageSize,
  workbooks,
  recommendedCurriculum = null,
  addWorkbooksAction,
  purchaseWorkbookAction,
  checkoutCanceled = false,
  onClose
}: {
  profileId: string;
  studentName: string;
  studentGradeLevel: number | null;
  learningYearId?: string | null;
  preferredPrintPageSize?: string | null;
  workbooks: NativeWorkbookCatalogItem[];
  recommendedCurriculum?: NativeWorkbookCatalogItem | null;
  addWorkbooksAction: (formData: FormData) => Promise<void>;
  purchaseWorkbookAction: (formData: FormData) => Promise<void>;
  checkoutCanceled?: boolean;
  onClose: () => void;
}) {
  const [skipRecommendation, setSkipRecommendation] = useState(false);
  const showRecommendation = Boolean(recommendedCurriculum) && !skipRecommendation;
  const recommendationGradeLevel = recommendedCurriculum?.recommendedGradeLevel ?? studentGradeLevel;
  const studentGradeLabel = recommendationGradeLevel === 0
    ? "Kindergarten"
    : recommendationGradeLevel != null
      ? `Grade ${recommendationGradeLevel}`
      : "grade-appropriate";
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedWorkbookCount = useMemo(() => new Set(
    workbooks
      .filter((workbook) => selectedIds.includes(workbook.id))
      .flatMap((workbook) => workbook.memberWorkbookIds)
  ).size, [selectedIds, workbooks]);
  const filteredWorkbooks = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return workbooks;
    return workbooks.filter((workbook) => [
      workbook.title,
      workbook.subjectLabel,
      workbook.description,
      ...workbook.coverageTags
    ].some((value) => value.toLowerCase().includes(search)));
  }, [query, workbooks]);

  function toggleWorkbook(workbookId: string) {
    setSelectedIds((current) => current.includes(workbookId)
      ? current.filter((id) => id !== workbookId)
      : [...current, workbookId]);
  }

  if (showRecommendation && recommendedCurriculum) {
    return (
      <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="recommended-curriculum-title" className="w-full max-w-3xl overflow-hidden rounded-[30px] border border-[#b9cea5] bg-[#fffaf2] shadow-2xl">
          <div className="relative bg-[#eef5e6] px-6 py-6 text-center sm:px-10 sm:py-7">
            <button type="button" onClick={onClose} className="absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-full border border-[#b9cea5] bg-white text-2xl" aria-label="Close workbook chooser">×</button>
            <h2 id="recommended-curriculum-title" className="mx-auto max-w-xl text-3xl font-semibold tracking-[-0.05em] text-ink sm:text-4xl">
              Start {studentName} with Treeschool’s recommended core curriculum?
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-ink/62">
              You can add a complete {studentGradeLabel} curriculum for {studentName} in one click!
            </p>
          </div>

          <div className="px-5 py-6 sm:px-9 sm:py-8">
            <div className="flex flex-col gap-5 rounded-[22px] border border-[#c6d8b5] bg-white p-5 sm:flex-row sm:items-center">
              <WorkbookCover workbook={recommendedCurriculum} />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h3 className="text-2xl font-semibold leading-tight text-ink">{recommendedCurriculum.title}</h3>
                <p className="mt-2 text-sm font-semibold text-ink/52">
                  {recommendedCurriculum.memberCount} workbooks · {formatNativeWorkbookGradeRange(recommendedCurriculum.gradeMin, recommendedCurriculum.gradeMax)}
                  {recommendedCurriculum.pageCount ? ` · ${recommendedCurriculum.pageCount} pages` : ""}
                </p>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-ink/60">{recommendedCurriculum.description}</p>
                <WorkbookProgressSummary workbook={recommendedCurriculum} />
              </div>
            </div>

            <form action={addWorkbooksAction} className="mt-6">
              <input type="hidden" name="profileId" value={profileId} />
              <input type="hidden" name="studentName" value={studentName} />
              <input type="hidden" name="learningYearId" value={learningYearId ?? ""} />
              <input type="hidden" name="preferredPrintPageSize" value={preferredPrintPageSize ?? ""} />
              <input type="hidden" name="workbookId" value={recommendedCurriculum.id} />
              <AddRecommendedCurriculumButton />
            </form>
            <button type="button" onClick={() => setSkipRecommendation(true)} className="mt-3 w-full rounded-[16px] px-5 py-3 text-sm font-semibold text-earth underline underline-offset-4 hover:bg-[#f7efe2]">
              Choose individual workbooks instead
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="native-workbook-dialog-title" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] shadow-2xl">
        <header className="border-b border-[#eadbc2] px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-[0.14em] text-earth">Treeschool library</p><h2 id="native-workbook-dialog-title" className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Choose workbooks</h2><p className="mt-2 text-sm leading-6 text-ink/58">Core workbooks are included with your Treeschool membership. Purchased titles can be added again at any time.</p></div>
            <button type="button" onClick={onClose} className="grid h-11 w-11 flex-none place-items-center rounded-full border border-[#dcc8aa] bg-white text-2xl" aria-label="Close workbook chooser">×</button>
          </div>
          {checkoutCanceled ? <p className="mt-4 rounded-[14px] bg-[#f2e6d3] px-4 py-3 text-sm font-semibold text-earth">Checkout was canceled. Nothing was purchased, and you can continue choosing workbooks.</p> : null}
          <label className="mt-5 block"><span className="sr-only">Search Treeschool workbooks</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search by title, subject, or topic…" className="w-full rounded-[16px] border border-[#d7c19f] bg-white px-4 py-3.5" /></label>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {filteredWorkbooks.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredWorkbooks.map((workbook) => {
                const canAdd = workbook.accessState === "included" || workbook.accessState === "owned";
                const selected = selectedIds.includes(workbook.id);
                return (
                  <article key={workbook.id} className={`flex gap-4 rounded-[20px] border p-4 ${selected ? "border-[#8dad72] bg-[#f1f7e9] ring-2 ring-[#dceacd]" : "border-[#e2cfb2] bg-white"}`}>
                    <WorkbookCover workbook={workbook} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        {workbook.catalogKind === "bundle" ? <span className="rounded-full bg-[#dfead4] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#4f7339]">Bundle · {workbook.memberCount} workbooks</span> : null}
                        {workbook.type === "core" && workbook.accessState === "included" ? <span className="rounded-full bg-[#e7f0de] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#4f7339]">Included with membership</span> : null}
                        {workbook.accessState === "owned" ? <span className="rounded-full bg-[#e7f0de] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#4f7339]">Purchased</span> : null}
                        {workbook.type === "elective" ? <span className="rounded-full bg-[#f3e6d2] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-earth">Elective</span> : null}
                      </div>
                      <h3 className="mt-2 text-lg font-semibold leading-6 text-ink">{workbook.title}</h3>
                      <p className="mt-1 text-xs font-semibold text-ink/48">{workbook.subjectLabel} · {formatNativeWorkbookGradeRange(workbook.gradeMin, workbook.gradeMax)}{workbook.pageCount ? ` · ${workbook.pageCount} pages` : ""}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink/58">{workbook.description}</p>
                      <WorkbookProgressSummary workbook={workbook} />
                      {canAdd ? (
                        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#4f7339]"><input type="checkbox" checked={selected} onChange={() => toggleWorkbook(workbook.id)} className="h-5 w-5 accent-[#678e4d]" />Add to lesson plan</label>
                      ) : (
                        <form action={purchaseWorkbookAction} className="mt-3">
                          <input type="hidden" name="profileId" value={profileId} />
                          <input type="hidden" name="studentName" value={studentName} />
                          <input type="hidden" name="learningYearId" value={learningYearId ?? ""} />
                          <input type="hidden" name="preferredPrintPageSize" value={preferredPrintPageSize ?? ""} />
                          <input type="hidden" name="workbookId" value={workbook.id} />
                          <PurchaseButton price={formatPrice(workbook.priceInCents, workbook.currencyCode)} />
                        </form>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <div className="py-14 text-center"><p className="text-xl font-semibold">No workbooks match that search.</p><p className="mt-2 text-sm text-ink/55">Try a subject or a broader topic.</p></div>}
        </div>

        <footer className="flex flex-col gap-3 border-t border-[#eadbc2] bg-[#fbf4e9] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-sm font-semibold text-ink/55">{selectedWorkbookCount} workbook{selectedWorkbookCount === 1 ? "" : "s"} selected</p>
          <form action={addWorkbooksAction}>
            <input type="hidden" name="profileId" value={profileId} />
            <input type="hidden" name="studentName" value={studentName} />
            <input type="hidden" name="learningYearId" value={learningYearId ?? ""} />
            <input type="hidden" name="preferredPrintPageSize" value={preferredPrintPageSize ?? ""} />
            {selectedIds.map((workbookId) => <input key={workbookId} type="hidden" name="workbookId" value={workbookId} />)}
            <AddSelectedButton count={selectedWorkbookCount} />
          </form>
        </footer>
      </section>
    </div>
  );
}
