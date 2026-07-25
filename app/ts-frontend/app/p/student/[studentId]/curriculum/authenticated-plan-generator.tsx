"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { CurriculumCompletenessDialog } from "../../../../../components/curriculum-completeness-dialog";
import { GearIcon } from "../../../../../components/gear-icon";
import { TeachingDaysConflictDialog } from "../../../../../components/teaching-days-conflict-dialog";
import {
  PlanCreationProgress,
  type PlanCreationProgressValue
} from "../../../../../components/plan-creation-progress";
import type {
  CurriculumCompletenessActionResult,
  CurriculumCompletenessResult
} from "../../../../../lib/curriculum-completeness/server";
import {
  PRINT_PAGE_SIZE_OPTIONS,
  compactPrintPageSizeLabel,
  printPageSizeLabel,
  type PrintPageSize
} from "../../../../../lib/print-page-sizes";
import {
  deleteStoredAuthenticatedPlanFiles,
  getStoredAuthenticatedPlanFiles,
  saveStoredAuthenticatedPlanFiles
} from "./authenticated-plan-draft-storage";
import type { NativeWorkbookCatalogItem } from "../../../../../lib/native-workbooks/server";
import { NativeWorkbookChooserDialog } from "./native-workbook-chooser-dialog";
import { NativeWorkbookContentReview } from "./native-workbook-content-review";
import { compactSchoolYearPeriod, defaultSchoolYearEnd } from "../../../../../lib/plan-generator-dates";
import {
  PLAN_GENERATOR_ACCEPTED_FILE_TYPES,
  PLAN_GENERATOR_MAX_INPUT_PAGE_COUNT
} from "../../../../../lib/plan-generator-contract";

// MAINTAINER NOTE: This subscriber experience parallels the public marketing
// funnel. Review docs/plan-generator-parity.md and run
// `bun run verify:plan-generators` whenever either experience changes.

type SubjectDraft = {
  id: number;
  uploadId: string;
  materialSetId: string;
  label: string;
  prerequisiteMaterialSetId: string;
  notes: string;
  daysPerWeek: string;
  fileNames: string[];
  fileSelectionKey: string;
  pageCount: number;
  pageCountPending: boolean;
  pageCountIncomplete: boolean;
  saved: boolean;
};

type Step = "details" | "subjects" | "review";

type ExistingDocumentCard = {
  id: string;
  materialSetId: string;
  prerequisiteMaterialSetId: string | null;
  label: string;
  subjectLabel: string | null;
  detail: string;
  status: string;
  statusKind: "ready" | "failed" | "queued" | "processing";
  summary: string | null;
  parentNotes: string | null;
  subjectDaysPerWeek: number | null;
  pageCount: number;
  sourceKind?: "pdf" | "text" | "image" | "native_workbook";
};

type StoredAuthenticatedPlanMetadata = {
  version: 2 | 3;
  updatedAt: string;
  step: Step;
  holidayWeeks: number;
  teachingDaysPerWeek: number;
  schoolYearStartDate?: string;
  schoolYearEndDate?: string;
  preferredPrintPageSize: PrintPageSize | "";
  subjects: SubjectDraft[];
  activeSubjectId: number | null;
};

const AUTHENTICATED_DRAFT_VERSION = 3;
const AUTHENTICATED_DRAFT_PREFIX = "treeschool-authenticated-plan-draft";

function dateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function HintPopover({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-block font-medium"
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
        className="text-xs text-earth underline underline-offset-4"
      >
        What’s this?
      </button>
      {open ? (
        <span role="tooltip" className="absolute left-0 top-full z-30 block w-72 max-w-[80vw] pt-2">
          <span className="relative block rounded-[16px] border border-[#c7d7b3] bg-[#eef5e4] px-3 py-2 pr-8 text-xs font-medium leading-[1.55] text-[#4d6a39] shadow-lg">
            {children}
            <button
              type="button"
              aria-label={closeLabel}
              onClick={() => setOpen(false)}
              className="absolute right-2 top-1.5 rounded-full p-1 text-base leading-none hover:bg-white/70"
            >
              ×
            </button>
          </span>
        </span>
      ) : null}
    </span>
  );
}

