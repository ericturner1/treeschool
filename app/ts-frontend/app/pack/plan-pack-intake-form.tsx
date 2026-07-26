"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { startPlanPackSetupAction } from "./actions";
import { getStoredPlanPackDraft, saveStoredPlanPackDraft } from "./plan-pack-draft-storage";
import { TeachingDaysConflictDialog } from "../../components/teaching-days-conflict-dialog";
import {
  PRINT_PAGE_SIZE_OPTIONS,
  compactPrintPageSizeLabel,
  printPageSizeLabel,
  type PrintPageSize
} from "../../lib/print-page-sizes";
import type { NativeWorkbookCatalogItem } from "../../lib/native-workbooks/server";
import { expandSelectedNativeWorkbookCards } from "../../lib/native-workbooks/catalog-selection";
import { hideCatalogItemsCoveredBySelection } from "../../lib/native-workbooks/catalog-visibility";
import {
  applySchoolYearStartDateChange,
  compactSchoolYearPeriod,
  restoreSchoolYearPeriod
} from "../../lib/plan-generator-dates";
import {
  PLAN_GENERATOR_ACCEPTED_FILE_TYPES,
  PLAN_GENERATOR_MAX_INPUT_PAGE_COUNT
} from "../../lib/plan-generator-contract";

const DEFAULT_HOLIDAY_WEEKS = 16;
const WEEKS_IN_YEAR = 52;
const FORM_DRAFT_KEY = "treeschool-plan-pack-form-draft";

// MAINTAINER NOTE: This public marketing funnel parallels the authenticated
// lesson-plan generator. Review docs/plan-generator-parity.md and run
// `bun run verify:plan-generators` whenever either experience changes.

type PlanPackPricing = {
  currencyCode: string;
  planPackPriceInCents: number;
  subscriptionIntroPriceInCents: number;
  subscriptionMonthlyPriceInCents: number;
  subscriptionYearlyPriceInCents: number;
  subscriptionPlanTier: "single";
  includedStudentCount: number;
  additionalStudentIntroPriceInCents: number;
  additionalStudentMonthlyPriceInCents: number;
  introductoryPlanGenerationLimit: number;
};

function formatMoney(cents: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(cents / 100);
}

function workbookGradeLabel(item: NativeWorkbookCatalogItem) {
  const grade = (value: number) => value === 0 ? "K" : String(value);
  return item.gradeMin === item.gradeMax
    ? item.gradeMin === 0 ? "Kindergarten" : `Grade ${item.gradeMin}`
    : `Grades ${grade(item.gradeMin)}-${grade(item.gradeMax)}`;
}

type SubjectRow = {
  id: number;
  materialSetId: string;
  prerequisiteMaterialSetId: string;
  label: string;
  notes: string;
  daysPerWeek: string;
  fileNames: string[];
  pageCount: number;
  pageCountPending: boolean;
  pageCountIncomplete: boolean;
  saved: boolean;
};

type SubjectCompletion = {
  hasLabel: boolean;
  hasFiles: boolean;
};

type Step = "setup" | "subjects" | "email";

const STEP_ORDER: Step[] = ["setup", "subjects", "email"];
const SUBJECT_REQUIREMENTS_ERROR = "Finish the highlighted subject and confirm its teaching materials before continuing.";

function isSubjectRequirementsError(message: string | null) {
  return message === SUBJECT_REQUIREMENTS_ERROR || message?.startsWith("Add at least one PDF, text, or image file for every subject before ") === true;
}

async function countSelectedPdfPages(files: File[]) {
  const pdfFiles = files.filter((file) =>
    file.type.toLowerCase().includes("pdf") || file.name.toLowerCase().endsWith(".pdf")
  );
  let pageCount = 0;
  let incomplete = false;
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;
  try {
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    pdfjs = null;
  }
  for (const file of pdfFiles) {
    try {
      if (!pdfjs) throw new Error("PDF.js unavailable");
      const pdf = await pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        stopAtErrors: false
      }).promise;
      try {
        pageCount += pdf.numPages;
      } finally {
        await pdf.destroy();
      }
    } catch {
      try {
        const { PDFDocument } = await import("pdf-lib");
        const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        pageCount += pdf.getPageCount();
      } catch {
        incomplete = true;
      }
    }
  }
  return { pageCount, incomplete };
}

function HintPopover({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="plan-hint relative inline-block font-medium"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="cursor-pointer text-xs text-earth underline underline-offset-4"
      >
        What’s this?
      </button>
      {open ? <span role="tooltip" className="plan-hint__popover absolute left-0 top-full z-20 block w-72 max-w-[80vw] pt-2">
        <div className="relative rounded-[16px] border border-[#c7d7b3] bg-[#eef5e4] px-3 py-2 pr-8 text-xs font-medium leading-[1.55] text-[#4d6a39] shadow-lg">
          {children}
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => setOpen(false)}
            className="absolute right-2 top-1.5 rounded-full p-1 text-base leading-none text-[#4d6a39] hover:bg-white/70"
          >
            ×
          </button>
        </div>
      </span> : null}
    </span>
  );
}

function SubmitButton({
  pending,
  authenticated,
  addingToExistingYear
}: {
  pending: boolean;
  authenticated: boolean;
  addingToExistingYear: boolean;
}) {
  return (
    <button type="submit" disabled={pending} className="cta-button cta-button--dark w-full disabled:opacity-60">
      {pending
        ? authenticated ? "Uploading materials..." : "Opening secure checkout..."
        : authenticated
          ? addingToExistingYear ? "Upload materials" : "Create learning year and upload materials"
          : "Start Single"}
    </button>
  );
}

