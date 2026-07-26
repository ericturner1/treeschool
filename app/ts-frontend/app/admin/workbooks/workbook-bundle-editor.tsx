"use client";

import Image from "next/image";
import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminNativeWorkbook, AdminNativeWorkbookBundle } from "../../../lib/native-workbooks/server";
import { formatNativeWorkbookGradeRange } from "../../../lib/native-workbooks/grades";
import { parseWorkbookPriceInCents } from "../../../lib/native-workbooks/price";
import {
  discardWorkbookBundleThumbnailAction,
  prepareWorkbookBundleThumbnailAction,
  updateWorkbookBundleAction
} from "./actions";

async function uploadThumbnail(url: string, file: File) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file
    });
  } catch {
    throw new Error("The bundle thumbnail could not reach cloud storage. Try again.");
  }
  if (!response.ok) throw new Error(`The bundle thumbnail upload failed (HTTP ${response.status}).`);
}

export function WorkbookBundleEditor({
  bundle,
  workbooks
}: {
  bundle: AdminNativeWorkbookBundle;
  workbooks: AdminNativeWorkbook[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(bundle.memberWorkbookIds);
  const [query, setQuery] = useState("");
  const [descriptionMode, setDescriptionMode] = useState<"auto" | "custom">("custom");
  const [isRecommendedCurriculum, setIsRecommendedCurriculum] = useState(bundle.isRecommendedCurriculum);
  const [recommendedGradeLevel, setRecommendedGradeLevel] = useState(
    bundle.recommendedGradeLevel == null ? "" : String(bundle.recommendedGradeLevel)
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkbooks = workbooks.filter((workbook) => selectedIds.includes(workbook.id));
  const selectedLanguageFamilies = new Set(
    selectedWorkbooks.map((workbook) => workbook.languageCode.trim().toLowerCase().split(/[-_]/)[0])
  );
  const sharedGradeMin = selectedWorkbooks.length ? Math.max(...selectedWorkbooks.map((workbook) => workbook.gradeMin)) : 0;
  const sharedGradeMax = selectedWorkbooks.length ? Math.min(...selectedWorkbooks.map((workbook) => workbook.gradeMax)) : -1;
  const recommendationEligible = selectedIds.length >= 2 &&
    selectedWorkbooks.length === selectedIds.length &&
    selectedWorkbooks.every((workbook) => workbook.type === "core") &&
    selectedLanguageFamilies.size === 1 &&
    sharedGradeMin <= sharedGradeMax;
  const recommendedGradeOptions = recommendationEligible
    ? Array.from({ length: sharedGradeMax - sharedGradeMin + 1 }, (_, index) => sharedGradeMin + index)
    : [];
  const regularTotal = selectedWorkbooks.reduce((total, workbook) => total + workbook.priceInCents, 0);
  const filteredWorkbooks = useMemo(() => {
    const search = query.trim().toLowerCase();
    return workbooks.filter((workbook) => !search || [workbook.title, workbook.subjectLabel]
      .some((value) => value.toLowerCase().includes(search)));
  }, [query, workbooks]);

  function reset() {
    setSelectedIds(bundle.memberWorkbookIds);
    setQuery("");
    setDescriptionMode("custom");
    setIsRecommendedCurriculum(bundle.isRecommendedCurriculum);
    setRecommendedGradeLevel(bundle.recommendedGradeLevel == null ? "" : String(bundle.recommendedGradeLevel));
    setStatus(null);
    setError(null);
  }

  function beginEditing() {
    reset();
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    reset();
  }

  function toggle(workbookId: string) {
    setSelectedIds((current) => {
      const next = current.includes(workbookId)
        ? current.filter((id) => id !== workbookId)
        : [...current, workbookId];
      const nextWorkbooks = workbooks.filter((workbook) => next.includes(workbook.id));
      const languages = new Set(nextWorkbooks.map((workbook) => workbook.languageCode.trim().toLowerCase().split(/[-_]/)[0]));
      const nextSharedGradeMin = nextWorkbooks.length ? Math.max(...nextWorkbooks.map((workbook) => workbook.gradeMin)) : 0;
      const nextSharedGradeMax = nextWorkbooks.length ? Math.min(...nextWorkbooks.map((workbook) => workbook.gradeMax)) : -1;
      if (nextWorkbooks.length !== next.length || nextWorkbooks.some((workbook) => workbook.type !== "core") || languages.size > 1 || nextSharedGradeMin > nextSharedGradeMax) {
        setIsRecommendedCurriculum(false);
        setRecommendedGradeLevel("");
      } else {
        setRecommendedGradeLevel((currentGrade) => {
          const grade = Number(currentGrade);
          return currentGrade && grade >= nextSharedGradeMin && grade <= nextSharedGradeMax
            ? currentGrade
            : String(nextSharedGradeMin);
        });
      }
      return next;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    const priceInCents = parseWorkbookPriceInCents(formData.get("price"));
    if (priceInCents == null) {
      setError("Enter a price between $0.00 and $1,000.00, using no more than two decimal places.");
      return;
    }
    if (selectedIds.length < 2) {
      setError("Choose at least two workbooks for the bundle.");
      return;
    }
    if (descriptionMode === "custom" && !String(formData.get("description") ?? "").trim()) {
      setError("Write a description for this bundle or choose automatic description generation.");
      return;
    }
    if (isRecommendedCurriculum && !recommendedGradeLevel) {
      setError("Choose the grade for this recommended curriculum.");
      return;
    }
    const thumbnail = formData.get("thumbnail") as File | null;
    if (thumbnail?.size && !["image/jpeg", "image/png", "image/webp"].includes(thumbnail.type)) {
      setError("Choose a JPG, PNG, or WebP bundle thumbnail.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Saving bundle details…");
    let thumbnailObjectPath: string | null = null;
    try {
      if (thumbnail?.size) {
        setStatus("Preparing the new thumbnail…");
        const prepared = await prepareWorkbookBundleThumbnailAction({
          bundleId: bundle.id,
          thumbnailFilename: thumbnail.name,
          thumbnailMimeType: thumbnail.type
        });
        if (!prepared.ok) throw new Error(prepared.error);
        thumbnailObjectPath = prepared.upload.thumbnailObjectPath;
        setStatus("Uploading the new thumbnail…");
        await uploadThumbnail(prepared.upload.thumbnailUploadUrl, thumbnail);
      }
      setStatus("Updating the bundle and bookstore…");
      const result = await updateWorkbookBundleAction({
        bundleId: bundle.id,
        title: String(formData.get("title") ?? ""),
        descriptionMode,
        description: String(formData.get("description") ?? ""),
        priceInCents,
        workbookIds: selectedIds,
        isRecommendedCurriculum,
        recommendedGradeLevel: isRecommendedCurriculum ? Number(recommendedGradeLevel) : null,
        thumbnailObjectPath
      });
      if (!result.ok) throw new Error(result.error);
      setStatus("Bundle updated.");
      setBusy(false);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      if (thumbnailObjectPath) {
        await discardWorkbookBundleThumbnailAction({ bundleId: bundle.id, thumbnailObjectPath }).catch(() => undefined);
      }
      setStatus(null);
      setError(caught instanceof Error ? caught.message : "Could not update the workbook bundle.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={beginEditing} className="cta-button cta-button--outline cta-button--small">Edit bundle</button>
      {open ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby={`edit-bundle-${bundle.id}`} className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-[#bfd1ad] bg-[#fffaf2] p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#567b40]">Workbook bundle</p><h2 id={`edit-bundle-${bundle.id}`} className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Edit “{bundle.title}”</h2><p className="mt-2 text-sm leading-6 text-ink/58">Changes apply to future bookstore purchases and future plan additions. Previous purchases and existing lesson plans remain intact.</p></div>
              <button type="button" disabled={busy} onClick={close} className="grid h-11 w-11 flex-none place-items-center rounded-full border border-[#dcc8aa] bg-white text-2xl disabled:opacity-50" aria-label="Close bundle editor">×</button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">Bundle title<input autoFocus required name="title" maxLength={180} defaultValue={bundle.title} className="rounded-[14px] border border-[#c5d5b5] bg-white px-4 py-3" /></label>
              <label className="grid gap-2 text-sm font-semibold">Master price ({bundle.currencyCode})<input required name="price" type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" defaultValue={(bundle.priceInCents / 100).toFixed(2)} className="rounded-[14px] border border-[#c5d5b5] bg-white px-4 py-3" /><span className="text-xs font-normal text-ink/50">Selected books cost ${(regularTotal / 100).toFixed(2)} separately.</span></label>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-semibold">Product description</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className={`cursor-pointer rounded-[16px] border p-4 ${descriptionMode === "custom" ? "border-[#7fa35e] bg-[#e8f1df]" : "border-[#c5d5b5] bg-white"}`}><input type="radio" checked={descriptionMode === "custom"} onChange={() => setDescriptionMode("custom")} className="mr-2" /><span className="font-semibold">Edit current description</span></label>
                  <label className={`cursor-pointer rounded-[16px] border p-4 ${descriptionMode === "auto" ? "border-[#7fa35e] bg-[#e8f1df]" : "border-[#c5d5b5] bg-white"}`}><input type="radio" checked={descriptionMode === "auto"} onChange={() => setDescriptionMode("auto")} className="mr-2" /><span className="font-semibold">Regenerate automatically</span></label>
                </div>
                {descriptionMode === "custom" ? <textarea required name="description" rows={4} maxLength={3000} defaultValue={bundle.description} className="mt-3 w-full rounded-[14px] border border-[#c5d5b5] bg-white px-4 py-3" /> : <p className="mt-3 rounded-[14px] bg-[#eef5e4] px-4 py-3 text-sm leading-6 text-ink/60">Treeschool will rebuild the description from the selected workbook titles, subjects, grades, and coverage.</p>}
              </fieldset>
              <div className="flex gap-4 rounded-[18px] border border-[#c5d5b5] bg-white p-4 sm:col-span-2">
                <div className="relative h-24 w-24 flex-none overflow-hidden rounded-[8px] border border-[#ddc9aa] bg-[#f8f1e4]">{bundle.thumbnailUrl ? <Image src={bundle.thumbnailUrl} alt="Current bundle cover" fill unoptimized className="object-contain p-1" /> : null}</div>
                <label className="grid flex-1 gap-2 text-sm font-semibold">Replace bookstore thumbnail <span className="font-normal text-ink/48">(optional)</span><input name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="rounded-[14px] border border-[#c5d5b5] bg-white px-4 py-3" /><span className="text-xs font-normal text-ink/50">Leave empty to keep the current cover.</span></label>
              </div>
            </div>

            <section className="mt-5 rounded-[20px] border border-[#c5d5b5] bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">Included workbooks</h3><p className="mt-1 text-xs text-ink/50">Add or remove published, indexed workbooks. The displayed order becomes the bundle order.</p></div><span className="rounded-full bg-[#e7f0de] px-3 py-1 text-xs font-black text-[#4f7339]">{selectedIds.length} selected</span></div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search workbooks…" className="mt-4 w-full rounded-[14px] border border-[#d8c7ad] px-4 py-3" />
              <div className="mt-4 grid max-h-[310px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                {filteredWorkbooks.map((workbook) => {
                  const selected = selectedIds.includes(workbook.id);
                  const available = workbook.active && workbook.analysisStatus === "ready";
                  return <label key={workbook.id} className={`flex gap-3 rounded-[16px] border p-3 ${selected ? "border-[#7fa35e] bg-[#eef5e4]" : available ? "cursor-pointer border-[#e2cfb2] bg-[#fffaf2]" : "border-[#ded7cb] bg-[#f4f1ec] opacity-60"}`}>
                    <input type="checkbox" checked={selected} disabled={!available && !selected} onChange={() => toggle(workbook.id)} className="mt-1 h-5 w-5 flex-none accent-[#678e4d]" />
                    <div className="relative h-16 w-11 flex-none overflow-hidden rounded-[6px] border border-[#ddc9aa] bg-white">{workbook.thumbnailUrl ? <Image src={workbook.thumbnailUrl} alt="" fill unoptimized className="object-cover" /> : null}</div>
                    <div className="min-w-0"><p className="font-semibold leading-5">{workbook.title}</p><p className="mt-1 text-xs leading-5 text-ink/52">{workbook.subjectLabel} · {formatNativeWorkbookGradeRange(workbook.gradeMin, workbook.gradeMax)} · ${(workbook.priceInCents / 100).toFixed(2)}</p>{!available ? <p className="mt-1 text-xs font-semibold text-[#8b6042]">Unavailable until published and indexed</p> : null}</div>
                  </label>;
                })}
                {!filteredWorkbooks.length ? <p className="py-8 text-center text-sm text-ink/55 sm:col-span-2">No workbooks match that search.</p> : null}
              </div>
            </section>

            <div className={`mt-5 rounded-[18px] border px-4 py-4 ${isRecommendedCurriculum ? "border-[#729954] bg-[#e6f0dc]" : "border-[#c5d5b5] bg-white"}`}>
              <label className="flex items-start gap-3"><input type="checkbox" checked={isRecommendedCurriculum} disabled={!recommendationEligible} onChange={(event) => { const checked = event.target.checked; setIsRecommendedCurriculum(checked); setRecommendedGradeLevel(checked ? recommendedGradeLevel || String(sharedGradeMin) : ""); }} className="mt-1 h-5 w-5 accent-[#678e4d] disabled:opacity-40" /><span><span className="block text-sm font-semibold">Treeschool Recommended curriculum</span><span className="mt-1 block text-xs font-normal leading-5 text-ink/55">Offer this bundle as the one-click starting curriculum for a matching grade and language.</span>{!recommendationEligible ? <span className="mt-1 block text-xs font-semibold text-[#7b583c]">Select at least two core workbooks in one language with a shared grade level.</span> : null}</span></label>
              {isRecommendedCurriculum ? <label className="mt-4 grid max-w-sm gap-2 text-sm font-semibold">Recommended for grade<select required value={recommendedGradeLevel} onChange={(event) => setRecommendedGradeLevel(event.target.value)} className="rounded-[14px] border border-[#a8bf93] bg-white px-4 py-3 pr-12">{recommendedGradeOptions.map((grade) => <option key={grade} value={grade}>{grade === 0 ? "Kindergarten" : `Grade ${grade}`}</option>)}</select></label> : null}
            </div>

            {status ? <p className="mt-5 rounded-[14px] bg-[#e7f0de] px-4 py-3 text-sm font-semibold text-[#4d6a39]">{status}</p> : null}
            {error ? <p role="alert" className="mt-5 rounded-[14px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold leading-6 text-[#8b3e2f]">{error}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={close} className="cta-button cta-button--outline cta-button--small disabled:opacity-60">Cancel</button><button type="submit" disabled={busy} className="cta-button cta-button--dark cta-button--small disabled:opacity-60">{busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Saving bundle…</> : "Save bundle"}</button></div>
          </form>
        </div>
      ) : null}
    </>
  );
}