function SubmitButton({
  addingToExistingYear,
  disabled = false,
  subjectCount = 0,
  forcePending = false
}: {
  addingToExistingYear: boolean;
  disabled?: boolean;
  subjectCount?: number;
  forcePending?: boolean;
}) {
  const { pending } = useFormStatus();
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const isPending = pending || forcePending;

  useEffect(() => {
    if (!isPending) {
      setPendingSeconds(0);
      return;
    }
    const handle = window.setInterval(() => setPendingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(handle);
  }, [isPending]);

  return (
    <div>
      <button data-generator-upload-submit="true" type="submit" disabled={isPending || disabled} className="cta-button cta-button--dark w-full disabled:opacity-45">
        {isPending
          ? addingToExistingYear
            ? `Uploading ${subjectCount} new ${subjectCount === 1 ? "subject" : "subjects"}…`
            : "Creating your plan…"
          : addingToExistingYear
            ? `Upload ${subjectCount} new ${subjectCount === 1 ? "subject" : "subjects"} and continue`
            : "Create plan"}
      </button>
      {isPending ? (
        <div className="mt-4 rounded-[18px] border border-[#c7d7b3] bg-[#eef5e4] px-4 py-4">
          <PlanCreationProgress progress={{
            stage: "uploading",
            percent: Math.min(14, 3 + pendingSeconds * 0.6),
            label: pendingSeconds < 3
              ? "Preparing your teaching materials…"
              : pendingSeconds < 12
                ? "Uploading your teaching materials…"
                : pendingSeconds < 25
                  ? "Verifying the uploaded files…"
                  : "Starting the material review…",
            detail: "Keep this page open until the upload finishes. Treeschool will then begin reading each file."
          }} compact />
        </div>
      ) : null}
    </div>
  );
}

export function AuthenticatedPlanGenerator({
  profileId,
  studentName,
  studentGradeLevel,
  existingLearningYearId,
  totalWeeks = 36,
  teachingDaysPerWeek: initialTeachingDaysPerWeek = 5,
  schoolYearStartDate: initialSchoolYearStartDate = null,
  schoolYearEndDate: initialSchoolYearEndDate = null,
  preferredPrintPageSize: initialPreferredPrintPageSize,
  suggestedPreferredPrintPageSize = null,
  submitAction,
  updateDetailsAction,
  existingDocuments = [],
  deleteDocumentAction,
  updateDocumentAction,
  planningAction,
  retryPlanningAction,
  completenessAction,
  canStartPlanning = false,
  planningButtonLabel = "Plan the year",
  showPlanningAction = true,
  planningProgress,
  planningFailed = false,
  qualityControlFailed = false,
  nativeWorkbooks = [],
  recommendedNativeCurriculum = null,
  addNativeWorkbooksAction,
  purchaseNativeWorkbookAction,
  checkoutCanceled = false,
  clearSavedDraft = false
}: {
  profileId: string;
  studentName: string;
  studentGradeLevel: number | null;
  existingLearningYearId?: string;
  totalWeeks?: number;
  teachingDaysPerWeek?: number | null;
  schoolYearStartDate?: string | null;
  schoolYearEndDate?: string | null;
  preferredPrintPageSize: PrintPageSize | null;
  suggestedPreferredPrintPageSize?: PrintPageSize | null;
  submitAction: (formData: FormData) => Promise<void>;
  updateDetailsAction?: (formData: FormData) => Promise<void>;
  existingDocuments?: ExistingDocumentCard[];
  deleteDocumentAction?: (documentId: string, formData: FormData) => Promise<void>;
  updateDocumentAction?: (formData: FormData) => Promise<void>;
  planningAction?: (formData: FormData) => Promise<void>;
  retryPlanningAction?: (formData: FormData) => Promise<void>;
  completenessAction?: (formData: FormData) => Promise<CurriculumCompletenessActionResult>;
  canStartPlanning?: boolean;
  planningButtonLabel?: string;
  showPlanningAction?: boolean;
  planningProgress?: PlanCreationProgressValue | null;
  planningFailed?: boolean;
  qualityControlFailed?: boolean;
  nativeWorkbooks?: NativeWorkbookCatalogItem[];
  recommendedNativeCurriculum?: NativeWorkbookCatalogItem | null;
  addNativeWorkbooksAction?: (formData: FormData) => Promise<void>;
  purchaseNativeWorkbookAction?: (formData: FormData) => Promise<void>;
  checkoutCanceled?: boolean;
  clearSavedDraft?: boolean;
}) {
  const router = useRouter();
  const addingToExistingYear = Boolean(existingLearningYearId);
  const [step, setStep] = useState<Step>(addingToExistingYear ? "subjects" : "details");
  const [holidayWeeks, setHolidayWeeks] = useState(52 - totalWeeks);
  const [teachingDaysPerWeek, setTeachingDaysPerWeek] = useState(initialTeachingDaysPerWeek ?? 5);
  const initialSchoolYearStartDateValue = dateInputValue(initialSchoolYearStartDate);
  const initialSchoolYearEndDateValue = dateInputValue(initialSchoolYearEndDate)
    || (initialSchoolYearStartDateValue ? defaultSchoolYearEnd(initialSchoolYearStartDateValue) : "");
  const schoolYearStartDate = initialSchoolYearStartDateValue;
  const schoolYearEndDate = initialSchoolYearEndDateValue;
  const hasPersistedPrintPageSize = initialPreferredPrintPageSize !== null;
  const [preferredPrintPageSize, setPreferredPrintPageSize] = useState<PrintPageSize | "">(
    initialPreferredPrintPageSize ?? suggestedPreferredPrintPageSize ?? ""
  );
  const [subjects, setSubjects] = useState<SubjectDraft[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [editingPlanDetails, setEditingPlanDetails] = useState(false);
  const [showCompleteness, setShowCompleteness] = useState(false);
  const [showAddSourceChoice, setShowAddSourceChoice] = useState(false);
  const [showNativeWorkbookChooser, setShowNativeWorkbookChooser] = useState(false);
  const [reviewingNativeDocumentId, setReviewingNativeDocumentId] = useState<string | null>(null);
  const [reviewingCompleteness, setReviewingCompleteness] = useState(false);
  const [startingPlan, setStartingPlan] = useState(false);
  const [uploadSubmissionStarted, setUploadSubmissionStarted] = useState(false);
  const [completenessResult, setCompletenessResult] = useState<CurriculumCompletenessResult | null>(null);
  const [completenessError, setCompletenessError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [draftStorageError, setDraftStorageError] = useState<string | null>(null);
  const [storedFilesRevision, setStoredFilesRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const subjectFormContainerRef = useRef<HTMLDivElement>(null);
  const storedFilesRef = useRef<Map<number, File[]>>(new Map());
  const filePersistenceRef = useRef<Promise<void>>(Promise.resolve());
  const [scheduleConflict, setScheduleConflict] = useState<
    | { kind: "subject"; subjectId: number; requestedDays: number }
    | { kind: "week"; requestedDays: number; affectedIds: number[] }
    | null
  >(null);
  const nextSubjectId = Math.max(0, ...subjects.map((subject) => subject.id)) + 1;
  const draftKey = `${profileId}:${existingLearningYearId ?? "new-learning-year"}`;
  const draftMetadataKey = `${AUTHENTICATED_DRAFT_PREFIX}:${draftKey}`;
  const newLearningYearDraftKey = `${profileId}:new-learning-year`;
  const indexingActive = existingDocuments.some((document) =>
    document.statusKind === "queued" || document.statusKind === "processing"
  );

  useEffect(() => {
    if (indexingActive) setEditingPlanDetails(false);
  }, [indexingActive]);

  useEffect(() => {
    let cancelled = false;

    async function restoreDraft() {
      try {
        if (clearSavedDraft) {
          const keysToClear = Array.from(new Set([draftKey, newLearningYearDraftKey]));
          for (const key of keysToClear) {
            localStorage.removeItem(`${AUTHENTICATED_DRAFT_PREFIX}:${key}`);
          }
          storedFilesRef.current = new Map();
          const url = new URL(window.location.href);
          url.searchParams.delete("clearDraft");
          window.history.replaceState(window.history.state, "", url);
          void Promise.all(keysToClear.map((key) =>
            deleteStoredAuthenticatedPlanFiles(key).catch(() => undefined)
          ));
          return;
        }
        const storedMetadata = JSON.parse(localStorage.getItem(draftMetadataKey) ?? "null") as StoredAuthenticatedPlanMetadata | null;
        if (!storedMetadata) return;
        if (storedMetadata.version !== 2 && storedMetadata.version !== AUTHENTICATED_DRAFT_VERSION) {
          localStorage.removeItem(draftMetadataKey);
          void deleteStoredAuthenticatedPlanFiles(draftKey).catch(() => undefined);
          return;
        }

        let storedFileDraft: Awaited<ReturnType<typeof getStoredAuthenticatedPlanFiles>>;
        try {
          storedFileDraft = await getStoredAuthenticatedPlanFiles(draftKey);
        } catch {
          storedFileDraft = undefined;
          setDraftStorageError("Your subject details were restored, but the selected files need to be attached again.");
        }
        if (cancelled) return;

        const filesBySubject = new Map<number, File[]>();
        for (const storedFile of storedFileDraft?.files ?? []) {
          const current = filesBySubject.get(storedFile.subjectId) ?? [];
          current.push(storedFile.file);
          filesBySubject.set(storedFile.subjectId, current);
        }
        storedFilesRef.current = filesBySubject;

        {
          const restoredSubjects = (storedMetadata.subjects ?? []).map((subject) => {
            const restoredFiles = filesBySubject.get(subject.id) ?? [];
            return {
              ...subject,
              uploadId: subject.uploadId || crypto.randomUUID(),
              materialSetId: subject.materialSetId || subject.uploadId || crypto.randomUUID(),
              prerequisiteMaterialSetId: subject.prerequisiteMaterialSetId || "",
              fileNames: restoredFiles.map((file) => file.name),
              fileSelectionKey: restoredFiles
                .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
                .join("|"),
              pageCountPending: false
            };
          });
          const expectedFileCount = (storedMetadata.subjects ?? []).reduce(
            (total, subject) => total + (subject.fileNames?.length ?? 0),
            0
          );
          const restoredFileCount = Array.from(filesBySubject.values()).reduce(
            (total, files) => total + files.length,
            0
          );
          const firstSubjectMissingFiles = restoredSubjects.find((subject) => subject.fileNames.length === 0);
          if (expectedFileCount > restoredFileCount) {
            setDraftStorageError("Your subject details were restored, but one or more files need to be attached again.");
          }
          setStep(storedMetadata.step ?? (addingToExistingYear ? "subjects" : "details"));
          setHolidayWeeks(storedMetadata.holidayWeeks);
          setTeachingDaysPerWeek(storedMetadata.teachingDaysPerWeek);
          setPreferredPrintPageSize(storedMetadata.preferredPrintPageSize);
          setSubjects(restoredSubjects);
          setActiveSubjectId(storedMetadata.activeSubjectId ?? firstSubjectMissingFiles?.id ?? null);
          setDraftNotice(
            restoredSubjects.length > 0
              ? expectedFileCount > restoredFileCount
                ? "Your saved subject details were restored from this browser."
                : "Your saved setup and selected files were restored from this browser."
              : "Your saved plan details were restored from this browser."
          );
          setStoredFilesRevision((revision) => revision + 1);
        }
      } catch {
        setDraftStorageError("The saved form details could not be read. Please check the fields before continuing.");
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    }

    void restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [
    addingToExistingYear,
    clearSavedDraft,
    draftKey,
    draftMetadataKey,
    newLearningYearDraftKey
  ]);

  useEffect(() => {
    if (!draftReady) return;
    const metadata: StoredAuthenticatedPlanMetadata = {
      version: AUTHENTICATED_DRAFT_VERSION,
      updatedAt: new Date().toISOString(),
      step,
      holidayWeeks,
      teachingDaysPerWeek,
      schoolYearStartDate,
      schoolYearEndDate,
      preferredPrintPageSize,
      subjects,
      activeSubjectId
    };
    try {
      localStorage.setItem(draftMetadataKey, JSON.stringify(metadata));
    } catch {
      setDraftStorageError("This browser could not save the draft. Keep this page open until the upload finishes.");
    }
  }, [activeSubjectId, draftMetadataKey, draftReady, holidayWeeks, preferredPrintPageSize, schoolYearEndDate, schoolYearStartDate, step, subjects, teachingDaysPerWeek]);

  const attachStoredFilesToInputs = useCallback(() => {
    if (!formRef.current) return;
    for (const [subjectId, files] of storedFilesRef.current) {
      const input = formRef.current.querySelector<HTMLInputElement>(
        `input[name="preCheckoutFiles-${subjectId}"]`
      );
      if (!input || files.length === 0) continue;
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      input.files = transfer.files;
    }
  }, []);

  useEffect(() => {
    attachStoredFilesToInputs();
  }, [attachStoredFilesToInputs, storedFilesRevision, subjects]);

  function advance(target: Step) {
    setStep(target);
  }

  function discardBrowserDraft() {
    const confirmed = window.confirm(
      "Discard this saved draft and its selected files? This cannot be undone."
    );
    if (!confirmed) return;
    const url = new URL(window.location.href);
    url.searchParams.set("clearDraft", "1");
    window.location.assign(url.toString());
  }

  function advanceToSubjects() {
    const printPageSizeInput = document.querySelector<HTMLSelectElement>(
      'select[name="preferredPrintPageSize"]'
    );
    const startDateInput = document.querySelector<HTMLInputElement>('input[name="startDate"]');
    const endDateInput = document.querySelector<HTMLInputElement>('input[name="endDate"]');
    for (const input of [startDateInput, endDateInput, printPageSizeInput]) {
      if (input && !input.reportValidity()) return;
    }
    advance("subjects");
  }

  function addSubject() {
    if (activeSubjectId != null) return;
    setActiveDocumentId(null);
    setSubjects((current) => [...current, {
      id: nextSubjectId,
      uploadId: crypto.randomUUID(),
      materialSetId: crypto.randomUUID(),
      label: "",
      prerequisiteMaterialSetId: "",
      notes: "",
      daysPerWeek: "",
      fileNames: [],
      fileSelectionKey: "",
      pageCount: 0,
      pageCountPending: false,
      pageCountIncomplete: false,
      saved: false
    }]);
    setActiveSubjectId(nextSubjectId);
  }

  function addOwnWorkbookAndScroll() {
    setShowAddSourceChoice(false);
    addSubject();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        subjectFormContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function updateSubject(id: number, patch: Partial<SubjectDraft>) {
    setSubjects((current) => current.map((subject) => subject.id === id ? { ...subject, ...patch } : subject));
  }

  async function updateSubjectFiles(subjectId: number, fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    const fileSelectionKey = files
      .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
      .join("|");
    const currentSubject = subjects.find((subject) => subject.id === subjectId);
    const uploadId = currentSubject?.fileSelectionKey && currentSubject.fileSelectionKey !== fileSelectionKey
      ? crypto.randomUUID()
      : currentSubject?.uploadId || crypto.randomUUID();
    storedFilesRef.current.set(subjectId, files);
    setStoredFilesRevision((revision) => revision + 1);
    setDraftStorageError(null);
    filePersistenceRef.current = filePersistenceRef.current.then(async () => {
      const stored = await getStoredAuthenticatedPlanFiles(draftKey);
      await saveStoredAuthenticatedPlanFiles({
        key: draftKey,
        updatedAt: new Date().toISOString(),
        files: [
          ...(stored?.files ?? []).filter((file) => file.subjectId !== subjectId),
          ...files.map((file) => ({
            subjectId,
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified,
            file
          }))
        ]
      });
    }).catch(() => {
      setDraftStorageError("The selected files could not be preserved in this browser. Keep this page open until you submit them.");
    });
    updateSubject(subjectId, {
      uploadId,
      fileNames: files.map((file) => file.name),
      fileSelectionKey,
      pageCount: 0,
      pageCountPending: files.length > 0,
      pageCountIncomplete: false
    });
    if (files.length === 0) return;

    let pageCount = files.filter((file) => !file.type.toLowerCase().includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")).length;
    let pageCountIncomplete = false;
    const pdfFiles = files.filter((file) => file.type.toLowerCase().includes("pdf") || file.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length > 0) {
      let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;
      try {
        // Importing the worker module first exposes its message handler so
        // PDF.js can parse locally without a separately hosted worker asset.
        await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
        pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      } catch {
        pdfjs = null;
      }
      for (const file of pdfFiles) {
        try {
          if (!pdfjs) throw new Error("PDF.js is unavailable.");
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
            pageCountIncomplete = true;
          }
        }
      }
    }

    setSubjects((current) => current.map((subject) => subject.id === subjectId && subject.fileSelectionKey === fileSelectionKey
      ? { ...subject, pageCount, pageCountPending: false, pageCountIncomplete }
      : subject));
  }

  function removeSubject(id: number) {
    setSubjects((current) => {
      const removed = current.find((subject) => subject.id === id);
      return current
        .filter((subject) => subject.id !== id)
        .map((subject) => removed && subject.prerequisiteMaterialSetId === removed.materialSetId
          ? { ...subject, prerequisiteMaterialSetId: "" }
          : subject);
    });
    setActiveSubjectId((current) => current === id ? null : current);
    storedFilesRef.current.delete(id);
    setStoredFilesRevision((revision) => revision + 1);
    filePersistenceRef.current = filePersistenceRef.current.then(async () => {
      const stored = await getStoredAuthenticatedPlanFiles(draftKey);
      if (!stored) return;
      await saveStoredAuthenticatedPlanFiles({
        ...stored,
        updatedAt: new Date().toISOString(),
        files: stored.files.filter((file) => file.subjectId !== id)
      });
    }).catch(() => {
      setDraftStorageError("The browser draft could not be updated. Your current form is still usable.");
    });
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

  function saveSubject(subject: SubjectDraft) {
    const label = document.querySelector<HTMLInputElement>(`input[name="subjectLabel-${subject.id}"]`);
    const files = document.querySelector<HTMLInputElement>(`input[name="preCheckoutFiles-${subject.id}"]`);
    if (!label?.reportValidity()) return;
    if (subject.fileNames.length === 0) {
      files?.setCustomValidity("Add at least one file for this subject.");
      files?.reportValidity();
      files?.setCustomValidity("");
      return;
    }
    updateSubject(subject.id, { saved: true });
    setActiveSubjectId(null);
  }

  function editDocument(documentId: string) {
    setActiveSubjectId(null);
    setActiveDocumentId(documentId);
  }

  const gradeLabel = studentGradeLevel === 0 ? "Kindergarten" : `Grade ${studentGradeLevel ?? "—"}`;
  const totalUploadedPages = existingDocuments.reduce((total, document) => total + Math.max(0, document.pageCount), 0);
  const existingMaterialOptions = Array.from(
    new Map(existingDocuments.map((document) => [document.materialSetId, {
      id: document.materialSetId,
      label: document.subjectLabel || document.label
    }])).values()
  );
  const materialLabel = (materialSetId: string) =>
    existingMaterialOptions.find((material) => material.id === materialSetId)?.label ||
    subjects.find((subject) => subject.materialSetId === materialSetId)?.label ||
    "earlier material";
  const selectedPageCount = subjects.reduce((total, subject) => total + subject.pageCount, 0);
  const selectedPageCountPending = subjects.some((subject) => subject.pageCountPending);
  const selectedPageCountIncomplete = subjects.some((subject) => subject.pageCountIncomplete);
  const totalInputPageCount = totalUploadedPages + selectedPageCount;
  const exceedsInputPageLimit = totalInputPageCount > PLAN_GENERATOR_MAX_INPUT_PAGE_COUNT;
  const schoolYearPeriodReady = Boolean(
    schoolYearStartDate && schoolYearEndDate && schoolYearEndDate > schoolYearStartDate
  );
  const canReview = subjects.length > 0 && activeSubjectId == null && subjects.every((subject) => subject.saved && subject.fileNames.length > 0) && !selectedPageCountPending && !exceedsInputPageLimit;
  const visiblePlanningProgress: PlanCreationProgressValue | null = startingPlan
    ? {
        stage: "planning",
        percent: 46,
        label: "Preparing your weekly plan…",
        detail: "Treeschool is organizing the reviewed materials into the weekly schedule."
      }
    : planningProgress ?? null;
  const reviewBeforePlanning = useCallback(async () => {
    if (!planningAction || !completenessAction || !existingLearningYearId) return false;
    setShowCompleteness(true);
    setReviewingCompleteness(true);
    setCompletenessResult(null);
    setCompletenessError(null);
    try {
      const formData = new FormData();
      formData.set("learningYearId", existingLearningYearId);
      const response = await completenessAction(formData);
      if (response.ok) {
        setCompletenessResult(response.result);
        return true;
      }
      setCompletenessError(response.error);
      return false;
    } catch (reviewError) {
      setCompletenessError(reviewError instanceof Error ? reviewError.message : "Could not review the curriculum.");
      return false;
    } finally {
      setReviewingCompleteness(false);
    }
  }, [completenessAction, existingLearningYearId, planningAction]);

  const reevaluateCompleteness = useCallback(async () => {
    const reviewed = await reviewBeforePlanning();
    if (reviewed) router.refresh();
    return reviewed;
  }, [reviewBeforePlanning, router]);

  useEffect(() => {
    if (!draftNotice) return;
    const timeoutId = window.setTimeout(() => setDraftNotice(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [draftNotice]);

  function continuePlanning() {
    if (!planningAction || !existingLearningYearId) return;
    setShowCompleteness(false);
    setStartingPlan(true);
    const formData = new FormData();
    formData.set("profileId", profileId);
    formData.set("learningYearId", existingLearningYearId);
    void planningAction(formData)
      .then(() => setStartingPlan(false))
      .catch((error) => {
        setCompletenessError(error instanceof Error ? error.message : "Could not start planning.");
        setStartingPlan(false);
        setShowCompleteness(true);
      });
  }

  const planningStatusPanel = subjects.length === 0 && existingDocuments.length > 0 &&
    (planningAction || retryPlanningAction) &&
    (visiblePlanningProgress || showPlanningAction || planningFailed) ? (
      <div className={`mb-6 rounded-[18px] border px-4 py-4 ${planningFailed ? "border-[#d7b26f] bg-[#fff8e7]" : "border-[#c7d7b3] bg-[#eef5e4]"}`}>
        <p className="mb-3 text-xs font-semibold text-ink/52">
          {existingDocuments.length} {existingDocuments.length === 1 ? "material" : "materials"} · {totalUploadedPages.toLocaleString()} uploaded {totalUploadedPages === 1 ? "page" : "pages"}
        </p>
        {visiblePlanningProgress ? <PlanCreationProgress progress={visiblePlanningProgress} compact /> : null}
        {!schoolYearPeriodReady && !visiblePlanningProgress ? (
          <p className="mb-4 rounded-[14px] border border-[#d7b26f] bg-[#fff8e7] px-4 py-3 text-sm font-semibold leading-6 text-[#805c22]">
            Add the school-year dates in the student profile before reviewing the curriculum.
          </p>
        ) : null}
        {planningFailed && retryPlanningAction && !qualityControlFailed ? (
          <div className={visiblePlanningProgress ? "mt-4" : ""}>
            <button
              type="submit"
              formAction={retryPlanningAction}
              formNoValidate
              className="cta-button cta-button--light cta-button--small w-full sm:w-auto"
            >
              Retry unfinished planning
            </button>
            <p className="mt-2 text-xs leading-relaxed text-ink/62">
              Treeschool will keep every completed week and resume only the work that failed.
            </p>
          </div>
        ) : null}
        {planningFailed && qualityControlFailed ? (
          <p className="mt-4 rounded-[14px] border border-[#e0bd78] bg-white/65 px-4 py-3 text-xs font-semibold leading-5 text-[#805c22]">
            Treeschool is correcting the scheduling problem automatically. You do not need to restart the plan or upload your materials again.
          </p>
        ) : null}
        {showPlanningAction ? <div className={visiblePlanningProgress ? "mt-4" : ""}>
          <button
            type="button"
            onClick={reviewBeforePlanning}
            disabled={!canStartPlanning || reviewingCompleteness || startingPlan}
            className="cta-button cta-button--dark cta-button--small w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {reviewingCompleteness ? "Reviewing curriculum…" : planningButtonLabel}
          </button>
        </div> : null}
      </div>
    ) : null;

  return (
    <form
      ref={formRef}
      action={submitAction}
      onSubmitCapture={(event: FormEvent<HTMLFormElement>) => {
        attachStoredFilesToInputs();
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        if (submitter?.dataset.generatorUploadSubmit === "true") {
          setUploadSubmissionStarted(true);
        }
      }}
      className="space-y-6"
    >
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="startDate" value={schoolYearStartDate} />
      <input type="hidden" name="endDate" value={schoolYearEndDate} />
      <input type="hidden" name="studentName" value={studentName} />
      <input type="hidden" name="studentGradeLevel" value={studentGradeLevel ?? ""} />
      {existingLearningYearId ? <input type="hidden" name="learningYearId" value={existingLearningYearId} /> : null}
      {draftNotice && typeof document !== "undefined" ? createPortal(
        <div role="status" className="fixed right-4 top-4 z-[300] flex w-[min(420px,calc(100vw-2rem))] items-start justify-between gap-4 rounded-[18px] border border-[#b8cf9f] bg-[#eef5e4] px-4 py-3 text-sm font-semibold leading-6 text-[#4d6a39] shadow-[0_16px_45px_rgba(45,36,28,0.22)] sm:right-6 sm:top-6">
          <span>{draftNotice}</span>
          <button type="button" aria-label="Dismiss restored draft notice" onClick={() => setDraftNotice(null)} className="mt-0.5 text-lg leading-none">×</button>
        </div>,
        document.body
      ) : null}
      {showAddSourceChoice && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto bg-black/55 p-2 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddSourceChoice(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="add-material-source-title" className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-4 shadow-2xl sm:rounded-[28px] sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-earth">Add teaching material</p>
                <h2 id="add-material-source-title" className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-ink">What kind of workbook?</h2>
              </div>
              <button type="button" onClick={() => setShowAddSourceChoice(false)} className="grid h-11 w-11 flex-none place-items-center rounded-full border border-[#dcc8aa] bg-white text-2xl" aria-label="Close material source chooser">×</button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                disabled={!addNativeWorkbooksAction || !purchaseNativeWorkbookAction}
                onClick={() => {
                  setShowAddSourceChoice(false);
                  setShowNativeWorkbookChooser(true);
                }}
                className="group flex items-center gap-4 rounded-[22px] border-2 border-[#8fad72] bg-[#edf4e5] p-5 text-left shadow-[0_7px_0_#9eb98a] transition hover:-translate-y-0.5 hover:border-[#6f914f] hover:bg-[#e7f0dd] active:translate-y-[5px] active:shadow-[0_2px_0_#9eb98a] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[#d9e8cb]" aria-hidden="true"><Image src="/tree-icon.png" alt="" width={34} height={34} className="h-9 w-9 object-contain" /></span>
                <span className="text-xl font-semibold text-ink">Add a Treeschool Workbook</span>
              </button>
              <button
                type="button"
                onClick={addOwnWorkbookAndScroll}
                className="group flex items-center gap-4 rounded-[22px] border-2 border-[#c8aa82] bg-white p-5 text-left shadow-[0_7px_0_#dfc8a7] transition hover:-translate-y-0.5 hover:border-[#a9835c] hover:bg-[#fffdf9] active:translate-y-[5px] active:shadow-[0_2px_0_#dfc8a7]"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f3e7d4] text-earth" aria-hidden="true">
                  <svg viewBox="0 0 48 48" className="h-7 w-7" fill="none"><path d="M10 8h20l8 8v24H10V8Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M30 8v8h8M24 33V20m0 0-5 5m5-5 5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span className="text-xl font-semibold text-ink">Add My Own Workbook</span>
              </button>
            </div>
          </section>
        </div>,
        document.body
      ) : null}
      {showNativeWorkbookChooser && addNativeWorkbooksAction && purchaseNativeWorkbookAction && typeof document !== "undefined" ? createPortal(
        <NativeWorkbookChooserDialog
          profileId={profileId}
          studentName={studentName}
          studentGradeLevel={studentGradeLevel}
          learningYearId={existingLearningYearId}
          preferredPrintPageSize={preferredPrintPageSize || null}
          workbooks={nativeWorkbooks}
          recommendedCurriculum={recommendedNativeCurriculum}
          addWorkbooksAction={addNativeWorkbooksAction}
          purchaseWorkbookAction={purchaseNativeWorkbookAction}
          checkoutCanceled={checkoutCanceled}
          onClose={() => setShowNativeWorkbookChooser(false)}
        />,
        document.body
      ) : null}
      {!addingToExistingYear && hasPersistedPrintPageSize ? (
        <input type="hidden" name="preferredPrintPageSize" value={preferredPrintPageSize} />
      ) : null}

      {planningStatusPanel}

      {!addingToExistingYear ? (
        <section className={step === "details" ? "block" : "hidden"}>
          <h2 className="text-[30px] font-semibold tracking-[-0.05em] text-ink">Set up the school year.</h2>
          <p className="mt-2 text-base leading-7 text-ink/68">
            Choose the schedule and print format for this lesson plan.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <label htmlFor="authenticatedHolidayWeeks">Holiday weeks</label>
                <HintPopover closeLabel="Close holiday weeks hint">
                  Treeschool will distribute the uploaded material across <strong>{52 - holidayWeeks} teaching weeks</strong> and create one printable PDF for each week.
                </HintPopover>
              </div>
              <input
                id="authenticatedHolidayWeeks"
                name="holidayWeeks"
                type="number"
                min="0"
                max="51"
                value={holidayWeeks}
                onChange={(event) => setHolidayWeeks(Math.max(0, Math.min(51, Number(event.target.value))))}
                className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <label htmlFor="authenticatedTeachingDays">Teaching days per week</label>
                <HintPopover closeLabel="Close teaching days hint">
                  Each weekly PDF will be separated into <strong>{teachingDaysPerWeek} numbered school days</strong>, each with its own summary page.
                </HintPopover>
              </div>
              <select
                id="authenticatedTeachingDays"
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
          <button type="button" onClick={advanceToSubjects} className="cta-button cta-button--light mt-6 w-full">
            Next: upload materials
          </button>
        </section>
      ) : (
        <section className="rounded-[20px] border border-[#eadbc2] bg-[#fffaf2] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <GearIcon className="h-[18px] w-[18px] text-earth/75" />
                Plan preferences
              </p>
              <p className="mt-1 text-xs text-ink/55">
                {52 - holidayWeeks} teaching weeks · {teachingDaysPerWeek} days/week · {compactSchoolYearPeriod(schoolYearStartDate, schoolYearEndDate)} · {compactPrintPageSizeLabel(preferredPrintPageSize || null)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingPlanDetails((current) => !current)}
              disabled={indexingActive}
              title={indexingActive ? "Plan preferences can be edited after indexing finishes." : undefined}
              className="text-sm font-semibold text-earth underline underline-offset-4 disabled:cursor-not-allowed disabled:text-ink/35 disabled:no-underline"
            >
              {indexingActive ? "Available after indexing" : editingPlanDetails ? "Close" : "Edit plan details"}
            </button>
          </div>
          {editingPlanDetails ? (
            <div className="mt-4 border-t border-[#eadbc2] pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <label htmlFor="existingHolidayWeeks">Holiday weeks</label>
                    <HintPopover closeLabel="Close holiday weeks hint">
                      This produces <strong>{52 - holidayWeeks} teaching weeks</strong>. Changing it affects only weeks that have not been started when you next replan.
                    </HintPopover>
                  </div>
                  <input id="existingHolidayWeeks" name="holidayWeeks" type="number" min="0" max="51" value={holidayWeeks} onChange={(event) => setHolidayWeeks(Math.max(0, Math.min(51, Number(event.target.value))))} className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]" />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <label htmlFor="existingTeachingDays">Teaching days per week</label>
                    <HintPopover closeLabel="Close teaching days hint">
                      Weekly PDFs use this many numbered day sections. Subject schedules cannot exceed this number.
                    </HintPopover>
                  </div>
                  <select id="existingTeachingDays" name="teachingDaysPerWeek" value={teachingDaysPerWeek} onChange={(event) => chooseTeachingDays(Number(event.target.value))} className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]">
                    {Array.from({ length: 7 }, (_, index) => index + 1).map((days) => (
                      <option key={days} value={days}>{days} {days === 1 ? "day" : "days"}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="mt-4 block max-w-sm text-sm font-semibold text-ink">
                Preferred Print Page Size
                <select name="preferredPrintPageSize" required value={preferredPrintPageSize} onChange={(event) => setPreferredPrintPageSize(event.target.value as PrintPageSize)} className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]">
                  {PRINT_PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              {updateDetailsAction ? (
                <button type="submit" formAction={updateDetailsAction} formNoValidate className="cta-button cta-button--light mt-4 w-full">
                  Save plan preferences
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      )}

      <section className={step === "subjects" ? "block" : "hidden"}>
        {subjects.length > 0 ? (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={discardBrowserDraft}
              className="text-sm font-semibold text-earth underline underline-offset-4"
            >
              Discard saved draft and start over
            </button>
          </div>
        ) : null}
        {draftStorageError ? (
          <p role="alert" className="mb-4 rounded-[18px] border border-[#d9afa2] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">
            {draftStorageError}
          </p>
        ) : null}
        {!addingToExistingYear ? <div className="mt-4 rounded-[20px] border border-[#eadbc2] bg-[#fffaf2] px-4 py-3 text-sm text-ink">
          <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.11em] text-earth">
            <GearIcon className="h-3.5 w-3.5" />
            Plan preferences
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1.5"><strong>{52 - holidayWeeks}</strong> teaching weeks</span>
            <span className="rounded-full bg-white px-3 py-1.5"><strong>{teachingDaysPerWeek}</strong> days/week</span>
            <span className="rounded-full bg-white px-3 py-1.5">{compactSchoolYearPeriod(schoolYearStartDate, schoolYearEndDate)}</span>
            <span className="rounded-full bg-white px-3 py-1.5" title={printPageSizeLabel(preferredPrintPageSize || null)}>{compactPrintPageSizeLabel(preferredPrintPageSize || null)}</span>
          </div>
        </div> : null}

        <div className={`${addingToExistingYear ? "mt-5" : "mt-6"} grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4`}>
          {existingDocuments.map((document) => (
            <article
              key={document.id}
              className={`relative aspect-[4/3] min-w-0 overflow-hidden rounded-[18px] border ${
                document.sourceKind === "native_workbook" ? "bg-[#edf4e5]" : "bg-[#fffaf2]"
              } ${
                activeDocumentId === document.id ? "border-[#8baa70] ring-2 ring-[#dceacd]" : "border-[#dcc8aa]"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (document.sourceKind === "native_workbook" && document.statusKind === "ready" && existingLearningYearId) {
                    setReviewingNativeDocumentId(document.id);
                  } else {
                    editDocument(document.id);
                  }
                }}
                aria-expanded={activeDocumentId === document.id}
                aria-haspopup={document.sourceKind === "native_workbook" && document.statusKind === "ready" ? "dialog" : undefined}
                title={document.sourceKind === "native_workbook" && document.statusKind === "ready" ? "Review indexed lessons" : undefined}
                className="flex h-full w-full flex-col p-3 text-left"
              >
                {document.sourceKind === "native_workbook" ? (
                  <span className="mr-7 inline-flex items-center gap-1.5 self-start rounded-full border border-[#b8cf9f] bg-[#dce8cf] px-2 py-1 text-[10px] font-semibold text-[#567b40]">
                    <Image src="/tree-icon.png" alt="" width={18} height={18} className="h-4 w-4 shrink-0 object-contain" />
                    <span>Treeschool</span>
                  </span>
                ) : null}
                {document.statusKind !== "ready" ? <span className={`inline-flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  document.statusKind === "failed"
                      ? "bg-[#fff1ec] text-[#8b3e2f]"
                      : "bg-[#f4ead8] text-earth"
                } ${document.sourceKind === "native_workbook" ? "mt-2" : ""}`}>
                  {document.statusKind === "processing" ? (
                    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
                  ) : null}
                  {document.status}
                </span> : null}
                <p className={`${document.sourceKind === "native_workbook" || document.statusKind !== "ready" ? "mt-3" : "mt-1"} line-clamp-3 pr-5 text-sm font-semibold leading-5 text-ink`}>{document.label}</p>
                {document.pageCount > 0 ? (
                  <span className="mt-auto flex w-full items-center justify-between gap-2 pt-2 text-[11px] font-medium text-ink/45">
                    <span>{document.pageCount.toLocaleString()} {document.pageCount === 1 ? "page" : "pages"}</span>
                    {document.sourceKind === "native_workbook" && document.statusKind === "ready" ? (
                      <span className="font-semibold text-[#567b40]">Review lessons</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
              {deleteDocumentAction ? (
                <button
                  type="submit"
                  formAction={deleteDocumentAction.bind(null, document.id)}
                  formNoValidate
                  aria-label={`Remove ${document.label}`}
                  title="Remove from future planning"
                  onClick={(event) => {
                    if (!window.confirm(`Remove ${document.label} from future planning? Your current plan and recoverable previous version will keep their existing material.`)) event.preventDefault();
                  }}
                  className="absolute right-2 top-2 rounded-full bg-white/85 p-1 text-sm leading-none text-[#8b3e2f] shadow-sm"
                >
                  ×
                </button>
              ) : null}
            </article>
          ))}
          {subjects.filter((subject) => subject.saved).map((subject) => (
            <div key={subject.id} className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-[18px] border border-[#c7d7b3] bg-[#eef5e4]">
              <button type="button" onClick={() => { setActiveDocumentId(null); setActiveSubjectId(subject.id); }} aria-expanded={activeSubjectId === subject.id} className="flex h-full w-full flex-col p-3 text-left">
                <span className="pr-7 text-[11px] font-black uppercase tracking-[0.12em] text-[#658347]">Ready</span>
                <span className="mt-2 line-clamp-3 pr-5 text-base font-semibold leading-5 text-ink">{subject.label}</span>
                <span className="mt-1 line-clamp-2 text-xs text-ink/55">{subject.prerequisiteMaterialSetId ? `After ${materialLabel(subject.prerequisiteMaterialSetId)} · ` : ""}{subject.fileNames.length} {subject.fileNames.length === 1 ? "file" : "files"} · {subject.pageCountPending ? "counting pages…" : `${subject.pageCount.toLocaleString()} ${subject.pageCount === 1 ? "page" : "pages"}`}</span>
              </button>
              <button type="button" aria-label={`Remove ${subject.label}`} onClick={() => window.confirm(`Remove ${subject.label}?`) && removeSubject(subject.id)} className="absolute right-2 top-2 rounded-full p-1.5 text-[#8b3e2f]">×</button>
            </div>
          ))}
          <button type="button" onClick={() => setShowAddSourceChoice(true)} disabled={activeSubjectId != null} className="aspect-[4/3] min-w-0 rounded-[18px] border border-dashed border-[#8f6544] bg-white p-3 text-earth disabled:opacity-40">
            <span className="block text-4xl font-light">+</span><span className="mt-2 block text-sm font-semibold">Add subject</span>
          </button>
        </div>

        {updateDocumentAction ? existingDocuments.filter((document) => document.id === activeDocumentId).map((document) => (
          <section key={`edit-${document.id}`} className="mt-6 rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-5">
            <input type="hidden" name="editDocumentId" value={document.id} />
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black uppercase tracking-[0.13em] text-earth">Edit material</p>
              <button type="button" onClick={() => setActiveDocumentId(null)} className="text-xs font-semibold underline underline-offset-4">Close</button>
            </div>
            <div className="mt-3 rounded-[16px] border border-[#eadbc2] bg-white px-4 py-3 text-sm text-ink/65">
              <p><span className="font-semibold text-ink">{document.status}</span> · {document.detail}</p>
              {document.summary ? <p className="mt-1.5 leading-6">{document.summary}</p> : null}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-ink">
                Subject name
                <input name="editSubjectLabel" defaultValue={document.subjectLabel ?? ""} placeholder="English" className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]" />
              </label>
              <label className="text-sm font-semibold text-ink">
                Material name
                <input name="editDocumentLabel" defaultValue={document.label} required className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]" />
              </label>
            </div>
            <label className="mt-3 block text-sm font-semibold text-ink">
              How often do you teach this subject? <span className="font-medium text-ink/55">(optional)</span>
              <select
                name="editSubjectDaysPerWeek"
                defaultValue={document.subjectDaysPerWeek ?? ""}
                className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
              >
                <option value="">Let Treeschool decide</option>
                {Array.from({ length: teachingDaysPerWeek }, (_, index) => index + 1).map((days) => (
                  <option key={days} value={days}>{days === teachingDaysPerWeek ? `Every teaching day (${days})` : `${days} ${days === 1 ? "day" : "days"} per week`}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-semibold text-ink">
              Starts after <span className="font-medium text-ink/55">(optional)</span>
              <select
                name="editPrerequisiteMaterialSetId"
                defaultValue={document.prerequisiteMaterialSetId ?? ""}
                disabled={existingMaterialOptions.every((material) => material.id === document.materialSetId)}
                className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544] disabled:cursor-not-allowed disabled:bg-[#f3eee6] disabled:text-ink/40"
              >
                <option value="">
                  {existingMaterialOptions.some((material) => material.id !== document.materialSetId)
                    ? "No prerequisite"
                    : "No other materials available"}
                </option>
                {existingMaterialOptions.filter((material) => material.id !== document.materialSetId).map((material) => (
                  <option key={material.id} value={material.id}>{material.label}</option>
                ))}
              </select>
              <span className="mt-1.5 block text-xs font-medium leading-5 text-ink/50">Treeschool will finish the selected material before scheduling this one.</span>
            </label>
            <label className="mt-3 block text-sm font-semibold text-ink">
              Special instructions <span className="font-medium text-ink/55">(optional)</span>
              <textarea name="editParentNotes" defaultValue={document.parentNotes ?? ""} rows={3} className="mt-2 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 py-3 text-base font-normal outline-none focus:border-[#8f6544]" />
            </label>
            <button type="submit" formAction={updateDocumentAction} formNoValidate className="cta-button cta-button--light mt-4 w-full">
              Save changes
            </button>
          </section>
        )) : null}

        <div ref={subjectFormContainerRef} className="mt-6 scroll-mt-6 space-y-4">
          {subjects.map((subject, index) => (
            <section key={subject.id} className={`${activeSubjectId === subject.id ? "block" : "hidden"} rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-5`}>
              <input type="hidden" name="subjectIndexes" value={subject.id} />
              <input type="hidden" name={`subjectUploadId-${subject.id}`} value={subject.uploadId} />
              <input type="hidden" name={`materialSetId-${subject.id}`} value={subject.materialSetId} />
              <div className="flex justify-between"><p className="text-sm font-black uppercase tracking-[0.13em] text-earth">Subject {index + 1}</p>{!subject.saved ? <button type="button" onClick={() => removeSubject(subject.id)} className="text-xs underline">Cancel</button> : null}</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-ink">Subject name<input name={`subjectLabel-${subject.id}`} value={subject.label} required placeholder="English" onChange={(event) => updateSubject(subject.id, { label: event.target.value })} className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none" /></label>
                <div className="text-sm font-semibold text-ink">
                  <div className="flex items-center gap-2">
                    <label htmlFor={`prerequisiteMaterialSetId-${subject.id}`}>Starts after <span className="font-medium text-ink/55">(optional)</span></label>
                    <HintPopover closeLabel="Close prerequisite hint">
                      Choose material that must be completed first. Treeschool will not schedule any content from this material until the final content from its prerequisite has appeared in the plan.
                    </HintPopover>
                  </div>
                  <select
                    id={`prerequisiteMaterialSetId-${subject.id}`}
                    name={`prerequisiteMaterialSetId-${subject.id}`}
                    value={subject.prerequisiteMaterialSetId}
                    onChange={(event) => updateSubject(subject.id, { prerequisiteMaterialSetId: event.target.value })}
                    disabled={
                      !existingMaterialOptions.some((material) => material.id !== subject.materialSetId) &&
                      !subjects.slice(0, index).some((candidate) => candidate.saved && candidate.materialSetId !== subject.materialSetId)
                    }
                    className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none disabled:cursor-not-allowed disabled:bg-[#f3eee6] disabled:text-ink/40"
                  >
                    <option value="">
                      {existingMaterialOptions.some((material) => material.id !== subject.materialSetId) || subjects.slice(0, index).some((candidate) => candidate.saved && candidate.materialSetId !== subject.materialSetId)
                        ? "No prerequisite"
                        : "Add an earlier material first"}
                    </option>
                    {existingMaterialOptions.filter((material) => material.id !== subject.materialSetId).map((material) => (
                      <option key={material.id} value={material.id}>{material.label}</option>
                    ))}
                    {subjects.slice(0, index).filter((candidate) => candidate.saved && candidate.materialSetId !== subject.materialSetId).map((candidate) => (
                      <option key={candidate.materialSetId} value={candidate.materialSetId}>{candidate.label || `Subject ${candidate.id}`}</option>
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
                  className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none"
                >
                  <option value="">Let Treeschool decide</option>
                  {Array.from({ length: 7 }, (_, index) => index + 1).map((days) => (
                    <option key={days} value={days}>{days === teachingDaysPerWeek ? `Every teaching day (${days})` : `${days} ${days === 1 ? "day" : "days"} per week`}</option>
                  ))}
                </select>
                <span className="mt-1.5 block text-xs font-medium leading-5 text-ink/50">This spreads work across school days; it does not require separate lessons within a day.</span>
              </label>
              <label className="mt-3 block rounded-[20px] border border-dashed border-[#c8af8b] bg-white px-4 py-5 text-sm font-semibold text-ink">
                Files for this subject<input name={`preCheckoutFiles-${subject.id}`} type="file" accept={PLAN_GENERATOR_ACCEPTED_FILE_TYPES} multiple required={subject.fileNames.length === 0} onChange={(event) => void updateSubjectFiles(subject.id, event.target.files)} className="mt-4 block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[#7fa15a] file:px-4 file:py-2 file:font-semibold file:text-white" />
                {subject.fileNames.length ? (
                  <span className="mt-2 block text-xs text-[#4d6a39]">
                    Selected: {subject.fileNames.join(", ")} · {subject.pageCountPending
                      ? "counting PDF pages…"
                      : `${subject.pageCount.toLocaleString()} ${subject.pageCount === 1 ? "page" : "pages"}${subject.pageCountIncomplete ? " counted; one or more PDFs could not be read" : ""}`}
                  </span>
                ) : null}
              </label>
              <div className="mt-3 text-sm font-semibold text-ink">
                <div className="flex items-center gap-2">
                  <label htmlFor={`authenticatedParentNotes-${subject.id}`}>Special instructions <span className="font-medium text-ink/55">(optional)</span></label>
                  <HintPopover closeLabel="Close special instructions hint">
                    Use this to direct how Treeschool plans the subject—for example, ask it to skip tests, use only workbook pages, or pair student work with an answer key.
                  </HintPopover>
                </div>
                <textarea id={`authenticatedParentNotes-${subject.id}`} name={`parentNotes-${subject.id}`} value={subject.notes} rows={3} placeholder="Example: skip tests, use only workbook pages, pair with answer key later..." onChange={(event) => updateSubject(subject.id, { notes: event.target.value })} className="mt-2 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 py-3 text-base font-normal outline-none" />
              </div>
              <button type="button" onClick={() => saveSubject(subject)} className="cta-button cta-button--light mt-4 w-full">Save subject</button>
            </section>
          ))}
        </div>
        {addingToExistingYear ? (
          subjects.length > 0 ? (
            <div className="mt-6 rounded-[22px] border border-[#c7d7b3] bg-[#eef5e4] p-5">
              <p className="text-xs font-black uppercase tracking-[0.13em] text-[#658347]">Next step</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.035em] text-ink">
                {subjects.length === 1
                  ? "Add this subject to the academic review"
                  : "Add these subjects to the academic review"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-ink/65">
                Upload the new files now. Treeschool will index them, then automatically reopen the curriculum coverage check with everything included.
              </p>
              {!canReview ? (
                <p className="mt-3 text-xs font-semibold text-[#7b583c]">
                  {exceedsInputPageLimit
                    ? "This lesson plan contains too much material to process at once. Remove one or more workbooks, or split the curriculum into separate plans."
                    : "Finish and save each subject before continuing."}
                </p>
              ) : null}
              <div className="mt-4">
                <SubmitButton addingToExistingYear disabled={!canReview} subjectCount={subjects.length} forcePending={uploadSubmissionStarted} />
              </div>
            </div>
          ) : null
        ) : (
          <>
          {exceedsInputPageLimit ? (
            <p role="alert" className="mt-4 rounded-[16px] border border-[#d9afa2] bg-[#fff1ec] px-4 py-3 text-xs font-semibold text-[#8b3e2f]">
              This lesson plan contains too much material to process at once. Remove one or more workbooks, or split the curriculum into separate plans.
            </p>
          ) : null}
          <button type="button" onClick={() => advance("review")} disabled={!canReview} className="cta-button cta-button--light mt-5 w-full disabled:opacity-45">Next: review materials</button>
          </>
        )}
      </section>

      {!addingToExistingYear ? <section className={step === "review" ? "block" : "hidden"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-[30px] font-semibold tracking-[-0.05em] text-ink">Review your materials.</h2>
          <button
            type="button"
            onClick={discardBrowserDraft}
            className="text-sm font-semibold text-earth underline underline-offset-4"
          >
            Discard saved draft and start over
          </button>
        </div>
        <div className="mt-5 rounded-[20px] border border-[#eadbc2] bg-[#fffaf2] p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-ink/50">Student</dt><dd className="font-semibold">{studentName}</dd></div>
            <div><dt className="text-xs text-ink/50">Grade</dt><dd className="font-semibold">{gradeLabel}</dd></div>
            <div><dt className="text-xs text-ink/50">Subjects</dt><dd className="font-semibold">{subjects.length}</dd></div>
            <div><dt className="text-xs text-ink/50">Content pages</dt><dd className="font-semibold">{selectedPageCountPending ? "Counting…" : `${selectedPageCount.toLocaleString()}${selectedPageCountIncomplete ? "+" : ""}`}</dd></div>
            <div><dt className="text-xs text-ink/50">Teaching weeks</dt><dd className="font-semibold">{52 - holidayWeeks}</dd></div>
            <div><dt className="text-xs text-ink/50">Days per week</dt><dd className="font-semibold">{teachingDaysPerWeek}</dd></div>
            <div><dt className="text-xs text-ink/50">Page size</dt><dd className="font-semibold">{printPageSizeLabel(preferredPrintPageSize || null)}</dd></div>
          </dl>
        </div>
        {exceedsInputPageLimit ? (
          <p role="alert" className="mt-4 rounded-[16px] border border-[#d9afa2] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">
            This lesson plan contains too much material to process at once. Return to the materials step and remove one or more workbooks, or split the curriculum into separate plans.
          </p>
        ) : null}
        <div className="mt-6"><SubmitButton addingToExistingYear={addingToExistingYear} subjectCount={subjects.length} disabled={exceedsInputPageLimit} forcePending={uploadSubmissionStarted} /></div>
      </section> : null}
      {!startingPlan ? <CurriculumCompletenessDialog
        open={showCompleteness && !startingPlan}
        loading={reviewingCompleteness}
        continuing={startingPlan}
        result={completenessResult}
        error={completenessError}
        onClose={() => {
          if (!reviewingCompleteness && !startingPlan) setShowCompleteness(false);
        }}
        onContinue={continuePlanning}
        onReevaluate={reevaluateCompleteness}
        materialSummary={`${existingDocuments.length} ${existingDocuments.length === 1 ? "material" : "materials"} · ${totalUploadedPages.toLocaleString()} uploaded ${totalUploadedPages === 1 ? "page" : "pages"}`}
        learningYearId={existingLearningYearId}
      /> : null}
      {existingLearningYearId && reviewingNativeDocumentId ? (
        <NativeWorkbookContentReview
          open
          learningYearId={existingLearningYearId}
          documentId={reviewingNativeDocumentId}
          workbookTitle={existingDocuments.find((document) => document.id === reviewingNativeDocumentId)?.label ?? "Treeschool workbook"}
          onClose={() => setReviewingNativeDocumentId(null)}
        />
      ) : null}
      <TeachingDaysConflictDialog
        open={scheduleConflict != null}
        title={scheduleConflict?.kind === "subject" ? "Increase the school week?" : "Some subjects use more days"}
        message={scheduleConflict?.kind === "subject"
          ? `This school week currently has ${teachingDaysPerWeek} teaching days. To teach this subject on ${scheduleConflict.requestedDays} days, increase the whole week to ${scheduleConflict.requestedDays} days.`
          : scheduleConflict?.kind === "week"
            ? `${scheduleConflict.affectedIds.length} subject schedule${scheduleConflict.affectedIds.length === 1 ? " exceeds" : "s exceed"} the new ${scheduleConflict.requestedDays}-day week. Treeschool can reduce ${scheduleConflict.affectedIds.length === 1 ? "that subject" : "those subjects"} to every teaching day.`
            : ""}
        cancelLabel={`Keep ${teachingDaysPerWeek}-day week`}
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
            setSubjects((current) => current.map((subject) => scheduleConflict.affectedIds.includes(subject.id)
              ? { ...subject, daysPerWeek: String(scheduleConflict.requestedDays) }
              : subject));
          }
          setScheduleConflict(null);
        }}
      />
    </form>
  );
}