function NativeWorkbookChooser({
  open,
  onClose,
  catalog,
  selectedIds,
  studentGradeLevel,
  currencyCode,
  onToggle
}: {
  open: boolean;
  onClose: () => void;
  catalog: NativeWorkbookCatalogItem[];
  selectedIds: string[];
  studentGradeLevel: string;
  currencyCode: string;
  onToggle: (item: NativeWorkbookCatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedWorkbookCount = useMemo(() => new Set(
    catalog.filter((item) => selectedSet.has(item.id)).flatMap((item) => item.memberWorkbookIds)
  ).size, [catalog, selectedSet]);
  const numericGrade = Number(studentGradeLevel);
  const compatible = Number.isFinite(numericGrade)
    ? catalog.filter((item) => item.gradeMin <= numericGrade && item.gradeMax >= numericGrade)
    : catalog;
  const available = hideCatalogItemsCoveredBySelection(compatible, selectedIds);
  const filtered = available.filter((item) => {
    const haystack = `${item.title} ${item.subjectLabel} ${item.curriculumAreaKey} ${item.description}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }).sort((left, right) =>
    Number(right.isRecommendedCurriculum) - Number(left.isRecommendedCurriculum) ||
    left.subjectLabel.localeCompare(right.subjectLabel) ||
    left.title.localeCompare(right.title)
  );

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2f241d]/65 px-4 py-6 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="native-workbook-title" className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-[#c8af8b] bg-[#fffaf2] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#eadbc2] px-6 py-5 sm:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-earth">Treeschool library</p>
            <h2 id="native-workbook-title" className="mt-1 text-[28px] font-semibold tracking-[-0.05em] text-ink">Choose ready-to-plan workbooks.</h2>
            <p className="mt-1 text-sm text-ink/62">Pre-indexed materials save setup time. Core workbooks are included; elective prices are added at checkout.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close workbook library" className="grid h-10 w-10 flex-none place-items-center rounded-full border border-[#dcc8aa] bg-white text-xl text-ink/65">×</button>
        </header>
        <div className="px-6 pt-5 sm:px-8">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title or subject"
            className="min-h-12 w-full rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
          />
        </div>
        <div className="grid flex-1 gap-3 overflow-y-auto px-6 py-5 sm:grid-cols-2 sm:px-8">
          {filtered.map((item) => {
            const selected = selectedSet.has(item.id);
            return (
              <article key={item.id} className={`flex min-h-36 gap-4 rounded-[22px] border p-4 ${selected ? "border-[#7fa15a] bg-[#eef5e4]" : "border-[#dcc8aa] bg-white"}`}>
                <div className={`h-28 flex-none overflow-hidden rounded-[10px] border border-[#dcc8aa] bg-[#f8f1e4] ${item.catalogKind === "bundle" ? "w-28" : "w-20"}`}>
                  {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className={`h-full w-full ${item.catalogKind === "bundle" ? "object-contain p-1" : "object-cover"}`} /> : <div className="grid h-full place-items-center text-3xl" aria-hidden="true">📗</div>}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-[0.08em]">
                    <span className="rounded-full bg-[#e6eedc] px-2 py-1 text-[#4d6a39]">{item.catalogKind === "bundle" ? `${item.memberCount} workbook bundle` : "Workbook"}</span>
                    {item.isRecommendedCurriculum ? <span className="rounded-full bg-[#f3e7d5] px-2 py-1 text-earth">Recommended</span> : null}
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-lg font-semibold leading-5 text-ink">{item.title}</h3>
                  <p className="mt-1 text-xs text-ink/55">{workbookGradeLabel(item)} · {Number(item.pageCount ?? 0).toLocaleString()} pages</p>
                  <button type="button" onClick={() => onToggle(item)} className={`mt-auto flex min-h-11 flex-col items-center justify-center rounded-[13px] px-3 text-sm font-semibold leading-tight ${selected ? "border border-[#9db78a] bg-white text-[#4d6a39]" : "bg-[#7fa15a] text-white shadow-[0_4px_0_#4f7138]"}`}>
                    {selected
                      ? "Remove"
                      : item.accessState === "owned"
                        ? <><span>Add</span><span className="mt-0.5 text-[11px] font-medium opacity-85">(Already purchased)</span></>
                        : item.type === "core" || item.accessState === "included"
                          ? <><span>Add</span><span className="mt-0.5 text-[11px] font-medium opacity-90">(Included with plan)</span></>
                          : `Add · ${formatMoney(item.priceInCents, item.currencyCode || currencyCode)}`}
                  </button>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 ? <p className="sm:col-span-2 rounded-[18px] bg-white px-5 py-8 text-center text-sm text-ink/55">No matching workbooks are available for this grade yet.</p> : null}
        </div>
        <footer className="flex items-center justify-between gap-4 border-t border-[#eadbc2] px-6 py-4 sm:px-8">
          <p className="text-sm font-semibold text-ink/65">{selectedWorkbookCount} workbook{selectedWorkbookCount === 1 ? "" : "s"} selected</p>
          <button type="button" onClick={onClose} className="cta-button cta-button--light px-7">Done</button>
        </footer>
      </section>
    </div>
  );
}

export type PlanGeneratorProps = {
  context?: "public" | "authenticated";
  profileId?: string;
  initialStudentName?: string;
  initialStudentGradeLevel?: number | null;
  initialHolidayWeeks?: number;
  initialTeachingDaysPerWeek?: number;
  initialPreferredPrintPageSize?: PrintPageSize | null;
  suggestedPreferredPrintPageSize?: PrintPageSize | null;
  existingLearningYearId?: string;
  submitAction?: (formData: FormData) => Promise<void>;
  nativeWorkbookCatalog?: NativeWorkbookCatalogItem[];
  pricing: PlanPackPricing;
};

export function PlanGenerator({
  context = "public",
  profileId,
  initialStudentName = "",
  initialStudentGradeLevel = null,
  initialHolidayWeeks = DEFAULT_HOLIDAY_WEEKS,
  initialTeachingDaysPerWeek = 5,
  initialPreferredPrintPageSize = null,
  suggestedPreferredPrintPageSize = null,
  existingLearningYearId,
  submitAction,
  nativeWorkbookCatalog = [],
  pricing
}: PlanGeneratorProps) {
  const authenticated = context === "authenticated";
  const addingToExistingYear = Boolean(existingLearningYearId);
  const stepOrder = useMemo<Step[]>(
    () => addingToExistingYear ? ["subjects", "email"] : STEP_ORDER,
    [addingToExistingYear]
  );
  const [step, setStep] = useState<Step>(addingToExistingYear ? "subjects" : "setup");
  const [furthestStepIndex, setFurthestStepIndex] = useState(0);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [subjectCompletion, setSubjectCompletion] = useState<Record<number, SubjectCompletion>>({});
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [studentName, setStudentName] = useState(initialStudentName);
  const [studentGradeLevel, setStudentGradeLevel] = useState(
    initialStudentGradeLevel == null ? "" : String(initialStudentGradeLevel)
  );
  const [email, setEmail] = useState("");
  const [holidayWeeks, setHolidayWeeks] = useState(initialHolidayWeeks);
  const [teachingDaysPerWeek, setTeachingDaysPerWeek] = useState(initialTeachingDaysPerWeek);
  const [schoolYearStartDate, setSchoolYearStartDate] = useState("");
  const [schoolYearEndDate, setSchoolYearEndDate] = useState("");
  const schoolYearEndSuggestionLockedRef = useRef(false);
  const hasPersistedPrintPageSize = initialPreferredPrintPageSize !== null;
  const [preferredPrintPageSize, setPreferredPrintPageSize] = useState<PrintPageSize | "">(
    initialPreferredPrintPageSize ?? suggestedPreferredPrintPageSize ?? ""
  );
  const [scheduleConflict, setScheduleConflict] = useState<
    | { kind: "subject"; subjectId: number; requestedDays: number }
    | { kind: "week"; requestedDays: number; affectedIds: number[] }
    | null
  >(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [draftStorageKey, setDraftStorageKey] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nativeWorkbookChooserOpen, setNativeWorkbookChooserOpen] = useState(false);
  const [selectedNativeWorkbookIds, setSelectedNativeWorkbookIds] = useState<string[]>([]);
  const checkoutFormRef = useRef<HTMLFormElement>(null);
  const filesStoredRef = useRef(false);
  const filePersistenceRef = useRef<Promise<void>>(Promise.resolve());
  const filePersistenceErrorRef = useRef<Error | null>(null);
  const nextSubjectId = useMemo(
    () => Math.max(0, ...subjects.map((subject) => subject.id)) + 1,
    [subjects]
  );
  const selectedNativeWorkbooks = nativeWorkbookCatalog.filter((item) => selectedNativeWorkbookIds.includes(item.id));
  const selectedNativeWorkbookCards = useMemo(
    () => expandSelectedNativeWorkbookCards(nativeWorkbookCatalog, selectedNativeWorkbookIds),
    [nativeWorkbookCatalog, selectedNativeWorkbookIds]
  );
  const uploadedPageCount = subjects.reduce((total, subject) => total + subject.pageCount, 0);
  const nativeWorkbookPageCount = selectedNativeWorkbooks.reduce((total, item) => total + Number(item.pageCount ?? 0), 0);
  const totalSelectedPageCount = uploadedPageCount + nativeWorkbookPageCount;
  const subscriptionAddOnTotalInCents = selectedNativeWorkbooks
    .filter((item) => item.type === "elective" && item.accessState === "purchase_required")
    .reduce((total, item) => total + item.priceInCents, 0);
  const subscriptionCheckoutTotalInCents = pricing.subscriptionIntroPriceInCents + subscriptionAddOnTotalInCents;
  const pageCountPending = subjects.some((subject) => subject.pageCountPending);
  const exceedsInputPageLimit = totalSelectedPageCount > PLAN_GENERATOR_MAX_INPUT_PAGE_COUNT;

  useEffect(() => {
    if (authenticated) {
      setDraftReady(true);
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem(FORM_DRAFT_KEY) ?? "null") as {
        draftStorageKey?: string;
        step?: Step;
        furthestStepIndex?: number;
        studentName?: string;
        studentGradeLevel?: string;
        email?: string;
        holidayWeeks?: number;
        teachingDaysPerWeek?: number;
        schoolYearStartDate?: string;
        schoolYearEndDate?: string;
        preferredPrintPageSize?: PrintPageSize;
        subjects?: SubjectRow[];
        activeSubjectId?: number | null;
        selectedNativeWorkbookIds?: string[];
      } | null;
      const key = stored?.draftStorageKey || crypto.randomUUID();
      setDraftStorageKey(key);
      if (stored) {
        const restoredSubjects = (stored.subjects ?? []).map((subject) => ({
          ...subject,
          materialSetId: subject.materialSetId || crypto.randomUUID(),
          prerequisiteMaterialSetId: subject.prerequisiteMaterialSetId ?? "",
          notes: subject.notes ?? "",
          daysPerWeek: subject.daysPerWeek ?? "",
          fileNames: subject.fileNames ?? [],
          pageCount: subject.pageCount ?? 0,
          pageCountPending: false,
          pageCountIncomplete: subject.pageCountIncomplete ?? false
        }));
        setStep(stored.step ?? "setup");
        setFurthestStepIndex(stored.furthestStepIndex ?? 0);
        setStudentName(stored.studentName ?? "");
        setStudentGradeLevel(stored.studentGradeLevel ?? "");
        setEmail(stored.email ?? "");
        setHolidayWeeks(stored.holidayWeeks ?? DEFAULT_HOLIDAY_WEEKS);
        setTeachingDaysPerWeek(stored.teachingDaysPerWeek ?? initialTeachingDaysPerWeek);
        const restoredSchoolYear = restoreSchoolYearPeriod(
          stored.schoolYearStartDate,
          stored.schoolYearEndDate
        );
        setSchoolYearStartDate(restoredSchoolYear.startDate);
        setSchoolYearEndDate(restoredSchoolYear.endDate);
        schoolYearEndSuggestionLockedRef.current = restoredSchoolYear.endDateSuggestionLocked;
        if (!initialPreferredPrintPageSize) {
          setPreferredPrintPageSize(stored.preferredPrintPageSize ?? "");
        }
        setSubjects(restoredSubjects);
        setSelectedNativeWorkbookIds((stored.selectedNativeWorkbookIds ?? []).filter((id) =>
          nativeWorkbookCatalog.some((item) => item.id === id)
        ));
        setActiveSubjectId(stored.activeSubjectId ?? null);
        setSubjectCompletion(Object.fromEntries(restoredSubjects.map((subject) => [
          subject.id,
          { hasLabel: Boolean(subject.label.trim()), hasFiles: (subject.fileNames?.length ?? 0) > 0 }
        ])));
      }
    } catch {
      setDraftStorageKey(crypto.randomUUID());
    } finally {
      setDraftReady(true);
    }
  }, [authenticated, initialPreferredPrintPageSize, initialTeachingDaysPerWeek, nativeWorkbookCatalog]);

  useEffect(() => {
    if (authenticated || !draftReady || !draftStorageKey) return;
    localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify({
      draftStorageKey,
      step,
      furthestStepIndex,
      studentName,
      studentGradeLevel,
      email,
      holidayWeeks,
      teachingDaysPerWeek,
      schoolYearStartDate,
      schoolYearEndDate,
      preferredPrintPageSize,
      subjects,
      activeSubjectId,
      selectedNativeWorkbookIds
    }));
  }, [activeSubjectId, authenticated, draftReady, draftStorageKey, email, furthestStepIndex, holidayWeeks, preferredPrintPageSize, schoolYearEndDate, schoolYearStartDate, selectedNativeWorkbookIds, step, studentGradeLevel, studentName, subjects, teachingDaysPerWeek]);

  useEffect(() => {
    if (!isSubjectRequirementsError(storageError)) return;
    const savedSubjects = subjects.filter((subject) => subject.saved && subject.label.trim());
    const allSubjectsHaveMaterials = (savedSubjects.length > 0 && savedSubjects.every(
      (subject) => subjectCompletion[subject.id]?.hasFiles
    )) || selectedNativeWorkbookIds.length > 0;
    if (allSubjectsHaveMaterials) setStorageError(null);
  }, [selectedNativeWorkbookIds.length, storageError, subjectCompletion, subjects]);

  function goToStep(nextStep: Step) {
    const nextStepIndex = stepOrder.indexOf(nextStep);
    if (nextStepIndex === -1 || nextStepIndex > furthestStepIndex) return;
    setStep(nextStep);
  }

  function advanceToStep(nextStep: Step) {
    const nextStepIndex = stepOrder.indexOf(nextStep);
    setFurthestStepIndex((current) => Math.max(current, nextStepIndex));
    setStep(nextStep);
  }

  function updateSubjectCompletion(id: number, patch: Partial<SubjectCompletion>) {
    setSubjectCompletion((current) => ({
      ...current,
      [id]: {
        hasLabel: current[id]?.hasLabel ?? false,
        hasFiles: current[id]?.hasFiles ?? false,
        ...patch
      }
    }));
  }

  function addSubject() {
    if (activeSubjectId !== null) return;
    setSubjects((current) => [...current, {
      id: nextSubjectId,
      materialSetId: crypto.randomUUID(),
      prerequisiteMaterialSetId: "",
      label: "",
      notes: "",
      daysPerWeek: "",
      fileNames: [],
      pageCount: 0,
      pageCountPending: false,
      pageCountIncomplete: false,
      saved: false
    }]);
    setSubjectCompletion((current) => ({
      ...current,
      [nextSubjectId]: { hasLabel: false, hasFiles: false }
    }));
    setActiveSubjectId(nextSubjectId);
  }

  function toggleNativeWorkbook(item: NativeWorkbookCatalogItem) {
    setStorageError(null);
    setSelectedNativeWorkbookIds((current) => {
      if (current.includes(item.id)) return current.filter((id) => id !== item.id);
      const selected = nativeWorkbookCatalog.filter((candidate) => current.includes(candidate.id));
      const overlappingIds = new Set(selected.filter((candidate) =>
        candidate.memberWorkbookIds.some((workbookId) => item.memberWorkbookIds.includes(workbookId))
      ).map((candidate) => candidate.id));
      if (current.length >= 10 && overlappingIds.size === 0) {
        setStorageError("Choose no more than 10 Treeschool catalog items for one lesson plan.");
        return current;
      }
      return [...current.filter((id) => !overlappingIds.has(id)), item.id];
    });
  }

  function removeSubject(id: number) {
    setSubjects((current) => {
      const removed = current.find((subject) => subject.id === id);
      return current.filter((subject) => subject.id !== id).map((subject) =>
        removed && subject.prerequisiteMaterialSetId === removed.materialSetId
          ? { ...subject, prerequisiteMaterialSetId: "" }
          : subject
      );
    });
    setActiveSubjectId((current) => (current === id ? null : current));
    setSubjectCompletion((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (!authenticated && draftStorageKey) {
      void getStoredPlanPackDraft(draftStorageKey).then((stored) => stored && saveStoredPlanPackDraft({
        ...stored,
        files: stored.files.filter((file) => file.subjectId !== id)
      }));
    }
  }

  function updateSubject(id: number, patch: Partial<Pick<SubjectRow, "label" | "prerequisiteMaterialSetId" | "notes" | "daysPerWeek" | "fileNames" | "pageCount" | "pageCountPending" | "pageCountIncomplete">>) {
    setSubjects((current) => current.map((subject) => (subject.id === id ? { ...subject, ...patch } : subject)));
  }

  function chooseTeachingDays(nextDays: number) {
    const affectedIds = subjects
      .filter((subject) => subject.daysPerWeek && Number(subject.daysPerWeek) > nextDays)
      .map((subject) => subject.id);
    if (affectedIds.length > 0) {
      setScheduleConflict({ kind: "week", requestedDays: nextDays, affectedIds });
      return;
    }
    setTeachingDaysPerWeek(nextDays);
  }

  function chooseSubjectDays(subjectId: number, value: string) {
    const requestedDays = Number(value);
    if (value && requestedDays > teachingDaysPerWeek) {
      setScheduleConflict({ kind: "subject", subjectId, requestedDays });
      return;
    }
    updateSubject(subjectId, { daysPerWeek: value });
  }

  function saveSubject(id: number) {
    const labelInput = document.querySelector<HTMLInputElement>(`input[name="subjectLabel-${id}"]`);
    const fileInput = document.querySelector<HTMLInputElement>(`input[data-plan-pack-files="${id}"]`);
    if (!labelInput?.reportValidity()) return;
    if (!subjectCompletion[id]?.hasFiles) {
      fileInput?.setCustomValidity("Add at least one file for this subject.");
      fileInput?.reportValidity();
      fileInput?.setCustomValidity("");
      return;
    }
    setSubjects((current) => current.map((subject) => (subject.id === id ? { ...subject, saved: true } : subject)));
    setActiveSubjectId(null);
  }

  function persistSubjectFiles(id: number, files: File[]) {
    filePersistenceErrorRef.current = null;
    const selectedFileNames = files.map((file) => file.name);
    updateSubject(id, {
      fileNames: selectedFileNames,
      pageCount: 0,
      pageCountPending: files.length > 0,
      pageCountIncomplete: false
    });
    updateSubjectCompletion(id, { hasFiles: files.length > 0 });
    void countSelectedPdfPages(files).then(({ pageCount, incomplete }) => {
      setSubjects((current) => current.map((subject) => subject.id === id &&
        subject.fileNames.join("\u0000") === selectedFileNames.join("\u0000")
        ? { ...subject, pageCount, pageCountPending: false, pageCountIncomplete: incomplete }
        : subject));
    });
    if (authenticated || !draftStorageKey) return;

    filePersistenceRef.current = filePersistenceRef.current.then(async () => {
      const stored = await getStoredPlanPackDraft(draftStorageKey);
      const subjectIndex = subjects.findIndex((subject) => subject.id === id);
      await saveStoredPlanPackDraft({
        key: draftStorageKey,
        createdAt: stored?.createdAt ?? new Date().toISOString(),
        files: [
          ...(stored?.files ?? []).filter((file) => file.subjectId !== id),
          ...files.map((file) => ({
            subjectId: id,
            subjectIndex,
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified,
            file
          }))
        ]
      });
    }).catch((error) => {
      const storageFailure = error instanceof Error ? error : new Error("Could not preserve the selected files in this browser.");
      filePersistenceErrorRef.current = storageFailure;
      setStorageError(storageFailure.message);
    });
  }

  function goToSubjectFiles() {
    const studentName = document.querySelector<HTMLInputElement>('input[name="studentName"]');
    const studentGrade = document.querySelector<HTMLSelectElement>('select[name="studentGradeLevel"]');
    const holidayWeeksInput = document.querySelector<HTMLInputElement>('input[name="holidayWeeks"]');
    const startDateInput = document.querySelector<HTMLInputElement>('input[name="startDate"]');
    const endDateInput = document.querySelector<HTMLInputElement>('input[name="endDate"]');
    const printPageSizeInput = document.querySelector<HTMLSelectElement>('select[name="preferredPrintPageSize"]');

    for (const input of [studentName, studentGrade, holidayWeeksInput, startDateInput, endDateInput, printPageSizeInput]) {
      if (input && !input.reportValidity()) {
        return;
      }
    }

    advanceToStep("subjects");
  }

  async function beginCheckout() {
    const form = checkoutFormRef.current;
    if (!form || filesStoredRef.current || submitting) return;

    if (!authenticated) {
      for (const input of Array.from(form.querySelectorAll<HTMLInputElement>("input[data-plan-pack-files]"))) {
        input.required = false;
        input.value = "";
      }
    }

    filesStoredRef.current = true;
    setSubmitting(true);
    try {
      const formData = new FormData(form);
      if (!authenticated) formData.set("checkoutKind", "subscription");
      await (submitAction ?? startPlanPackSetupAction)(formData);
    } catch (error) {
      filesStoredRef.current = false;
      setSubmitting(false);
      setStorageError(
        error instanceof Error
          ? error.message
          : authenticated ? "Could not create the learning year." : "Could not open secure checkout. Please try again."
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (filesStoredRef.current || submitting) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    setStorageError(null);
    if (pageCountPending) {
      setStep("subjects");
      setStorageError("Wait a moment while Treeschool finishes counting the selected PDF pages.");
      return;
    }
    if (exceedsInputPageLimit) {
      setStep("subjects");
      setStorageError("This lesson plan contains too much material to process at once. Remove one or more workbooks, or split the curriculum into separate plans.");
      return;
    }
    const form = event.currentTarget;

    if (!form.checkValidity()) {
      const invalidControl = form.querySelector<HTMLElement>(":invalid");
      const invalidName = invalidControl?.getAttribute("name") ?? "";
      const invalidStep: Step =
        invalidName.startsWith("subjectLabel-") ||
        invalidName.startsWith("preCheckoutFiles-") ||
        invalidName.startsWith("subjectDaysPerWeek-")
          ? "subjects"
          : ["studentName", "studentGradeLevel", "holidayWeeks", "teachingDaysPerWeek", "startDate", "endDate", "preferredPrintPageSize"].includes(invalidName)
            ? "setup"
            : "email";
      setStep(invalidStep);
      setStorageError(
        invalidName === "termsAccepted"
          ? "Accept the Terms, Privacy Policy, and Refund Policy before continuing."
          : invalidName === "email"
            ? "Enter a valid parent email address before continuing."
            : invalidStep === "subjects"
            ? SUBJECT_REQUIREMENTS_ERROR
              : "Complete the highlighted plan detail before continuing."
      );
      requestAnimationFrame(() => {
        invalidControl?.focus();
        if (invalidControl instanceof HTMLInputElement || invalidControl instanceof HTMLSelectElement || invalidControl instanceof HTMLTextAreaElement) {
          invalidControl.reportValidity();
        }
      });
      return;
    }

    try {
      await filePersistenceRef.current;
      if (filePersistenceErrorRef.current) {
        throw filePersistenceErrorRef.current;
      }

      const savedSubjects = subjects.filter((subject) => subject.saved && subject.label.trim());
      const hasAllFiles = savedSubjects.length > 0 && savedSubjects.every(
        (subject) => subjectCompletion[subject.id]?.hasFiles
      );
      if (!hasAllFiles && selectedNativeWorkbookIds.length === 0) {
        throw new Error(`Add at least one PDF, text, or image file for every subject before ${authenticated ? "continuing" : "checkout"}.`);
      }
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : "Could not confirm the selected files in this browser before checkout."
      );
      setStep("subjects");
      return;
    }

    await beginCheckout();
  }

  return (
    <form ref={checkoutFormRef} action={submitAction ?? startPlanPackSetupAction} onSubmit={handleSubmit} noValidate className="space-y-6">
      <input type="hidden" name="draftStorageKey" value={draftStorageKey} />
      {selectedNativeWorkbookIds.map((id) => <input key={id} type="hidden" name="nativeCatalogItemIds" value={id} />)}
      {profileId ? <input type="hidden" name="profileId" value={profileId} /> : null}
      {existingLearningYearId ? <input type="hidden" name="learningYearId" value={existingLearningYearId} /> : null}
      {addingToExistingYear ? <input type="hidden" name="teachingDaysPerWeek" value={teachingDaysPerWeek} /> : null}
      {hasPersistedPrintPageSize ? (
        <input type="hidden" name="preferredPrintPageSize" value={preferredPrintPageSize} />
      ) : null}
      <div className="rounded-[22px] bg-[#f8f1e4] p-2">
        <div className={`progress-arrow-track grid ${addingToExistingYear ? "grid-cols-2" : authenticated ? "grid-cols-3" : "grid-cols-4"} text-center text-[13px] font-semibold tracking-normal sm:text-sm`}>
          {!addingToExistingYear ? <button
            type="button"
            onClick={() => goToStep("setup")}
            disabled={furthestStepIndex < 0}
            aria-current={step === "setup" ? "step" : undefined}
            className={`progress-arrow-step py-2.5 pl-3 pr-6 transition ${step === "setup" ? "progress-arrow-step--active text-white" : "progress-arrow-step--inactive"} disabled:cursor-not-allowed`}
          >
            1 · Details
          </button> : null}
          <button
            type="button"
            onClick={() => goToStep("subjects")}
            disabled={furthestStepIndex < (addingToExistingYear ? 0 : 1)}
            aria-current={step === "subjects" ? "step" : undefined}
            className={`progress-arrow-step py-2.5 pl-3 pr-6 transition ${step === "subjects" ? "progress-arrow-step--active text-white" : "progress-arrow-step--inactive"} disabled:cursor-not-allowed`}
          >
            {addingToExistingYear ? "1 · Subjects" : "2 · Subjects"}
          </button>
          <button
            type="button"
            onClick={() => goToStep("email")}
            disabled={furthestStepIndex < (addingToExistingYear ? 1 : 2)}
            aria-current={step === "email" ? "step" : undefined}
            className={`progress-arrow-step py-2.5 pl-3 pr-6 transition ${step === "email" ? "progress-arrow-step--active text-white" : "progress-arrow-step--inactive"} disabled:cursor-not-allowed`}
          >
            {addingToExistingYear ? "2 · Review" : "3 · Review"}
          </button>
          {!authenticated ? (
            <button type="button" disabled className="progress-arrow-payment rounded-full py-2.5 pl-6 pr-3 disabled:cursor-not-allowed">
              4 · Checkout
            </button>
          ) : null}
        </div>
      </div>

      {!addingToExistingYear ? <section className={step === "setup" ? "block" : "hidden"}>
        <p className="text-sm font-black uppercase tracking-[0.14em] text-earth">Step 1</p>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.05em] text-ink sm:text-[30px]">
          Set up the school year.
        </h2>
        <p className="mt-2 text-[16.5px] leading-[1.7] text-ink/68">
          {authenticated
            ? `Choose how many school-free weeks to leave open for ${studentName} before uploading the year’s teaching materials.`
            : "Tell us who this is for and how many school-free weeks to leave open before you upload the year’s teaching materials."}
        </p>

        {authenticated ? (
          <>
            <input type="hidden" name="studentName" value={studentName} />
            <input type="hidden" name="studentGradeLevel" value={studentGradeLevel} />
          </>
        ) : <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-ink">
            Student name
            <input
              name="studentName"
              value={studentName}
              placeholder="Emma"
              required
              onChange={(event) => setStudentName(event.target.value)}
              className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
            />
          </label>
          <label className="text-sm font-semibold text-ink">
            Student grade
            <select
              name="studentGradeLevel"
              required
              value={studentGradeLevel}
              onChange={(event) => setStudentGradeLevel(event.target.value)}
              className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
            >
              <option value="" disabled>
                Select grade
              </option>
              <option value="0">Kindergarten</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((grade) => (
                <option key={grade} value={grade}>
                  Grade {grade}
                </option>
              ))}
            </select>
          </label>
        </div>}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <label htmlFor="holidayWeeks">Holiday weeks</label>
              <HintPopover closeLabel="Close holiday weeks hint">
                Default: {DEFAULT_HOLIDAY_WEEKS} holiday weeks, which creates {WEEKS_IN_YEAR - DEFAULT_HOLIDAY_WEEKS} teaching weeks. Holiday weeks have no school; Treeschool distributes the uploaded work evenly across the remaining {WEEKS_IN_YEAR - holidayWeeks} teaching weeks.{" "}
                <strong>
                  You’ll get exactly {WEEKS_IN_YEAR - holidayWeeks} PDF files, sequentially ordered, each containing one week’s worth of teaching material across all your subjects.
                </strong>
              </HintPopover>
            </div>
            <input
              id="holidayWeeks"
              name="holidayWeeks"
              type="number"
              min="0"
              max="51"
              value={holidayWeeks}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  setHolidayWeeks(DEFAULT_HOLIDAY_WEEKS);
                  return;
                }
                setHolidayWeeks(Math.max(0, Math.min(51, Math.round(parsed))));
              }}
              className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <label htmlFor="teachingDaysPerWeek">Teaching days per week</label>
              <HintPopover closeLabel="Close teaching days hint">
                Treeschool will organize each weekly PDF into <strong>{teachingDaysPerWeek} numbered school days</strong>, each with its own summary page.
              </HintPopover>
            </div>
            <select
              id="teachingDaysPerWeek"
              name="teachingDaysPerWeek"
              value={teachingDaysPerWeek}
              onChange={(event) => chooseTeachingDays(Number(event.target.value))}
              className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
            >
              {Array.from({ length: 7 }, (_, index) => index + 1).map((days) => (
                <option key={days} value={days}>{days} {days === 1 ? "day" : "days"}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-ink">
            School year starts on
            <input
              name="startDate"
              type="date"
              required
              value={schoolYearStartDate}
              onChange={(event) => {
                const nextStart = event.target.value;
                const nextDates = applySchoolYearStartDateChange({
                  nextStartDate: nextStart,
                  currentEndDate: schoolYearEndDate,
                  endDateSuggestionLocked: schoolYearEndSuggestionLockedRef.current
                });
                setSchoolYearStartDate(nextStart);
                setSchoolYearEndDate(nextDates.endDate);
                schoolYearEndSuggestionLockedRef.current = nextDates.endDateSuggestionLocked;
              }}
              onBlur={() => {
                if (schoolYearStartDate && schoolYearEndDate) {
                  schoolYearEndSuggestionLockedRef.current = true;
                }
              }}
              className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
            />
          </label>
          <label className="text-sm font-semibold text-ink">
            School year ends on
            <input
              name="endDate"
              type="date"
              required
              disabled={!schoolYearStartDate}
              min={schoolYearStartDate || undefined}
              value={schoolYearEndDate}
              onChange={(event) => {
                schoolYearEndSuggestionLockedRef.current = true;
                setSchoolYearEndDate(event.target.value);
              }}
              className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544] disabled:cursor-not-allowed disabled:bg-[#f2eee7] disabled:text-ink/35"
            />
          </label>
        </div>

        {!hasPersistedPrintPageSize ? (
          <label className="mt-4 block max-w-sm text-sm font-semibold text-ink">
            Preferred Print Page Size
            <select
              name="preferredPrintPageSize"
              required
              value={preferredPrintPageSize}
              onChange={(event) => setPreferredPrintPageSize(event.target.value as PrintPageSize)}
              className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
            >
              <option value="" disabled>Choose a page size</option>
              {PRINT_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {suggestedPreferredPrintPageSize ? (
              <span className="mt-1.5 block text-xs font-medium leading-5 text-ink/50">
                Suggested from your approximate region. You can change it.
              </span>
            ) : null}
          </label>
        ) : null}

        <div className="mt-6">
          <button type="button" onClick={goToSubjectFiles} className="cta-button cta-button--light w-full">
            Next: upload materials
          </button>
        </div>
      </section> : null}

      <section className={step === "subjects" ? "block" : "hidden"}>
        <p className="text-sm font-black uppercase tracking-[0.14em] text-earth">Step {addingToExistingYear ? 1 : 2}</p>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.05em] text-ink sm:text-[30px]">
          Choose your year’s teaching materials.
        </h2>
        <p className="mt-2 text-[16.5px] leading-[1.7] text-ink/68">
          Select pre-indexed Treeschool workbooks, upload your own materials, or combine both. Treeschool will turn them into ordered weekly print packets{authenticated ? "." : " after checkout."}
        </p>
        {storageError ? (
          <p className="mt-4 rounded-[18px] border border-[#d9afa2] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">
            {storageError}
          </p>
        ) : null}

        <div className="mt-4 rounded-[20px] border border-[#eadbc2] bg-[#fffaf2] px-4 py-3.5 text-sm text-ink">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-black uppercase tracking-[0.11em] text-earth">Plan details</span>
            <span className="font-semibold">{studentName}</span>
            <span className="text-ink/55">{studentGradeLevel === "0" ? "Kindergarten" : `Grade ${studentGradeLevel}`}</span>
            {!addingToExistingYear ? (
              <button type="button" onClick={() => goToStep("setup")} className="ml-auto text-xs font-semibold text-earth underline underline-offset-4">
                Edit
              </button>
            ) : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="min-w-0 rounded-[13px] bg-white/75 px-3 py-2">
              <dt className="text-[11px] font-semibold text-ink/45">Teaching year</dt>
              <dd className="mt-0.5 font-semibold text-ink">{WEEKS_IN_YEAR - holidayWeeks} weeks <span className="font-normal text-ink/50">· {holidayWeeks} off</span></dd>
            </div>
            <div className="min-w-0 rounded-[13px] bg-white/75 px-3 py-2">
              <dt className="text-[11px] font-semibold text-ink/45">Weekly schedule</dt>
              <dd className="mt-0.5 font-semibold text-ink">{teachingDaysPerWeek} {teachingDaysPerWeek === 1 ? "day" : "days"} per week</dd>
            </div>
            <div className="min-w-0 rounded-[13px] bg-white/75 px-3 py-2">
              <dt className="text-[11px] font-semibold text-ink/45">School year</dt>
              <dd className="mt-0.5 truncate font-semibold text-ink" title={compactSchoolYearPeriod(schoolYearStartDate, schoolYearEndDate)}>{compactSchoolYearPeriod(schoolYearStartDate, schoolYearEndDate)}</dd>
            </div>
            <div className="min-w-0 rounded-[13px] bg-white/75 px-3 py-2">
              <dt className="text-[11px] font-semibold text-ink/45">Print size</dt>
              <dd className="mt-0.5 font-semibold text-ink" title={printPageSizeLabel(preferredPrintPageSize || null)}>{compactPrintPageSizeLabel(preferredPrintPageSize || null)}</dd>
            </div>
          </dl>
        </div>

        {nativeWorkbookCatalog.length > 0 ? (
          <button type="button" onClick={() => setNativeWorkbookChooserOpen(true)} className="cta-button cta-button--light mt-6 inline-flex items-center gap-2 px-5">
            <img src="/tree-icon.png" alt="" className="h-6 w-6 object-contain" />
            Add Treeschool Workbooks
          </button>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {selectedNativeWorkbookCards.map(({ workbook, selection }) => (
            <div key={`native-${selection.id}-${workbook.id}`} className="relative flex aspect-[4/3] min-w-0 flex-col overflow-hidden rounded-[18px] border border-[#9db78a] bg-[#e8f0df] p-3">
              <div className="inline-flex items-center gap-1 rounded-full bg-[#d5e4c7] px-2 py-1 text-[10px] font-black text-[#4d6a39]">
                <img src="/tree-icon.png" alt="" className="h-4 w-4 object-contain" /> Treeschool
              </div>
              <span className="mt-2 line-clamp-2 block pr-5 text-base font-semibold leading-5 text-ink">{workbook.title}</span>
              <span className="mt-1 block text-xs text-ink/55">{Number(workbook.pageCount ?? 0).toLocaleString()} pages</span>
              <span className="mt-auto block line-clamp-2 pt-2 text-[11px] font-semibold leading-4 text-[#4d6a39]">
                {selection.catalogKind === "bundle"
                  ? `From ${selection.title}`
                  : selection.accessState === "included"
                    ? "Included with plan"
                    : selection.accessState === "owned"
                      ? "Already purchased"
                      : formatMoney(selection.priceInCents, selection.currencyCode)}
              </span>
              <button
                type="button"
                onClick={() => toggleNativeWorkbook(selection)}
                aria-label={selection.catalogKind === "bundle" ? `Remove ${selection.title} and its workbooks` : `Remove ${workbook.title}`}
                title={selection.catalogKind === "bundle" ? `Remove ${selection.title} and its workbooks` : `Remove ${workbook.title}`}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white text-[#8b3e2f] shadow-sm"
              >×</button>
            </div>
          ))}
          {subjects.filter((subject) => subject.saved).map((subject) => (
            <div
              key={`card-${subject.id}`}
              className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-[18px] border border-[#c7d7b3] bg-[#eef5e4] transition hover:-translate-y-0.5 hover:border-[#7fa15a]"
            >
              <button
                type="button"
                onClick={() => setActiveSubjectId(subject.id)}
                disabled={activeSubjectId !== null}
                aria-expanded={activeSubjectId === subject.id}
                className="flex h-full w-full flex-col p-3 text-left disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span className="block pr-7 text-[11px] font-black uppercase tracking-[0.12em] text-[#658347]">Ready</span>
                <span className="mt-2 line-clamp-2 block pr-5 text-base font-semibold leading-5 text-ink">{subject.label}</span>
                <span className="mt-1 line-clamp-1 block text-xs text-ink/55">
                  {subject.prerequisiteMaterialSetId
                    ? `After ${subjects.find((candidate) => candidate.materialSetId === subject.prerequisiteMaterialSetId)?.label || "earlier material"} · `
                    : ""}{subject.fileNames.length} {subject.fileNames.length === 1 ? "file" : "files"}
                </span>
                <span className="mt-auto block pt-3 text-xs font-semibold text-earth">View details</span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${subject.label}`}
                title="Remove subject"
                onClick={() => {
                  if (window.confirm(`Remove ${subject.label}? This will also remove its selected files.`)) {
                    removeSubject(subject.id);
                  }
                }}
                className="absolute right-2 top-2 rounded-full p-1.5 text-[#8b3e2f] transition hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#8b3e2f]/30"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                </svg>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addSubject}
            disabled={activeSubjectId !== null}
            className="aspect-[4/3] min-w-0 rounded-[18px] border border-dashed border-[#8f6544] bg-white p-3 text-center text-earth transition hover:bg-[#fffaf2] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="block text-4xl font-light leading-none">+</span>
            <span className="mt-3 block text-sm font-semibold">Add My Own Workbook</span>
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {subjects.map((subject, index) => (
            <section key={subject.id} className={`${activeSubjectId === subject.id ? "block" : "hidden"} rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-4 sm:p-5`}>
              <input type="hidden" name="subjectIndexes" value={subject.id} />
              <input type="hidden" name={`materialSetId-${subject.id}`} value={subject.materialSetId} />
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-black uppercase tracking-[0.13em] text-earth">Subject {index + 1}</p>
                {!subject.saved ? (
                  <button type="button" onClick={() => removeSubject(subject.id)} className="text-xs font-semibold text-ink/55 underline underline-offset-4">
                    Cancel
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block text-sm font-semibold text-ink">
                  Subject name
                  <input
                    name={`subjectLabel-${subject.id}`}
                    value={subject.label}
                    required
                    placeholder="English"
                    onChange={(event) => {
                      updateSubject(subject.id, { label: event.target.value });
                      updateSubjectCompletion(subject.id, { hasLabel: event.target.value.trim().length > 0 });
                    }}
                    className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
                  />
                </label>
                <div className="block text-sm font-semibold text-ink">
                  <div className="flex items-center justify-start gap-2">
                    <label htmlFor={`prerequisiteMaterialSetId-${subject.id}`}>
                      Starts after <span className="font-medium text-ink/55">(optional)</span>
                    </label>
                    <HintPopover closeLabel="Close prerequisite material hint">
                      Choose an earlier material when this one must not appear until all planned content from that material has appeared. For example, make English Book 2 start after English Book 1.
                    </HintPopover>
                  </div>
                  <select
                    id={`prerequisiteMaterialSetId-${subject.id}`}
                    name={`prerequisiteMaterialSetId-${subject.id}`}
                    value={subject.prerequisiteMaterialSetId}
                    onChange={(event) => updateSubject(subject.id, { prerequisiteMaterialSetId: event.target.value })}
                    disabled={!subjects.slice(0, index).some((candidate) =>
                      candidate.id !== subject.id &&
                      candidate.materialSetId !== subject.materialSetId &&
                      candidate.saved &&
                      candidate.label.trim()
                    )}
                    className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544] disabled:cursor-not-allowed disabled:bg-[#f3eee6] disabled:text-ink/40"
                  >
                    <option value="">
                      {subjects.slice(0, index).some((candidate) => candidate.id !== subject.id && candidate.materialSetId !== subject.materialSetId && candidate.saved && candidate.label.trim())
                        ? "No prerequisite"
                        : "Add an earlier material first"}
                    </option>
                    {subjects.slice(0, index).filter((candidate) => candidate.id !== subject.id && candidate.materialSetId !== subject.materialSetId && candidate.saved && candidate.label.trim()).map((candidate) => (
                      <option key={candidate.materialSetId} value={candidate.materialSetId}>
                        After {candidate.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="mt-3 block text-sm font-semibold text-ink">
                How often do you teach this subject? <span className="font-medium text-ink/55">(optional)</span>
                <select
                  name={`subjectDaysPerWeek-${subject.id}`}
                  value={subject.daysPerWeek}
                  onChange={(event) => chooseSubjectDays(subject.id, event.target.value)}
                  className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
                >
                  <option value="">Let Treeschool decide</option>
                  {Array.from({ length: 7 }, (_, index) => index + 1).map((days) => (
                    <option key={days} value={days}>
                      {days === teachingDaysPerWeek ? `Every teaching day (${days})` : `${days} ${days === 1 ? "day" : "days"} per week`}
                    </option>
                  ))}
                </select>
                <span className="mt-1.5 block text-xs font-medium leading-5 text-ink/50">
                  This controls how work is spread across the numbered school days, not how many separate lessons must happen in a day.
                </span>
              </label>
              <label className="mt-3 block rounded-[20px] border border-dashed border-[#c8af8b] bg-white px-4 py-5 text-sm font-semibold text-ink">
                <span className="block">Files for this subject</span>
                <span className="mt-1 block text-xs font-medium leading-[1.55] text-ink/55">
                  {authenticated
                    ? "PDF, text, or image. These will upload when you create the learning year."
                    : "PDF, text, or image. These are saved here for checkout, then uploaded after payment."}
                </span>
                <input
                  data-plan-pack-files={subject.id}
                  name={`preCheckoutFiles-${subject.id}`}
                  type="file"
                  accept={PLAN_GENERATOR_ACCEPTED_FILE_TYPES}
                  multiple
                  required={!subjectCompletion[subject.id]?.hasFiles}
                  onChange={(event) => persistSubjectFiles(subject.id, Array.from(event.target.files ?? []))}
                  className="mt-4 block w-full text-sm text-ink file:mr-4 file:rounded-full file:border-0 file:bg-[#7fa15a] file:px-4 file:py-2 file:font-semibold file:text-white"
                />
                {subject.fileNames?.length ? (
                  <span className="mt-2 block text-xs font-medium text-[#4d6a39]">
                    {authenticated ? "Selected" : "Saved in this browser"}: {subject.fileNames.join(", ")} · {subject.pageCountPending
                      ? "counting PDF pages…"
                      : `${subject.pageCount.toLocaleString()} PDF ${subject.pageCount === 1 ? "page" : "pages"}${subject.pageCountIncomplete ? "+" : ""}`}
                  </span>
                ) : null}
              </label>
              <div className="mt-3 text-sm font-semibold text-ink">
                <div className="flex items-center justify-start gap-2">
                  <label htmlFor={`parentNotes-${subject.id}`}>
                    Special instructions <span className="font-medium text-ink/55">(optional)</span>
                  </label>
                  <HintPopover closeLabel="Close special instructions hint">
                    Use this field to direct how Treeschool plans this subject—for example, ask it to skip tests, use only workbook pages, or pair student work with an answer key.
                  </HintPopover>
                </div>
                <textarea
                  id={`parentNotes-${subject.id}`}
                  name={`parentNotes-${subject.id}`}
                  value={subject.notes ?? ""}
                  rows={3}
                  maxLength={700}
                  placeholder="Example: skip tests, use only workbook pages, pair with answer key later..."
                  onChange={(event) => updateSubject(subject.id, { notes: event.target.value })}
                  className="mt-2 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 py-3 text-base font-normal outline-none focus:border-[#8f6544]"
                />
              </div>
              <button type="button" onClick={() => saveSubject(subject.id)} className="cta-button cta-button--light mt-4 w-full">
                Save Subject
              </button>
            </section>
          ))}
        </div>

        {exceedsInputPageLimit ? (
          <p role="alert" className="mt-4 rounded-[16px] border border-[#d9afa2] bg-[#fff1ec] px-4 py-3 text-xs font-semibold text-[#8b3e2f]">
            This lesson plan contains too much material to process at once. Remove one or more workbooks, or split the curriculum into separate plans.
          </p>
        ) : null}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => advanceToStep("email")}
            disabled={(subjects.length === 0 && selectedNativeWorkbookIds.length === 0) || activeSubjectId !== null || subjects.some((subject) => !subject.saved) || pageCountPending || exceedsInputPageLimit}
            className="cta-button cta-button--light w-full disabled:cursor-not-allowed disabled:opacity-45"
          >
            Next: save setup
          </button>
        </div>
      </section>

      <section className={step === "email" ? "block" : "hidden"}>
        <p className="text-sm font-black uppercase tracking-[0.14em] text-earth">Step {addingToExistingYear ? 2 : 3}</p>
        <h2 className="mt-2 text-[26px] font-semibold tracking-[-0.05em] text-ink sm:text-[30px]">
          {authenticated
            ? addingToExistingYear ? "Review and add these materials." : "Review and create your learning year."
            : "Review your plan and start your Single membership."}
        </h2>
        <p className="mt-3 text-sm leading-[1.7] text-ink/68">
          {authenticated
            ? `Treeschool will upload these materials and begin reading each PDF${addingToExistingYear ? " for the current learning year" : ""}.`
            : "We’ll save this setup to a passwordless parent account, then open secure checkout for Single."}
        </p>
        {storageError ? (
          <p role="alert" className="mt-4 rounded-[18px] border border-[#d9afa2] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">
            {storageError}
          </p>
        ) : null}
        <div className="mt-5 rounded-[20px] border border-[#eadbc2] bg-[#fffaf2] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.13em] text-earth">{authenticated ? "Plan summary" : "Order summary"}</p>
            {!authenticated ? <p className="text-base font-semibold text-ink">{formatMoney(subscriptionCheckoutTotalInCents, pricing.currencyCode)} today</p> : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-ink/50">Student</dt><dd className="mt-0.5 font-semibold text-ink">{studentName}</dd></div>
            <div><dt className="text-xs text-ink/50">Grade</dt><dd className="mt-0.5 font-semibold text-ink">{studentGradeLevel === "0" ? "Kindergarten" : `Grade ${studentGradeLevel}`}</dd></div>
            <div><dt className="text-xs text-ink/50">Materials</dt><dd className="mt-0.5 font-semibold text-ink">{subjects.length + selectedNativeWorkbookCards.length}</dd></div>
            <div><dt className="text-xs text-ink/50">Content pages</dt><dd className="mt-0.5 font-semibold text-ink">{totalSelectedPageCount.toLocaleString()}</dd></div>
            <div><dt className="text-xs text-ink/50">Teaching weeks</dt><dd className="mt-0.5 font-semibold text-ink">{WEEKS_IN_YEAR - holidayWeeks}</dd></div>
            <div><dt className="text-xs text-ink/50">Page size</dt><dd className="mt-0.5 font-semibold text-ink">{printPageSizeLabel(preferredPrintPageSize || null)}</dd></div>
          </dl>
          {!authenticated ? <div className="mt-4 space-y-2 border-t border-[#eadbc2] pt-3 text-sm">
            <div className="flex justify-between gap-4"><span className="text-ink/65">Single · first month</span><span className="font-semibold text-ink">{formatMoney(pricing.subscriptionIntroPriceInCents, pricing.currencyCode)}</span></div>
            {selectedNativeWorkbooks.map((item) => <div key={`summary-${item.id}`} className="flex justify-between gap-4"><span className="min-w-0 truncate text-ink/65">{item.title}</span><span className="font-semibold text-ink">{item.accessState === "owned" ? "Owned" : item.type === "core" || item.accessState === "included" ? "Included" : formatMoney(item.priceInCents, item.currencyCode)}</span></div>)}
            <div className="flex justify-between gap-4 border-t border-[#eadbc2] pt-2 text-base"><strong>Total today</strong><strong>{formatMoney(subscriptionCheckoutTotalInCents, pricing.currencyCode)}</strong></div>
            <p className="text-xs leading-5 text-ink/55">Then {formatMoney(pricing.subscriptionMonthlyPriceInCents, pricing.currencyCode)}/month for up to {pricing.includedStudentCount} children. Cancel anytime.</p>
          </div> : null}
          <p className="mt-3 border-t border-[#eadbc2] pt-3 text-xs leading-[1.6] text-ink/60">
            {authenticated
              ? "Your uploaded materials will be indexed before Treeschool builds the sequential weekly lesson-plan PDFs."
              : "Single includes the complete Treeschool experience for one student: printable weekly lesson plans, progress, attendance, grades, and ongoing planning tools."}
          </p>
        </div>
        {!authenticated ? <><label className="mt-6 block text-sm font-semibold text-ink">
          Parent email
          <input
            name="email"
            type="email"
            value={email}
            required
            placeholder="you@example.com"
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
          />
        </label>
        <p className="mt-4 rounded-[18px] bg-[#eef5e4] px-4 py-3 text-sm leading-[1.65] text-[#4d6a39]">
          We’ll email an account-access link that can also resume checkout. Your selected files stay in this browser and upload after membership checkout; on another device, you’ll need to attach them again.
        </p>
        <label className="mt-5 flex items-start gap-3 rounded-[18px] border border-[#dcc8aa] bg-white px-4 py-3 text-sm leading-6 text-ink/70">
          <input name="termsAccepted" type="checkbox" value="yes" required className="mt-1 h-4 w-4 accent-[#7fa15a]" />
          <span>
            I agree to the <a href="/terms" target="_blank" className="font-semibold text-earth underline">Terms</a> and acknowledge the <a href="/privacy" target="_blank" className="font-semibold text-earth underline">Privacy Policy</a> and <a href="/refunds" target="_blank" className="font-semibold text-earth underline">Refund Policy</a>.
          </span>
        </label></> : null}
        <div className="mt-6">
          <SubmitButton
            pending={submitting}
            authenticated={authenticated}
            addingToExistingYear={addingToExistingYear}
          />
        </div>
      </section>
      <TeachingDaysConflictDialog
        open={scheduleConflict != null}
        title={scheduleConflict?.kind === "subject" ? "Increase the school week?" : "Some subjects use more days"}
        message={scheduleConflict?.kind === "subject"
          ? `This school week currently has ${teachingDaysPerWeek} teaching days. To teach this subject on ${scheduleConflict.requestedDays} days, increase the whole week to ${scheduleConflict.requestedDays} days.`
          : scheduleConflict?.kind === "week"
            ? `${scheduleConflict.affectedIds.length} subject schedule${scheduleConflict.affectedIds.length === 1 ? " exceeds" : "s exceed"} the new ${scheduleConflict.requestedDays}-day week. Treeschool can reduce ${scheduleConflict.affectedIds.length === 1 ? "that subject" : "those subjects"} to every teaching day.`
            : ""}
        cancelLabel={scheduleConflict?.kind === "subject" ? `Keep ${teachingDaysPerWeek}-day week` : `Keep ${teachingDaysPerWeek}-day week`}
        confirmLabel={scheduleConflict?.kind === "subject"
          ? `Change week to ${scheduleConflict.requestedDays} days`
          : scheduleConflict?.kind === "week" ? `Use ${scheduleConflict.requestedDays}-day week` : "Continue"}
        onCancel={() => setScheduleConflict(null)}
        onConfirm={() => {
          if (scheduleConflict?.kind === "subject") {
            setTeachingDaysPerWeek(scheduleConflict.requestedDays);
            updateSubject(scheduleConflict.subjectId, { daysPerWeek: String(scheduleConflict.requestedDays) });
          } else if (scheduleConflict?.kind === "week") {
            setTeachingDaysPerWeek(scheduleConflict.requestedDays);
            setSubjects((current) => current.map((subject) =>
              scheduleConflict.affectedIds.includes(subject.id)
                ? { ...subject, daysPerWeek: String(scheduleConflict.requestedDays) }
                : subject
            ));
          }
          setScheduleConflict(null);
        }}
      />
      <NativeWorkbookChooser
        open={nativeWorkbookChooserOpen}
        onClose={() => setNativeWorkbookChooserOpen(false)}
        catalog={nativeWorkbookCatalog}
        selectedIds={selectedNativeWorkbookIds}
        studentGradeLevel={studentGradeLevel}
        currencyCode={pricing.currencyCode}
        onToggle={toggleNativeWorkbook}
      />
    </form>
  );
}

export function PlanPackIntakeForm({
  initialPreferredPrintPageSize = null,
  suggestedPreferredPrintPageSize = null,
  nativeWorkbookCatalog = [],
  pricing
}: {
  initialPreferredPrintPageSize?: PrintPageSize | null;
  suggestedPreferredPrintPageSize?: PrintPageSize | null;
  nativeWorkbookCatalog?: NativeWorkbookCatalogItem[];
  pricing: PlanPackPricing;
}) {
  return (
    <PlanGenerator
      initialPreferredPrintPageSize={initialPreferredPrintPageSize}
      suggestedPreferredPrintPageSize={suggestedPreferredPrintPageSize}
      nativeWorkbookCatalog={nativeWorkbookCatalog}
      pricing={pricing}
    />
  );
}
