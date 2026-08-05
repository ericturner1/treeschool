"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { showGlobalToast } from "../../../lib/toast";
import type { AdminNativeWorkbook } from "../../../lib/native-workbooks/server";
import { formatNativeWorkbookGradeRange } from "../../../lib/native-workbooks/grades";
import { parseWorkbookPriceInCents } from "../../../lib/native-workbooks/price";
import {
  completeWorkbookBundleAction,
  discardWorkbookBundleAction,
  prepareWorkbookBundleAction
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

export function WorkbookBundleForm({ workbooks }: { workbooks: AdminNativeWorkbook[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [descriptionMode, setDescriptionMode] = useState<"auto" | "custom">("auto");
  const [isRecommendedCurriculum, setIsRecommendedCurriculum] = useState(false);
  const [recommendedGradeLevel, setRecommendedGradeLevel] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = useMemo(() => workbooks.filter((workbook) => {
    const search = query.trim().toLowerCase();
    return !search || [workbook.title, workbook.subjectLabel].some((value) => value.toLowerCase().includes(search));
  }), [query, workbooks]);
  const regularTotal = workbooks
    .filter((workbook) => selectedIds.includes(workbook.id))
    .reduce((total, workbook) => total + workbook.priceInCents, 0);
  const selectedWorkbooks = workbooks.filter((workbook) => selectedIds.includes(workbook.id));
  const selectedLanguageFamilies = new Set(
    selectedWorkbooks.map((workbook) => workbook.languageCode.trim().toLowerCase().split(/[-_]/)[0])
  );
  const sharedGradeMin = selectedWorkbooks.length ? Math.max(...selectedWorkbooks.map((workbook) => workbook.gradeMin)) : 0;
  const sharedGradeMax = selectedWorkbooks.length ? Math.min(...selectedWorkbooks.map((workbook) => workbook.gradeMax)) : -1;
  const recommendationEligible = selectedIds.length >= 2 &&
    selectedWorkbooks.every((workbook) => workbook.type === "core") &&
    selectedLanguageFamilies.size === 1 &&
    sharedGradeMin <= sharedGradeMax;
  const recommendedGradeOptions = recommendationEligible
    ? Array.from({ length: sharedGradeMax - sharedGradeMin + 1 }, (_, index) => sharedGradeMin + index)
    : [];

  function toggle(workbookId: string) {
    setSelectedIds((current) => {
      const next = current.includes(workbookId)
        ? current.filter((id) => id !== workbookId)
        : [...current, workbookId];
      const nextWorkbooks = workbooks.filter((workbook) => next.includes(workbook.id));
      const languages = new Set(nextWorkbooks.map((workbook) => workbook.languageCode.trim().toLowerCase().split(/[-_]/)[0]));
      const nextSharedGradeMin = nextWorkbooks.length ? Math.max(...nextWorkbooks.map((workbook) => workbook.gradeMin)) : 0;
      const nextSharedGradeMax = nextWorkbooks.length ? Math.min(...nextWorkbooks.map((workbook) => workbook.gradeMax)) : -1;
      if (nextWorkbooks.some((workbook) => workbook.type !== "core") || languages.size > 1 || nextSharedGradeMin > nextSharedGradeMax) {
        setIsRecommendedCurriculum(false);
        setRecommendedGradeLevel("");
      } else {
        setRecommendedGradeLevel((current) => {
          const grade = Number(current);
          return current && grade >= nextSharedGradeMin && grade <= nextSharedGradeMax
            ? current
            : String(nextSharedGradeMin);
        });
      }
      return next;
    });
  }

  async function submit(formData: FormData) {
    if (busy) return;
    let bundleId: string | null = null;
    setBusy(true);
    setError(null);
    setStatus("Preparing the bundle…");
    try {
      if (selectedIds.length < 2) throw new Error("Choose at least two workbooks for the bundle.");
      const thumbnail = formData.get("thumbnail") as File | null;
      if (!thumbnail?.size) throw new Error("Choose a bundle thumbnail.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(thumbnail.type)) {
        throw new Error("Choose a JPG, PNG, or WebP bundle thumbnail.");
      }
      const priceInCents = parseWorkbookPriceInCents(formData.get("price"));
      if (priceInCents == null) throw new Error("Enter a price between $0.00 and $1,000.00, using no more than two decimal places.");
      if (isRecommendedCurriculum && !recommendedGradeLevel) throw new Error("Choose the grade for this recommended curriculum.");
      const prepared = await prepareWorkbookBundleAction({
        title: String(formData.get("title") ?? ""),
        descriptionMode,
        description: String(formData.get("description") ?? ""),
        priceInCents,
        workbookIds: selectedIds,
        thumbnailFilename: thumbnail.name,
        thumbnailMimeType: thumbnail.type,
        isRecommendedCurriculum,
        recommendedGradeLevel: isRecommendedCurriculum ? Number(recommendedGradeLevel) : null
      });
      if (!prepared.ok) throw new Error(prepared.error);
      bundleId = prepared.upload.bundleId;
      setStatus("Uploading the bundle thumbnail…");
      await uploadThumbnail(prepared.upload.thumbnailUploadUrl, thumbnail);
      setStatus("Finishing the bundle…");
      const completed = await completeWorkbookBundleAction({ bundleId });
      if (!completed.ok) throw new Error(completed.error);
      setSelectedIds([]);
      setQuery("");
      setDescriptionMode("auto");
      setIsRecommendedCurriculum(false);
      setRecommendedGradeLevel("");
      setStatus(null);
      showGlobalToast({ kind: "success", text: "Bundle created and available in the bookstore and lesson planner." });
      router.refresh();
    } catch (caught) {
      if (bundleId) await discardWorkbookBundleAction({ bundleId }).catch(() => undefined);
      setStatus(null);
      setError(caught instanceof Error ? caught.message : "Could not create the workbook bundle.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="rounded-[28px] border border-[#c5d5b5] bg-[#f3f8ed] p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#567b40]">Catalog collection</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Add a workbook bundle</h2></div>
        <p className="max-w-md text-sm leading-6 text-ink/55">Sell several indexed workbooks together at one master price. Families add the entire bundle to a plan in one click.</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">Bundle title<input required name="title" maxLength={180} placeholder="Grade 1 Reading Collection" className="rounded-[14px] border border-[#c5d5b5] bg-white px-4 py-3" /></label>
        <label className="grid gap-2 text-sm font-semibold">Master price (USD)<input required name="price" type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" placeholder="19.99" className="rounded-[14px] border border-[#c5d5b5] bg-white px-4 py-3" /><span className="text-xs font-normal text-ink/50">Selected books total ${(regularTotal / 100).toFixed(2)} separately.</span></label>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold">Product description</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-[16px] border p-4 ${descriptionMode === "auto" ? "border-[#7fa35e] bg-[#e8f1df]" : "border-[#c5d5b5] bg-white"}`}><input type="radio" checked={descriptionMode === "auto"} onChange={() => setDescriptionMode("auto")} className="mr-2" /><span className="font-semibold">Auto-generate</span><span className="mt-1 block text-xs font-normal leading-5 text-ink/55">Build a factual description from the selected workbook titles, subjects, grades, and coverage.</span></label>
            <label className={`cursor-pointer rounded-[16px] border p-4 ${descriptionMode === "custom" ? "border-[#7fa35e] bg-[#e8f1df]" : "border-[#c5d5b5] bg-white"}`}><input type="radio" checked={descriptionMode === "custom"} onChange={() => setDescriptionMode("custom")} className="mr-2" /><span className="font-semibold">Write my own</span><span className="mt-1 block text-xs font-normal leading-5 text-ink/55">Use exactly the description entered below.</span></label>
          </div>
          {descriptionMode === "custom" ? <textarea required name="description" rows={4} maxLength={3000} className="mt-3 w-full rounded-[14px] border border-[#c5d5b5] bg-white px-4 py-3" placeholder="Describe the collection and who it is for." /> : null}
        </fieldset>
        <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Bookstore thumbnail<input required name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="rounded-[14px] border border-[#c5d5b5] bg-white px-4 py-3" /><span className="text-xs font-normal text-ink/50">Use a portrait-oriented JPG, PNG, or WebP cover image made for this bundle.</span></label>
        <div className={`rounded-[18px] border px-4 py-4 sm:col-span-2 ${isRecommendedCurriculum ? "border-[#729954] bg-[#e6f0dc]" : "border-[#c5d5b5] bg-white"}`}>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isRecommendedCurriculum}
              disabled={!recommendationEligible}
              onChange={(event) => {
                const checked = event.target.checked;
                setIsRecommendedCurriculum(checked);
                setRecommendedGradeLevel(checked ? recommendedGradeLevel || String(sharedGradeMin) : "");
              }}
              className="mt-1 h-5 w-5 accent-[#678e4d] disabled:opacity-40"
            />
            <span>
              <span className="block text-sm font-semibold">Treeschool Recommended curriculum</span>
              <span className="mt-1 block text-xs font-normal leading-5 text-ink/55">
                Offer this bundle as the one-click starting curriculum for students whose grade and language match. Only core workbooks in one language can be recommended.
              </span>
              {!recommendationEligible ? <span className="mt-1 block text-xs font-semibold text-[#7b583c]">Select at least two core workbooks in the same language with a shared grade level to enable this option.</span> : null}
            </span>
          </label>
          {isRecommendedCurriculum ? (
            <label className="mt-4 grid max-w-sm gap-2 text-sm font-semibold">
              Recommended for grade
              <select required value={recommendedGradeLevel} onChange={(event) => setRecommendedGradeLevel(event.target.value)} className="rounded-[14px] border border-[#a8bf93] bg-white px-4 py-3 pr-12">
                {recommendedGradeOptions.map((grade) => <option key={grade} value={grade}>{grade === 0 ? "Kindergarten" : `Grade ${grade}`}</option>)}
              </select>
              <span className="text-xs font-normal leading-5 text-ink/55">This exact grade and the bundle’s language determine which students see the one-click recommendation.</span>
            </label>
          ) : null}
        </div>
      </div>

      <section className="mt-6 rounded-[20px] border border-[#c5d5b5] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">Choose included workbooks</h3><p className="mt-1 text-xs text-ink/50">Only published, indexed workbooks are available.</p></div><span className="rounded-full bg-[#e7f0de] px-3 py-1 text-xs font-black text-[#4f7339]">{selectedIds.length} selected</span></div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search workbooks…" className="mt-4 w-full rounded-[14px] border border-[#d8c7ad] px-4 py-3" />
        <div className="mt-4 grid max-h-[430px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {available.map((workbook) => {
            const selected = selectedIds.includes(workbook.id);
            return <label key={workbook.id} className={`flex cursor-pointer gap-3 rounded-[16px] border p-3 ${selected ? "border-[#7fa35e] bg-[#eef5e4]" : "border-[#e2cfb2] bg-[#fffaf2]"}`}>
              <input type="checkbox" checked={selected} onChange={() => toggle(workbook.id)} className="mt-1 h-5 w-5 flex-none accent-[#678e4d]" />
              <div className="relative h-20 w-14 flex-none overflow-hidden rounded-[7px] border border-[#ddc9aa] bg-white">{workbook.thumbnailUrl ? <Image src={workbook.thumbnailUrl} alt="" fill unoptimized className="object-cover" /> : null}</div>
              <div className="min-w-0"><p className="font-semibold leading-5">{workbook.title}</p><p className="mt-1 text-xs leading-5 text-ink/52">{workbook.subjectLabel} · {formatNativeWorkbookGradeRange(workbook.gradeMin, workbook.gradeMax)} · ${(workbook.priceInCents / 100).toFixed(2)}</p></div>
            </label>;
          })}
          {!available.length ? <p className="py-8 text-center text-sm text-ink/55 sm:col-span-2">No published workbooks match this search.</p> : null}
        </div>
      </section>

      {status ? <p className="mt-5 rounded-[14px] bg-[#e7f0de] px-4 py-3 text-sm font-semibold text-[#4d6a39]">{status}</p> : null}
      {error ? <p className="mt-5 rounded-[14px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">{error}</p> : null}
      <button disabled={busy || workbooks.length < 2} className="cta-button cta-button--dark mt-5 disabled:opacity-50">{busy ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Creating bundle…</> : "Create workbook bundle"}</button>
    </form>
  );
}
