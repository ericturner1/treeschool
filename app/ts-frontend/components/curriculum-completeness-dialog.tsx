"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { CurriculumCompletenessResult } from "../lib/curriculum-completeness/server";

const CORE_AREA_LABELS = {
  mathematics: "Mathematics",
  languageArts: "Language arts",
  science: "Science",
  socialStudies: "Social studies"
} as const;

function concernSubjectLabel(subject: string) {
  const words = subject
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const coreArea = Object.entries(CORE_AREA_LABELS).find(([key, label]) =>
    words === key.toLowerCase() || words === label.toLowerCase()
  );
  if (coreArea) return coreArea[1];
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : "Curriculum area";
}

function CoreAreasRadar({ areas }: { areas: CurriculumCompletenessResult["coreAreas"] }) {
  const entries = (Object.keys(CORE_AREA_LABELS) as Array<keyof typeof CORE_AREA_LABELS>).map((key) => ({
    key,
    label: CORE_AREA_LABELS[key],
    ...areas[key]
  }));
  const centerX = 180;
  const centerY = 160;
  const radius = 95;
  const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const point = (angle: number, distance: number) =>
    `${centerX + Math.cos(angle) * distance},${centerY + Math.sin(angle) * distance}`;
  const polygon = (scale: number) => angles.map((angle) => point(angle, radius * scale)).join(" ");
  const dataPolygon = entries.map((entry, index) => point(angles[index], radius * entry.score / 100)).join(" ");

  return (
    <section className="mt-5 rounded-[22px] border border-[#d7e4c7] bg-[#f7faf2] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-[#567b40]">Estimated grade-level coverage</h3>
        <p className="text-[11px] text-ink/48">Evidence found in these materials</p>
      </div>
      <div className="mt-2 grid items-center gap-3 sm:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)]">
        <svg viewBox="0 0 360 330" className="mx-auto h-auto w-full max-w-[330px]" role="img" aria-labelledby="core-radar-title core-radar-description">
          <title id="core-radar-title">Core curriculum coverage radar chart</title>
          <desc id="core-radar-description">{entries.map((entry) => `${entry.label}: ${entry.score} percent`).join(". ")}</desc>
          {[0.25, 0.5, 0.75, 1].map((scale) => (
            <polygon key={scale} points={polygon(scale)} fill="none" stroke="#cdddbb" strokeWidth={scale === 1 ? 1.5 : 1} />
          ))}
          {angles.map((angle, index) => (
            <line key={entries[index].key} x1={centerX} y1={centerY} x2={centerX + Math.cos(angle) * radius} y2={centerY + Math.sin(angle) * radius} stroke="#cdddbb" strokeWidth="1" />
          ))}
          <polygon points={dataPolygon} fill="#7fa15a" fillOpacity="0.28" stroke="#5f813f" strokeWidth="3" strokeLinejoin="round" />
          {entries.map((entry, index) => {
            const [x, y] = point(angles[index], radius * entry.score / 100).split(",");
            return <circle key={entry.key} cx={x} cy={y} r="4.5" fill="#5f813f" stroke="white" strokeWidth="2" />;
          })}
          <text x="180" y="28" textAnchor="middle" className="fill-ink text-[11px] font-semibold">Mathematics</text>
          <text x="350" y="164" textAnchor="end" className="fill-ink text-[11px] font-semibold">Language arts</text>
          <text x="180" y="318" textAnchor="middle" className="fill-ink text-[11px] font-semibold">Science</text>
          <text x="10" y="164" textAnchor="start" className="fill-ink text-[11px] font-semibold">Social studies</text>
        </svg>
        <ul className="grid gap-2 text-xs">
          {entries.map((entry) => (
            <li key={entry.key} className="rounded-[14px] bg-white px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-ink">{entry.label}</span>
                <span className="font-black tabular-nums text-[#567b40]">{entry.score}%</span>
              </div>
              <p className="mt-1 leading-5 text-ink/58">{entry.summary}</p>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-ink/48">
        This estimates the breadth of grade-level topics found in the materials—not teaching quality or activities you cover separately.
      </p>
    </section>
  );
}

export function CurriculumCompletenessDialog({
  open,
  loading,
  continuing,
  result,
  error,
  onClose,
  onContinue,
  onReevaluate,
  materialSummary,
  learningYearId,
  planPackContext
}: {
  open: boolean;
  loading: boolean;
  continuing?: boolean;
  result: CurriculumCompletenessResult | null;
  error: string | null;
  onClose: () => void;
  onContinue: () => void;
  onReevaluate: () => Promise<boolean>;
  materialSummary?: string | null;
  learningYearId?: string | null;
  planPackContext?: { intakeId: string; checkoutSessionId: string } | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [addingWorkbookId, setAddingWorkbookId] = useState<string | null>(null);
  const [addedWorkbookIds, setAddedWorkbookIds] = useState<string[]>([]);
  const [workbookError, setWorkbookError] = useState<string | null>(null);
  const [needsReevaluation, setNeedsReevaluation] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);
  const [projectedResult, setProjectedResult] = useState<CurriculumCompletenessResult | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setAddingWorkbookId(null);
    setAddedWorkbookIds([]);
    setWorkbookError(null);
    setNeedsReevaluation(false);
    setReevaluating(false);
    setProjectedResult(null);
  }, [open]);

  useEffect(() => {
    setProjectedResult(null);
  }, [result]);

  if (!open || !mounted) return null;

  async function addWorkbook(workbookId: string) {
    setAddingWorkbookId(workbookId);
    setWorkbookError(null);
    try {
      const response = await fetch("/api/workbooks/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookId,
          learningYearId,
          ...(planPackContext ?? {})
        })
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        curriculumCompletenessResult?: CurriculumCompletenessResult | null;
      };
      if (!response.ok) throw new Error(payload.error || "Could not add the workbook.");
      setAddedWorkbookIds((current) => current.includes(workbookId) ? current : [...current, workbookId]);
      if (payload.curriculumCompletenessResult) {
        setProjectedResult(payload.curriculumCompletenessResult);
        setNeedsReevaluation(false);
      } else {
        setNeedsReevaluation(true);
      }
    } catch (addError) {
      setWorkbookError(addError instanceof Error ? addError.message : "Could not add the workbook.");
    } finally {
      setAddingWorkbookId(null);
    }
  }

  async function reevaluate() {
    setReevaluating(true);
    setWorkbookError(null);
    try {
      const reviewed = await onReevaluate();
      if (reviewed) {
        setNeedsReevaluation(false);
        setProjectedResult(null);
      }
    } catch (reviewError) {
      setWorkbookError(reviewError instanceof Error ? reviewError.message : "Could not re-evaluate the curriculum.");
    } finally {
      setReevaluating(false);
    }
  }

  const displayResult = projectedResult ?? result;
  const hasConcerns = Boolean(displayResult?.concerns.length);
  const reviewFailed = Boolean(error && !displayResult);
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex h-[100dvh] w-screen items-center justify-center overscroll-contain bg-[#2d241c]/55 px-4 py-6"
      role="presentation"
      onPointerDown={(event) => {
        const interactionInProgress = loading || continuing || reevaluating || addingWorkbookId != null;
        if (event.target === event.currentTarget && !interactionInProgress) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="curriculum-check-title"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-[#dcc8aa] bg-[#fffdf8] p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-earth">Academic completeness check</p>
            <h2 id="curriculum-check-title" className="mt-2 text-[27px] font-semibold tracking-[-0.04em] text-ink">
              {loading
                ? "Reviewing the year’s subjects…"
                : reviewFailed ? "The review needs another try"
                  : hasConcerns ? "A few areas may need attention" : "The academic mix looks broadly balanced"}
            </h2>
            {materialSummary ? <p className="mt-1.5 text-xs font-semibold text-ink/48">{materialSummary}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading || continuing || reevaluating || addingWorkbookId != null}
            aria-label="Close curriculum review"
            className="rounded-full p-2 text-2xl leading-none text-ink/55 transition hover:bg-[#f8f1e4] disabled:opacity-40"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <span className="h-9 w-9 animate-spin rounded-full border-4 border-[#dce8cf] border-t-[#6f914f]" aria-label="Reviewing curriculum" />
          </div>
        ) : (
          <>
            {reviewFailed ? (
              <section className="mt-4 rounded-[18px] border border-[#efd4c9] bg-[#fff5f1] px-4 py-3 text-[#7d4034]">
                <h3 className="text-sm font-semibold">Your materials are safe.</h3>
                <p className="mt-1 text-sm leading-6">Treeschool hit a temporary problem while reviewing them. Try the review again, or return to the planner and come back later.</p>
              </section>
            ) : displayResult?.summary ? (
              <section className="mt-4 rounded-[18px] bg-[#eef5e4] px-4 py-3 text-[#4d6a39]">
                <h3 className="text-sm font-black uppercase tracking-[0.12em] text-[#567b40]">Evaluation summary</h3>
                <p className="mt-1.5 text-sm leading-6">{displayResult.summary}</p>
              </section>
            ) : null}

            {displayResult?.coreAreas ? <CoreAreasRadar areas={displayResult.coreAreas} /> : null}

            {displayResult?.concerns.length ? (
              <section className="mt-5">
                <h3 className="text-lg font-semibold text-ink">Possible curriculum gaps</h3>
                <p className="mt-1 text-sm leading-6 text-ink/62">
                  These areas may be missing or under-covered in the materials you added. You can add supporting material, or continue if you teach them separately.
                </p>
                <div className="mt-3 space-y-3">
                  {displayResult.concerns.map((concern, index) => (
                    <article key={`${concern.kind}-${concern.subject}-${index}`} className="rounded-[20px] border border-[#eadbc2] bg-[#fffaf2] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${concern.priority === "essential" ? "bg-[#f4dfd7] text-[#8b3e2f]" : "bg-[#f4ead8] text-earth"}`}>
                          {concern.priority === "essential" ? "Potential core gap" : "Suggested addition"}
                        </span>
                        <span className="text-xs font-semibold text-ink/50">{concernSubjectLabel(concern.subject)}</span>
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-ink">{concern.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-ink/65">{concern.explanation}</p>
                      {concern.workbooks?.length ? (
                        <div className="mt-3 space-y-2">
                          {concern.workbooks.map((workbook) => {
                            const added = addedWorkbookIds.includes(workbook.id);
                            const canAdd = workbook.accessState === "owned" || workbook.accessState === "included";
                            const buyUrl = `/bookstore/${encodeURIComponent(workbook.slug)}${learningYearId ? `?addToLearningYearId=${encodeURIComponent(learningYearId)}` : ""}`;
                            return (
                              <div key={workbook.id} className="flex flex-col gap-3 rounded-[16px] border border-[#d7e4c7] bg-white p-3 sm:flex-row sm:items-center">
                                {workbook.thumbnailUrl ? <img src={workbook.thumbnailUrl} alt="" className="h-20 w-16 flex-none rounded-[8px] border border-[#e5d8c4] object-cover" /> : null}
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7efdd] px-2.5 py-1 font-semibold text-[#4f6e3a]">
                                      <Image src="/tree-icon.png" alt="" width={14} height={14} className="h-3.5 w-3.5 object-contain" />
                                      Treeschool
                                    </span>
                                    <span className="rounded-full bg-[#f1efe9] px-2.5 py-1 font-semibold text-ink/58">
                                      {workbook.catalogKind === "bundle" ? `Curriculum bundle · ${workbook.memberCount} workbooks` : "Workbook"}
                                    </span>
                                    <span className="rounded-full bg-[#f3eadc] px-2.5 py-1 font-semibold text-earth/75">
                                      {workbook.type === "core" ? "Core" : "Elective"}
                                    </span>
                                  </div>
                                  <p className="mt-1 font-semibold text-ink">{workbook.title}</p>
                                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink/58">{workbook.description}</p>
                                </div>
                                {canAdd ? (
                                  <button type="button" disabled={added || addingWorkbookId === workbook.id} onClick={() => void addWorkbook(workbook.id)} className="cta-button cta-button--light cta-button--small flex-none disabled:opacity-55">
                                    {added
                                      ? "Added"
                                      : addingWorkbookId === workbook.id
                                        ? "Adding…"
                                        : workbook.accessState === "included"
                                          ? <span className="flex flex-col items-center leading-tight"><span>Add</span><span className="mt-0.5 text-[11px] font-medium">(Included with plan)</span></span>
                                          : workbook.catalogKind === "bundle"
                                            ? "Add purchased bundle"
                                            : "Add purchased book"}
                                  </button>
                                ) : (
                                  <a href={buyUrl} className="cta-button cta-button--light cta-button--small flex-none">Buy {workbook.catalogKind === "bundle" ? "bundle" : "& add"} · ${(workbook.priceInCents / 100).toFixed(2)}</a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <a href="https://www.k5learning.com/" target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-semibold text-[#567b40] underline underline-offset-4">
                          Browse supporting materials at K5 Learning ↗
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {workbookError ? <p className="mt-4 rounded-[14px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">{workbookError}</p> : null}

            {reviewFailed ? (
              <div className="mt-5 flex flex-col-reverse gap-3 border-t border-[#eadbc2] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={onClose} disabled={reevaluating} className="cta-button cta-button--muted cta-button--small gap-2 disabled:opacity-50">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true"><path d="m12.5 4.5-5.5 5.5 5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Back to Planner
                </button>
                <button type="button" onClick={() => void reevaluate()} disabled={reevaluating} className="cta-button cta-button--light cta-button--small gap-2 disabled:opacity-50">
                  {reevaluating ? (
                    <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Trying again…</>
                  ) : (
                    <><svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true"><path d="M15.3 7.1A6 6 0 1 0 16 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M12.8 4.9h2.8v2.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> Try Review Again</>
                  )}
                </button>
              </div>
            ) : needsReevaluation ? (
              <section className="mt-4 flex items-start gap-3 rounded-[16px] border border-[#b9cea5] bg-[#eef5e4] px-4 py-3 text-[#4d6a39]">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#dbe9cc]" aria-hidden="true">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none"><path d="m4.5 10.3 3.2 3.2 7.8-7.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <div>
                  <h3 className="text-sm font-semibold">New material added</h3>
                  <p className="mt-0.5 text-xs leading-5 text-[#4d6a39]/80">Add more workbooks if needed, or re-check the curriculum when you’re ready.</p>
                </div>
              </section>
            ) : projectedResult ? (
              <section className="mt-4 flex items-start gap-3 rounded-[16px] border border-[#b9cea5] bg-[#eef5e4] px-4 py-3 text-[#4d6a39]">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#dbe9cc]" aria-hidden="true">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none"><path d="m4.5 10.3 3.2 3.2 7.8-7.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Estimated coverage updated</h3>
                  <p className="mt-0.5 text-xs leading-5 text-[#4d6a39]/80">The radar now includes the indexed material you added—no additional AI review was needed.</p>
                </div>
              </section>
            ) : null}

            <p className="mt-5 text-xs leading-5 text-ink/52">
              This is a broad planning aid based only on the materials listed here. It is not a legal, accreditation, or country-specific standards review.
            </p>

            {needsReevaluation ? (
              <div className="mt-5 flex flex-col-reverse gap-3 border-t border-[#eadbc2] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={onClose} disabled={continuing || reevaluating} className="cta-button cta-button--muted cta-button--small gap-2 disabled:opacity-50">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true"><path d="m12.5 4.5-5.5 5.5 5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Back to Planner
                </button>
                <button type="button" onClick={() => void reevaluate()} disabled={continuing || reevaluating || addingWorkbookId != null} className="cta-button cta-button--light cta-button--small gap-2 disabled:opacity-50">
                  {reevaluating ? (
                    <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" /> Re-checking…</>
                  ) : (
                    <><svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true"><path d="M15.3 7.1A6 6 0 1 0 16 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M12.8 4.9h2.8v2.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> Re-check Curriculum</>
                  )}
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-col-reverse gap-3 border-t border-[#eadbc2] pt-5 sm:flex-row sm:items-center sm:justify-end">
                <button type="button" onClick={onClose} disabled={continuing || reevaluating} className="cta-button cta-button--muted cta-button--small gap-2 disabled:opacity-50">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true"><path d="m12.5 4.5-5.5 5.5 5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Back to Planner
                </button>
                <button type="button" onClick={onContinue} disabled={continuing || reevaluating} className="cta-button cta-button--light cta-button--small gap-2.5 justify-center disabled:opacity-50">
                  {continuing ? "Approving…" : (
                    <>
                      <svg viewBox="0 0 20 20" className="h-5 w-5 flex-none" fill="none" aria-hidden="true"><path d="m4 10.5 3.6 3.6L16 5.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span className="flex flex-col items-center leading-tight">
                        <span>Approve Curriculum</span>
                        {hasConcerns ? <span className="mt-1 text-xs font-medium text-white/75">We’ll teach these subjects separately</span> : null}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>,
    document.body
  );
}
